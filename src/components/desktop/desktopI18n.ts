import i18n from "@/i18n";
import { DESKTOP_JA } from "./desktopI18n.ja";
import { DESKTOP_KO } from "./desktopI18n.ko";
import { DESKTOP_ZH_TW } from "./desktopI18n.zhTW";

type Values = Record<string, string | number | null | undefined>;

export const DESKTOP_EN: Record<string, string> = {
  工作台: "Workspace",
  工具管理: "Tool Management",
  能力中心: "Capability Center",
  会话与用量: "Sessions & Usage",
  声音克隆: "Voice Clone",
  连接与路由: "Connections & Routing",
  设置: "Settings",
  元衡桌面端: "YuanHeng Desktop",
  日常使用: "Daily",
  专业控制: "Advanced",
  元衡用户: "YuanHeng User",
  "用户 {{id}}": "User {{id}}",
  "打开官网失败，请稍后重试":
    "Unable to open the website. Please try again later.",
  账号与余额: "Account & Balance",
  已登录: "Signed in",
  可用余额: "Available Balance",
  充值: "Top Up",
  访问元衡官网: "Visit YuanHeng Website",
  访问官网: "Visit Website",
  本地路由运行中: "Local routing is running",
  本地路由未启动: "Local routing is stopped",
  打开中: "Opening...",
  账号用量: "Account Usage",
  余额与消费记录由元衡平台统一管理:
    "Balance and billing records are managed by YuanHeng.",
  查看详情: "View Details",
  今日请求: "Requests Today",
  "今日 Tokens": "Tokens Today",
  今日成本: "Cost Today",
  缓存命中率: "Cache Hit Rate",
  请求数: "Requests",
  "{{count}} 次": "{{count}} requests",
  "Token 总量": "Total Tokens",
  估算成本: "Estimated Cost",
  "约 {{amount}}": "About {{amount}}",
  缓存率: "Cache Rate",
  "{{rate}}% 命中": "{{rate}}% hit",
  在线: "Online",
  离线: "Offline",
  "余额 ${{balance}}": "Balance ${{balance}}",
  元衡服务: "YuanHeng Service",
  已连接: "Connected",
  未连接: "Disconnected",
  本地路由: "Local Routing",
  "运行中 · {{port}}": "Running · {{port}}",
  运行中: "Running",
  未启动: "Stopped",
  应用接管: "App Routing",
  已启用: "Enabled",
  未启用: "Disabled",
  用量: "Usage",
  连接状态: "Connection Status",
  管理: "Manage",
  当前状态: "Current Status",
  焦点应用: "Focused App",
  查看用量: "View Usage",
  今日速览: "Today at a Glance",
  元衡连接: "YuanHeng Connection",
  远程服务: "Remote Service",
  请求直连上游: "Requests go directly upstream",
  "已接管至少一个 AI 工具": "At least one AI tool is routed",
  应用配置保持原状: "App configurations are unchanged",
  故障转移: "Failover",
  可按应用配置候选线路: "Backup routes can be configured per app",
  仅使用当前线路: "Current route only",
  本地路由与高可用: "Local Routing & High Availability",
  "专业功能默认收起，普通使用无需调整。":
    "Advanced controls are collapsed by default; no changes are needed for normal use.",
  本地接管: "Local Routing",
  自动故障转移: "Automatic Failover",
  路由设置保存失败: "Failed to save routing settings",
  "元衡账号负责远程权限和模型目录，本地路由负责接管、健康检查与故障转移。":
    "Your YuanHeng account provides remote access and the model catalog; local routing handles app routing, health checks, and failover.",
  "安装、检测和修复本机 AI 工具；日常模型切换请在工作台完成。":
    "Install, detect, and repair local AI tools. Switch models from the workspace.",
  "本地请求、会话历史和元衡余额集中在同一处查看。":
    "View local requests, session history, and your YuanHeng balance in one place.",
  元衡余额: "YuanHeng Balance",
  用量统计: "Usage Statistics",
  会话记录: "Session History",
  "给 AI 工具安装可复用的专业能力":
    "Install reusable capabilities for AI tools",
  "连接文件、数据库和外部服务":
    "Connect files, databases, and external services",
  按工具维护系统提示词和指令: "Manage system prompts and instructions per tool",
  自治代理编排能力仍在建设中:
    "Autonomous agent orchestration is under development",
  "YuanHeng 图像生成": "YuanHeng Image Generation",
  "在 Codex 中直接生成或编辑图片，直连接口失败时自动兼容回退。":
    "Generate or edit images directly in Codex, with an automatic compatibility fallback when needed.",
  图像生成能力已更新: "Image generation capability updated",
  "图像生成能力已启用到 Codex": "Image generation capability enabled for Codex",
  图像生成能力安装失败: "Failed to install image generation capability",
  更新能力: "Update Capability",
  "启用到 Codex": "Enable for Codex",
  "统一管理 {{app}} 的 Skills、MCP、提示词与 Agent 能力。":
    "Manage Skills, MCP, prompts, and agent capabilities for {{app}}.",
  "{{v0}} 个技能 · {{v1}} 个 MCP": "{{v0}} Skills · {{v1}} MCP",
  "{{count}} 个已就绪": "{{count}} ready",
  正在检测本机工具: "Detecting local tools",
  本机工具检测失败: "Local tool detection failed",
  "尚未检测到已安装的 AI 工具": "No installed AI tools detected",
  "没有将检测失败误判为未安装，你可以重新检测或进入工具管理。":
    "The detection error was not treated as an uninstall. Retry detection or open Tool Management.",
  "安装或配置工具后，这里会显示当前工具、模型和令牌分组。":
    "After installing or configuring a tool, its current model and token group will appear here.",
  打开工具管理: "Open Tool Management",
  安装与配置: "Install & Configure",
  未选择: "Not Selected",
  "{{tool}} 模型供应商": "{{tool}} Model Provider",
  "{{tool}} {{vendor}}模型": "{{tool}} {{vendor}} Models",
  "选择 {{vendor}}模型": "Select {{vendor}} Models",
  供应商: "Provider",
  "{{tool}} 当前工具令牌分组": "{{tool}} Token Group",
  正在读取本机工具与配置状态: "Reading local tool and configuration status",
  当前模型: "Current Model",
  使用方式: "Connection Mode",
  "OpenAI 官方账号": "OpenAI Official Account",
  "使用 Codex 中已登录的 OpenAI 官方账号":
    "Use the OpenAI account already signed in to Codex",
  "使用元衡模型、分组与本地安全路由":
    "Use YuanHeng models, token groups, and local secure routing",
  元衡中转: "YuanHeng Relay",
  "OpenAI 官方": "OpenAI Official",
  "模型与推理等级由 Codex 官方账号管理；切回元衡后会恢复上次选择。":
    "Models and reasoning are managed by the official Codex account. Your previous YuanHeng selection will be restored when you switch back.",
  使用元衡模型与令牌分组: "Use YuanHeng models and token groups",
  "当前使用 OpenAI 官方账号，模型由 Codex 管理":
    "The OpenAI official account is active. Codex manages the model.",
  "已切换到 OpenAI 官方账号": "Switched to the OpenAI official account",
  已切换到元衡中转: "Switched to YuanHeng Relay",
  "Codex 使用方式切换失败": "Failed to switch the Codex connection mode",
  快捷切换: "Quick Switch",
  账号默认: "Account Default",
  查看所有工具: "View All Tools",
  启动: "Launch",
  "启动 {{tool}}": "Launch {{tool}}",
  工作目录: "Working Directory",
  用户主目录: "Home Directory",
  "选择 {{tool}} 工作目录": "Choose {{tool}} Working Directory",
  "已将 {{tool}} 工作目录切换为 {{directory}}":
    "{{tool}} working directory changed to {{directory}}",
  选择工作目录失败: "Failed to choose working directory",
  选择模型: "Select Model",
  "搜索网站可用模型...": "Search available models...",
  "当前/推荐优先 · 新版本在前 · 共 {{count}} 个":
    "Current/recommended first · Newest first · {{count}} total",
  没有找到匹配的模型: "No matching models found",
  正在核验工具状态: "Verifying tool status",
  "待 {{count}} 个终端下一条消息应用":
    "Pending for {{count}} terminals on their next message",
  "已应用 {{model}}": "Applied {{model}}",
  "已连接 {{count}} 个终端": "{{count}} terminals connected",
  配置已生效: "Configuration Active",
  待配置: "Setup Required",
  "{{tool}} 模型选择": "{{tool}} Model",
  "{{tool}} 快捷令牌分组": "{{tool}} Quick Token Group",
  "{{tool}} 快捷推理等级": "{{tool}} Quick Reasoning Level",
  连接元衡后即可在此切换模型: "Connect YuanHeng to switch models here",
  快捷控制台: "Quick Console",
  不适用: "N/A",
  "网站模型同步失败，已保留上次可用列表":
    "Model sync failed. The last available list is preserved.",
  "{{tool}} 没有可用模型": "No models are available for {{tool}}",
  配置失败: "Configuration failed",
  "已选择 {{model}}，终端下一条消息自动应用":
    "Selected {{model}}. It will apply on the terminal's next message.",
  "Codex 默认模型已切换到 {{model}}":
    "Codex default model switched to {{model}}",
  模型切换失败: "Failed to switch model",
  "{{tool}} 已切换到 {{model}}": "{{tool}} switched to {{model}}",
  "{{tool}} 已切换到 {{group}} 分组 · {{model}}":
    "{{tool}} switched to group {{group}} · {{model}}",
  "{{tool}} 推理等级已更新 · {{model}}":
    "{{tool}} reasoning level updated · {{model}}",
  "{{tool}} 已启动": "{{tool}} launched",
  启动失败: "Launch failed",
  自动: "Auto",
  关闭: "Off",
  极简: "Minimal",
  低: "Low",
  中: "Medium",
  高: "High",
  超高: "Very High",
  最大: "Max",
  极限: "Ultra",
  "自动（默认：{{level}}）": "Auto (default: {{level}})",
  "已完成 {{count}} 个工具的元衡配置":
    "Configured {{count}} tools for YuanHeng",
  "{{tool}}：{{error}}": "{{tool}}: {{error}}",
  工具配置失败: "Tool configuration failed",
  "Codex 已切换到 {{model}}，下一条消息生效":
    "Codex switched to {{model}}. It will apply on the next message.",
  "已打开 {{tool}} 官方下载页，安装完成后请刷新检测":
    "Opened the official {{tool}} download page. Refresh detection after installation.",
  "{{tool}} 安装任务已完成": "{{tool}} installation completed",
  安装失败: "Installation failed",
  模型配置失败: "Model configuration failed",
  推荐模型: "Recommended Model",
  重新打开: "Reopen",
  打开: "Open",
  "{{tool}} 已使用 {{model}} {{action}}":
    "{{tool}} was {{action}} with {{model}}",
  网站模型同步失败: "Model sync failed",
  "已选择 {{count}} 个工具": "{{count}} tools selected",
  选择你需要使用的工具: "Select the tools you want to use",
  "元衡将写入 API、模型和认证配置；工作目录仅在你主动选择时更改。":
    "YuanHeng writes API, model, and authentication settings; working directories change only when you choose one.",
  刷新工具状态: "Refresh Tool Status",
  刷新: "Refresh",
  一键配置所选工具: "Configure Selected Tools",
  "请先连接元衡账号，再为工具写入配置。":
    "Connect your YuanHeng account before configuring tools.",
  "选择 {{tool}}": "Select {{tool}}",
  桌面应用: "Desktop App",
  未检测到: "Not Detected",
  自定义路径: "Custom Path",
  注册表检测: "Registry Detection",
  自动检测: "Automatic Detection",
  开始菜单检测: "Start Menu Detection",
  运行中检测: "Running Process Detection",
  尚未选择应用路径: "No application path selected",
  "原自定义路径已失效，当前继续使用自动检测结果。":
    "The custom path is no longer valid. The automatically detected app is still in use.",
  重新选择: "Choose Again",
  选择路径: "Choose Path",
  清除自定义路径: "Clear Custom Path",
  "已保存 {{v0}} 应用路径": "Saved the {{v0}} application path",
  应用路径无效: "Invalid application path",
  已恢复自动检测: "Automatic detection restored",
  清除应用路径失败: "Failed to clear the application path",
  已配置: "Configured",
  需更新: "Update Required",
  "打开 Claude Desktop": "Open Claude Desktop",
  重新检测: "Detect Again",
  桌面模型: "Desktop Model",
  终端模型: "Terminal Model",
  "{{tool}} 令牌分组": "{{tool}} Token Group",
  "{{count}} 档": "{{count}} levels",
  "{{tool}} 推理等级": "{{tool}} Reasoning Level",
  "配置已就绪，可直接启动使用。":
    "Configuration is ready. You can launch it now.",
  "配置发生变化，点击即可自动恢复。":
    "The configuration changed. Click to repair it automatically.",
  "元衡会自动选择适合的模型。":
    "YuanHeng automatically selects a suitable model.",
  "安装后即可由元衡自动配置。":
    "YuanHeng can configure it automatically after installation.",
  "打开 {{tool}} 官方下载页": "Open the official {{tool}} download page",
  "一键安装 {{tool}}": "Install {{tool}}",
  官方下载: "Official Download",
  一键安装: "Install",
  "配置 {{tool}}": "Configure {{tool}}",
  应用模型: "Apply Model",
  自动恢复: "Repair Automatically",
  重新配置: "Reconfigure",
  配置: "Configure",
  应用并刷新: "Apply & Refresh",
  应用并启动: "Apply & Launch",
  刷新显示: "Refresh",
  公告: "Announcement",
  进行中: "Ongoing",
  已上线: "Released",
  重要提醒: "Important Notice",
  紧急通知: "Urgent Notice",
  平台同步: "Platform Sync",
  关闭公告中心: "Close Announcement Center",
  平台公告: "Platform Announcements",
  "与元衡平台公告中心同步，每分钟自动检查更新":
    "Synced with YuanHeng announcements and checked every minute.",
  "已同步 {{count}} 条公告": "{{count}} announcements synced",
  查看历史: "View History",
  标记最新公告为已读: "Mark Latest Announcement as Read",
  "正在同步平台公告…": "Syncing platform announcements...",
  平台公告暂时同步失败: "Platform announcements are temporarily unavailable",
  "已同步，暂无公告": "Synced. No announcements yet.",
  欢迎: "Welcome",
  连接元衡: "Connect YuanHeng",
  配置工具: "Configure Tools",
  完成: "Done",
  "已有 {{count}} 个 AI 工具接入元衡，可以直接开始使用。":
    "{{count}} AI tools are connected to YuanHeng and ready to use.",
  "你可以稍后进入工具管理页面完成配置。":
    "You can finish setup later in Tool Management.",
  配置完成: "Setup Complete",
  首次配置: "First-time Setup",
  "连接元衡账号并配置本机 AI 工具":
    "Connect a YuanHeng account and configure local AI tools",
  "账号密码验证通过，请完成两步验证":
    "Password verified. Complete two-factor authentication.",
  注册并登录成功: "Registered and signed in",
  登录成功: "Signed in successfully",
  "登录账号不能为空且不能超过 254 个字符":
    "Sign-in name is required and must be no more than 254 characters",
  "用户名不能为空且不能超过 20 个字符":
    "Username is required and must be no more than 20 characters",
  "密码长度必须为 8 到 20 个字符": "Password must be 8–20 characters",
  两次输入的密码不一致: "Passwords do not match",
  注册失败: "Registration failed",
  登录失败: "Sign-in failed",
  请输入两步验证码或备用码: "Enter a two-factor code or backup code",
  两步验证失败: "Two-factor authentication failed",
  元衡数据已同步: "YuanHeng data synced",
  同步失败: "Sync failed",
  "已退出元衡账号，本机工具配置保持不变":
    "Signed out of YuanHeng. Local tool settings were preserved.",
  退出登录失败: "Sign out failed",
  "账号已断开；{{tools}} 缺少原配置，元衡配置仍保留":
    "Account disconnected. Original settings are missing for {{tools}}, so YuanHeng settings were preserved.",
  "已断开元衡账号，并恢复工具原配置":
    "YuanHeng account disconnected and original tool settings restored",
  已断开元衡账号: "YuanHeng account disconnected",
  断开失败: "Disconnect failed",
  完成两步验证: "Complete Two-Factor Authentication",
  登录你的元衡账号: "Sign In to YuanHeng",
  "输入认证器验证码或备用码，验证成功后即可继续。":
    "Enter an authenticator code or backup code to continue.",
  "直接使用账号密码登录或注册。密码不会保存在本机，登录后客户端会自动创建或复用本机专用工具凭据。":
    "Sign in or register with your username and password. Passwords are not stored locally; the app creates or reuses device-specific tool credentials after sign-in.",
  "6 位验证码或备用码": "6-digit code or backup code",
  输入元衡用户名: "Enter YuanHeng username",
  "8 到 20 个字符": "8–20 characters",
  再次输入密码: "Enter password again",
  注册并登录: "Register & Sign In",
  登录: "Sign In",
  一切正常: "All Good",
  "账号、API 和工具配置均可用。":
    "Your account, API, and tool configurations are available.",
  需要完成一项设置: "One Action Required",
  "元衡可以自动处理大部分配置问题。":
    "YuanHeng can automatically resolve most configuration issues.",
  当前不可用: "Currently Unavailable",
  "检查结果中有需要处理的问题。": "The check found issues that need attention.",
  "体检完成，一切正常": "Health check complete. Everything looks good.",
  "已修复 {{count}} 个工具配置": "Repaired {{count}} tool configurations",
  连接与凭据已恢复: "Connection and credentials restored",
  "自动修复失败，请重新登录": "Automatic repair failed. Please sign in again.",
  脱敏诊断已复制: "Redacted diagnostics copied",
  复制诊断失败: "Failed to copy diagnostics",
  "将重新生成当前设备凭据，并自动更新已经配置的工具。旧凭据会被撤销，是否继续？":
    "This regenerates credentials for this device and updates configured tools. The old credentials will be revoked. Continue?",
  "凭据已更新，并同步到 {{count}} 个工具":
    "Credentials updated and synced to {{count}} tools",
  本机凭据已重新生成: "Local credentials regenerated",
  重新生成凭据失败: "Failed to regenerate credentials",
  "脱敏诊断已导出：{{path}}": "Redacted diagnostics exported: {{path}}",
  导出诊断失败: "Failed to export diagnostics",
  前往登录: "Sign In",
  重新检查: "Check Again",
  一键修复: "Repair Now",
  暂时无法检查: "Unable to Check",
  智能体检: "Health Check",
  检查详情: "Check Details",
  复制脱敏诊断: "Copy Redacted Diagnostics",
  导出脱敏诊断: "Export Redacted Diagnostics",
  重新生成本机凭据: "Regenerate Local Credentials",
  模型自动同步: "Automatic Model Sync",
  配置立即生效: "Instant Configuration",
  本机安全凭据: "Secure Local Credentials",
  返回首页: "Return Home",
  切换模型与分组: "Switch models and groups",
  "Skills、MCP 与提示词": "Skills, MCP, and prompts",
  查看请求与成本: "View requests and costs",
  账号连接与本地代理: "Account connection and local proxy",
  应用偏好: "App preferences",
  "操作失败，请稍后重试": "Action failed. Please try again later.",
  "搜索页面、工具或操作...": "Search pages, tools, or actions...",
  页面导航: "Navigation",
  切换当前工具: "Switch Current Tool",
  "切换工具 {{tool}}": "Switch to {{tool}}",
  快捷操作: "Quick Actions",
  "充值 余额 topup": "top up balance",
  "官网 website": "website",
  "检查更新 update": "check updates",
  没有找到匹配的操作: "No matching actions found",
  充值账户余额: "Top Up Account Balance",
  检查客户端更新: "Check for App Updates",
  "↑↓ 选择 · Enter 执行 · Esc 关闭": "↑↓ Select · Enter Run · Esc Close",

  "剩余额度 · 已用 {{amount}}": "Remaining · Used {{amount}}",
  "已用 {{percent}}%": "{{percent}}% used",
  "{{amount}} 总额": "{{amount}} total",
  "统一管理 {{v0}} 的 Skills、MCP、提示词与 Agent 能力。":
    "Manage Skills, MCP, prompts, and agent capabilities for {{v0}}.",
  发现能力: "Discover Capabilities",
  全局能力配置: "Global Capability Settings",
  当前管理: "Currently managing",
  "，启用状态直接同步到对应工具。":
    ". Enabled states sync directly to the corresponding tool.",
  "从技能仓库发现并安装新能力；安装后可按工具启用。":
    "Discover and install capabilities from the skill repository, then enable them per tool.",
  "{{v0}} 次": "{{v0}} requests",
  "约 {{v0}}": "About {{v0}}",
  "{{v0}}% 命中": "{{v0}}% hit",
  "余额 ${{v0}}": "Balance ${{v0}}",
  "运行中 · {{v0}}": "Running · {{v0}}",
  当前工具: "Current Tool",
  分组: "Group",
  推理: "Reasoning",
  "先选供应商，再选模型；修改后立即生效":
    "Choose a provider, then a model. Changes apply immediately.",
  "1 · 模型供应商": "1 · Model Provider",
  "{{v0}} 模型供应商": "{{v0}} Model Provider",
  "2 · 细分模型": "2 · Model",
  "{{v0}} {{v1}}模型": "{{v0}} {{v1}} Models",
  "选择 {{v0}}模型": "Select {{v0}} Models",
  "3 · 令牌分组": "3 · Token Group",
  "{{v0}} 当前工具令牌分组": "{{v0}} Token Group",
  "切换工具 {{v0}}": "Switch to {{v0}}",
  当前: "Current",
  推荐: "Recommended",
  "模型目录与可用分组来自你的元衡账号。":
    "The model catalog and available groups come from your YuanHeng account.",
  "已识别 {{v0}} 个图像生成专用模型。它们不能作为终端主模型，请通过 Images API 或图像生成工具调用。":
    "{{v0}} image-generation-only models detected. They cannot be terminal chat models; use the Images API or an image generation tool.",
  "检测失败不会再显示成“未安装”，请重新检测。":
    "Detection failures are no longer shown as uninstalled. Please detect again.",
  "直接调整模型、令牌分组和推理等级":
    "Adjust models, token groups, and reasoning levels directly",
  安装与维护: "Install & Maintain",
  "未检测到已安装的 AI 工具": "No installed AI tools detected",
  去安装与配置: "Install & Configure",
  "待 {{v0}} 个终端下一条消息应用":
    "Pending for {{v0}} terminals on their next message",
  "已应用 {{v0}}": "Applied {{v0}}",
  "已连接 {{v0}} 个终端": "{{v0}} terminals connected",
  "启动 {{v0}}": "Launch {{v0}}",
  模型: "Model",
  "{{v0}} 模型选择": "{{v0}} Model",
  令牌分组: "Token Group",
  "{{v0}} 快捷令牌分组": "{{v0}} Quick Token Group",
  推理等级: "Reasoning Level",
  "{{v0}} 快捷推理等级": "{{v0}} Quick Reasoning Level",
  "一次连接，配置所有 AI 工具": "Connect Once, Configure Every AI Tool",
  "连接元衡账号，选择本机需要使用的工具，自动写入 API、认证和推荐模型。":
    "Connect your YuanHeng account, select local tools, and automatically apply API, authentication, and recommended model settings.",
  "也可以暂时跳过，稍后在“连接与路由”中完成。":
    "You can also skip this for now and finish it later in Connections & Routing.",
  选择需要的工具: "Select Your Tools",
  "只配置你实际使用的工具，之后可以随时增减。":
    "Configure only the tools you use. You can add or remove them at any time.",
  "已有 {{v0}} 个 AI 工具接入元衡，可以直接开始使用。":
    "{{v0}} AI tools are connected to YuanHeng and ready to use.",
  稍后配置: "Configure Later",
  上一步: "Back",
  继续: "Continue",
  进入工具中心: "Open Tool Center",
  重试: "Retry",
  "已同步 {{v0}} 条公告": "{{v0}} announcements synced",
  "自动（默认：{{v0}}）": "Auto (default: {{v0}})",
  "已完成 {{v0}} 个工具的元衡配置": "Configured {{v0}} tools for YuanHeng",
  "{{v0}}：{{v1}}": "{{v0}}: {{v1}}",
  "Codex 已切换到 {{v0}}，下一条消息生效":
    "Codex switched to {{v0}}. It will apply on the next message.",
  "已打开 {{v0}} 官方下载页，安装完成后请刷新检测":
    "Opened the official {{v0}} download page. Refresh detection after installation.",
  "{{v0}} 安装任务已完成": "{{v0}} installation completed",
  "{{v0}} 已使用 {{v1}} {{v2}}": "{{v0}} was {{v2}} with {{v1}}",
  "已选择 {{v0}} 个工具": "{{v0}} tools selected",
  "选择 {{v0}}": "Select {{v0}}",
  可选: "available",
  "个 · 点击切换": " · click to switch",
  "{{v0}} 令牌分组": "{{v0}} Token Group",
  " · {{v0}} 档": " · {{v0}} levels",
  "{{v0}} 推理等级": "{{v0}} Reasoning Level",
  "右下角固定显示“元衡\n                      AI”；模型与推理等级在此切换，无需重启。":
    "YuanHeng AI stays visible in the lower-right corner. Switch models and reasoning levels here without restarting.",
  "从元衡启动后，模型会在同一会话的下一条消息自动切换，无需重启。":
    "After launching from YuanHeng, the model switches on the next message in the same session without restarting.",
  "使用独立桌面配置；已有任务保持原模型，请新建任务。":
    "Uses a separate desktop configuration. Existing tasks keep their original model; create a new task to use the new model.",
  "写入 WorkBuddy 自定义模型；应用后会重新打开。":
    "Writes the WorkBuddy custom model and reopens the app after applying.",
  "打开 {{v0}} 官方下载页": "Open the official {{v0}} download page",
  "一键安装 {{v0}}": "Install {{v0}}",
  "配置 {{v0}}": "Configure {{v0}}",
  "一个入口，连接全部工具": "One Place for Every Tool",
  "登录后，模型与额度": "After sign-in, models and quota",
  自动同步到本机: "sync automatically to this device",
  "使用元衡账号统一管理 Claude、Codex、ChatGPT 等 AI\n            工具，无需逐个填写接口与密钥。":
    "Manage Claude, Codex, ChatGPT, and other AI tools with one YuanHeng account—no need to enter endpoints and keys for each tool.",
  "正在检查登录状态…": "Checking sign-in status...",
  登录后自动进入工作台: "Open the workspace automatically after sign-in",
  "账号已断开；{{v0}} 缺少原配置，元衡配置仍保留":
    "Account disconnected. Original settings are missing for {{v0}}, so YuanHeng settings were preserved.",
  "元衡 API": "YuanHeng API",
  账号密码仅用于本次认证: "Your password is used only for this authentication",
  两步验证码: "Two-Factor Code",
  验证并登录: "Verify & Sign In",
  返回账号登录: "Back to Account Sign-In",
  注册: "Register",
  用户名: "Username",
  密码: "Password",
  确认密码: "Confirm Password",
  "用户 {{v0}}": "User {{v0}}",
  "元衡账号已登录 · 本机工具凭据已就绪":
    "Signed in to YuanHeng · Local tool credentials are ready",
  同步: "Sync",
  退出登录: "Sign Out",
  "已修复 {{v0}} 个工具配置": "Repaired {{v0}} tool configurations",
  "凭据已更新，并同步到 {{v0}} 个工具":
    "Credentials updated and synced to {{v0}} tools",
  "脱敏诊断已导出：{{v0}}": "Redacted diagnostics exported: {{v0}}",
  其他模型: "Other Models",
  阿里千问: "Alibaba Qwen",
  "智谱 AI": "Zhipu AI",
  月之暗面: "Moonshot AI",
  字节豆包: "ByteDance Doubao",
  百度文心: "Baidu ERNIE",
  腾讯混元: "Tencent Hunyuan",
  "小米 MiMo": "Xiaomi MiMo",
  阶跃星辰: "StepFun",
  "美团 LongCat": "Meituan LongCat",
  "{{v0}} 没有可用模型": "No models are available for {{v0}}",
  "已选择 {{v0}}，终端下一条消息自动应用":
    "Selected {{v0}}. It will apply on the terminal's next message.",
  "Codex 默认模型已切换到 {{v0}}": "Codex default model switched to {{v0}}",
  "{{v0}} 已切换到 {{v1}}": "{{v0}} switched to {{v1}}",
  "{{v0}} 已切换到 {{v1}} 分组 · {{v2}}":
    "{{v0}} switched to group {{v1}} · {{v2}}",
  "{{v0}} 推理等级已更新 · {{v1}}": "{{v0}} reasoning level updated · {{v1}}",
  "配置已保存；重启 Codex App 后加载新的模型与推理档位":
    "Configuration saved. Restart Codex App to load the new model and reasoning options.",
  需要重启以加载模型目录: "Restart required to load the model catalog",
  "重启并应用 {{v0}}": "Restart and apply {{v0}}",
  重启并应用: "Restart & Apply",
  "{{v0}} 已启动": "{{v0}} launched",
  尚未连接元衡: "YuanHeng Not Connected",
  登录后会自动创建本机凭据并检查工具配置:
    "After sign-in, local credentials are created and tool configurations are checked automatically.",
  登录状态不完整: "Incomplete Sign-In State",
  请重新登录元衡账号: "Please sign in to YuanHeng again.",
  账号连接正常: "Account Connection Healthy",
  登录状态有效: "Your sign-in session is valid.",
  登录状态已失效: "Sign-In Session Expired",
  请退出后重新登录元衡账号: "Sign out and sign in to YuanHeng again.",
  本机凭据缺失: "Local Credentials Missing",
  可以自动重新创建本机工具凭据:
    "Local tool credentials can be recreated automatically.",
  "API 连接正常": "API Connection Healthy",
  本机凭据可访问模型接口: "Local credentials can access the model API.",
  本机凭据已失效: "Local Credentials Expired",
  可以自动重新同步本机工具凭据:
    "Local tool credentials can be synced again automatically.",
  部分工具配置需要恢复: "Some Tool Configurations Need Repair",
  工具配置正常: "Tool Configuration Healthy",
  "尚未配置 AI 工具": "No AI Tools Configured",
  选择本机已安装的工具后即可一键配置:
    "Select installed tools to configure them with one click.",
  登录后会自动检查: "Checks run automatically after sign-in.",
  "已打开 {{v0}} 官方下载页，元衡将在后台等待安装完成":
    "Opened the official {{v0}} download page. YuanHeng will detect the installation in the background.",
  "暂未检测到 {{v0}}，可重新检测或手动选择路径":
    "{{v0}} was not detected yet. Retry detection or choose the app path manually.",
  "已检测到 {{v0}}，并完成元衡配置":
    "Detected {{v0}} and completed YuanHeng configuration.",
  "已检测到 {{v0}}，现在可以进行配置":
    "Detected {{v0}}. It is ready to configure.",
  "已检测到 {{v0}}，但自动配置未完成，可点击配置重试":
    "Detected {{v0}}, but automatic configuration did not finish. Use Configure to retry.",
  自动配置失败: "Automatic configuration failed",
  等待安装: "Waiting for Install",
  "将恢复元衡接管前的工具配置，并保留账号连接。外部修改过的文件不会被覆盖，是否继续？":
    "Restore tool configurations from before YuanHeng took control while keeping the account connected? Externally modified files will not be overwritten.",
  "已回滚 {{v0}} 个工具配置": "Rolled back {{v0}} tool configurations",
  没有可安全回滚的工具配置: "No tool configurations can be safely rolled back",
  "部分外部修改的配置已保留，请查看诊断详情":
    "Some externally modified configurations were preserved. Review the diagnostic details.",
  回滚工具配置失败: "Failed to roll back tool configurations",
  恢复接管前配置: "Restore Previous Configurations",
  "即将执行以下修复：": "The following repairs will be applied:",
  "修复前会保留可恢复的原工具配置，是否继续？":
    "Recoverable original tool configurations will be preserved before repair. Continue?",
  模型与分组匹配: "Models and Groups Match",
  已配置工具使用的模型仍在当前账号目录中:
    "Configured tools still use models available to the current account.",
  模型或分组已经失效: "Model or Group Is No Longer Available",
  本地模型路由正常: "Local Model Route Healthy",
  需要本地协议适配的桌面工具可以访问元衡:
    "Desktop tools that require local protocol adaptation can reach YuanHeng.",
  本地模型路由未运行: "Local Model Route Is Not Running",
  "Codex 或 Claude Desktop 的配置存在，但本地协议路由未启动。":
    "Codex or Claude Desktop is configured, but the local protocol route is not running.",
};

