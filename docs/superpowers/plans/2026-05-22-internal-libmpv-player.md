# 内置 libmpv 播放器实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 用随应用分发的 libmpv 播放后端替代外部 `mpv` 命令依赖，并在 macOS 上逐步实现内置播放器窗口、基础控制和观看体验能力。

**架构：** 保留 `plan/mpv-playback-loop` 已完成的 Emby 登录、媒体浏览、`PlaybackInfo`、播放源选择和状态上报边界。Rust 新增播放器 backend trait，先用 fake backend 建立可测试命令边界，再用动态加载的 libmpv backend 替换外部进程控制，随后接入 macOS 原生渲染窗口和前端控制状态。

**技术栈：** Tauri 2、Rust、serde、reqwest、libloading、libmpv C API、macOS VideoToolbox、Vue 3、Pinia、Vitest。

---

## 文件结构

- 创建：`src-tauri/src/player/backend.rs`，播放器后端 trait、播放启动参数、运行时控制参数和测试 fake backend。
- 创建：`src-tauri/src/player/libmpv.rs`，libmpv 动态加载、context 生命周期、命令映射和错误转换。
- 修改：`src-tauri/src/player/mod.rs`，导出 backend 和 libmpv 模块，停止把外部进程 mpv 作为主后端。
- 修改：`src-tauri/src/lib.rs`，把 `AppState.mpv` 替换为播放器后端状态。
- 修改：`src-tauri/src/commands/playback.rs`，`start_playback`、`stop_playback`、`pause_playback` 改用后端 trait，新增 seek、倍速、音量、静音、全屏命令。
- 修改：`src-tauri/src/player/session.rs`，记录 duration、volume、muted、speed、fullscreen、ended、last_error。
- 修改：`src-tauri/Cargo.toml`，新增 `libloading`，后续 macOS 渲染任务再加入平台依赖。
- 修改：`src/services/playback/playback.ts`，增加播放控制 invoke 包装。
- 修改：`src/app/stores/playback.ts`，增加播放器控制状态和动作。
- 修改：`src/features/media/MediaDetailPage.vue`，保持原有播放入口，必要时展示 libmpv 启动错误。
- 创建：`src/features/playback/PlaybackControls.vue`，应用内控制栏基础组件。
- 修改：`src/App.vue`，添加播放器控制栏样式。
- 后续创建：`src-tauri/src/player/macos_window.rs`，macOS 原生播放窗口和 render API 接入。
- 后续创建：`src/services/emby/episodes.ts`、`src/features/playback/EpisodePicker.vue`，剧集选集。
- 后续创建：`src/features/playback/SkipButtons.vue`、`src/features/playback/SeekPreview.vue`，跳过片头 / 片尾和进度预览。
- 后续修改：`README.md`，记录内置 libmpv 运行时、打包和已知限制。

## 任务 1：播放器后端 trait

**文件：**
- 创建：`src-tauri/src/player/backend.rs`
- 修改：`src-tauri/src/player/mod.rs`

- [x] **步骤 1：编写失败测试**

在 `src-tauri/src/player/backend.rs` 中添加测试，定义 fake backend 的预期行为：

```rust
#[test]
fn fake_backend_records_loaded_media_and_controls() {
    let mut backend = FakePlayerBackend::default();

    backend
        .load(PlaybackLoadOptions {
            url: "https://emby.example.test/video.mkv".into(),
            start_paused: false,
            hwdec: HardwareDecoder::VideoToolbox,
        })
        .unwrap();
    backend.set_paused(true).unwrap();
    backend.seek(125.0).unwrap();
    backend.set_speed(1.5).unwrap();

    assert_eq!(backend.loaded_url(), Some("https://emby.example.test/video.mkv"));
    assert!(backend.snapshot().paused);
    assert_eq!(backend.snapshot().position_seconds, 125.0);
    assert_eq!(backend.snapshot().speed, 1.5);
}
```

- [x] **步骤 2：运行测试验证失败**

运行：

```bash
cd src-tauri && cargo test player::backend
```

预期：FAIL，`player::backend` 模块或类型不存在。

- [x] **步骤 3：实现最少后端边界**

创建 `PlayerBackend` trait、`PlaybackLoadOptions`、`HardwareDecoder`、`PlaybackSnapshot` 和 `FakePlayerBackend`。trait 至少包含：

