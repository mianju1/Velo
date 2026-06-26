<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from "vue";
import { useFontStore } from "./app/stores/font";
import { usePlaybackStore } from "./app/stores/playback";
import { useThemeStore } from "./app/stores/theme";
import PlaybackControls from "./features/playback/PlaybackControls.vue";

const playback = usePlaybackStore();
const font = useFontStore();
const theme = useThemeStore();
const appClasses = computed(() => ({
  "app-shell--playback": playback.playbackVisible,
}));

let stopSystemThemeSync: (() => void) | undefined;

watch(
  () => [theme.preference, theme.resolvedTheme],
  () => theme.applyToDocument(),
  { immediate: true },
);

watch(
  () => font.selectedFamily,
  () => font.applyToDocument(),
  { immediate: true },
);

watch(
  () => playback.playbackVisible,
  (visible) => {
    document.body.classList.toggle("body--playback", visible);
  },
  { immediate: true },
);

onMounted(() => {
  stopSystemThemeSync = theme.startSystemThemeSync();
  void font.loadSystemFonts();
});

onUnmounted(() => {
  stopSystemThemeSync?.();
  document.body.classList.remove("body--playback");
});
</script>

<template>
  <div class="app-shell" :class="appClasses">
    <main class="app-content" :aria-hidden="playback.playbackVisible">
      <RouterView />
    </main>
    <PlaybackControls />
  </div>
</template>

<style>
@font-face {
  font-family: "MapleMono-CN";
  src: url("./assets/fonts/MapleMono-CN-Regular.ttf") format("truetype");
  font-display: swap;
  font-style: normal;
  font-weight: 400;
}

@font-face {
  font-family: "MapleMono-CN";
  src: url("./assets/fonts/MapleMono-CN-Bold.ttf") format("truetype");
  font-display: swap;
  font-style: normal;
  font-weight: 700;
}

@font-face {
  font-family: "MapleMono-CN";
  src: url("./assets/fonts/MapleMono-CN-Italic.ttf") format("truetype");
  font-display: swap;
  font-style: italic;
  font-weight: 400;
}

@font-face {
  font-family: "MapleMono-CN";
  src: url("./assets/fonts/MapleMono-CN-BoldItalic.ttf") format("truetype");
  font-display: swap;
  font-style: italic;
  font-weight: 700;
}

