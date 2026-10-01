//! Bounded, typed request evidence. Never persist headers, URLs, bodies, model
//! names or panic payloads. The raw application logger is deliberately separate.
use axum::{body::Body, http::StatusCode, response::IntoResponse, Json};
use futures::{FutureExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::{
    collections::VecDeque,
    fs::{self, OpenOptions},
    io::{Read, Write},
    panic::AssertUnwindSafe,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering},
        mpsc::{self, SyncSender},
        Arc, Mutex, OnceLock,
    },
    thread::JoinHandle,
    time::{Duration, Instant},
};

const MAX_EVENTS: usize = 128;
const MAX_FILE_BYTES: u64 = 256 * 1024;
const WRITE_QUEUE_CAPACITY: usize = 128;
static JOURNAL: OnceLock<Arc<Journal>> = OnceLock::new();

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum Stage {
    Received,
    Authorized,
    Parsed,
    ProviderSelected,
    ModelMapped,
    UpstreamSend,
    UpstreamResponse,
    ResponseHeaders,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum Outcome {
    Progress,
    TransportComplete,
    Cancelled,
    BodyError,
    Panic,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Event {
    request_id: String,
    started_at: i64,
    at: i64,
    stage: Stage,
    outcome: Outcome,
    status: Option<u16>,
    elapsed_ms: u64,
}

struct JournalState {
    events: VecDeque<Event>,
}

struct Journal {
    state: Mutex<JournalState>,
    writer: Option<BackgroundWriter>,
}

#[derive(Default)]
struct WriterHealth {
    pending: AtomicUsize,
    dropped: AtomicU64,
    write_failures: AtomicU64,
    running: AtomicBool,
    stopping: AtomicBool,
}

/// Count every queued/in-flight event, including receiver teardown and a failed
/// try_send. A stalled filesystem can hold one event, never an unbounded backlog.
struct PendingEvent {
    event: Event,
    health: Arc<WriterHealth>,
    handled: bool,
}

impl PendingEvent {
    fn finish(mut self, written: bool) {
        self.handled = true;
        if !written {
            self.health.write_failures.fetch_add(1, Ordering::Relaxed);
        }
    }
}

impl Drop for PendingEvent {
    fn drop(&mut self) {
        if !self.handled {
            self.health.dropped.fetch_add(1, Ordering::Relaxed);
        }
        self.health.pending.fetch_sub(1, Ordering::AcqRel);
    }
}

struct BackgroundWriter {
    sender: SyncSender<PendingEvent>,
    health: Arc<WriterHealth>,
    handle: Mutex<Option<JoinHandle<()>>>,
}

impl BackgroundWriter {
    fn spawn<F>(capacity: usize, mut write: F) -> Self
    where
        F: FnMut(&Event) -> std::io::Result<()> + Send + 'static,
    {
        let (sender, receiver) = mpsc::sync_channel::<PendingEvent>(capacity);
        let health = Arc::new(WriterHealth::default());
        health.running.store(true, Ordering::Release);
        let thread_health = health.clone();
        let result = std::thread::Builder::new()
            .name("yuanheng-diagnostic-writer".into())
            .spawn(move || {
                struct Exit(Arc<WriterHealth>);
                impl Drop for Exit {
                    fn drop(&mut self) {
                        self.0.stopping.store(true, Ordering::Release);
                        self.0.running.store(false, Ordering::Release);
                    }
                }
                let _exit = Exit(thread_health.clone());
                loop {
                    if thread_health.stopping.load(Ordering::Acquire)
                        && thread_health.pending.load(Ordering::Acquire) == 0
                    {
                        break;
                    }
                    match receiver.recv_timeout(Duration::from_millis(100)) {
                        Ok(item) => {
                            let result =
                                std::panic::catch_unwind(AssertUnwindSafe(|| write(&item.event)));
                            let panicked = result.is_err();
                            item.finish(matches!(result, Ok(Ok(()))));
                            if panicked {
                                break;
                            }
                        }
                        Err(mpsc::RecvTimeoutError::Timeout) => continue,
                        Err(mpsc::RecvTimeoutError::Disconnected) => break,
                    }
                }
                // No request-state lock is ever held by this thread.
                drop(receiver);
            });
        let handle = match result {
            Ok(handle) => Some(handle),
            Err(_) => {
                health.running.store(false, Ordering::Release);
                health.write_failures.fetch_add(1, Ordering::Relaxed);
                None
            }
        };
        Self {
            sender,
            health,
            handle: Mutex::new(handle),
        }
    }

    fn enqueue(&self, event: Event) {
        if self.health.stopping.load(Ordering::Acquire) {
            self.health.dropped.fetch_add(1, Ordering::Relaxed);
            return;
        }
        self.health.pending.fetch_add(1, Ordering::AcqRel);
        let item = PendingEvent {
            event,
            health: self.health.clone(),
            handled: false,
        };
        // Never use send(): waiting for queue capacity would reintroduce disk
        // latency into the request path. PendingEvent::drop counts lost records.
        let _ = self.sender.try_send(item);
    }

    fn persistence_ok(&self) -> bool {
        self.health.running.load(Ordering::Acquire)
            && self.health.dropped.load(Ordering::Relaxed) == 0
            && self.health.write_failures.load(Ordering::Relaxed) == 0
    }

    async fn stop_and_join(&self, timeout: Duration) -> bool {
        self.health.stopping.store(true, Ordering::Release);
        let started = Instant::now();
        loop {
            let finished = self
                .handle
                .lock()
                .ok()
                .is_some_and(|handle| handle.as_ref().is_none_or(JoinHandle::is_finished));
            if finished {
                if let Ok(mut handle) = self.handle.lock() {
                    if let Some(handle) = handle.take() {
                        return handle.join().is_ok();
                    }
                }
                return true;
            }
            if started.elapsed() >= timeout {
                return false;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    }
}

impl Drop for BackgroundWriter {
    fn drop(&mut self) {
        // Disconnect and request drain; do not block an HTTP task's destructor.
        // Normal Core shutdown explicitly performs a bounded join below.
        self.health.stopping.store(true, Ordering::Release);
    }
}

impl Journal {
    fn new(path: Option<PathBuf>) -> Self {
        Self {
            state: Mutex::new(JournalState {
                events: VecDeque::new(),
            }),
            writer: path.map(|path| {
                BackgroundWriter::spawn(WRITE_QUEUE_CAPACITY, move |event| {
                    append_event(&path, event)
                })
            }),
        }
    }

    fn record(&self, event: Event) {
        // Logging must never panic or poison request processing.
        let Ok(mut state) = self.state.lock() else {
            return;
        };
        if state.events.len() >= MAX_EVENTS {
            state.events.pop_front();
        }
        state.events.push_back(event.clone());
        drop(state);
        if let Some(writer) = &self.writer {
            writer.enqueue(event);
        }
    }
}

fn append_event(path: &Path, event: &Event) -> std::io::Result<()> {
    let mut bytes = serde_json::to_vec(event)?;
    bytes.push(b'\n');
    if fs::symlink_metadata(path).is_ok_and(|m| m.file_type().is_symlink()) {
        return Err(std::io::ErrorKind::PermissionDenied.into());
    }
    if fs::metadata(path).is_ok_and(|m| m.len() + bytes.len() as u64 > MAX_FILE_BYTES) {
        let backup = path.with_extension("previous.jsonl");
        if backup.exists() {
            fs::remove_file(&backup)?;
        }
        fs::rename(path, backup)?;
    }
    let mut options = OpenOptions::new();
    options.create(true).append(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options.open(path)?.write_all(&bytes)
}

pub(crate) fn init(config_dir: &Path) {
    JOURNAL.get_or_init(|| {
        let root = config_dir.join("core/logs");
        let path = root.join("request-diagnostics.jsonl");
        let directory_ok = fs::create_dir_all(&root).is_ok();
        let journal = Arc::new(Journal::new(Some(path)));
        if let Ok(mut state) = journal.state.lock() {
            state.events.extend(persisted_events(config_dir));
        }
        if !directory_ok {
            if let Some(writer) = &journal.writer {
                writer.health.write_failures.fetch_add(1, Ordering::Relaxed);
            }
        }
        journal
    });
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Snapshot {
    pub schema_version: u32,
    pub persistence_ok: bool,
    pub events: Vec<Event>,
    #[serde(default)]
    pub pending_writes: usize,
    #[serde(default)]
    pub dropped_events: u64,
    #[serde(default)]
    pub write_failures: u64,
    #[serde(default)]
    pub writer_running: bool,
}

pub(crate) fn snapshot() -> Option<Snapshot> {
    let journal = JOURNAL.get()?;
    let state = journal.state.lock().ok()?;
    let health = journal.writer.as_ref().map(|w| &w.health);
    Some(Snapshot {
        schema_version: 1,
        persistence_ok: journal
            .writer
            .as_ref()
            .is_some_and(BackgroundWriter::persistence_ok),
        events: state.events.iter().cloned().collect(),
        pending_writes: health.map_or(0, |h| h.pending.load(Ordering::Acquire)),
        dropped_events: health.map_or(0, |h| h.dropped.load(Ordering::Relaxed)),
        write_failures: health.map_or(0, |h| h.write_failures.load(Ordering::Relaxed)),
        writer_running: health.is_some_and(|h| h.running.load(Ordering::Acquire)),
    })
}

pub(crate) async fn shutdown() {
    if let Some(writer) = JOURNAL.get().and_then(|j| j.writer.as_ref()) {
        if !writer.stop_and_join(Duration::from_secs(2)).await {
            // Do not wait forever for an OS write on a broken/network disk.
            log::warn!("[Core] 阶段日志退出等待超时，未强制中断磁盘写入");
        }
    }
}

/// Closed-schema projection, including when a Core response/file was tampered
/// with. No request IDs, free-form error messages or labels enter a report.
pub(crate) fn support_events(events: &[Event], since: i64, until: i64) -> Vec<serde_json::Value> {
    let mut aliases = std::collections::HashMap::new();
    events
        .iter()
        .rev()
        .filter(|e| e.started_at > since * 1000 && e.at <= until * 1000 + 999)
        .take(40)
        .map(|e| {
            let next = aliases.len() + 1;
            let alias = *aliases.entry(e.request_id.as_str()).or_insert(next);
            serde_json::json!({
                "requestAlias": format!("request-{alias}"),
                "tool": "claude-desktop", "startedAtMs": e.started_at,
                "atMs": e.at, "stage": e.stage, "outcome": e.outcome,
                "status": e.status.filter(|s| (100..=599).contains(s)), "elapsedMs": e.elapsed_ms,
            })
        })
        .collect()
}

/// Optional local recovery after a Core crash; bounded read, no arbitrary files.
pub(crate) fn persisted_events(config_dir: &Path) -> Vec<Event> {
    let path = config_dir.join("core/logs/request-diagnostics.jsonl");
    let Ok(file) = fs::File::open(path) else {
        return vec![];
    };
    let mut text = String::new();
    if file.take(MAX_FILE_BYTES).read_to_string(&mut text).is_err() {
        return vec![];
    }
    let mut events: Vec<Event> = text
        .lines()
        .rev()
        .take(MAX_EVENTS)
        .filter_map(|line| serde_json::from_str::<Event>(line).ok())
        .collect();
    events.reverse();
    events
}

#[derive(Clone)]
struct TraceContext {
    id: String,
    started_at: i64,
    start: Instant,
    stage: Arc<Mutex<Stage>>,
    journal: Option<Arc<Journal>>,
}

tokio::task_local! { static TRACE: TraceContext; }

impl TraceContext {
    fn record(&self, outcome: Outcome, status: Option<u16>) {
        if let (Some(journal), Ok(stage)) = (&self.journal, self.stage.lock()) {
            journal.record(Event {
                request_id: self.id.clone(),
                started_at: self.started_at,
                at: chrono::Utc::now().timestamp_millis(),
                stage: *stage,
                outcome,
                status,
                elapsed_ms: self.start.elapsed().as_millis().min(u64::MAX as u128) as u64,
            });
        }
    }
}

pub(crate) fn stage(stage: Stage) {
    let _ = TRACE.try_with(|trace| {
        if let Ok(mut current) = trace.stage.lock() {
            *current = stage;
        }
        trace.record(Outcome::Progress, None);
    });
}

struct TraceGuard {
    trace: TraceContext,
    finished: bool,
    status: Option<u16>,
}

impl TraceGuard {
    fn finish(&mut self, outcome: Outcome) {
        self.finished = true;
        self.trace.record(outcome, self.status);
    }
}

impl Drop for TraceGuard {
    fn drop(&mut self) {
        if !self.finished {
            self.trace.record(Outcome::Cancelled, self.status);
        }
    }
}

pub(crate) async fn observe<F>(future: F) -> axum::response::Response
where
    F: std::future::Future<Output = axum::response::Response>,
{
    observe_with(future, JOURNAL.get().cloned()).await
}

async fn observe_with<F>(future: F, journal: Option<Arc<Journal>>) -> axum::response::Response
where
    F: std::future::Future<Output = axum::response::Response>,
{
    let trace = TraceContext {
        id: uuid::Uuid::new_v4().to_string(),
        started_at: chrono::Utc::now().timestamp_millis(),
        start: Instant::now(),
        stage: Arc::new(Mutex::new(Stage::Received)),
        journal,
    };
    trace.record(Outcome::Progress, None);
    let mut guard = TraceGuard {
        trace: trace.clone(),
        finished: false,
        status: None,
    };
    let result = TRACE
        .scope(trace.clone(), AssertUnwindSafe(future).catch_unwind())
        .await;
    let response = match result {
        Ok(response) => response,
        Err(_) => {
            guard.status = Some(500);
            guard.finish(Outcome::Panic);
            // Do not echo a panic payload (may contain credentials).
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "error": {"type": "proxy_error", "code": "yuanheng_core_handler_panic",
                    "message": "元衡本地网关处理异常，请导出脱敏诊断；不要自动重试。"}
                })),
            )
                .into_response();
        }
    };
    guard.status = Some(response.status().as_u16());
    if let Ok(mut current) = trace.stage.lock() {
        *current = Stage::ResponseHeaders;
    }
    trace.record(Outcome::Progress, guard.status);
    let (parts, body) = response.into_parts();
    let mut source = AssertUnwindSafe(http_body_util::BodyStream::new(body)).catch_unwind();
    let stream = async_stream::stream! {
        // Own the guard before the first poll, so even an unpolled body drop
        // records cancellation instead of leaving a false successful result.
        let mut guard = guard;
        while let Some(chunk) = source.next().await {
            match chunk {
                Ok(Ok(bytes)) => yield Ok::<_, std::io::Error>(bytes),
                Ok(Err(_)) => {
                    guard.finish(Outcome::BodyError);
                    yield Err(std::io::Error::other("yuanheng response body interrupted"));
                    return;
                }
                Err(_) => {
                    guard.finish(Outcome::Panic);
                    yield Err(std::io::Error::other("yuanheng response body panic"));
                    return;
                }
            }
        }
        guard.finish(Outcome::TransportComplete);
    };
    axum::response::Response::from_parts(parts, Body::new(http_body_util::StreamBody::new(stream)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use http_body_util::BodyExt;

    #[tokio::test]
    async fn handler_panic_is_safe_http_error_with_stage_not_payload() {
        let dir = tempfile::tempdir().unwrap();
        let journal = Arc::new(Journal::new(Some(
            dir.path().join("request-diagnostics.jsonl"),
        )));
        let response = observe_with(
            async {
                stage(Stage::Parsed);
                panic!("Bearer secret-token private-user");
                #[allow(unreachable_code)]
                StatusCode::OK.into_response()
            },
            Some(journal.clone()),
        )
        .await;
        assert_eq!(response.status(), 500);
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        assert!(!String::from_utf8_lossy(&bytes).contains("secret-token"));
        assert!(
            journal
                .writer
                .as_ref()
                .unwrap()
                .stop_and_join(Duration::from_secs(2))
                .await
        );
        let state = journal.state.lock().unwrap();
        let last = state.events.back().unwrap();
        assert_eq!(last.stage, Stage::Parsed);
        assert_eq!(last.outcome, Outcome::Panic);
        let disk = fs::read_to_string(dir.path().join("request-diagnostics.jsonl")).unwrap();
        assert!(!disk.contains("secret-token"));
        assert!(!disk.contains("private-user"));
    }

    #[tokio::test]
    async fn body_failure_cancel_and_completion_are_distinct() {
        let journal = Arc::new(Journal::new(None));
        let good = observe_with(async { "OK".into_response() }, Some(journal.clone())).await;
        good.into_body().collect().await.unwrap();
        assert_eq!(
            journal.state.lock().unwrap().events.back().unwrap().outcome,
            Outcome::TransportComplete
        );
        let cancelled = observe_with(async { "OK".into_response() }, Some(journal.clone())).await;
        drop(cancelled);
        assert_eq!(
            journal.state.lock().unwrap().events.back().unwrap().outcome,
            Outcome::Cancelled
        );
        let bad = observe_with(
            async {
                Body::from_stream(futures::stream::once(async {
                    Err::<bytes::Bytes, _>(std::io::Error::other("private body"))
                }))
                .into_response()
            },
            Some(journal.clone()),
        )
        .await;
        assert!(bad.into_body().collect().await.is_err());
        assert_eq!(
            journal.state.lock().unwrap().events.back().unwrap().outcome,
            Outcome::BodyError
        );
    }

    #[tokio::test]
    async fn observation_preserves_data_and_trailers_and_catches_body_panics() {
        let journal = Arc::new(Journal::new(None));
        let mut trailers = http::HeaderMap::new();
        trailers.insert("x-synthetic-trailer", "kept".parse().unwrap());
        let frames = vec![
            Ok::<_, std::io::Error>(http_body::Frame::data(bytes::Bytes::from_static(b"data"))),
            Ok(http_body::Frame::trailers(trailers)),
        ];
        let response = observe_with(
            async {
                Body::new(http_body_util::StreamBody::new(futures::stream::iter(
                    frames,
                )))
                .into_response()
            },
            Some(journal.clone()),
        )
        .await;
        let collected = response.into_body().collect().await.unwrap();
        assert_eq!(collected.trailers().unwrap()["x-synthetic-trailer"], "kept");
        assert_eq!(collected.to_bytes(), "data");
        let response = observe_with(
            async {
                Body::from_stream(futures::stream::once(async {
                    panic!("body secret");
                    #[allow(unreachable_code)]
                    Ok::<bytes::Bytes, std::io::Error>(bytes::Bytes::new())
                }))
                .into_response()
            },
            Some(journal.clone()),
        )
        .await;
        assert!(response.into_body().collect().await.is_err());
        assert_eq!(
            journal.state.lock().unwrap().events.back().unwrap().outcome,
            Outcome::Panic
        );
    }

    #[tokio::test]
    async fn concurrent_requests_do_not_share_stage_state() {
        let journal = Arc::new(Journal::new(None));
        let barrier = Arc::new(tokio::sync::Barrier::new(2));
        let mut tasks = Vec::new();
        for expected in [Stage::Parsed, Stage::UpstreamSend] {
            let barrier = barrier.clone();
            let journal = journal.clone();
            tasks.push(tokio::spawn(async move {
                observe_with(
                    async move {
                        stage(expected);
                        barrier.wait().await;
                        TRACE.with(|trace| assert_eq!(*trace.stage.lock().unwrap(), expected));
                        StatusCode::NO_CONTENT.into_response()
                    },
                    Some(journal),
                )
                .await
            }));
        }
        for task in tasks {
            task.await.unwrap().into_body().collect().await.unwrap();
        }
        assert_eq!(
            journal
                .state
                .lock()
                .unwrap()
                .events
                .iter()
                .filter(|e| e.outcome == Outcome::TransportComplete)
                .count(),
            2
        );
    }

    #[tokio::test]
    async fn rotation_capacity_export_boundary_and_disk_failure() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("events.jsonl");
        fs::write(&path, vec![b' '; MAX_FILE_BYTES as usize]).unwrap();
        let journal = Journal::new(Some(path.clone()));
        let event = Event {
            request_id: "untrusted-private-id".into(),
            started_at: 2000,
            at: 3000,
            stage: Stage::Received,
            outcome: Outcome::Progress,
            status: None,
            elapsed_ms: 1,
        };
        for _ in 0..150 {
            journal.record(event.clone());
        }
        assert!(
            journal
                .writer
                .as_ref()
                .unwrap()
                .stop_and_join(Duration::from_secs(2))
                .await
        );
        assert_eq!(journal.state.lock().unwrap().events.len(), MAX_EVENTS);
        assert!(path.with_extension("previous.jsonl").exists());
        assert!(fs::metadata(&path).unwrap().len() <= MAX_FILE_BYTES);
        assert!(support_events(&[event.clone()], 2, 4).is_empty());
        let exported = support_events(&[event], 1, 4);
        assert_eq!(exported.len(), 1);
        assert!(!serde_json::to_string(&exported)
            .unwrap()
            .contains("private"));
        let broken = Journal::new(Some(dir.path().join("missing").join("events")));
        broken.record(journal.state.lock().unwrap().events[0].clone());
        let writer = broken.writer.as_ref().unwrap();
        assert!(writer.stop_and_join(Duration::from_secs(2)).await);
        assert_eq!(writer.health.write_failures.load(Ordering::Relaxed), 1);
        assert!(!writer.persistence_ok());
    }

    fn synthetic_event() -> Event {
        Event {
            request_id: "synthetic".into(),
            started_at: 1000,
            at: 1001,
            stage: Stage::Received,
            outcome: Outcome::Progress,
            status: None,
            elapsed_ms: 1,
        }
    }

    #[tokio::test]
    async fn blocked_disk_does_not_block_requests_snapshots_or_shutdown_deadline() {
        let (ready_tx, ready_rx) = mpsc::channel();
        let (release_tx, release_rx) = mpsc::channel();
        let mut first = true;
        let writer = BackgroundWriter::spawn(2, move |_| {
            if first {
                first = false;
                ready_tx.send(()).unwrap();
                release_rx
                    .recv_timeout(Duration::from_secs(3))
                    .map_err(|_| std::io::Error::other("synthetic slow-disk wait expired"))?;
            }
            Ok(())
        });
        let journal = Arc::new(Journal {
            state: Mutex::new(JournalState {
                events: VecDeque::new(),
            }),
            writer: Some(writer),
        });
        journal.record(synthetic_event());
        ready_rx.recv_timeout(Duration::from_secs(2)).unwrap();
        for _ in 0..20 {
            journal.record(synthetic_event());
        }
        let writer = journal.writer.as_ref().unwrap();
        assert_eq!(writer.health.pending.load(Ordering::Acquire), 3); // two queued + one writing
        assert_eq!(writer.health.dropped.load(Ordering::Relaxed), 18);
        assert_eq!(journal.state.lock().unwrap().events.len(), 21);
        let response = observe_with(async { "OK".into_response() }, Some(journal.clone())).await;
        assert_eq!(
            response.into_body().collect().await.unwrap().to_bytes(),
            "OK"
        );
        assert_eq!(
            writer.health.write_failures.load(Ordering::Relaxed),
            0,
            "HTTP must finish before the synthetic disk wait expires"
        );
        assert!(!writer.persistence_ok(), "overflow must remain visible");
        assert!(!writer.stop_and_join(Duration::from_millis(25)).await);
        release_tx.send(()).unwrap();
        assert!(writer.stop_and_join(Duration::from_secs(2)).await);
        assert_eq!(writer.health.pending.load(Ordering::Acquire), 0);
        assert!(!writer.health.running.load(Ordering::Acquire));
    }

    #[tokio::test]
    async fn panicking_consumer_and_late_writes_are_counted_and_thread_is_reaped() {
        let writer = BackgroundWriter::spawn(2, |_| -> std::io::Result<()> {
            panic!("synthetic writer failure");
        });
        writer.enqueue(synthetic_event());
        assert!(writer.stop_and_join(Duration::from_secs(2)).await);
        assert_eq!(writer.health.write_failures.load(Ordering::Relaxed), 1);
        assert_eq!(writer.health.pending.load(Ordering::Acquire), 0);
        writer.enqueue(synthetic_event());
        assert_eq!(writer.health.dropped.load(Ordering::Relaxed), 1);
        assert!(!writer.persistence_ok());
    }

    #[tokio::test]
    async fn normal_shutdown_drains_all_accepted_events_without_holding_state_lock() {
        let writes = Arc::new(AtomicUsize::new(0));
        let counter = writes.clone();
        let writer = BackgroundWriter::spawn(128, move |_| {
            counter.fetch_add(1, Ordering::Relaxed);
            Ok(())
        });
        for _ in 0..100 {
            writer.enqueue(synthetic_event());
        }
        assert!(writer.stop_and_join(Duration::from_secs(2)).await);
        assert_eq!(writes.load(Ordering::Relaxed), 100);
        assert_eq!(writer.health.dropped.load(Ordering::Relaxed), 0);
        assert_eq!(writer.health.write_failures.load(Ordering::Relaxed), 0);
        assert_eq!(writer.health.pending.load(Ordering::Acquire), 0);
    }

    #[tokio::test]
    async fn write_error_is_reported_but_later_writes_can_continue() {
        let writes = Arc::new(AtomicUsize::new(0));
        let counter = writes.clone();
        let writer = BackgroundWriter::spawn(8, move |_| {
            if counter.fetch_add(1, Ordering::Relaxed) == 0 {
                Err(std::io::ErrorKind::PermissionDenied.into())
            } else {
                Ok(())
            }
        });
        writer.enqueue(synthetic_event());
        writer.enqueue(synthetic_event());
        assert!(writer.stop_and_join(Duration::from_secs(2)).await);
        assert_eq!(writes.load(Ordering::Relaxed), 2);
        assert_eq!(writer.health.write_failures.load(Ordering::Relaxed), 1);
        assert_eq!(writer.health.dropped.load(Ordering::Relaxed), 0);
        assert_eq!(writer.health.pending.load(Ordering::Acquire), 0);
    }
}