```rust
pub trait PlayerBackend: Send {
    fn load(&mut self, options: PlaybackLoadOptions) -> AppResult<()>;
    fn stop(&mut self) -> AppResult<()>;
    fn set_paused(&mut self, paused: bool) -> AppResult<()>;
    fn seek(&mut self, position_seconds: f64) -> AppResult<()>;
    fn set_speed(&mut self, speed: f64) -> AppResult<()>;
    fn set_volume(&mut self, volume: u8) -> AppResult<()>;
    fn set_muted(&mut self, muted: bool) -> AppResult<()>;
    fn set_fullscreen(&mut self, fullscreen: bool) -> AppResult<()>;
    fn snapshot(&self) -> PlaybackSnapshot;
}
```

`FakePlayerBackend` 只在内存中记录状态，不加载真实 libmpv。

- [x] **步骤 4：运行测试验证通过**

运行：

```bash
cd src-tauri && cargo test player::backend
```

预期：PASS。

- [x] **步骤 5：Commit**

```bash
git add src-tauri/src/player/backend.rs src-tauri/src/player/mod.rs
git commit -m "feat(player): 添加播放器后端边界"
```

## 任务 2：替换外部 mpv 状态为后端状态

**文件：**
- 修改：`src-tauri/src/lib.rs`
- 修改：`src-tauri/src/commands/playback.rs`
- 修改：`src-tauri/src/player/session.rs`
- 测试：`src-tauri/src/commands/playback.rs`

- [x] **步骤 1：编写失败测试**

在 `commands/playback.rs` 测试中增加启动结果不再包含外部 mpv 语义，并验证 load options 可以从播放源生成：

```rust
#[test]
fn playback_load_options_use_selected_source_url() {
    let selected = PlaybackMediaSource::Direct {
        media_source_id: "source-1".into(),
        url: "https://emby.example.test/video.mkv".into(),
    };

    let options = load_options_for_source(&selected);

    assert_eq!(options.url, "https://emby.example.test/video.mkv");
    assert!(!options.start_paused);
    assert_eq!(options.hwdec, HardwareDecoder::VideoToolbox);
}
```

- [x] **步骤 2：运行测试验证失败**

运行：

```bash
cd src-tauri && cargo test commands::playback::tests::playback_load_options_use_selected_source_url
```

预期：FAIL，`load_options_for_source` 或 `HardwareDecoder` 未接入。

- [x] **步骤 3：改造 AppState 和 start/stop**

将 `AppState` 中的 `mpv: Mutex<MpvController>` 改为 `player: Mutex<Box<dyn PlayerBackend>>`。初期用 `FakePlayerBackend::default()` 作为启动后端，保证测试和应用能编译。`start_playback` 调用 `player.load(&load_options)`；`stop_playback` 调用 `player.stop()`。

保留现有：

- `resolve_playback_account`
- `state.emby.playback_info`
- `select_playback_source`
- `PlaybackSessionState::start`
- 播放开始 / 停止上报

- [x] **步骤 4：运行测试验证通过**

运行：

```bash
cd src-tauri && cargo test commands::playback player::backend
```

预期：PASS。

- [x] **步骤 5：Commit**

```bash
git add src-tauri/src/lib.rs src-tauri/src/commands/playback.rs src-tauri/src/player/session.rs
git commit -m "feat(player): 使用播放器后端替换外部 mpv 状态"
```

## 任务 3：libmpv 动态加载后端

**文件：**
- 创建：`src-tauri/src/player/libmpv.rs`
- 修改：`src-tauri/src/player/mod.rs`
- 修改：`src-tauri/Cargo.toml`

- [x] **步骤 1：编写失败测试**

在 `src-tauri/src/player/libmpv.rs` 中添加纯函数测试，先验证库候选路径和错误转换，不加载真实动态库：

```rust
#[test]
fn libmpv_library_candidates_prefer_bundled_runtime() {
    let candidates = libmpv_library_candidates();

    assert!(candidates.iter().any(|path| path.contains("Frameworks/libmpv")));
    assert!(candidates.iter().any(|path| path == "libmpv.2.dylib" || path == "libmpv.dylib"));
}

#[test]
fn maps_negative_mpv_error_to_app_error() {
    let error = mpv_error("mpv_initialize", -12);

    assert_eq!(error.code, "libmpv_command_failed");
    assert!(error.message.contains("libmpv"));
}
```

- [x] **步骤 2：运行测试验证失败**

运行：

```bash
cd src-tauri && cargo test player::libmpv
```

预期：FAIL，模块不存在。

- [x] **步骤 3：实现动态加载骨架**

新增 `libloading = "0.8"`。实现：