:root {
  color: var(--text-primary);
  background: transparent;
  color-scheme: light;
  --app-bg: #f6f8fb;
  --surface: #ffffff;
  --surface-muted: #eef3f8;
  --surface-raised: rgba(255, 255, 255, 0.9);
  --surface-panel: rgba(255, 255, 255, 0.78);
  --text-primary: #141b24;
  --text-secondary: #5f6b78;
  --text-muted: #788492;
  --border: #dce3eb;
  --border-strong: #c8d2dd;
  --accent: #1d7fc2;
  --accent-strong: #155f95;
  --accent-soft: #e7f4ff;
  --danger: #b3262e;
  --danger-bg: #fff0f1;
  --shadow: 0 18px 52px rgba(20, 31, 45, 0.1);
  --scrollbar-track: color-mix(in srgb, var(--surface-panel) 76%, transparent);
  --scrollbar-thumb: rgba(120, 132, 146, 0.36);
  --app-font-family: "MapleMono-CN";
  font-family:
    var(--app-font-family), Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
    sans-serif;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

@media (prefers-color-scheme: dark) {
  :root {
    color-scheme: dark;
    --app-bg: #05070a;
    --surface: #10151c;
    --surface-muted: #171f2a;
    --surface-raised: rgba(16, 21, 28, 0.92);
    --surface-panel: rgba(16, 21, 28, 0.72);
    --text-primary: #edf4fb;
    --text-secondary: #a7b3c1;
    --text-muted: #778595;
    --border: #263241;
    --border-strong: #354456;
    --accent: #57b8ff;
    --accent-strong: #8bd0ff;
    --accent-soft: rgba(87, 184, 255, 0.16);
    --danger: #ff8a92;
    --danger-bg: rgba(255, 87, 100, 0.14);
    --shadow: 0 20px 58px rgba(0, 0, 0, 0.45);
    --scrollbar-track: rgba(16, 21, 28, 0.24);
    --scrollbar-thumb: rgba(167, 179, 193, 0.28);
  }
}

:root[data-theme="light"] {
  color-scheme: light;
  --app-bg: #f6f8fb;
  --surface: #ffffff;
  --surface-muted: #eef3f8;
  --surface-raised: rgba(255, 255, 255, 0.9);
  --surface-panel: rgba(255, 255, 255, 0.78);
  --text-primary: #141b24;
  --text-secondary: #5f6b78;
  --text-muted: #788492;
  --border: #dce3eb;
  --border-strong: #c8d2dd;
  --accent: #1d7fc2;
  --accent-strong: #155f95;
  --accent-soft: #e7f4ff;
  --danger: #b3262e;
  --danger-bg: #fff0f1;
  --shadow: 0 18px 52px rgba(20, 31, 45, 0.1);
  --scrollbar-track: color-mix(in srgb, var(--surface-panel) 76%, transparent);
  --scrollbar-thumb: rgba(120, 132, 146, 0.36);
}

:root[data-theme="dark"] {
  color-scheme: dark;
  --app-bg: #05070a;
  --surface: #10151c;
  --surface-muted: #171f2a;
  --surface-raised: rgba(16, 21, 28, 0.92);
  --surface-panel: rgba(16, 21, 28, 0.72);
  --text-primary: #edf4fb;
  --text-secondary: #a7b3c1;
  --text-muted: #778595;
  --border: #263241;
  --border-strong: #354456;
  --accent: #57b8ff;
  --accent-strong: #8bd0ff;
  --accent-soft: rgba(87, 184, 255, 0.16);
  --danger: #ff8a92;
  --danger-bg: rgba(255, 87, 100, 0.14);
  --shadow: 0 20px 58px rgba(0, 0, 0, 0.45);
  --scrollbar-track: rgba(16, 21, 28, 0.24);
  --scrollbar-thumb: rgba(167, 179, 193, 0.28);
}

* {
  box-sizing: border-box;
}

body {
  min-width: 360px;
  min-height: 100vh;
  margin: 0;
  color: var(--text-primary);
  background: var(--app-bg);
}

body.body--playback {
  background: transparent;
}

#app,
.app-shell {
  min-height: 100vh;
}

.app-shell {
  color: var(--text-primary);
  background:
    radial-gradient(circle at top left, rgba(29, 127, 194, 0.1), transparent 32%),
    linear-gradient(135deg, rgba(29, 127, 194, 0.05), transparent 42%),
    var(--app-bg);
}

.app-shell--playback {
  background: transparent;
}

.app-shell--playback .app-content {
  visibility: hidden;
  pointer-events: none;
}

button,
input,
select {
  font: inherit;
}

button {
  min-height: 38px;
  border: 1px solid var(--accent);
  border-radius: 6px;
  padding: 0 14px;
  color: #ffffff;
  background: var(--accent);
  cursor: pointer;
  transition:
    background 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
}

button:hover:not(:disabled) {
  border-color: var(--accent-strong);
  background: var(--accent-strong);
  box-shadow: 0 8px 18px rgba(29, 127, 194, 0.18);
}

button:active:not(:disabled) {
  transform: translateY(1px);
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

button.secondary,
button.ghost {
  color: var(--accent);
  background: var(--surface);
}

button.ghost {
  border-color: var(--border);
}

button.ghost:hover:not(:disabled) {
  color: var(--accent-strong);
  border-color: var(--accent);
  background: var(--accent-soft);
}

input,
select {
  width: 100%;
  min-height: 40px;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  padding: 0 10px;
  color: var(--text-primary);
  background: var(--surface);
  outline: none;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    background 0.18s ease;
}

input:focus,
select:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

label {
  display: grid;
  gap: 6px;
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 600;
}

.server-shell,
.home-shell {
  width: min(1120px, calc(100vw - 40px));
  margin: 0 auto;
  padding: 32px 0;
}

.server-shell {
  display: grid;
  min-height: 100vh;
  place-items: center;
  padding: 44px 0;
}

.login-panel {
  min-width: 0;
}

.login-panel {
  width: min(460px, 100%);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 32px;
  background:
    linear-gradient(180deg, var(--surface-raised), var(--surface-panel)),
    var(--surface);
  box-shadow: var(--shadow);
  backdrop-filter: blur(18px);
}

.login-logo {
  display: block;
  width: 76px;
  height: 76px;
  margin: 0 auto 22px;
  border-radius: 20px;
  box-shadow: 0 14px 30px rgba(29, 127, 194, 0.24);
}

.login-panel .section-heading {
  text-align: center;
}

.connection-field {
  margin-bottom: 16px;
}

.saved-login-card {
  display: grid;
  grid-template-columns: 54px minmax(0, 1fr);
  gap: 14px;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  background:
    linear-gradient(135deg, var(--accent-soft), transparent 58%),
    var(--surface-muted);
}

.saved-login-card span,
.saved-login-card small {
  color: var(--text-secondary);
}

.saved-login-card strong {
  color: var(--text-primary);
  font-size: 22px;
}

.saved-login-avatar {
  display: grid;
  width: 54px;
  height: 54px;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: #ffffff;
  background: linear-gradient(135deg, var(--accent), var(--accent-strong));
  font-size: 24px;
  font-weight: 800;
}

.saved-login-copy {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.saved-login-copy span,
.saved-login-copy strong,
.saved-login-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.saved-login-actions {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  margin-top: 4px;
}

.saved-login-delete {
  color: var(--danger);
  border-color: var(--border);
}

.saved-login-delete:hover:not(:disabled) {
  color: var(--danger);
  border-color: var(--danger);
  background: var(--danger-bg);
  box-shadow: none;
}

.login-progress {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 40px;
  margin: 0 0 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0 12px;
  color: var(--accent);
  background:
    linear-gradient(135deg, var(--accent-soft), transparent 72%),
    var(--surface-muted);
  font-size: 14px;
  font-weight: 700;
}

.login-progress-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--border-strong);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.section-heading {
  margin-bottom: 22px;
}

.eyebrow {
  margin: 0 0 4px;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

h1,
h2 {
  margin: 0;
  line-height: 1.15;
}

h1 {
  font-size: 32px;
}

h2 {
  font-size: 24px;
}

.muted {
  color: var(--text-secondary);
}

.server-entry {
  border-top: 1px solid var(--border);
  padding: 18px 0;
}

.server-title,
.topbar,
.server-check-row,
.topbar-actions,
.cache-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.server-title,
.topbar,
.server-check-row {
  justify-content: space-between;
}

.topbar-actions,
.cache-actions {
  flex-wrap: wrap;
  justify-content: flex-end;
}

.cache-size {
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 38px;
  white-space: nowrap;
}

.server-title strong,
.server-title span {
  display: block;
}

.server-title span,
.server-check-row span {
  color: var(--text-secondary);
  font-size: 13px;
}

.account-list,
.library-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
  margin-top: 14px;
}

.login-form {
  display: grid;
  gap: 14px;
}

.error {
  border-left: 3px solid var(--danger);
  margin-top: 16px;
  padding: 8px 10px;
  color: var(--danger);
  background: var(--danger-bg);
}

.topbar {
  margin-bottom: 28px;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 18px;
  background: var(--surface-raised);
  box-shadow: 0 10px 32px rgba(15, 25, 36, 0.07);
}

.back-button {
  margin-bottom: 16px;
}

.library-grid button {
  min-height: 84px;
  color: var(--text-primary);
  border-color: var(--border);
  background: var(--surface);
}

.library-section {
  margin-top: 30px;
}

.library-link,
.media-tile {
  color: var(--text-primary);
  text-decoration: none;
  background: var(--surface);
}

.library-link {
  min-height: 96px;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
}

.library-link:hover,
.library-link:focus-visible {
  border-color: var(--accent);
  box-shadow: 0 12px 28px rgba(29, 127, 194, 0.13);
  transform: translateY(-1px);
}

.library-link strong,
.library-link span,
.media-copy strong,
.media-copy > .media-progress {
  display: block;
}

.library-link span,
.media-copy > .media-progress {
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 13px;
}

.toolbar,
.search-row {
  display: flex;
  gap: 12px;
}

.toolbar {
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: flex-end;
}

.local-library-search {
  flex: 1 1 300px;
  max-width: 360px;
  min-width: min(280px, 100%);
}

.local-library-search-input,
.toolbar select {
  min-height: 42px;
  border-color: color-mix(in srgb, var(--border-strong) 76%, transparent);
  border-radius: 12px;
  color: var(--text-primary);
  background: color-mix(in srgb, var(--surface) 82%, transparent);
  box-shadow: inset 0 1px 0 color-mix(in srgb, #ffffff 46%, transparent);
  font-size: 14px;
  font-weight: 600;
}

.local-library-search-input {
  padding-inline: 14px;
}

.local-library-search-input::placeholder {
  color: var(--text-muted);
  font-weight: 500;
}

.local-library-search-input:hover,
.toolbar select:hover {
  border-color: color-mix(in srgb, var(--accent) 42%, var(--border-strong));
  background: color-mix(in srgb, var(--surface) 92%, transparent);
}

.local-library-search-input:focus,
.toolbar select:focus {
  border-color: var(--accent);
  background: var(--surface);
  box-shadow:
    0 0 0 3px var(--accent-soft),
    inset 0 1px 0 color-mix(in srgb, #ffffff 48%, transparent);
}

.global-search-row {
  align-items: center;
  margin-bottom: 14px;
}

.global-search-input {
  min-height: 46px;
  border-radius: 8px;
}

.global-search-submit {
  min-width: 96px;
  min-height: 46px;
}

.search-history {
  display: grid;
  gap: 10px;
  margin-bottom: 22px;
}

.search-history-title {
  margin: 0;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 700;
}

.search-history-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.search-history-item {
  min-height: 34px;
  border-color: var(--border);
  border-radius: 999px;
  padding: 0 12px;
  color: var(--text-secondary);
  background: var(--surface-muted);
}

.search-history-item:hover:not(:disabled) {
  color: var(--accent-strong);
  border-color: var(--accent);
  background: var(--accent-soft);
  box-shadow: none;
}

.toolbar select {
  -webkit-appearance: none;
  appearance: none;
  width: auto;
  min-width: 140px;
  padding-right: 36px;
  background:
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23788492' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m7 10 5 5 5-5'/%3E%3C/svg%3E") right 14px center / 14px 14px no-repeat,
    color-mix(in srgb, var(--surface) 82%, transparent);
  cursor: pointer;
}

.toolbar select:hover {
  background:
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23788492' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m7 10 5 5 5-5'/%3E%3C/svg%3E") right 14px center / 14px 14px no-repeat,
    color-mix(in srgb, var(--surface) 92%, transparent);
}

.toolbar select:focus {
  background:
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23788492' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m7 10 5 5 5-5'/%3E%3C/svg%3E") right 14px center / 14px 14px no-repeat,
    var(--surface);
}

.media-browser-shell {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  height: 100vh;
  min-height: 100vh;
  overflow: hidden;
  color: var(--text-primary);
}

.media-sidebar {
  position: sticky;
  top: 0;
  display: grid;
  align-content: start;
  gap: 18px;
  height: 100vh;
  overflow-y: auto;
  border-right: 1px solid var(--border);
  padding: 28px 18px;
  background:
    linear-gradient(180deg, rgba(29, 127, 194, 0.08), transparent 38%),
    var(--surface-panel);
  backdrop-filter: blur(18px);
  scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
  scrollbar-gutter: stable;
  scrollbar-width: thin;
}

.media-sidebar::-webkit-scrollbar {
  width: 10px;
}

.media-sidebar::-webkit-scrollbar-track {
  background: var(--scrollbar-track);
}

.media-sidebar::-webkit-scrollbar-thumb {
  border: 3px solid transparent;
  border-radius: 999px;
  background: var(--scrollbar-thumb);
  background-clip: content-box;
}

.media-sidebar-logo {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--text-primary);
  text-decoration: none;
}

.media-sidebar-logo img {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  box-shadow: 0 12px 26px rgba(29, 127, 194, 0.2);
}

.media-sidebar-logo strong {
  font-size: 19px;
}

.media-sidebar-nav {
  display: grid;
  gap: 6px;
}

.media-sidebar-search-link {
  color: var(--text-primary);
  border-color: var(--border);
  background: var(--surface-muted);
}

.media-sidebar-divider {
  height: 1px;
  margin: 4px 0;
  background: var(--border-strong);
}

.media-sidebar-title,
.media-sidebar-muted {
  margin: 0;
  padding: 0 12px;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 700;
}

.media-sidebar-title {
  text-transform: uppercase;
}

.media-sidebar-link {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 44px;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 0 12px;
  color: var(--text-secondary);
  background: transparent;
  text-align: left;
  text-decoration: none;
}

.media-sidebar-link:hover,
.media-sidebar-link:focus-visible {
  color: var(--text-primary);
  background: var(--surface-muted);
}

.media-sidebar-link--active {
  color: #ffffff;
  border-color: rgba(255, 255, 255, 0.16);
  background: linear-gradient(135deg, var(--accent-strong), var(--accent));
  box-shadow: 0 14px 30px rgba(29, 127, 194, 0.22);
}

.media-sidebar-link--disabled {
  cursor: not-allowed;
  opacity: 0.64;
}

.media-sidebar-link--disabled:hover {
  color: var(--text-secondary);
  background: transparent;
}

.settings-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.24);
}

.settings-dialog {
  position: relative;
  display: grid;
  grid-template-columns: 176px minmax(0, 480px);
  width: min(720px, calc(100vw - 48px));
  min-height: 420px;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: var(--shadow);
}

.settings-tabs {
  display: grid;
  align-content: start;
  gap: 6px;
  border-right: 1px solid var(--border);
  padding: 16px;
  background: var(--surface-muted);
}

.settings-tab {
  justify-content: flex-start;
  border-color: transparent;
  color: var(--text-secondary);
  background: transparent;
  text-align: left;
}

.settings-tab:hover:not(:disabled) {
  color: var(--text-primary);
  border-color: transparent;
  background: var(--surface);
  box-shadow: none;
}

.settings-tab--active,
.settings-tab--active:hover:not(:disabled) {
  color: #ffffff;
  border-color: var(--accent);
  background: var(--accent);
  box-shadow: 0 10px 22px rgba(29, 127, 194, 0.2);
}

.settings-content {
  min-width: 0;
  padding: 18px 18px 18px;
}

.settings-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-right: 44px;
  margin-bottom: 18px;
}

