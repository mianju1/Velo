# M2 媒体库与浏览实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 实现 Emby 媒体库首页、主要媒体类型列表、搜索、详情页、图片渲染和基础加载/空/错误状态。

**架构：** 前端通过 `services/emby/media.ts` 封装浏览 API URL、响应规范化和请求行为；Pinia `media` store 持有列表、详情、搜索和加载状态；`features/libraries` 与 `features/media` 提供页面与可复用组件。M2 继续保持 Token 不落入前端持久化存储，但浏览请求使用当前会话内存中的 Token，由后续 M3/M4 再评估是否整体迁移到 Rust commands 后方。

**技术栈：** Vue 3、TypeScript、Vue Router、Pinia、Tauri 2、Emby HTTP API、Vitest。

---

## 文件结构

- 修改：`package.json`、`package-lock.json`，添加 Vitest 测试脚本和依赖。
- 创建：`src/services/emby/media.ts`，封装媒体库、列表、搜索、详情和图片 URL。
- 创建：`src/services/emby/media.test.ts`，覆盖 URL 构造和响应规范化。
- 创建：`src/app/stores/media.ts`，维护 M2 浏览状态。
- 修改：`src/app/router/index.ts`，添加媒体库、搜索和详情路由。
- 修改：`src/features/libraries/HomePage.vue`，从占位入口升级为可点击首页。
- 创建：`src/features/media/MediaListPage.vue`，媒体列表页。
- 创建：`src/features/media/MediaDetailPage.vue`，媒体详情页。
- 创建：`src/features/media/SearchPage.vue`，跨媒体搜索页。
- 创建：`src/features/media/components/MediaGrid.vue`，列表网格。
- 创建：`src/features/media/components/StateBlock.vue`，加载、空和错误状态。

## 任务 1：建立媒体 API 可测试边界

- [x] 编写 `media.test.ts`，覆盖：图片 URL 携带 api_key、媒体列表查询包含类型/排序、搜索查询包含 SearchTerm。
- [x] 运行 `npm test -- --run src/services/emby/media.test.ts`，确认因缺失模块失败。
- [x] 创建 `media.ts` 最小实现。
- [x] 运行测试确认通过。
- [x] 运行 `npm run build` 确认类型通过。
- [x] 提交：`test(m2): 建立媒体 API 测试边界`。

## 任务 2：媒体状态与路由

- [x] 创建 `media` store，包含首页分组、列表、详情、搜索的加载/空/错误状态。
- [x] 添加 `/library/:kind`、`/media/:itemId`、`/search` 路由。
- [x] 运行 `npm run build`。
- [x] 提交：`feat(m2): 添加媒体浏览状态与路由`。

## 任务 3：首页与媒体列表

- [x] 将首页入口改为真实路由入口，包含继续观看、最近添加、收藏和主要媒体类型。
- [x] 实现媒体列表页，支持电影、剧集、音乐、照片、直播电视入口。
- [x] 添加基础筛选排序控件：最近添加、名称、播放日期。
- [x] 运行 `npm run build`。
- [x] 提交：`feat(m2): 实现媒体库首页和列表页`。

## 任务 4：详情页与搜索页

- [x] 实现跨媒体搜索页，显示混合结果。
- [x] 实现详情页，展示海报、背景图、名称、年份、时长、评分、简介和基础元数据。
- [x] 为播放或预览操作保留禁用态入口，等待 M3 接入。
- [x] 运行 `npm test -- --run`、`npm run build`、`cargo test`。
- [x] 提交：`feat(m2): 实现媒体库浏览页面`。

## 任务 5：详情元数据增强

- [x] 为剧集单集、音乐、照片元数据规范化编写失败测试。
- [x] 实现 `seriesName`、季集号、专辑、艺人、曲目号、创建日期、分级和类型标签规范化。
- [x] 详情页展示背景图、类型化元数据和类型标签。
- [x] 运行 `npm test -- --run` 和 `npm run build`。
- [x] 提交：`feat(m2): 增强媒体详情元数据展示`。

## 自检

- M2 验收项均有对应任务。
- 计划不包含占位实现项；播放能力明确留到 M3。
- 类型命名统一使用 `MediaItem`、`MediaKind`、`MediaQuery` 和 `MediaDetail`。
