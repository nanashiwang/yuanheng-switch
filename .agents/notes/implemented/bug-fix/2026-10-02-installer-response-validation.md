# Agent Note: Claude Windows 安装响应校验与安全错误展示

Status: implemented

## Problem

安装端把下载结果直接交给 ScriptBlock.Create，截图中网页 JavaScript 被当作 PowerShell 解析，原始 CLIXML 和脚本源随后进入 toast。网页来源尚无用户端 HTTP 证据，不能断言地区或网络拦截。

## Decision

沿用原生安装器地址、受控进程与取消机制，改用带超时的 Invoke-WebRequest 获取状态、最终地址和类型，拒绝非 HTTPS、非成功响应、HTML/JSON/XML、空内容和过大内容；解析成功后才执行。下载/校验/执行失败只输出固定标记和受限 HTTP 元数据，不输出正文、查询参数、个人路径或完整异常。关于页复制安装命令复用同一脚本。

安装结果整理优先识别固定标记；CLIXML（含截断片段）降级为简短提示，不正则拼凑任意 XML 异常并展示。普通命令失败仍保留有限尾部文本。不会自动换服务或回退 npm。

## Alternatives considered

- 只关掉 progress 或改 OutputFormat Text 能减轻 XML，但仍可能执行错误网页，且错误会暴露脚本/路径；不够。
- 只按 Content-Type 放行最简单，但网关可把 HTML 标成 text/plain，且合法脚本可用 octet-stream；同时检查正文形态与 PowerShell 语法。
- 引入完整 CLIXML 解析可以保留详情，但截图错误包含网页全文和潜在个人信息；本流程用固定分类更小、更安全。

## Verification

本地 PowerShell 7.4.6 以生产相同的 EncodedCommand 方式运行 `scripts/test_claude_windows_installer.py`：15 个模拟响应回归通过，覆盖网页伪装、JSON/XML、空/超长、语法错误、下载异常、执行异常、带 CmdletBinding 的合法脚本、BOM 与 octet-stream。拒绝路径未执行模拟安装标记，输出不含正文秘密或 CLIXML，成功路径仅写临时标记；无真实网络请求或安装。

初次前端全量 831 项、TypeScript、格式、renderer 构建通过；共享脚本的 Rust include 与关于页 raw import 有源契约回归。新增 Rust 测试覆盖 CLIXML/截断错误、错误分类、长单行和普通错误。v0.1.64 发布前已使用临时 Rust 工具链执行包含本改动的完整回归：2451 通过、2 项原有忽略，Clippy 无警告；当前前端 852 项通过，15 项 PowerShell 模拟测试再次通过。Windows PowerShell 5.1、真实上游下载和干净 Windows 安装未验收。本地临时 PowerShell 无全局安装、未改 shell 配置。

## Consequences

响应检查不是签名验证，不保证上游脚本绝对安全或下载可达；官方 MIME 变化可能需要调整允许表。正文长度检查在下载完成后进行，不是流式网络字节上限。对 CLIXML 采用固定降级消息会牺牲详细异常，但不泄露下载网页/脚本/个人路径；进程输出不上传。PowerShell 5.1 Windows 真机仍需独立验证。本轮仅本地，不提交推送发布。

## Existing notes audit

[安装状态](2026-10-01-tool-install-and-model-picker.md) 部分重叠，复用原生安装策略；[进程监督](2026-10-01-bounded-tool-installation.md) 独立保持超时与取消，不替代响应校验。
