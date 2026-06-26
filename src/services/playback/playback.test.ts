import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getPlaybackStatus,
  clearPlaybackCache,
  getPlaybackCacheStatus,
  disableSubtitle,
  loadSubtitle,
  pausePlayback,
  reportPlaybackProgress,
  seekPlayback,
  selectEmbeddedSubtitle,
  setPlaybackBufferProfile,
  setPlaybackRate,
  startPlayback,
  stopPlayback,
} from "./playback";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("播放服务", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
  });

  it("启动播放时只提交播放意图", async () => {
    vi.mocked(invoke).mockResolvedValue({
      itemId: "item-1",
      mediaSourceId: "source-1",
      playMethod: "direct",
    });

    await startPlayback({
      serverId: "server-1",
      userId: "user-1",
      itemId: "item-1",
      mediaSourceId: "source-1",
    });

    expect(invoke).toHaveBeenCalledWith("start_playback", {
      request: {
        serverId: "server-1",
        userId: "user-1",
        itemId: "item-1",
        mediaSourceId: "source-1",
      },
    });
    expect(JSON.stringify(vi.mocked(invoke).mock.calls[0])).not.toContain("token");
    expect(JSON.stringify(vi.mocked(invoke).mock.calls[0])).not.toContain("url");
  });

  it("停止播放调用 Rust 命令", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);

    await stopPlayback();

    expect(invoke).toHaveBeenCalledWith("mpv_stop");
  });

  it("停止播放时可携带最终播放位置", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);

    await stopPlayback(12);

    expect(invoke).toHaveBeenCalledWith("mpv_stop", { positionSeconds: 12 });
  });

  it("暂停和 seek 调用 mpv 命令", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);

    await pausePlayback();
    await seekPlayback(30);

    expect(invoke).toHaveBeenNthCalledWith(1, "mpv_pause");
    expect(invoke).toHaveBeenNthCalledWith(2, "mpv_seek", { seconds: 30 });
  });

  it("设置倍速调用 Rust 命令", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);

    await setPlaybackRate(1.5);

    expect(invoke).toHaveBeenCalledWith("mpv_set_speed", { speed: 1.5 });
  });

  it("切换缓存策略调用 Rust 命令", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);

    await setPlaybackBufferProfile("steady");

    expect(invoke).toHaveBeenCalledWith("mpv_set_buffer_profile", { profile: "steady" });
  });

  it("上报播放进度调用 Rust 命令", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);

    await reportPlaybackProgress({ positionSeconds: 15, isPaused: false });

    expect(invoke).toHaveBeenCalledWith("report_playback_progress", {
      report: { positionSeconds: 15, isPaused: false },
    });
  });

  it("查询播放运行状态调用 mpv 状态命令", async () => {
    vi.mocked(invoke).mockResolvedValue({
      coreReady: true,
      mediaLoaded: true,
      paused: false,
      pausedForCache: true,
      cacheSpeedBytesPerSecond: 1024,
      positionSeconds: 0,
    });

    const status = await getPlaybackStatus();

    expect(invoke).toHaveBeenCalledWith("mpv_get_status");
    expect(status.cacheSpeedBytesPerSecond).toBe(1024);
  });

  it("查询和清理本地视频缓存调用 Rust 命令", async () => {
    vi.mocked(invoke).mockResolvedValue({ sizeBytes: 2048, path: "/tmp/cache" });

    await getPlaybackCacheStatus();
    await clearPlaybackCache();

    expect(invoke).toHaveBeenNthCalledWith(1, "get_playback_cache_status");
    expect(invoke).toHaveBeenNthCalledWith(2, "clear_playback_cache_command");
  });

  it("加载和关闭字幕调用 Rust 命令", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);

    await loadSubtitle("https://emby.example.test/subtitle.ass");
    await disableSubtitle();

    expect(invoke).toHaveBeenNthCalledWith(1, "mpv_load_subtitle", {
      path: "https://emby.example.test/subtitle.ass",
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "mpv_disable_subtitle");
  });

  it("切换内嵌字幕轨道调用 Rust 命令", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);

    await selectEmbeddedSubtitle(3);

    expect(invoke).toHaveBeenCalledWith("mpv_select_embedded_subtitle", {
      streamIndex: 3,
    });
  });
});
