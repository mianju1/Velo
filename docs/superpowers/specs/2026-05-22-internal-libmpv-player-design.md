# 内置 libmpv 播放器设计

## 背景

当前播放器已经完成 Emby 登录、资源浏览、详情页播放入口、播放源选择和播放状态上报基础能力。上一阶段播放执行依赖外部 `mpv` 命令，用户需要自行安装 mpv 才能播放。用户已确认新方向：通过内置 `libmpv` 播放，移除外部播放器安装要求，并优先保障复杂视频资源的兼容性和观看体验。

本阶段不采用 HTML5 `<video>` 作为主播放内核。WebView 播放方案可作为低成本备选，但主线应围绕 libmpv 的解码、字幕、音轨和硬件解码能力建设。

## 目标

- 应用包内包含或可加载随应用分发的 libmpv 运行时，播放时不依赖用户安装外部 `mpv` 命令。
- 保留现有 Emby 登录、资源列表、详情页、播放源选择和播放历史上报边界。
- 支持基础播放控制：播放、暂停、停止、进度跳转、音量、静音、倍速、全屏。
- 支持跳过片头 / 片尾、剧集选集、进度拖动预览。
- 支持硬件解码配置，macOS 默认优先启用 VideoToolbox 路径。
- 为后续字幕轨、音轨、HDR、直播电视和播放失败诊断保留扩展点。

## 非目标

- 本阶段不继续推进 WebView `<video>` 主播放器实现。
- 不要求第一轮实现完整的高级字幕样式编辑、滤镜、截图、外挂字幕下载或投屏。
- 不在第一轮支持 Windows / Linux；所有原生渲染和打包策略先以 macOS 为目标。
- 不把用户本机 Homebrew 的 mpv 作为运行依赖。开发期可以用 Homebrew 提供头文件和库来验证，发布包必须能随应用携带运行时。

## 架构方案

采用「Emby 播放会话编排 + libmpv 原生播放内核 + Vue 控制层」。

Rust 继续负责敏感信息和 Emby 播放链路：读取保存账号、请求 `PlaybackInfo`、选择 Direct / Transcode 媒体源、创建播放会话、向 Emby 上报播放开始、进度和停止。

新增 `player/libmpv` 边界替代外部进程控制。该模块持有 libmpv context，负责加载 URL、设置播放参数、发送命令、读取属性和处理事件。前端不直接接触 Token 或原始播放 URL，只通过 Tauri commands 表达播放意图和控制动作。

macOS 渲染采用 libmpv render API 作为主方向。libmpv 官方示例说明 render API 比原始窗口嵌入更灵活，也更适合自绘 OSD 和应用层控制。第一轮可以先创建独立的应用内原生播放窗口，稳定后再评估和主 Tauri 窗口的更深层嵌入。

## 运行时与打包

开发期：

- 允许通过 Homebrew 安装 `mpv` / `libmpv` 提供头文件和动态库，用于本地编译验证。
- Rust FFI 层必须把“找不到 libmpv 动态库”转换成结构化错误，便于调试。

发布期：

- 将 `libmpv` 及其必要动态库随 `.app` 打包到应用 bundle 内。
- 构建脚本负责设置动态库搜索路径和 macOS bundle 资源位置。
- 打包后在无 Homebrew、无外部 `mpv` 命令的环境下验证播放启动。
- 需要单独记录动态库授权、签名和公证影响，避免发布流程后期才发现不可分发或签名失败。

## 播放数据流

1. 用户在详情页点击播放。
2. 前端 playback store 调用 `start_playback`，只传 `serverId`、`userId`、`itemId` 和可选 `mediaSourceId`。
3. Rust 从加密存储读取 Token，请求 Emby `PlaybackInfo`。
4. Rust 选择 Direct / Transcode 播放源，并创建 `PlaybackSession`。
5. Rust 初始化或复用 libmpv context，设置硬件解码、音视频输出、初始倍速和起播位置。
6. libmpv 打开播放 URL 并在原生播放窗口渲染。
7. libmpv 事件循环把时间位置、暂停状态、结束、错误等事件写回 `PlaybackSessionState`。
8. Rust 按节流策略向 Emby 上报进度；停止或自然结束时发送停止上报。
9. 前端通过 Tauri events 或轮询查询播放状态，更新控制栏、选集和错误提示。

## 控制能力

播放器命令分为两类：

- 会话命令：开始播放、停止播放、切换剧集、关闭播放器窗口。
- 运行时命令：暂停 / 恢复、seek、设置倍速、设置音量、静音、全屏、跳过片头、跳过片尾。

