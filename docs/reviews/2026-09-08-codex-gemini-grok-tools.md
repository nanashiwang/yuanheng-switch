# Codex Gemini/Grok client compatibility review

## Scope

Client only. No New API or CLIProxyAPI source, production configuration, account,
credential, model mapping or upstream version headers are modified.

The supported route is the YuanHeng-configured Codex Responses-to-Chat bridge.
Native xAI OAuth/Responses and unrelated client/provider adapters remain unchanged.
This release does not claim to fix Gemini CLI model-retirement responses or CPA
rewriting Claude Code versions.

## Invariants

- Match the resolved target model, including provider-prefixed Gemini/Grok IDs.
- Remove only declaration-level `strict` for Gemini. A user's property named
  `strict`, its constraints, and GPT/other-provider strict metadata stay intact.
- Function-call arguments are objects. For Grok, intersect the parameter root and
  its same-instance `anyOf`/`oneOf`/`allOf` branches with `type: object`.
- Never flatten all branch properties together, remove `required`, deduplicate
  `oneOf`, or change nested property/item/definition schemas.
- An object-incompatible union branch becomes an explicit unsatisfiable object
  branch (`type: object`, `not: {}`), retaining indices and union semantics.
  An impossible root or conjunction fails locally rather than becoming permissive.
- Unsafe root/external/dynamic references fail explicitly. References into
  unchanged `$defs`/`definitions` are retained. No network schema resolution.
- Preserve function names, namespace restoration, tool choice, call IDs, arguments
  and tool results. No new argument envelope and no silent tool deletion.
- Depth/node limits bound schema work. Errors never include private schema content.
- Final outgoing Chat declarations are checked after body overrides as well.

## Adversarial validation

- Flat, nested and namespace tool declarations through the actual Codex converter.
- Gemini true/false strict metadata removed only at the function declaration.
- GPT, DeepSeek and names merely containing "Gemini" remain unchanged.
- Missing branch types, nested same-instance unions and conjunctions.
- Mixed null/string/object unions and duplicate oneOf branches.
- Required fields, const constraints and additionalProperties retained.
- Independent fixture validator compares accepted/rejected object calls before and
  after conversion; it is a bounded test helper, not a production schema validator.
- User properties named `$ref` and constant objects containing `$ref` remain data.
- Impossible roots, invalid union types, deep schemas and unsafe references fail
  atomically, without dropping tools or emitting schema contents.
- Grok namespace tool invocation, fragmented argument output and following tool
  result retain the original namespace/name and call ID.
- Reapplying the adapter is deterministic and idempotent.

## Acceptance boundary

Synthetic tests do not prove the user's live channel uses the same validator or
has no other compatibility defects. After installing, fully restart Codex and
test a new session with the original group/model: ordinary text, a read-only tool
call, and a follow-up turn. Capture the new request ID if rejected.

Do not advise upgrading an already-new Claude CLI to solve a server-side version
rewrite. Do not change Gemini model aliases or synthesize a successful finish
event for an upstream retirement error.

Release announcements retain only v0.1.49 and v0.1.48. Verify CI, release files,
mirror manifests and download hashes independently. End with no remaining test,
build, download or monitoring processes from this task.

## Local results

- 9 new targeted tests, including the object-argument equivalence fixture matrix
  and fragmented SSE namespace-tool round trip.
- Rust: 2250 unit tests passed, 2 existing ignored; 116 integration tests passed.
- Frontend: 123 files / 760 tests passed.
- Rust formatting, Clippy with `-D warnings`, TypeScript, Prettier, renderer build,
  version/rolling-announcement check and `git diff --check` passed.
- No live model calls, account reads, server configuration changes or service restarts.
- New API and CLIProxyAPI working trees were checked and remain unchanged.