const DYNAMIC_EN: Array<[RegExp, (...matches: string[]) => string]> = [
  [
    /^检测到 (\d+) 个工具配置发生变化。$/,
    (count) => `${count} tool configurations have changed.`,
  ],
  [/^(\d+) 个工具已经就绪。$/, (count) => `${count} tools are ready.`],
  [
    /^(\d+) 个工具使用了当前账号目录中不存在的模型或分组。$/,
    (count) =>
      `${count} tools use a model or group that is unavailable to the current account.`,
  ],
];

const DYNAMIC_KO: Array<[RegExp, (...matches: string[]) => string]> = [
  [
    /^检测到 (\d+) 个工具配置发生变化。$/,
    (count) => `${count}개 도구 구성이 변경되었습니다.`,
  ],
  [/^(\d+) 个工具已经就绪。$/, (count) => `${count}개 도구가 준비되었습니다.`],
  [
    /^(\d+) 个工具使用了当前账号目录中不存在的模型或分组。$/,
    (count) =>
      `${count}개 도구가 현재 계정에 없는 모델 또는 그룹을 사용합니다.`,
  ],
];

const DYNAMIC_JA: Array<[RegExp, (...matches: string[]) => string]> = [
  [
    /^检测到 (\d+) 个工具配置发生变化。$/,
    (count) => `${count}個のツール設定が変更されました。`,
  ],
  [
    /^(\d+) 个工具已经就绪。$/,
    (count) => `${count}個のツールが準備完了しました。`,
  ],
  [
    /^(\d+) 个工具使用了当前账号目录中不存在的模型或分组。$/,
    (count) =>
      `${count}個のツールが現在のアカウントで利用できないモデルまたはグループを使用しています。`,
  ],
];

