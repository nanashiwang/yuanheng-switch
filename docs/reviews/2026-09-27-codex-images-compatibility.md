# Codex 内置图片生成与编辑兼容性（v0.1.58）

## 根因与边界

Codex 0.155.0-alpha.16.4 使用 `yuanheng-switch-official`，地址为本地 Core 的 `/v1`，并保留 `requires_openai_auth = true`。普通 Responses 对话正常，但 Core 0.1.56 和修复前的 0.1.57 源码均未注册 Images 路由，图片请求在本地返回空正文 404，尚未到达官方上游。

该错误不能用于推断账号缺少权限，也不要求把 ChatGPT OAuth 改成 API Key。上游 OPTIONS 的 HTML 403 同样不能代替真实 POST 验证。

## 实现

- 新增 `/images/generations`、`/images/edits`，支持无前缀、`/v1`、`/v1/v1` 和 `/codex/v1`。
- 使用独立 `proxy/images.rs`，请求体按字节透传；JSON 图片引用、multipart 边界、模型与图片参数不经过聊天转换、模型映射或媒体降级。
- 只使用当前选中的 Codex 供应商，不进入聊天故障转移队列或熔断选择。单次提交，HTTP 客户端也禁用自动重试和重定向。
- OpenAI Official 的上游固定为 `https://chatgpt.com/backend-api/codex`，保留客户端 OAuth Authorization、ChatGPT 账号及 Codex 请求标识，不采用可编辑的上游地址或存储的 API Key。
- 普通兼容供应商使用自己的 Bearer 凭据，删除客户端官方账号鉴权；其他托管供应商暂不接入此通道，返回明确配置错误。
- 整个上游请求独立超时 15 分钟，请求上限 200 MiB，响应按块限制为 256 MiB。结果不确定时返回错误，不重放请求。
- 保留上游 HTTP 状态、原始响应正文、内容编码、错误编号与请求头；`x-yuanheng-response-source` 标记 `local` 或 `upstream`，`x-yuanheng-request-id` 关联本地日志。接收响应失败时额外保留上游请求编号及 `x-yuanheng-upstream-status`。
- 日志仅记录路径、Content-Type、状态、编号及耗时，不记录凭据、提示词或图片内容。活跃连接保护持续至图片交付结束，避免 Core 在传输期间自动升级。

## 验证记录

本机升级至 Core 0.1.58 后，使用 **Codex 内置 `image_gen.imagegen`** 完成实际验证，未使用备用 API 脚本：

| 验证 | 结果 |
| --- | --- |
| 生成浅黄色桌面上的蓝色陶瓷杯 | `/v1/images/generations` HTTP 200，20.165 秒，得到 PNG |
| 以生成的 PNG 为引用，只将杯子改成红色 | `/v1/images/edits` HTTP 200，21.257 秒，得到编辑后的 PNG |
| 同一代理、同一 OAuth 身份的普通 Responses 对话 | HTTP 200，收到 `response.completed`，回复 `YUANHENG_CHAT_OK`，无错误事件 |
| Codex 配置与登录文件 | 修改前后摘要相同，无改写 |

本次图像提示词为“生成一只蓝色陶瓷杯，浅黄色桌面，干净背景”，编辑指令为“只把杯子改成红色，保留形状、构图、灯光与背景”。两张结果已在验收会话中展示。上游这两次响应未提供 `x-request-id`；本地请求编号分别为 `e1fdf002-9418-4c1d-a6ec-2872758eda3e` 与 `d4f5e578-780b-485c-b7d3-231bdc24abf4`。

自动检查：Rust 测试 2416 项通过（2 项原有忽略），TypeScript 检查、前端测试 811 项、前端构建、发布版本/中文公告检查、Rust 格式检查、CI 同参数 Clippy 均通过。新增测试覆盖路由、官方身份及固定上游、JSON/multipart 原样透传、错误与请求编号、重定向/错误不重发、超时和响应体上限；原有聊天测试同时通过。

安装发布版本后仍须核对后台 Core 的实际版本；桌面 App 版本、源码版本或路由 405 都不能单独作为端到端验收证据。上述成功只证明本次测试账号和当时的官方上游可用，不扩大为所有供应商、账号或托管 OAuth 渠道均可生图。
