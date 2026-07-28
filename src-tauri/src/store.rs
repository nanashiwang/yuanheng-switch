use crate::database::Database;
use crate::services::{ProxyService, UsageCache};
use std::sync::Arc;

/// 全局应用状态
pub struct AppState {
    pub db: Arc<Database>,
    pub proxy_service: ProxyService,
    pub usage_cache: Arc<UsageCache>,
}

impl AppState {
    /// 创建隔离的应用状态（测试、导入导出等非 Desktop 生命周期）。
    pub fn new(db: Arc<Database>) -> Self {
        let proxy_service = ProxyService::new(db.clone());

        Self {
            db,
            proxy_service,
            usage_cache: Arc::new(UsageCache::new()),
        }
    }

    /// 创建 Desktop 主状态，代理由独立 Core 托管。
    pub fn new_desktop(db: Arc<Database>) -> Self {
        let proxy_service = ProxyService::new_managed(db.clone());

        Self {
            db,
            proxy_service,
            usage_cache: Arc::new(UsageCache::new()),
        }
    }
}
