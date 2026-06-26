# M3 mpv 播放闭环实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 从媒体详情页启动播放，由 Rust 获取 Emby `PlaybackInfo`、选择 Direct Play 或转码地址、启动外部 mpv，并为播放控制和状态上报建立可扩展边界。

**架构：** Rust 侧新增 `player` 模块封装播放源选择、mpv 进程控制和会话状态；`commands/playback.rs` 暴露 Tauri 命令给前端。前端 `services/playback` 只提交播放意图，不构造原始播放 URL；详情页播放按钮从禁用态切换为调用播放服务。Emby 播放状态上报先建立命令和会话边界，再逐步接入进度事件。

**技术栈：** Tauri 2、Rust、serde、reqwest、std::process、Vue 3、TypeScript、Pinia、Vitest。

---

## 文件结构

- 创建：`src-tauri/src/player/mod.rs`，播放器模块出口。
- 创建：`src-tauri/src/player/source.rs`，`PlaybackInfo` 模型、Direct Play/转码源选择和单元测试。
- 创建：`src-tauri/src/player/mpv.rs`，mpv 可用性检测与外部进程启动。
- 创建：`src-tauri/src/player/session.rs`，当前播放会话状态与控制入口。
- 创建：`src-tauri/src/commands/playback.rs`，Tauri 播放命令。
- 修改：`src-tauri/src/commands/mod.rs`、`src-tauri/src/lib.rs`，注册 playback commands。
- 修改：`src-tauri/src/emby/client.rs`，添加 `PlaybackInfo` 请求和播放状态上报请求。
- 创建：`src/services/playback/playback.ts`，前端播放服务。
- 创建：`src/app/stores/playback.ts`，前端播放状态。
- 修改：`src/features/media/MediaDetailPage.vue`，接入播放按钮。

## 任务 1：播放源选择

- [x] 在 `src-tauri/src/player/source.rs` 编写失败测试：可直接播放时选择 Direct Play，无法直连但支持转码时选择转码，二者都不可用时返回结构化错误。
- [x] 运行：`cargo test player::source`，预期因模块或类型缺失失败。
- [x] 实现最小 `PlaybackInfo` 模型和 `select_playback_source`。
- [x] 运行：`cargo test player::source`，预期通过。
- [x] 提交：`feat(m3): 添加播放源选择模型`。

## 任务 2：mpv 进程边界

- [x] 为 mpv 命令构造编写单元测试：包含媒体 URL、force-window 和 idle 参数。
- [x] 实现 `MpvController`：检测 `mpv` 是否存在，启动外部窗口，停止进程。
- [x] 运行：`cargo test player::mpv`。
- [x] 提交：`feat(m3): 添加 mpv 进程控制边界`。

## 任务 3：播放 Tauri 命令

- [x] 添加 `start_playback`、`stop_playback`、`pause_playback` 命令骨架。
- [x] `start_playback` 输入只接受 `serverId`、`userId`、`itemId`、可选 `mediaSourceId`，从 Rust 存储读取 Token。
- [x] 调用 Emby `PlaybackInfo`、选择源、启动 mpv。
- [x] 运行：`cargo test`、`npm run build`。
- [x] 提交：`feat(m3): 接入播放启动命令`。

## 任务 4：前端播放入口

- [x] 添加 `src/services/playback/playback.ts` 和 `src/app/stores/playback.ts`。
- [x] 详情页播放按钮调用播放 store，并展示启动中、失败和播放中状态。
- [x] 运行：`npm test -- --run`、`npm run build`。
- [x] 提交：`feat(m3): 接入详情页播放入口`。

## 任务 5：播放状态上报基础

- [x] 在 Rust 会话中记录 itemId、mediaSourceId、playSessionId、positionTicks、paused。
- [x] 添加开始、停止状态上报请求；进度定时上报留到 mpv IPC 事件接入后完善。
- [x] 运行：`cargo test`、`npm run build`。
- [x] 提交：`feat(m3): 添加播放状态上报基础`。

## 自检

- 前端不会构造播放 URL。
- mpv 细节只在 `src-tauri/src/player` 内部。
- Direct Play 优先，转码为明确回退路径。
- M3 首轮不做 WebView 内嵌和复杂 IPC 事件流。