.settings-close {
  position: absolute;
  top: 14px;
  right: 14px;
  display: inline-grid;
  width: 36px;
  min-width: 36px;
  height: 36px;
  min-height: 36px;
  place-items: center;
  border-color: var(--border);
  border-radius: 50%;
  padding: 0;
  color: var(--text-secondary);
  background: var(--surface-muted);
}

.settings-close:hover:not(:disabled) {
  color: var(--text-primary);
  border-color: var(--border-strong);
  background: var(--surface);
  box-shadow: 0 8px 18px rgba(12, 20, 30, 0.12);
}

.settings-close-icon,
.settings-close-icon::before {
  position: absolute;
  width: 15px;
  height: 2px;
  border-radius: 999px;
  background: currentColor;
}

.settings-close-icon {
  transform: rotate(45deg);
}

.settings-close-icon::before {
  content: "";
  inset: 0;
  transform: rotate(90deg);
}

.settings-panel {
  display: grid;
  gap: 12px;
}

.settings-card {
  display: grid;
  gap: 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px;
  background: var(--surface-raised);
}

.settings-card span {
  color: var(--text-muted);
  font-size: 13px;
}

.settings-card strong {
  color: var(--text-primary);
  font-size: 20px;
}

.settings-theme-card {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
}

.settings-theme-card > span {
  grid-column: 1;
}