倍速使用 libmpv `speed` 属性。进度跳转使用 `seek` 命令。硬件解码默认设置为 `hwdec=videotoolbox`，如果启动失败或解码失败，允许回退到 `hwdec=auto-safe` 或软件解码，并把诊断信息返回 UI。

## 跳过片头 / 片尾

第一轮使用务实策略：

- 如果 Emby item 提供章节信息，优先识别名称包含 Intro、Opening、OP、片头、Credits、Ending、ED、片尾的章节。
- 如果没有章节信息，使用播放器设置中的默认秒数配置。
- UI 提供明确按钮，不做自动跳过，避免误跳。

后续可以接入更精细的 Emby chapter、trickplay 或用户自定义规则。

## 选集

剧集详情页需要能获取同季 episode 列表。选集不属于 libmpv 内核职责，由媒体服务和前端 UI 处理：

- 当前条目是 Episode 时，请求同季剧集列表。
- 播放器内展示紧凑选集菜单。
- 切换剧集时停止当前 libmpv 会话，复用 `start_playback` 链路启动新 item。
- 自然播放结束后可以保留“下一集”入口，自动连播可作为后续增强。

## 进度拖动预览

第一轮提供时间预览：拖动进度条时显示目标时间和剩余时间。

第二轮补缩略图预览：

- 优先使用 Emby trickplay / chapter image 能力。
- 如果服务器不提供缩略图，保持时间预览，不在本地实时解码抓帧，避免增加播放器复杂度和 CPU 压力。

## 错误处理

需要覆盖以下错误：

- libmpv 动态库不可加载。
- libmpv context 初始化失败。
- 原生渲染窗口创建失败。
- 播放源不可用。
- Direct Play 失败。
- 转码播放失败。
- 硬件解码初始化失败并回退。
- 播放事件循环断开。
- Emby 状态上报失败。

播放状态上报失败不应中断本地播放。Direct Play 失败时，如果服务器支持转码，应尝试转码回退。硬件解码失败时应尝试软件解码回退，并在 UI 中保留诊断信息。

## 测试策略

- Rust 单元测试：播放源选择、播放会话状态、libmpv 命令映射、错误转换、进度节流。
- Rust 集成测试：在不加载真实 libmpv 的情况下使用 trait / fake backend 验证 `start_playback`、`pause`、`seek`、`stop` 的状态变化。
- 前端单元测试：播放 store 命令调用、状态更新、选集切换、跳过片头 / 片尾按钮逻辑。
- 手动验证：无外部 `mpv` 命令环境下启动应用并播放真实 Emby 视频。
- 手动验证：H.264、H.265、MKV、多音轨、常见字幕、转码回退和硬件解码开关。

## 阶段划分

### L1：libmpv 后端边界

- 新增播放器 backend trait，隔离真实 libmpv 和测试 fake backend。
- 新增 libmpv context 初始化、加载 URL、停止播放和错误转换。
- `start_playback` 不再使用外部 mpv 进程。
- 保留现有 Emby 播放源选择和开始 / 停止上报。

### L2：macOS 播放窗口与基础控制

- 创建应用内原生播放窗口。
- 接入 libmpv render API 渲染视频。
- 实现暂停、恢复、seek、音量、静音、倍速、全屏。
- 从 libmpv 事件同步进度和暂停状态。

### L3：观看体验功能

- 剧集选集。
- 跳过片头 / 片尾。
- 进度拖动时间预览。
- 播放结束后的下一集入口。
- 更明确的播放失败诊断 UI。

### L4：发布打包

- 将 libmpv 运行时纳入 macOS app bundle。
- 验证无 Homebrew、无外部 `mpv` 命令环境下可播放。
- 补充 README：内置播放器能力、硬件解码、已知限制和构建发布流程。

## 验收标准

- 未安装外部 `mpv` 命令时，电影和剧集单集可以从详情页播放。
- 播放窗口属于当前应用，不启动独立播放器应用。
- 支持暂停 / 恢复、停止、seek、倍速和全屏。
- Emby 服务器能看到播放中状态，并收到进度和停止上报。
- 剧集可以在播放器内切换选集。
- 用户可以手动跳过片头 / 片尾。
- 拖动进度条时能看到目标时间预览。
- 默认启用 macOS 硬件解码，失败时有可理解的回退或诊断。

## 参考

- mpv 官方 libmpv 示例说明了窗口嵌入和 render API 的差异，并指出 render API 更适合自定义 OSD 与复杂集成。
- libmpv render API 通过 `mpv_render_context_render` 渲染视频帧，配合 update callback 驱动绘制。
- mpv 官方文档说明硬件解码需要显式启用，macOS 方向应配置 VideoToolbox 或安全自动模式。
