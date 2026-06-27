// @vitest-environment jsdom
import { createPinia } from "pinia";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, nextTick, type App } from "vue";
import { usePlaybackStore } from "../../app/stores/playback";
import { useSessionStore } from "../../app/stores/session";
import {
  loadSubtitle,
  pausePlayback,
  seekPlayback,
  setPlaybackRate,
  setPlaybackFullscreen,
  setPlaybackMuted,
  setPlaybackVolume,
  stopPlayback,
} from "../../services/playback/playback";
import PlaybackControls from "./PlaybackControls.vue";

vi.mock("../../services/playback/playback", () => ({
  pausePlayback: vi.fn(),
  resumePlayback: vi.fn(),
  seekPlayback: vi.fn(),
  setPlaybackFullscreen: vi.fn(),
  setPlaybackMuted: vi.fn(),
  setPlaybackRate: vi.fn(),
  setPlaybackVolume: vi.fn(),
  stopPlayback: vi.fn(),
  getPlaybackCacheStatus: vi.fn().mockResolvedValue({ sizeBytes: 0, path: "/tmp/cache" }),
  loadSubtitle: vi.fn(),
}));

describe("PlaybackControls", () => {
  let app: App<Element> | null = null;

  afterEach(() => {
    app?.unmount();
    app = null;
    document.body.innerHTML = "";
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("播放层可见时渲染全窗口事件覆盖层承接快捷键", async () => {
    const pinia = createPinia();
    const root = document.createElement("div");
    document.body.append(root);
    app = createApp(PlaybackControls);
    app.use(pinia);
    app.mount(root);

    const playback = usePlaybackStore(pinia);
    playback.current = {
      itemId: "item-1",
      mediaSourceId: "source-1",
      playMethod: "direct",
    };
    playback.phase = "playing";
    playback.seekReady = true;
    await nextTick();

    const overlay = root.querySelector<HTMLElement>(".playback-overlay");
    expect(overlay).not.toBeNull();
    expect(overlay?.tabIndex).toBe(-1);

    overlay?.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));

    expect(pausePlayback).toHaveBeenCalled();
  });

  it("uses a black overlay backdrop while loading and removes it when video is playing", async () => {
    const pinia = createPinia();
    const root = document.createElement("div");
    document.body.append(root);
    app = createApp(PlaybackControls);
    app.use(pinia);
    app.mount(root);

    const playback = usePlaybackStore(pinia);
    playback.current = {
      itemId: "item-1",
      mediaSourceId: "source-1",
      playMethod: "direct",
    };
    playback.phase = "loadingVideo";
    await nextTick();

    const overlay = root.querySelector<HTMLElement>(".playback-overlay");
    expect(overlay).not.toBeNull();
    expect(overlay?.classList.contains("playback-overlay--loading")).toBe(true);

    playback.phase = "playing";
    await nextTick();

    expect(overlay?.classList.contains("playback-overlay--loading")).toBe(false);
  });

  it("keeps the black loading backdrop while loading even when the timeline becomes seek ready", async () => {
    const pinia = createPinia();
    const root = document.createElement("div");
    document.body.append(root);
    app = createApp(PlaybackControls);
    app.use(pinia);
    app.mount(root);

    const playback = usePlaybackStore(pinia);
    playback.current = {
      itemId: "item-1",
      mediaSourceId: "source-1",
      playMethod: "direct",
    };
    playback.phase = "loadingVideo";
    playback.seekReady = true;
    await nextTick();

    const overlay = root.querySelector<HTMLElement>(".playback-overlay");
    expect(overlay).not.toBeNull();
    expect(overlay?.classList.contains("playback-overlay--loading")).toBe(true);
  });

  it("工具栏隐藏后鼠标移到顶部边缘会显示，并在离开工具栏时继续自动隐藏", async () => {
    vi.useFakeTimers();
    const pinia = createPinia();
    const root = document.createElement("div");
    document.body.append(root);
    app = createApp(PlaybackControls);
    app.use(pinia);
    app.mount(root);

    const playback = usePlaybackStore(pinia);
    playback.current = {
      itemId: "item-1",
      mediaSourceId: "source-1",
      playMethod: "direct",
    };
    playback.phase = "playing";
    playback.seekReady = true;
    await nextTick();
    await vi.advanceTimersByTimeAsync(500);
    await nextTick();

    const overlay = root.querySelector<HTMLElement>(".playback-overlay");
    const controls = root.querySelector<HTMLElement>(".playback-controls");
    expect(overlay).not.toBeNull();
    expect(controls?.classList.contains("playback-controls--hidden")).toBe(true);

    overlay!.dispatchEvent(new PointerEvent("pointermove", { clientX: 640, clientY: 30, bubbles: true }));
    await nextTick();

    expect(controls?.classList.contains("playback-controls--hidden")).toBe(false);

    await vi.advanceTimersByTimeAsync(500);
    await nextTick();

    expect(controls?.classList.contains("playback-controls--hidden")).toBe(true);
  });

  it("窗口快捷键可控制暂停、全屏、进度和音量", async () => {
    const pinia = createPinia();
    const root = document.createElement("div");
    document.body.append(root);
    app = createApp(PlaybackControls);
    app.use(pinia);
    app.mount(root);

    const playback = usePlaybackStore(pinia);
    playback.current = {
      itemId: "item-1",
      mediaSourceId: "source-1",
      playMethod: "direct",
    };
    playback.phase = "playing";
    playback.seekReady = true;
    playback.setPlaybackMetadata({ durationSeconds: 120 });
    playback.positionSeconds = 30;
    playback.volume = 40;
    await nextTick();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "f" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    window.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowRight" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));

    await nextTick();

    expect(pausePlayback).toHaveBeenCalled();
    expect(setPlaybackFullscreen).toHaveBeenCalledWith(true);
    expect(seekPlayback).toHaveBeenCalledWith(45);
    expect(setPlaybackVolume).toHaveBeenCalledWith(45);
  });

  it("快捷键触发播放操作时在左上角显示反馈提示", async () => {
    vi.useFakeTimers();
    const pinia = createPinia();
    const root = document.createElement("div");
    document.body.append(root);
    app = createApp(PlaybackControls);
    app.use(pinia);
    app.mount(root);

    const playback = usePlaybackStore(pinia);
    playback.current = {
      itemId: "item-1",
      mediaSourceId: "source-1",
      playMethod: "direct",
    };
    playback.phase = "playing";
    playback.seekReady = true;
    playback.setPlaybackMetadata({ durationSeconds: 120 });
    playback.positionSeconds = 30;
    playback.volume = 75;
    await nextTick();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));
    await nextTick();

    expect(root.querySelector(".shortcut-feedback")?.textContent).toBe("当前音量：80%");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    await nextTick();

    expect(root.querySelector(".shortcut-feedback")?.textContent).toBe("-15s");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    await nextTick();

    expect(root.querySelector(".shortcut-feedback")?.textContent).toBe("暂停");

    playback.paused = true;
    window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    await nextTick();

    expect(root.querySelector(".shortcut-feedback")?.textContent).toBe("播放");

    await vi.advanceTimersByTimeAsync(1200);
    expect(root.querySelector(".shortcut-feedback")).toBeNull();
  });

  it("鼠标点击播放器按钮不显示快捷键反馈提示", async () => {
    const pinia = createPinia();
    const root = document.createElement("div");
    document.body.append(root);
    app = createApp(PlaybackControls);
    app.use(pinia);
    app.mount(root);

    const playback = usePlaybackStore(pinia);
    playback.current = {
      itemId: "item-1",
      mediaSourceId: "source-1",
      playMethod: "direct",
    };
    playback.phase = "playing";
    playback.seekReady = true;
    await nextTick();

    const pauseButton = root.querySelector<HTMLButtonElement>('button[aria-label="播放/暂停"]');
    pauseButton?.click();
    await nextTick();

    expect(pausePlayback).toHaveBeenCalled();
    expect(root.querySelector(".shortcut-feedback")).toBeNull();
  });

  it("播放器工具栏使用 SVG 图标，不使用 emoji 作为图标", async () => {
    const pinia = createPinia();
    const root = document.createElement("div");
    document.body.append(root);
    app = createApp(PlaybackControls);
    app.use(pinia);
    app.mount(root);

    const playback = usePlaybackStore(pinia);
    playback.current = {
      itemId: "item-1",
      mediaSourceId: "source-1",
      playMethod: "direct",
    };
    playback.phase = "playing";
    playback.seekReady = true;
    await nextTick();

    const iconButtons = root.querySelectorAll<HTMLButtonElement>(".icon-button");
    expect(iconButtons.length).toBeGreaterThan(0);

    for (const button of iconButtons) {
      expect(button.querySelector("svg.control-icon")).not.toBeNull();
      expect(button.textContent).not.toMatch(/[▶️⏸️🔇🔊⬅️⏭️⛶]/u);
    }
  });

  it("展示上一集、下一集和带封面的选集列表", async () => {
    const pinia = createPinia();
    const root = document.createElement("div");
    document.body.append(root);
    app = createApp(PlaybackControls);
    app.use(pinia);
    app.mount(root);

    const playback = usePlaybackStore(pinia);
    playback.current = {
      itemId: "episode-2",
      mediaSourceId: "source-2",
      playMethod: "direct",
    };
    playback.phase = "playing";
    playback.seekReady = true;
    playback.setPlaybackMetadata({
      title: "第二集",
      episodes: [
        { itemId: "episode-1", title: "第一集", imageUrl: "https://img/1.jpg" },
        { itemId: "episode-2", title: "第二集", imageUrl: "https://img/2.jpg" },
        { itemId: "episode-3", title: "第三集", imageUrl: "https://img/3.jpg" },
      ],
    });
    await nextTick();

    expect(root.querySelector<HTMLButtonElement>('button[aria-label="上一集"] svg.control-icon')).not.toBeNull();
    expect(root.querySelector<HTMLButtonElement>('button[aria-label="下一集"] svg.control-icon')).not.toBeNull();

    root.querySelector<HTMLButtonElement>('button[aria-label="选集"]')?.click();
    await nextTick();

    const episodeImages = root.querySelectorAll<HTMLImageElement>(".episode-menu img");
    expect(episodeImages).toHaveLength(3);
    expect(episodeImages[1]?.src).toBe("https://img/2.jpg");
    expect(root.querySelector(".episode-menu")?.textContent).toContain("第二集");
  });

  it("点击静音图标时音量归零，再次点击恢复静音前音量", async () => {
    const pinia = createPinia();
    const root = document.createElement("div");
    document.body.append(root);
    app = createApp(PlaybackControls);
    app.use(pinia);
    app.mount(root);

    const playback = usePlaybackStore(pinia);
    playback.current = {
      itemId: "item-1",
      mediaSourceId: "source-1",
      playMethod: "direct",
    };
    playback.phase = "playing";
    playback.seekReady = true;
    playback.volume = 70;
    await nextTick();

    const muteButton = root.querySelector<HTMLButtonElement>('button[aria-label="静音/取消静音"]');
    const volumeSlider = root.querySelector<HTMLInputElement>('input[aria-label="音量"]');

    expect(muteButton).not.toBeNull();
    expect(volumeSlider?.value).toBe("70");

    muteButton?.click();
    await Promise.resolve();
    await Promise.resolve();
    await nextTick();

    expect(setPlaybackMuted).toHaveBeenCalledWith(true);
    expect(setPlaybackVolume).toHaveBeenCalledWith(0);
    expect(playback.volume).toBe(0);
    expect(volumeSlider?.value).toBe("0");

    muteButton?.click();
    await Promise.resolve();
    await Promise.resolve();
    await nextTick();

    expect(setPlaybackMuted).toHaveBeenCalledWith(false);
    expect(setPlaybackVolume).toHaveBeenCalledWith(70);
    expect(playback.volume).toBe(70);
    expect(volumeSlider?.value).toBe("70");
  });

  it("进度条悬停时显示鼠标位置对应的时间节点", async () => {
    const pinia = createPinia();
    const root = document.createElement("div");
    document.body.append(root);
    app = createApp(PlaybackControls);
    app.use(pinia);
    app.mount(root);

    const playback = usePlaybackStore(pinia);
    playback.current = {
      itemId: "item-1",
      mediaSourceId: "source-1",
      playMethod: "direct",
    };
    playback.phase = "playing";
    playback.seekReady = true;
    playback.setPlaybackMetadata({ durationSeconds: 7200 });
    await nextTick();

    const timeline = root.querySelector<HTMLElement>(".timeline-wrap");
    expect(timeline).not.toBeNull();
    timeline!.getBoundingClientRect = () =>
      ({
        left: 0,
        right: 200,
        width: 200,
        top: 0,
        bottom: 20,
        height: 20,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    timeline!.dispatchEvent(new MouseEvent("pointermove", { clientX: 100, bubbles: true }));
    await nextTick();

    expect(root.querySelector(".timeline-hover-preview")?.textContent?.trim()).toBe("60:00/120:00");
  });

  it("点击进度条时按鼠标位置跳转到对应进度", async () => {
    const pinia = createPinia();
    const root = document.createElement("div");
    document.body.append(root);
    app = createApp(PlaybackControls);
    app.use(pinia);
    app.mount(root);

    const playback = usePlaybackStore(pinia);
    playback.current = {
      itemId: "item-1",
      mediaSourceId: "source-1",
      playMethod: "direct",
    };
    playback.phase = "playing";
    playback.seekReady = true;
    playback.setPlaybackMetadata({ durationSeconds: 120 });
    await nextTick();

    const timeline = root.querySelector<HTMLElement>(".timeline-wrap");
    expect(timeline).not.toBeNull();
    timeline!.getBoundingClientRect = () =>
      ({
        left: 0,
        right: 200,
        width: 200,
        top: 0,
        bottom: 20,
        height: 20,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    timeline!.dispatchEvent(new PointerEvent("pointerdown", { clientX: 100, bubbles: true }));
    timeline!.dispatchEvent(new PointerEvent("pointerup", { clientX: 100, bubbles: true }));
    await nextTick();

    expect(seekPlayback).toHaveBeenCalledWith(60);
  });

  it("视频加载期间点击进度条不会触发 seek，加载完成后恢复跳转", async () => {
    const pinia = createPinia();
    const root = document.createElement("div");
    document.body.append(root);
    app = createApp(PlaybackControls);
    app.use(pinia);
    app.mount(root);

    const playback = usePlaybackStore(pinia);
    playback.current = {
      itemId: "episode-2",
      mediaSourceId: "source-2",
      playMethod: "direct",
    };
    playback.phase = "loadingVideo";
    playback.setPlaybackMetadata({ durationSeconds: 120 });
    await nextTick();

    const timeline = root.querySelector<HTMLElement>(".timeline-wrap");
    const input = root.querySelector<HTMLInputElement>('input[aria-label="播放进度"]');
    expect(timeline).not.toBeNull();
    expect(input?.disabled).toBe(true);
    timeline!.getBoundingClientRect = () =>
      ({
        left: 0,
        right: 200,
        width: 200,
        top: 0,
        bottom: 20,
        height: 20,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    timeline!.dispatchEvent(new PointerEvent("pointerdown", { clientX: 100, bubbles: true }));
    timeline!.dispatchEvent(new PointerEvent("pointerup", { clientX: 100, bubbles: true }));
    await nextTick();

    expect(seekPlayback).not.toHaveBeenCalled();
    expect(playback.pendingSeekSeconds).toBeNull();

    playback.phase = "playing";
    playback.seekReady = true;
    await nextTick();

    expect(input?.disabled).toBe(false);

    timeline!.dispatchEvent(new PointerEvent("pointerdown", { clientX: 100, bubbles: true }));
    timeline!.dispatchEvent(new PointerEvent("pointerup", { clientX: 100, bubbles: true }));
    await nextTick();

    expect(seekPlayback).toHaveBeenCalledWith(60);
  });

  it("全屏快捷键不显示反馈提示", async () => {
    const pinia = createPinia();
    const root = document.createElement("div");
    document.body.append(root);
    app = createApp(PlaybackControls);
    app.use(pinia);
    app.mount(root);

    const playback = usePlaybackStore(pinia);
    playback.current = {
      itemId: "item-1",
      mediaSourceId: "source-1",
      playMethod: "direct",
    };
    playback.phase = "playing";
    playback.seekReady = true;
    await nextTick();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "f" }));
    await nextTick();

    expect(setPlaybackFullscreen).toHaveBeenCalledWith(true);
    expect(root.querySelector(".shortcut-feedback")).toBeNull();
  });

  it("切换字幕后焦点回到播放层，快捷键继续生效", async () => {
    vi.mocked(loadSubtitle).mockResolvedValue(undefined);
    const pinia = createPinia();
    const root = document.createElement("div");
    document.body.append(root);
    app = createApp(PlaybackControls);
    app.use(pinia);
    app.mount(root);

    const session = useSessionStore(pinia);
    session.activeSession = {
      server: { id: "server-1", name: "Home", url: "https://emby.example.test" },
      account: { id: "user-1", serverId: "server-1", name: "alice" },
      accessToken: "token-1",
    };
    const playback = usePlaybackStore(pinia);
    playback.current = {
      itemId: "item-1",
      mediaSourceId: "source-1",
      playMethod: "direct",
    };
    playback.phase = "playing";
    playback.seekReady = true;
    playback.subtitleTracks = [
      { id: "zh", mediaSourceId: "source-1", streamIndex: 3, codec: "ass", language: "chi", label: "中文" },
    ];
    await nextTick();

    const subtitleSelect = root.querySelector<HTMLSelectElement>(".subtitle-field select");
    const overlay = root.querySelector<HTMLElement>(".playback-overlay");
    subtitleSelect?.focus();
    expect(document.activeElement).toBe(subtitleSelect);

    subtitleSelect!.value = "zh";
    subtitleSelect?.dispatchEvent(new Event("change", { bubbles: true }));
    await nextTick();
    await nextTick();

    expect(document.activeElement).toBe(overlay);

    document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));

    expect(pausePlayback).toHaveBeenCalled();
  });

  it("播放控制按钮位于覆盖层内并能触发停止命令", async () => {
    const pinia = createPinia();
    const root = document.createElement("div");
    document.body.append(root);
    app = createApp(PlaybackControls);
    app.use(pinia);
    app.mount(root);

    const playback = usePlaybackStore(pinia);
    playback.current = {
      itemId: "item-1",
      mediaSourceId: "source-1",
      playMethod: "direct",
    };
    playback.phase = "playing";
    playback.seekReady = true;
    await nextTick();

    const stopButton = root.querySelector<HTMLButtonElement>('button[aria-label="停止"]');
    expect(stopButton).not.toBeNull();

    stopButton?.click();
    await nextTick();

    expect(stopPlayback).toHaveBeenCalled();
  });

  it("右方向键在 0.5 秒内松开时只快进 15 秒", async () => {
    vi.useFakeTimers();
    const pinia = createPinia();
    const root = document.createElement("div");
    document.body.append(root);
    app = createApp(PlaybackControls);
    app.use(pinia);
    app.mount(root);

    const playback = usePlaybackStore(pinia);
    playback.current = {
      itemId: "item-1",
      mediaSourceId: "source-1",
      playMethod: "direct",
    };
    playback.phase = "playing";
    playback.seekReady = true;
    playback.setPlaybackMetadata({ durationSeconds: 120 });
    playback.positionSeconds = 30;
    playback.rate = 1.25;
    await nextTick();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    await vi.advanceTimersByTimeAsync(499);
    window.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowRight" }));
    await nextTick();

    expect(seekPlayback).toHaveBeenCalledWith(45);
    expect(setPlaybackRate).not.toHaveBeenCalled();
    expect(root.querySelector(".shortcut-feedback")?.textContent).toBe("+15s");
  });

  it("右方向键按下超过 0.5 秒后进入临时倍速播放，松开后恢复原倍速", async () => {
    vi.useFakeTimers();
    const pinia = createPinia();
    const root = document.createElement("div");
    document.body.append(root);
    app = createApp(PlaybackControls);
    app.use(pinia);
    app.mount(root);

    const playback = usePlaybackStore(pinia);
    playback.current = {
      itemId: "item-1",
      mediaSourceId: "source-1",
      playMethod: "direct",
    };
    playback.phase = "playing";
    playback.seekReady = true;
    playback.setPlaybackMetadata({ durationSeconds: 120 });
    playback.positionSeconds = 30;
    playback.rate = 1.25;
    await nextTick();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    await vi.advanceTimersByTimeAsync(500);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", repeat: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", repeat: true }));
    window.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowRight" }));

    expect(seekPlayback).not.toHaveBeenCalled();
    expect(setPlaybackRate).toHaveBeenNthCalledWith(1, 2);
    expect(setPlaybackRate).toHaveBeenNthCalledWith(2, 1.25);
    expect(setPlaybackRate).toHaveBeenCalledTimes(2);
    expect(root.querySelector(".shortcut-feedback")?.textContent).toBe("2x");
  });
});