.settings-font-card label {
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 600;
}

.settings-font-card select {
  min-height: 40px;
}

.settings-font-error {
  color: var(--danger);
  font-size: 12px;
  line-height: 1.4;
}

.theme-switch {
  --theme-index: 2;
  position: relative;
  grid-column: 2;
  display: grid;
  grid-template-columns: repeat(3, 42px);
  gap: 0;
  height: 40px;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 3px;
  background: var(--surface-muted);
  box-shadow: inset 0 1px 2px rgba(12, 20, 30, 0.08);
}

.theme-switch--light {
  --theme-index: 0;
}

.theme-switch--dark {
  --theme-index: 1;
}

.theme-switch--auto {
  --theme-index: 2;
}

.theme-switch-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 42px;
  height: 32px;
  border-radius: 999px;
  background: var(--surface);
  box-shadow: 0 8px 18px rgba(12, 20, 30, 0.16);
  transform: translateX(calc(var(--theme-index) * 42px));
  transition:
    transform 0.24s cubic-bezier(0.22, 1, 0.36, 1),
    background 0.24s ease,
    box-shadow 0.24s ease;
}

.theme-switch-option {
  position: relative;
  z-index: 1;
  display: inline-grid;
  width: 42px;
  min-width: 42px;
  height: 32px;
  min-height: 32px;
  place-items: center;
  border-color: transparent;
  border-radius: 999px;
  padding: 0;
  color: var(--text-muted);
  background: transparent;
  transition:
    color 0.2s ease,
    transform 0.2s ease;
}

