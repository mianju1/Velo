import { describe, expect, it } from "vitest";
import {
  canUsePlaybackControls,
  formatPlaybackMinuteTime,
  formatPlaybackTime,
  keyboardShortcutAction,
  shouldUsePlaybackLoadingBackdrop,
  shouldRenderPlaybackOverlay,
  isPointerInToolbarRevealZone,
  progressPercent,
  runtimeMinutesToSeconds,
  shouldHideToolbar,
  RIGHT_ARROW_HOLD_SPEED_DELAY_MS,
  TOOLBAR_HIDE_DELAY_MS,
} from "./playback-controls";
import playbackControlsSource from "./PlaybackControls.vue?raw";

describe("播放控制栏辅助逻辑", () => {
  it("格式化播放时间", () => {
    expect(formatPlaybackTime(65)).toBe("01:05");
    expect(formatPlaybackTime(3665)).toBe("1:01:05");
  });

  it("格式化进度悬停时间时以分钟为最大单位", () => {
    expect(formatPlaybackMinuteTime(3600)).toBe("60:00");
    expect(formatPlaybackMinuteTime(7200)).toBe("120:00");
  });

  it("计算进度百分比并限制范围", () => {
    expect(progressPercent(30, 120)).toBe(25);
    expect(progressPercent(150, 120)).toBe(100);
    expect(progressPercent(30, 0)).toBe(0);
  });

  it("把详情页分钟片长转换为秒", () => {
    expect(runtimeMinutesToSeconds(42)).toBe(2520);
    expect(runtimeMinutesToSeconds(undefined)).toBeUndefined();
  });

  it("加载视频时仍允许拖动进度和跳过片头片尾", () => {
    expect(canUsePlaybackControls("loadingVideo")).toBe(true);
    expect(canUsePlaybackControls("playing")).toBe(true);
    expect(canUsePlaybackControls("creatingKernel")).toBe(false);
    expect(canUsePlaybackControls("failed")).toBe(false);
  });

  it("工具栏失焦后快速隐藏", () => {
    expect(TOOLBAR_HIDE_DELAY_MS).toBe(500);
  });

  it("右方向键长按超过 0.5 秒才进入倍速判断", () => {
    expect(RIGHT_ARROW_HOLD_SPEED_DELAY_MS).toBe(500);
  });

  it("鼠标移动到窗口任意边缘都会唤起隐藏的播放工具栏", () => {
    expect(isPointerInToolbarRevealZone(640, 690, 1280, 720)).toBe(true);
    expect(isPointerInToolbarRevealZone(640, 30, 1280, 720)).toBe(true);
    expect(isPointerInToolbarRevealZone(30, 360, 1280, 720)).toBe(true);
    expect(isPointerInToolbarRevealZone(1250, 360, 1280, 720)).toBe(true);
    expect(isPointerInToolbarRevealZone(640, 500, 1280, 720)).toBe(false);
    expect(isPointerInToolbarRevealZone(-1, 360, 1280, 720)).toBe(false);
    expect(isPointerInToolbarRevealZone(640, 721, 1280, 720)).toBe(false);
  });

  it("鼠标仍在工具栏内时不自动隐藏", () => {
    expect(shouldHideToolbar(true, false)).toBe(true);
    expect(shouldHideToolbar(true, true)).toBe(false);
    expect(shouldHideToolbar(false, false)).toBe(false);
  });

  it("播放层可见时需要渲染事件覆盖层", () => {
    expect(shouldRenderPlaybackOverlay(true)).toBe(true);
    expect(shouldRenderPlaybackOverlay(false)).toBe(false);
  });

  it("uses a black backdrop only while the video is loading", () => {
    expect(shouldUsePlaybackLoadingBackdrop("creatingKernel", false)).toBe(true);
    expect(shouldUsePlaybackLoadingBackdrop("loadingVideo", false)).toBe(true);
    expect(shouldUsePlaybackLoadingBackdrop("loadingVideo", true)).toBe(false);
    expect(shouldUsePlaybackLoadingBackdrop("playing", true)).toBe(false);
    expect(shouldUsePlaybackLoadingBackdrop("failed", false)).toBe(false);
  });

  it("defines an opaque black loading backdrop for the playback overlay", () => {
    const loadingBackdropRule =
      playbackControlsSource.match(/\.playback-overlay--loading\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? "";

    expect(loadingBackdropRule).toContain("background: #000");
  });

  it("只有播放窗口可见且焦点不在输入控件时才响应快捷键", () => {
    expect(
      keyboardShortcutAction({
        key: " ",
        repeat: false,
        playbackVisible: false,
        targetEditable: false,
        fullscreen: false,
      }),
    ).toBeNull();
    expect(
      keyboardShortcutAction({
        key: " ",
        repeat: false,
        playbackVisible: true,
        targetEditable: true,
        fullscreen: false,
      }),
    ).toBeNull();
  });

  it("按键事件已到达播放窗口时响应快捷键，避免被原生视频层焦点状态误拦截", () => {
    expect(
      keyboardShortcutAction({
        key: " ",
        repeat: false,
        playbackVisible: true,
        targetEditable: false,
        fullscreen: false,
      }),
    ).toEqual({ type: "togglePause" });
  });

  it("映射播放器快捷键动作", () => {
    const base = {
      repeat: false,
      playbackVisible: true,
      targetEditable: false,
      fullscreen: true,
    };

    expect(keyboardShortcutAction({ ...base, key: " " })).toEqual({ type: "togglePause" });
    expect(keyboardShortcutAction({ ...base, key: "f" })).toEqual({ type: "toggleFullscreen" });
    expect(keyboardShortcutAction({ ...base, key: "ArrowUp" })).toEqual({ type: "volumeDelta", delta: 5 });
    expect(keyboardShortcutAction({ ...base, key: "ArrowDown" })).toEqual({ type: "volumeDelta", delta: -5 });
    expect(keyboardShortcutAction({ ...base, key: "ArrowLeft" })).toEqual({ type: "seekDelta", delta: -15 });
    expect(keyboardShortcutAction({ ...base, key: "ArrowRight" })).toEqual({ type: "rightArrowDown" });
    expect(keyboardShortcutAction({ ...base, key: "Escape" })).toEqual({ type: "exitFullscreen" });
    expect(keyboardShortcutAction({ ...base, key: "Escape", fullscreen: false })).toBeNull();
    expect(keyboardShortcutAction({ ...base, key: "ArrowRight", repeat: true })).toEqual({ type: "rightArrowDown" });
  });
});
