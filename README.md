# Tauri + Vue + TypeScript

This template should help get you started developing with Vue 3 and TypeScript in Vite. The template uses Vue 3 `<script setup>` SFCs, check out the [script setup docs](https://v3.vuejs.org/api/sfc-script-setup.html#sfc-script-setup) to learn more.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Vue - Official](https://marketplace.visualstudio.com/items?itemName=Vue.volar) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## 内置 libmpv 运行时

播放器通过应用内置 `libmpv` 后端播放视频，不再启动外部 `mpv` 命令。开发或打包前先准备一次运行时：

```bash
npm run prepare:libmpv
```

该命令会把本机可用的 `libmpv` 及依赖复制到 `src-tauri/runtime/macos/lib`。发布 `.app` 时，Tauri 会把该目录打包到 `Contents/Frameworks`，应用启动后优先加载随包携带的运行时。

如果脚本提示未找到 `libmpv`，开发机可先执行 `brew install mpv` 作为构建期来源；最终用户运行已打包应用时不需要安装 Homebrew、`mpv` 或其他外部播放器。