.theme-switch-option:hover:not(:disabled) {
  color: var(--text-primary);
  border-color: transparent;
  background: transparent;
  box-shadow: none;
}

.theme-switch-option--active {
  color: var(--accent);
}

.theme-switch-option svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
}

.theme-switch-auto {
  color: currentColor;
  font-size: 15px;
  font-weight: 800;
  line-height: 1;
}

.settings-about {
  justify-items: start;
}

.settings-about img {
  width: 64px;
  height: 64px;
  border-radius: 16px;
  box-shadow: 0 12px 26px rgba(29, 127, 194, 0.22);
}

.media-sidebar-svg {
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
}

.media-sidebar-svg[data-icon="star"] {
  fill: currentColor;
  stroke-width: 1.7;
}

.media-browser-content {
  position: relative;
  min-width: 0;
  height: 100vh;
  overflow-y: auto;
  scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  padding: 0 34px 42px;
  background: var(--app-bg);
}

.media-browser-content::-webkit-scrollbar {
  width: 10px;
}

.media-browser-content::-webkit-scrollbar-track {
  background: var(--scrollbar-track);
}

.media-browser-content::-webkit-scrollbar-thumb {
  border: 3px solid transparent;
  border-radius: 999px;
  background: var(--scrollbar-thumb);
  background-clip: content-box;
}

