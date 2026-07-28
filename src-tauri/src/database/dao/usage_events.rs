use crate::database::{lock_conn, Database};
use crate::error::AppError;

impl Database {
    /// 用于 GUI 检测独立 Core 新写入的用量日志。
    pub fn get_usage_log_revision(&self) -> Result<(i64, i64), AppError> {
        let conn = lock_conn!(self.conn);
        conn.query_row(
            "SELECT COUNT(*), COALESCE(MAX(rowid), 0) FROM proxy_request_logs",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|error| AppError::Database(error.to_string()))
    }
}