const DYNAMIC_ZH_TW: Array<[RegExp, (...matches: string[]) => string]> = [
  [
    /^检测到 (\d+) 个工具配置发生变化。$/,
    (count) => `偵測到 ${count} 個工具設定發生變更。`,
  ],
  [/^(\d+) 个工具已经就绪。$/, (count) => `${count} 個工具已就緒。`],
  [
    /^(\d+) 个工具使用了当前账号目录中不存在的模型或分组。$/,
    (count) => `${count} 個工具使用了目前帳號目錄中不存在的模型或分組。`,
  ],
];

function translateDynamic(
  source: string,
  translations: Array<[RegExp, (...matches: string[]) => string]>,
): string | undefined {
  for (const [pattern, translate] of translations) {
    const match = source.match(pattern);
    if (match) return translate(...match.slice(1));
  }
  return undefined;
}

function interpolate(template: string, values?: Values): string {
  if (!values) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    String(values[key] ?? ""),
  );
}

export function desktopLocale(): string {
  return i18n.resolvedLanguage || i18n.language || "en";
}

export function dt(source: string, values?: Values): string {
  const language = i18n.resolvedLanguage || i18n.language;
  let template: string;

  if (language === "zh-CN") {
    template = source;
  } else if (language === "zh-TW") {
    template =
      DESKTOP_ZH_TW[source] ??
      translateDynamic(source, DYNAMIC_ZH_TW) ??
      source;
  } else if (language === "ja") {
    template =
      DESKTOP_JA[source] ?? translateDynamic(source, DYNAMIC_JA) ?? source;
  } else if (language === "ko") {
    template =
      DESKTOP_KO[source] ?? translateDynamic(source, DYNAMIC_KO) ?? source;
  } else {
    template =
      DESKTOP_EN[source] ?? translateDynamic(source, DYNAMIC_EN) ?? source;
  }

  return interpolate(template, values);
}