.media-browser-topbar {
  position: sticky;
  top: 0;
  z-index: 12;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 76%, transparent);
  margin-inline: -34px;
  padding: 28px 34px 18px;
  background: color-mix(in srgb, var(--app-bg) 72%, transparent);
  backdrop-filter: blur(16px);
}

.search-row {
  margin-bottom: 20px;
}

.media-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(172px, 1fr));
  gap: 26px;
}

.media-page-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 28px 0 0;
  color: var(--text-muted);
  font-size: 13px;
}

.media-page-status--error {
  color: var(--danger);
}

.back-to-top-button {
  position: fixed;
  right: 28px;
  bottom: 28px;
  z-index: 40;
  display: inline-grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border: 1px solid var(--border);
  border-radius: 50%;
  padding: 0;
  color: var(--text-primary);
  background: var(--surface-raised);
  box-shadow: 0 14px 34px rgba(12, 20, 30, 0.22);
}

.back-to-top-button:hover,
.back-to-top-button:focus-visible {
  border-color: var(--accent);
  color: var(--accent-strong);
  transform: translateY(-2px);
}

.back-to-top-button svg {
  display: block;
  width: 21px;
  height: 21px;
  margin: auto;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.3;
}

.back-to-top-enter-active,
.back-to-top-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.back-to-top-enter-from,
.back-to-top-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