- `LibMpvBackend`
- `LibMpvSymbols`
- `libmpv_library_candidates()`
- `mpv_error(operation, code)`
- `PlayerBackend for LibMpvBackend`

第一轮 FFI 覆盖：

- `mpv_create`
- `mpv_initialize`
- `mpv_destroy`
- `mpv_command`
- `mpv_set_option_string`
- `mpv_set_property`

`load()` 设置：

```text
hwdec=videotoolbox
input-default-bindings=yes
osc=no
```

然后执行：

```text
loadfile <url> replace
```

- [x] **步骤 4：运行测试验证通过**

运行：

```bash
cd src-tauri && cargo test player::libmpv
```

预期：PASS。

- [x] **步骤 5：Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/player/libmpv.rs src-tauri/src/player/mod.rs
git commit -m "feat(player): 添加 libmpv 动态加载后端"
```

## 任务 4：启用 libmpv 后端并保留测试可替换性

**文件：**
- 修改：`src-tauri/src/lib.rs`
- 修改：`src-tauri/src/player/libmpv.rs`
- 测试：`src-tauri/src/player/libmpv.rs`

- [x] **步骤 1：编写失败测试**

给后端工厂添加测试，验证测试模式可以选择 fake，生产模式尝试 libmpv：

```rust
#[test]
fn player_backend_factory_can_create_fake_backend_for_tests() {
    let backend = create_player_backend(PlayerBackendMode::Fake).unwrap();

    assert_eq!(backend.snapshot().speed, 1.0);
}
```

- [x] **步骤 2：运行测试验证失败**

运行：

```bash
cd src-tauri && cargo test player::libmpv::tests::player_backend_factory_can_create_fake_backend_for_tests
```

预期：FAIL，工厂不存在。

- [x] **步骤 3：实现后端工厂**

新增 `create_player_backend(PlayerBackendMode)`。应用启动使用 `PlayerBackendMode::LibMpv`。如果 libmpv 加载失败，应用仍可启动，但播放时返回：

```text
code: libmpv_not_available
message: 未找到内置 libmpv 运行时，请检查应用安装包是否完整
```

这要求工厂可以返回一个 `UnavailablePlayerBackend`，在 `load()` 时返回结构化错误。

- [x] **步骤 4：运行验证**

运行：

```bash
cd src-tauri && cargo test player::libmpv player::backend
cd .. && npm run build
```

预期：PASS；前端 build 通过。

- [x] **步骤 5：Commit**

```bash
git add src-tauri/src/lib.rs src-tauri/src/player/libmpv.rs
git commit -m "feat(player): 启用内置 libmpv 后端工厂"
```

## 任务 5：基础播放控制命令

**文件：**
- 修改：`src-tauri/src/commands/playback.rs`
- 修改：`src-tauri/src/player/session.rs`
- 修改：`src-tauri/src/lib.rs`
- 修改：`src/services/playback/playback.ts`
- 修改：`src/app/stores/playback.ts`
- 测试：`src/services/playback/playback.test.ts`
- 测试：`src/app/stores/playback.test.ts`

- [x] **步骤 1：编写 Rust 失败测试**

在 `session.rs` 中验证状态更新：

```rust
#[test]
fn updates_runtime_playback_state() {
    let mut state = PlaybackSessionState::default();
    state.start(sample_session());

    state.update_position(90_000_000);
    state.set_paused(true);
    state.set_speed(1.25);

    let current = state.current().unwrap();
    assert_eq!(current.position_ticks, 90_000_000);
    assert!(current.paused);
    assert_eq!(current.speed, 1.25);
}
```

- [x] **步骤 2：编写前端失败测试**

在 `src/services/playback/playback.test.ts` 中验证新增 invoke：

```ts
it("设置倍速调用 Rust 命令", async () => {
  await setPlaybackRate(1.5);

  expect(invoke).toHaveBeenCalledWith("set_playback_rate", { rate: 1.5 });
});
```

- [x] **步骤 3：运行测试验证失败**

运行：

```bash
cd src-tauri && cargo test player::session
cd .. && npm test -- --run src/services/playback/playback.test.ts src/app/stores/playback.test.ts
```

预期：FAIL，新增方法和服务函数不存在。

- [ ] **步骤 4：实现控制命令**

进度记录：已实现暂停 / 恢复、seek、倍速、音量、静音、全屏命令和前端 store/service 动作；`get_playback_status` 仍未实现。

新增 Tauri commands：

- `resume_playback`
- `seek_playback(position_seconds: f64)`
- `set_playback_rate(rate: f64)`
- `set_playback_volume(volume: u8)`
- `set_playback_muted(muted: bool)`
- `set_playback_fullscreen(fullscreen: bool)`
- `get_playback_status`

所有命令调用 `PlayerBackend`，并同步更新 `PlaybackSessionState`。

- [ ] **步骤 5：运行验证并提交**

运行：

```bash
cd src-tauri && cargo test commands::playback player::session
cd .. && npm test -- --run
npm run build
```

提交：

```bash
git add src-tauri/src/commands/playback.rs src-tauri/src/player/session.rs src-tauri/src/lib.rs src/services/playback/playback.ts src/app/stores/playback.ts src/services/playback/playback.test.ts src/app/stores/playback.test.ts
git commit -m "feat(player): 添加 libmpv 基础播放控制"
```

## 任务 6：macOS 播放窗口和渲染接入

**文件：**
- 创建：`src-tauri/src/player/macos_window.rs`
- 修改：`src-tauri/src/player/libmpv.rs`
- 修改：`src-tauri/src/player/mod.rs`
- 修改：`src-tauri/Cargo.toml`

- [ ] **步骤 1：编写可测试边界**

为窗口配置和尺寸计算编写纯函数测试：

```rust
#[test]
fn default_player_window_config_is_widescreen_and_resizable() {
    let config = PlayerWindowConfig::default();

    assert_eq!(config.title, "Velo");
    assert_eq!(config.width, 1280);
    assert_eq!(config.height, 720);
    assert!(config.resizable);
}
```

- [ ] **步骤 2：运行测试验证失败**

运行：

```bash
cd src-tauri && cargo test player::macos_window
```

预期：FAIL，模块不存在。

- [ ] **步骤 3：实现窗口骨架**

创建应用内播放窗口，先完成生命周期和错误转换。渲染接入分两层：

- `macos_window` 管理窗口创建、关闭、全屏状态。
- `libmpv` 管理 render context 和绘制回调。

如果 render context 初始化失败，返回 `libmpv_render_init_failed`。

- [ ] **步骤 4：手动验证**

运行：

```bash
npm run tauri dev
```

预期：点击详情页播放时打开应用内播放窗口，不启动外部 mpv 应用。

- [ ] **步骤 5：Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/player/macos_window.rs src-tauri/src/player/libmpv.rs src-tauri/src/player/mod.rs
git commit -m "feat(player): 添加 macOS libmpv 播放窗口"
```

