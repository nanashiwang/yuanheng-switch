# Codex 登录方式切换后的历史会话兼容

## 问题与结果

旧会话保存了 `yuanheng` 或 `custom` 供应商标识。切换到官方账号时，原实现提取通用配置并移除供应商表，只生成 `yuanheng-switch-official`，恢复旧会话因此报 `Model provider ... not found`。

新增 `codex_history_routes` 配置投影层，在元衡管理的两种登录方式之间维护这三个标识。旧会话使用当前选择的登录方式；聊天记录、会话数据库和登录凭据均无需迁移。

## 覆盖范围

- 官方路由生成、配置写入、代理接管/备份恢复共用兼容逻辑。
- Core 启动和巡检会修复缺失兼容项，并同步实际端口；保留原来的 Desktop/CLI 路径。
- 诊断增加历史兼容检查；网络登录检查失败或超时也会执行本机检查。
- 重复点击当前使用方式可以修复配置。相同模式下保留模型和推理设置，健康配置不重复写入、不新增备份、不提示重启。
- 释放官方代理时，历史标识改为官方原生认证配置，移除受管端点与占位凭据，避免旧会话指向已停止的 Core。
- 托管配置改变前备份原配置，默认目录为 `~/.yuanheng-switch/backups/codex-history-routes/`，遵循应用自定义数据目录。Unix 新备份文件权限为 `0600`。备份失败则停止写入，账号切换沿用原有快照回滚。

## 自定义配置保护

只处理三个已知标识，并按元衡生成的字段形态识别可更新的定义；附加字段、外部地址、用户凭据等均作为自定义配置保留。冲突占用了目标主供应商时，阻止覆盖；冲突只涉及历史兼容项时，保留并显示提示。

官方模式清理受管本地端点中的 `PROXY_MANAGED` 占位值，保留真实用户令牌。未知供应商不会自动改成元衡或官方路由。

## 模型兼容性边界

供应商能解析不等于旧模型属于当前账号。客户端显示旧对话跟随当前使用方式，并提示旧模型不可用时在 Codex 中重选。本次不推断官方账号模型权限，也不静默修改历史会话模型。

## 验证

- 612 项 Codex Rust 单元/集成测试通过，包含双向切换、三种历史标识、端口变化、自定义配置、重复修复、备份失败回滚及登录凭据保护。
- TypeScript 类型检查通过；工作台相关前端测试通过。
- 本机 Codex CLI 0.151.0：使用独立临时配置和合成历史，真实调用 app-server 的 `thread/resume`。原配置复现 `yuanheng` 与 `custom` 缺失报错；修复后，三种标识在官方代理、切回元衡、官方原生恢复三个场景均恢复成功。
- 冒烟验证不发送 `turn/start`，不调用模型，不复制真实登录凭据或读取真实聊天记录。该验证不能证明某个模型的账号权限或实际推理请求成功。

复现命令：

```sh
cargo test --manifest-path src-tauri/Cargo.toml --lib codex --offline
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/vitest run tests/hooks/useModelSwitchCenter.test.tsx tests/components/FocusToolCard.test.tsx
python3 scripts/check-codex-history-resume.py
```

冒烟夹具的内容另由 Rust 测试对照生产配置投影生成结果校验。