.media-tile {
  min-width: 0;
  color: var(--text-primary);
  background: transparent;
}

.poster-frame {
  position: relative;
  display: grid;
  place-items: center;
  aspect-ratio: 2 / 3;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: #ffffff;
  background: #273646;
  box-shadow: 0 14px 30px rgba(12, 20, 30, 0.16);
}

.poster-frame img,
.detail-poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.poster-placeholder,
.detail-poster span {
  font-size: 40px;
  font-weight: 700;
}

.resolution-badge {
  position: absolute;
  top: 7px;
  left: 7px;
  z-index: 1;
  border: 1px solid rgba(255, 190, 56, 0.92);
  border-radius: 5px;
  padding: 2px 6px;
  color: #ffd46b;
  background: rgba(0, 0, 0, 0.72);
  font-size: 13px;
  font-weight: 800;
  line-height: 1.2;
}

.media-copy {
  padding-top: 10px;
}

.media-tile {
  border-radius: 8px;
  text-decoration: none;
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.media-tile:hover,
.media-tile:focus-visible {
  transform: translateY(-2px);
}

.media-tile:hover .poster-frame,
.media-tile:focus-visible .poster-frame {
  border-color: var(--accent);
}

.media-copy strong {
  overflow: hidden;
  color: var(--text-primary);
  font-size: 15px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.media-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  color: var(--text-muted);
  line-height: 1.35;
}

.media-meta span {
  margin: 0;
}

.media-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
  max-width: 100%;
}

.media-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: fit-content;
  max-width: 100%;
  border: 1px solid color-mix(in srgb, var(--accent) 22%, var(--border));
  border-radius: 999px;
  margin-top: 0;
  padding: 3px 8px;
  color: var(--text-secondary);
  background: color-mix(in srgb, var(--surface-muted) 78%, var(--accent-soft));
  font-size: 12px;
  font-weight: 700;
  line-height: 1.35;
  text-align: center;
  white-space: nowrap;
}

.media-tag--genre {
  color: color-mix(in srgb, var(--accent-strong) 72%, var(--text-primary));
  background: linear-gradient(135deg, var(--accent-soft), color-mix(in srgb, var(--surface) 82%, var(--accent-soft)));
}

.media-tag--type {
  color: var(--text-secondary);
  background: var(--surface-muted);
}

.media-progress {
  color: var(--accent);
  font-weight: 700;
}

.state-block {
  display: grid;
  min-height: calc(100vh - 220px);
  place-content: center;
  justify-items: center;
  gap: 10px;
  border: 0;
  padding: 28px 20px;
  background: transparent;
  text-align: center;
}

.state-block strong {
  display: block;
}

.state-block p {
  margin: 0;
  color: var(--text-secondary);
}

.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid var(--border-strong);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.detail-layout {
  position: relative;
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 28px;
  overflow: visible;
  border: 0;
  border-radius: 8px;
  padding: 24px;
  background: transparent;
  box-shadow: none;
}

.detail-back-button {
  position: relative;
  z-index: 2;
  display: inline-grid;
  width: 40px;
  min-width: 40px;
  height: 40px;
  min-height: 40px;
  place-items: center;
  border-color: var(--border);
  border-radius: 50%;
  margin-bottom: 16px;
  padding: 0;
  color: var(--text-primary);
  background: var(--surface-raised);
}