## 任务 7：前端控制栏

**文件：**
- 创建：`src/features/playback/PlaybackControls.vue`
- 修改：`src/App.vue`
- 修改：`src/app/stores/playback.ts`

- [ ] **步骤 1：编写失败测试**

如果项目已有 Vue 组件测试工具，添加控制栏事件测试；当前项目未配置组件测试工具时，先在 store 测试覆盖交互动作：

```ts
it("倍速动作更新本地状态并调用服务", async () => {
  const playback = usePlaybackStore();

  await playback.setRate(1.5);

  expect(playback.rate).toBe(1.5);
  expect(setPlaybackRate).toHaveBeenCalledWith(1.5);
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：

```bash
npm test -- --run src/app/stores/playback.test.ts
```

预期：FAIL，`setRate` 不存在。

- [ ] **步骤 3：实现控制栏**

控制栏包含：

- 暂停 / 恢复
- 停止
- 进度条
- 当前时间 / 总时长
- 倍速选择：0.75、1.0、1.25、1.5、2.0
- 音量
- 静音
- 全屏

前端只调用控制命令，不直接操作 libmpv。

- [ ] **步骤 4：运行验证并提交**

运行：

```bash
npm test -- --run
npm run build
```

提交：

```bash
git add src/features/playback/PlaybackControls.vue src/App.vue src/app/stores/playback.ts src/app/stores/playback.test.ts
git commit -m "feat(player): 添加播放控制栏"
```

## 任务 8：跳过片头 / 片尾与进度预览

**文件：**
- 创建：`src/features/playback/SkipButtons.vue`
- 创建：`src/features/playback/SeekPreview.vue`
- 修改：`src/app/stores/playback.ts`
- 修改：`src/services/emby/media.ts`

- [ ] **步骤 1：编写失败测试**

在 store 测试中验证跳过片头默认跳到 90 秒，片尾跳到总时长前 30 秒：

```ts
it("按默认规则跳过片头和片尾", async () => {
  const playback = usePlaybackStore();
  playback.setDurationForTest(3600);

  await playback.skipIntro();
  await playback.skipOutro();

  expect(seekPlayback).toHaveBeenNthCalledWith(1, 90);
  expect(seekPlayback).toHaveBeenNthCalledWith(2, 3570);
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：

```bash
npm test -- --run src/app/stores/playback.test.ts
```

预期：FAIL，跳过方法不存在。

- [ ] **步骤 3：实现功能**

先实现基于默认秒数的显式跳过按钮。进度预览第一轮显示目标时间和剩余时间，不拉缩略图。

- [ ] **步骤 4：运行验证并提交**

运行：

```bash
npm test -- --run
npm run build
```

提交：

```bash
git add src/features/playback/SkipButtons.vue src/features/playback/SeekPreview.vue src/app/stores/playback.ts src/services/emby/media.ts src/app/stores/playback.test.ts
git commit -m "feat(player): 添加跳过片头片尾和进度预览"
```

## 任务 9：剧集选集

**文件：**
- 创建：`src/services/emby/episodes.ts`
- 创建：`src/features/playback/EpisodePicker.vue`
- 修改：`src/features/media/MediaDetailPage.vue`
- 修改：`src/app/stores/media.ts`
- 测试：`src/services/emby/media.test.ts`

- [ ] **步骤 1：编写失败测试**

在媒体服务测试中验证同季剧集 URL 构造：

```ts
it("构造同季剧集列表请求", () => {
  const url = buildEpisodesUrl({
    serverUrl: "https://emby.example.test",
    userId: "user-1",
    token: "token-1",
    seriesId: "series-1",
    seasonId: "season-1",
  });

  expect(url).toContain("/Shows/series-1/Episodes");
  expect(url).toContain("SeasonId=season-1");
  expect(url).toContain("api_key=token-1");
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：

```bash
npm test -- --run src/services/emby/media.test.ts
```

预期：FAIL，`buildEpisodesUrl` 不存在。

- [ ] **步骤 3：实现选集能力**

扩展 `MediaItem`，保留 `seriesId`、`seasonId`。当前详情项为 Episode 时加载同季剧集。播放器控制区展示选集菜单；点击剧集时调用现有 `playItem(nextItemId)`。

- [ ] **步骤 4：运行验证并提交**

运行：

```bash
npm test -- --run
npm run build
```

提交：

```bash
git add src/services/emby/episodes.ts src/features/playback/EpisodePicker.vue src/features/media/MediaDetailPage.vue src/app/stores/media.ts src/services/emby/media.test.ts
git commit -m "feat(player): 添加剧集选集能力"
```

## 任务 10：打包文档与最终验证

**文件：**
- 创建或修改：`README.md`
- 修改：`docs/superpowers/specs/2026-05-22-internal-libmpv-player-design.md`，如实现中发现需要记录的限制。

- [ ] **步骤 1：补充 README**

记录：

- 当前使用内置 libmpv。
- 开发期如何准备 libmpv。
- 发布包需要携带的动态库。
- macOS 硬件解码默认策略。
- 已知限制。

- [ ] **步骤 2：全量验证**

运行：

```bash
cd src-tauri && cargo test
cd .. && npm test -- --run
npm run build
```

预期：全部通过。

- [ ] **步骤 3：手动验证**

运行：

```bash
npm run tauri dev
```

验证：

- 未安装外部 `mpv` 命令时不再出现“未找到 mpv”。
- 播放窗口属于当前应用。
- 可播放真实 Emby 视频。
- 暂停、恢复、seek、倍速、停止可用。
- Emby 服务器收到播放开始、进度和停止上报。

- [ ] **步骤 4：Commit**

```bash
git add README.md docs/superpowers/specs/2026-05-22-internal-libmpv-player-design.md
git commit -m "docs(player): 补充内置 libmpv 播放说明"
```

## 自检

- 规格中的目标均有对应任务：后端替换对应任务 1-4；基础控制对应任务 5-7；跳过片头 / 片尾和预览对应任务 8；选集对应任务 9；打包和验证对应任务 10。
- 计划不依赖已删除的 `plan/internal-webview-player` 分支。
- 第一阶段基于 `plan/mpv-playback-loop` 的现有 Emby 播放闭环，不重写登录、媒体浏览或播放源选择。
- 单元测试通过 fake backend 避免真实 libmpv 环境影响 CI。
- 真实 libmpv、macOS 渲染窗口和打包发布被拆成独立节点，便于在风险点单独提交和回退。
