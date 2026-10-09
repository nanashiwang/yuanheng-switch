# macOS Developer ID 签名与公证发布

元衡通过官网和 GitHub Release 分发 DMG，分别支持 Apple 芯片与 Intel Mac，最低系统版本仍是 macOS 12。应用标识保持 `com.nanashiwang.yuanhengswitch`，已有用户的数据目录及自动更新公钥不变。

## 凭据配置

开发者会员须已生效。申请 **Developer ID Application** 证书并选择 G2 中间证书；保存对应私钥，导出带密码的 `.p12`。不使用 iOS Distribution、Apple Development 或 Mac App Store 的证书。

在此仓库的 GitHub Actions Secrets 配置以下名称：

| 名称 | 内容 |
| --- | --- |
| `APPLE_CERTIFICATE` | 包含证书和对应私钥的 `.p12`，Base64 编码 |
| `APPLE_CERTIFICATE_PASSWORD` | `.p12` 导出密码 |
| `APPLE_SIGNING_IDENTITY` | 完整的 `Developer ID Application: … (TEAM_ID)` 名称 |
| `APPLE_TEAM_ID` | 证书所属开发者团队 ID |
| `APPLE_ID` | 用于公证的 Apple 账号邮箱 |
| `APPLE_PASSWORD` | 该账号生成的 App 专用密码，不是 Apple 账号登录密码 |

私钥、`.p12`、导出密码和 App 专用密码保存在仓库外，不提交 Git、不写进公告或日志。可通过交互式 `gh secret set NAME --repo nanashiwang/yuanheng-switch` 设置值，避免把秘密直接放进命令行或聊天。

Tauri 更新密钥 `TAURI_SIGNING_PRIVATE_KEY` 及其密码继续沿用；自动更新 `.sig` 验证下载字节，Developer ID 与 Apple 公证负责 macOS 分发信任，两个链路均须验证。

## 构建与验证

沿用 [Desktop Release](../../.github/workflows/release.yml) 和[集中发布](../release-announcements.md)。macOS 发行构建必须具有全部 Apple 凭据，缺失时失败，不再生成未签名发行包。Tauri 执行证书导入、加固运行时签名、公证和票据装订，然后产生自动更新归档与签名。

[验证脚本](../../scripts/verify-macos-release.py) 在上传工作流产物前检查：

- 原始 app、自动更新归档中的 app、只读挂载 DMG 中的 app，分别核对标识和版本。
- 主程序与 `yuanheng-core` 的有效 Developer ID 签名、相同团队、加固运行时、安全时间戳与目标架构。
- `stapler validate` 验证 app 的公证票据，`spctl --assess` 确认 Gatekeeper 接受。

验证不会启动应用或发起模型请求。DMG 验证针对实际分发的内部 app，不把磁盘映像自身签名与 app 公证混为一谈。所有平台成功后才由原有集中任务核对摘要和更新签名、公开 Release，再执行镜像上传。

本机离线回归：`python3 scripts/test_verify_macos_release.py`。实际签名和公证还需有凭据的 macOS 构建，不由模拟测试或 Secret 名称存在代替。首次公证可能需要更长时间；排错使用 Apple 返回的提交状态和日志，不通过关闭 Gatekeeper 或移除 quarantine 规避验收。

## 发布验收边界

只有两个 macOS 构建都通过真实公证和最终产物检查，才能称该版本已签名并公证。已发布的旧版安装包不就地覆盖，改用新的版本号生成整套安装包、更新签名和清单。其他用户设备上的首次安装仍应验证下载、拖入“应用程序”、首次打开及 Core 启动；首次正常的系统确认对话框不等于签名错误。

参考：[Apple Developer ID](https://developer.apple.com/developer-id/)、[Tauri macOS 签名](https://v2.tauri.app/distribute/sign/macos/)。
