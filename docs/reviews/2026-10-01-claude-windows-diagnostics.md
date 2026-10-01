# Claude Desktop / Windows 本地验收

## 目的与边界

本地修复独立 Core 的 TLS 后端选择与已确认的诊断盲区；未发布版本，不能仅凭客户端显示 `0.1.61` 判断是否包含改动。下载运行组件超时是另一条链路，本改动不代理官方下载、不改变地区限制、不自动开启虚拟化或回环豁免。

## 可复现的代码缺陷

GUI 在 setup 中安装 ring CryptoProvider，独立 Core 不执行 GUI setup。锁定依赖同时启用 ring 和 aws-lc，因此 `ClientConfig::builder()` 及 Hyper fallback 的隐式 builder 在全新进程中 panic。

回归用独立子进程，避免其它测试或 GUI 已设置的全局后端掩盖问题：

```sh
cargo test --manifest-path src-tauri/Cargo.toml --lib headless_tls_tests -- --nocapture
```

修复前两条连接器均触发 `Could not automatically determine the process-level CryptoProvider`。修复在连接器创建点显式选择 ring，保留各自原有信任根、主机名验证、代理策略；不关闭 TLS 验证。

## 自动回归入口

```sh
cargo test --manifest-path src-tauri/Cargo.toml --lib core_diagnostics
cargo test --manifest-path src-tauri/Cargo.toml --lib claude_desktop_diagnostics
cargo test --manifest-path src-tauri/Cargo.toml --lib desktop_gateway_auth_parse_and_mapping
cargo test --manifest-path src-tauri/Cargo.toml --lib trusted_store_aumid
pnpm test:unit tests/components/YuanhengHealthCard.test.tsx
bash .agents/verify-notes.sh
```

测试仅使用内存数据库、临时目录与 loopback 合成服务，不能产生真实模型费用。

## Windows 真机检查清单（待执行）

1. 保留原配置和重要工作，停止所有模型请求。使用本分支构建的客户端及配套 Core，勿把旧版 Core 的启动结果当作新代码验收。
2. 检查已安装的官方 Claude MSIX 被识别；假的相似包名不可识别为官方。不得更改 WindowsApps 权限或自动添加回环豁免。
3. 工作台 → 智能体检 → 重新检查 → 检查详情。核对实际 Core 版本、阶段诊断能力、Windows 虚拟化检查和本机网关检查。旧 Core 应显示缺少阶段诊断，不能静默算通过。
4. 不启用虚拟机平台、查询无权限/超时等情况必须区分。该项检查不会执行启用命令；功能开启也不代表运行镜像已下载。
5. 一次默认体检只能访问本机 `/claude-desktop/v1/models`，不得 POST 模型推理或跟随重定向。用户已应用的模型/分组/密钥保持不变。
6. 实际模型请求需单独获准：发一个简短消息（可能计费），记录是否收到正常回复或明确 HTTP 错误。失败后不连续重发。
7. 同次诊断预览、复制、导出内容一致；`core.events` 能区分收到请求、认证、解析、供应商/模型映射、发往上游、响应头、响应完成、取消、body_error、panic。传输完成不等于模型正确回答或官方计费确认。
8. 分享只使用脱敏诊断快照。结构化阶段日志保存在应用配置目录下 `core/logs/request-diagnostics.jsonl`，单文件 256 KiB，保留一份轮转文件。没有原始正文、密钥或错误 payload，不上传数据库或 `admin.token`。
9. 关闭测试窗口和临时服务，确认无遗留测试进程；元衡正常后台 Core 不属于测试残留。

## 后续审查加固

- 日志由单一后台线程写盘，128 条队列另加最多一条进行中的写入。队列满不等待，报告提供 `pendingWrites`、`droppedEvents`、`writeFailures` 和 `writerRunning`；计数为本机 Core 生命周期状态，不是账号计费记录。
- Core 正常退出最多等两秒排空日志；磁盘异常不无限阻止退出。尚未落盘的记录可能在进程退出时丢失，内存报告不等同于磁盘已完整保存。
- 自动识别 Claude MSIX 仅接受已确认完整包族，不再按 `Anthropic.*` 名称放行；未确认旧包可能不被自动识别，须拿到身份验证证据后扩展，不能以关闭保护或放宽任意包名解决。

## 不可提前宣称

- 此文档不代表已经在 Windows 安装运行；本机 macOS 编译/单测不能替代真机验证。
- 缺少事件不证明请求完全未进入操作系统；协议解析前、native 崩溃、进程退出无法都由请求观察器覆盖。
- 当前锁定版本未增加日志下载或更新安装包；推送、构建 Windows 包和发布是后续独立步骤。