.detail-back-button svg {
  width: 18px;
  height: 18px;
  fill: currentColor;
}

.detail-poster {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  aspect-ratio: 2 / 3;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: #ffffff;
  background: #273646;
}

.detail-copy {
  position: relative;
  z-index: 1;
  min-width: 0;
}

.detail-backdrop {
  position: fixed;
  inset: -12vh -12vw;
  z-index: 0;
  background-position: center;
  background-size: cover;
  border: 0;
  opacity: 1;
  filter: blur(8px) saturate(1.08);
  pointer-events: none;
}

.detail-backdrop::after {
  content: "";
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--app-bg) 78%, transparent) 0%, color-mix(in srgb, var(--app-bg) 46%, transparent) 54%, color-mix(in srgb, var(--app-bg) 78%, transparent) 100%),
    color-mix(in srgb, var(--app-bg) 42%, transparent);
}

.overview {
  max-width: 760px;
  color: var(--text-secondary);
  line-height: 1.65;
}

.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 18px 0;
}

.tag-row span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--detail-tag-border, var(--border));
  border-radius: 999px;
  padding: 4px 10px;
  color: var(--detail-tag-color, var(--text-secondary));
  background: var(--detail-tag-bg, var(--surface-raised));
  font-size: 13px;
  line-height: 1.35;
}

.detail-resolution-tag {
  --detail-tag-border: color-mix(in srgb, var(--accent) 38%, var(--border));
  --detail-tag-color: var(--accent-strong);
  --detail-tag-bg: var(--accent-soft);
  border-radius: 999px;
  font-weight: 700;
}

.dolby-badge {
  display: inline-flex;
  gap: 6px;
  min-width: 42px;
  --detail-tag-border: color-mix(in srgb, #f4c542 46%, var(--border));
  --detail-tag-color: #f4c542;
  --detail-tag-bg: color-mix(in srgb, #f4c542 16%, var(--surface-raised));
  color: #f4c542;
  font-weight: 700;
}

.dolby-badge svg {
  width: 28px;
  height: 16px;
  fill: currentColor;
}

.detail-video-size {
  margin: 18px 0 0;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 600;
}

.action-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 18px;
}

.playback-status {
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
}

.playback-error {
  width: fit-content;
  max-width: 100%;
}

.detail-episode-section {
  margin-top: 24px;
}

.detail-episode-section h2 {
  margin: 0 0 12px;
  color: var(--text-primary);
  font-size: 18px;
}

.detail-episode-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}

.detail-episode-card {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
  color: var(--text-primary);
  background: var(--surface-raised);
  text-align: left;
}

.detail-episode-card:hover:not(:disabled),
.detail-episode-card:focus-visible {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.detail-episode-card--resumable {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.detail-episode-thumb {
  display: grid;
  place-items: center;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: 5px;
  color: #ffffff;
  background: #273646;
}

.detail-episode-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.detail-episode-copy {
  min-width: 0;
}

.detail-episode-copy strong,
.detail-episode-copy span {
  display: block;
}

.detail-episode-copy strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-episode-copy span {
  margin-top: 3px;
  color: var(--text-secondary);
  font-size: 12px;
}

.detail-episode-copy .detail-episode-progress {
  color: var(--accent);
  font-weight: 700;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 820px) {
  .media-browser-shell {
    grid-template-columns: 1fr;
  }

  .media-sidebar {
    position: static;
    height: auto;
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }

  .media-browser-content {
    padding: 24px 20px 34px;
  }

  .media-browser-topbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .settings-dialog {
    grid-template-columns: 1fr;
  }

  .settings-tabs {
    display: flex;
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }

  .server-shell {
    grid-template-columns: 1fr;
  }

  .topbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .toolbar,
  .search-row,
  .detail-layout {
    grid-template-columns: 1fr;
    flex-direction: column;
  }

  .toolbar select {
    width: 100%;
  }

  .detail-poster {
    width: min(240px, 100%);
  }
}
</style>
