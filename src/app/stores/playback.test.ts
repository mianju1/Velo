import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSessionStore } from "./session";
import { usePlaybackStore } from "./playback";
import {
  clearPlaybackCache,
  disableSubtitle,
  getPlaybackCacheStatus,
  getPlaybackStatus,
  loadSubtitle,
  reportPlaybackProgress,
  seekPlayback,
  selectEmbeddedSubtitle,
  setPlaybackBufferProfile,
  setPlaybackRate,
  startPlayback,
  stopPlayback,
} from "../../services/playback/playback";

vi.mock("../../services/playback/playback", () => ({
  pausePlayback: vi.fn(),
  clearPlaybackCache: vi.fn(),
  getPlaybackCacheStatus: vi.fn(),
  getPlaybackStatus: vi.fn(),
  resumePlayback: vi.fn(),
  loadSubtitle: vi.fn(),
  reportPlaybackProgress: vi.fn(),
  seekPlayback: vi.fn(),
  selectEmbeddedSubtitle: vi.fn(),
  setPlaybackBufferProfile: vi.fn(),
  disableSubtitle: vi.fn(),
  setPlaybackFullscreen: vi.fn(),
  setPlaybackMuted: vi.fn(),
  setPlaybackRate: vi.fn(),
  setPlaybackVolume: vi.fn(),
  startPlayback: vi.fn(),
  stopPlayback: vi.fn(),
}));

describe("playback store", () => {
  beforeEach(() => {
    vi.useRealTimers();
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.mocked(getPlaybackCacheStatus).mockResolvedValue({ sizeBytes: 0, path: "/tmp/cache" });
  });

  it("使用当前会话启动播放", async () => {
    const session = useSessionStore();
    session.activeSession = {
      server: { id: "server-1", name: "Home", url: "https://emby.example.test" },
      account: { id: "user-1", serverId: "server-1", name: "alice" },
      accessToken: "token-1",
    };
    vi.mocked(startPlayback).mockResolvedValue({
      itemId: "item-1",
      mediaSourceId: "source-1",
      playMethod: "direct",
    });
    const playback = usePlaybackStore();

    await playback.playItem("item-1", { durationSeconds: 5400, title: "Pilot" });

    expect(startPlayback).toHaveBeenCalledWith({
      serverId: "server-1",
      userId: "user-1",
      itemId: "item-1",
      mediaSourceId: undefined,
    });
    expect(JSON.stringify(vi.mocked(startPlayback).mock.calls[0])).not.toContain("token");
    expect(playback.current?.itemId).toBe("item-1");
    expect(playback.mediaTitle).toBe("Pilot");
    expect(playback.durationSeconds).toBe(5400);
    expect(playback.playing).toBe(true);
    expect(playback.playbackVisible).toBe(true);
    expect(playback.phase).toBe("loadingVideo");
    expect(playback.loading).toBe(false);
  });

  it("带历史进度启动播放时记录待续播位置，等待媒体可用后跳转", async () => {
    const session = useSessionStore();
    session.activeSession = {
      server: { id: "server-1", name: "Home", url: "https://emby.example.test" },
      account: { id: "user-1", serverId: "server-1", name: "alice" },
      accessToken: "token-1",
    };
    vi.mocked(startPlayback).mockResolvedValue({
      itemId: "episode-3",
      mediaSourceId: "source-3",
      playMethod: "direct",
    });
    vi.mocked(seekPlayback).mockResolvedValue(undefined);
    vi.mocked(getPlaybackStatus).mockResolvedValue({
      coreReady: true,
      mediaLoaded: true,
      paused: false,
      pausedForCache: false,
      cacheSpeedBytesPerSecond: null,
      positionSeconds: 754,
    });
    const playback = usePlaybackStore();

    await playback.playItem("episode-3", {
      durationSeconds: 2700,
      title: "第三集",
      initialPositionSeconds: 754,
    });

    expect(playback.positionSeconds).toBe(754);
    expect(playback.pendingSeekSeconds).toBe(754);
    expect(seekPlayback).not.toHaveBeenCalled();

    await playback.refreshStatus();

    expect(seekPlayback).toHaveBeenCalledWith(754);
    expect(playback.pendingSeekSeconds).toBeNull();

    await playback.stop();
  });

  it("播放过程中观看满 10 秒向 Emby 上报一次进度", async () => {
    const session = useSessionStore();
    session.activeSession = {
      server: { id: "server-1", name: "Home", url: "https://emby.example.test" },
      account: { id: "user-1", serverId: "server-1", name: "alice" },
      accessToken: "token-1",
    };
    vi.mocked(startPlayback).mockResolvedValue({
      itemId: "item-1",
      mediaSourceId: "source-1",
      playMethod: "direct",
    });
    vi.mocked(reportPlaybackProgress).mockResolvedValue(undefined);
    vi.mocked(getPlaybackStatus)
      .mockResolvedValueOnce({
        coreReady: true,
        mediaLoaded: true,
        paused: false,
        pausedForCache: false,
        cacheSpeedBytesPerSecond: null,
        positionSeconds: 9,
      })
      .mockResolvedValueOnce({
        coreReady: true,
        mediaLoaded: true,
        paused: false,
        pausedForCache: false,
        cacheSpeedBytesPerSecond: null,
        positionSeconds: 10,
      })
      .mockResolvedValueOnce({
        coreReady: true,
        mediaLoaded: true,
        paused: false,
        pausedForCache: false,
        cacheSpeedBytesPerSecond: null,
        positionSeconds: 19,
      })
      .mockResolvedValueOnce({
        coreReady: true,
        mediaLoaded: true,
        paused: false,
        pausedForCache: false,
        cacheSpeedBytesPerSecond: null,
        positionSeconds: 20,
      });
    const playback = usePlaybackStore();

    await playback.playItem("item-1");
    await playback.refreshStatus();
    expect(reportPlaybackProgress).not.toHaveBeenCalled();

    await playback.refreshStatus();
    expect(reportPlaybackProgress).toHaveBeenCalledTimes(1);
    expect(reportPlaybackProgress).toHaveBeenLastCalledWith({
      positionSeconds: 10,
      isPaused: false,
    });

    await playback.refreshStatus();
    expect(reportPlaybackProgress).toHaveBeenCalledTimes(1);

    await playback.refreshStatus();
    expect(reportPlaybackProgress).toHaveBeenCalledTimes(2);
    expect(reportPlaybackProgress).toHaveBeenLastCalledWith({
      positionSeconds: 20,
      isPaused: false,
    });

    await playback.stop();
  });

  it("用户主动停止播放时将当前位置交给后端记录最终进度", async () => {
    const session = useSessionStore();
    session.activeSession = {
      server: { id: "server-1", name: "Home", url: "https://emby.example.test" },
      account: { id: "user-1", serverId: "server-1", name: "alice" },
      accessToken: "token-1",
    };
    vi.mocked(startPlayback).mockResolvedValue({
      itemId: "item-1",
      mediaSourceId: "source-1",
      playMethod: "direct",
    });
    vi.mocked(stopPlayback).mockResolvedValue(undefined);
    vi.mocked(getPlaybackStatus).mockResolvedValue({
      coreReady: true,
      mediaLoaded: true,
      paused: false,
      pausedForCache: false,
      cacheSpeedBytesPerSecond: null,
      positionSeconds: 7,
    });
    const playback = usePlaybackStore();

    await playback.playItem("item-1");
    await playback.refreshStatus();
    await playback.stop();

    expect(stopPlayback).toHaveBeenCalledWith(7);
  });

  it("没有活动会话时进入错误状态", async () => {
    const playback = usePlaybackStore();

    await playback.playItem("item-1");

    expect(playback.error?.code).toBe("session_required");
    expect(startPlayback).not.toHaveBeenCalled();
  });

  it("倍速动作更新本地状态并调用服务", async () => {
    vi.mocked(setPlaybackRate).mockResolvedValue(undefined);
    const playback = usePlaybackStore();

    await playback.setRate(1.5);

    expect(playback.rate).toBe(1.5);
    expect(setPlaybackRate).toHaveBeenCalledWith(1.5);
  });

  it("支持播放队列中的上一集和下一集", async () => {
    const session = useSessionStore();
    session.activeSession = {
      server: { id: "server-1", name: "Home", url: "https://emby.example.test" },
      account: { id: "user-1", serverId: "server-1", name: "alice" },
      accessToken: "token-1",
    };
    vi.mocked(startPlayback)
      .mockResolvedValueOnce({ itemId: "episode-2", mediaSourceId: "source-2", playMethod: "direct" })
      .mockResolvedValueOnce({ itemId: "episode-1", mediaSourceId: "source-1", playMethod: "direct" })
      .mockResolvedValueOnce({ itemId: "episode-2", mediaSourceId: "source-2", playMethod: "direct" })
      .mockResolvedValueOnce({ itemId: "episode-3", mediaSourceId: "source-3", playMethod: "direct" });
    const playback = usePlaybackStore();

    await playback.playItem("episode-2", {
      title: "第二集",
      episodes: [
        { itemId: "episode-1", title: "第一集", durationSeconds: 1200, imageUrl: "https://img/1.jpg" },
        { itemId: "episode-2", title: "第二集", durationSeconds: 1300, imageUrl: "https://img/2.jpg" },
        { itemId: "episode-3", title: "第三集", durationSeconds: 1400, imageUrl: "https://img/3.jpg" },
      ],
    });

    expect(playback.currentEpisodeIndex).toBe(1);
    expect(playback.hasPreviousEpisode).toBe(true);
    expect(playback.hasNextEpisode).toBe(true);

    await playback.playPreviousEpisode();
    expect(startPlayback).toHaveBeenNthCalledWith(2, {
      serverId: "server-1",
      userId: "user-1",
      itemId: "episode-1",
      mediaSourceId: undefined,
    });
    expect(playback.mediaTitle).toBe("第一集");

    await playback.playNextEpisode();
    expect(startPlayback).toHaveBeenNthCalledWith(3, {
      serverId: "server-1",
      userId: "user-1",
      itemId: "episode-2",
      mediaSourceId: undefined,
    });
    expect(playback.mediaTitle).toBe("第二集");

    await playback.playNextEpisode();
    expect(startPlayback).toHaveBeenNthCalledWith(4, {
      serverId: "server-1",
      userId: "user-1",
      itemId: "episode-3",
      mediaSourceId: undefined,
    });
    expect(playback.mediaTitle).toBe("第三集");
  });

  it("选集切换失败时保留当前播放状态，避免播放层退出", async () => {
    const session = useSessionStore();
    session.activeSession = {
      server: { id: "server-1", name: "Home", url: "https://emby.example.test" },
      account: { id: "user-1", serverId: "server-1", name: "alice" },
      accessToken: "token-1",
    };
    vi.mocked(startPlayback)
      .mockResolvedValueOnce({ itemId: "episode-1", mediaSourceId: "source-1", playMethod: "direct" })
      .mockRejectedValueOnce({
        code: "playback_source_unavailable",
        message: "没有可播放的媒体源",
        recoverable: true,
      });
    const playback = usePlaybackStore();

    await playback.playItem("episode-1", {
      title: "第一集",
      durationSeconds: 1200,
      episodes: [
        { itemId: "episode-1", title: "第一集", durationSeconds: 1200 },
        { itemId: "episode-2", title: "第二集", durationSeconds: 1300 },
      ],
    });

    await playback.playEpisode("episode-2");

    expect(playback.current?.itemId).toBe("episode-1");
    expect(playback.mediaTitle).toBe("第一集");
    expect(playback.playbackVisible).toBe(true);
    expect(playback.error?.message).toBe("没有可播放的媒体源");
  });

  it("跳过片头和片尾会跳转到安全位置", async () => {
    vi.mocked(seekPlayback).mockResolvedValue(undefined);
    const playback = usePlaybackStore();
    playback.setPlaybackMetadata({ durationSeconds: 1800 });

    await playback.skipIntro();
    await playback.skipOutro();

    expect(seekPlayback).toHaveBeenNthCalledWith(1, 90);
    expect(seekPlayback).toHaveBeenNthCalledWith(2, 1770);
    expect(playback.positionSeconds).toBe(1770);
  });

  it("拖动预览不会立即 seek，确认后才提交目标进度", async () => {
    vi.mocked(seekPlayback).mockResolvedValue(undefined);
    const playback = usePlaybackStore();
    playback.setPlaybackMetadata({ durationSeconds: 1200 });

    playback.beginSeekPreview();
    playback.updateSeekPreview(360);

    expect(playback.seekPreviewSeconds).toBe(360);
    expect(playback.seekPreviewLabel).toBe("06:00 / -14:00");
    expect(seekPlayback).not.toHaveBeenCalled();

    await playback.commitSeekPreview();

    expect(seekPlayback).toHaveBeenCalledWith(360);
    expect(playback.positionSeconds).toBe(360);
    expect(playback.seekPreviewSeconds).toBeNull();
  });

  it("加载视频期间提交拖动进度时先缓存待跳转目标，等媒体可用后再执行 seek", async () => {
    const session = useSessionStore();
    session.activeSession = {
      server: { id: "server-1", name: "Home", url: "https://emby.example.test" },
      account: { id: "user-1", serverId: "server-1", name: "alice" },
      accessToken: "token-1",
    };
    vi.mocked(startPlayback).mockResolvedValue({
      itemId: "item-1",
      mediaSourceId: "source-1",
      playMethod: "direct",
    });
    vi.mocked(stopPlayback).mockResolvedValue(undefined);
    vi.mocked(seekPlayback).mockResolvedValue(undefined);
    vi.mocked(getPlaybackStatus)
      .mockResolvedValueOnce({
        coreReady: true,
        mediaLoaded: false,
        paused: false,
        pausedForCache: true,
        cacheSpeedBytesPerSecond: 512_000,
        positionSeconds: 0,
      })
      .mockResolvedValueOnce({
        coreReady: true,
        mediaLoaded: true,
        paused: false,
        pausedForCache: false,
        cacheSpeedBytesPerSecond: null,
        positionSeconds: 0,
      });
    const playback = usePlaybackStore();

    await playback.playItem("item-1", { durationSeconds: 1200 });
    playback.beginSeekPreview();
    playback.updateSeekPreview(360);
    await playback.commitSeekPreview();

    expect(playback.pendingSeekSeconds).toBe(360);
    expect(playback.positionSeconds).toBe(360);
    expect(seekPlayback).not.toHaveBeenCalled();

    await playback.refreshStatus();
    expect(seekPlayback).not.toHaveBeenCalled();

    await playback.refreshStatus();
    expect(seekPlayback).toHaveBeenCalledWith(360);
    expect(playback.pendingSeekSeconds).toBeNull();

    await playback.stop();
  });

  it("等待视频数据时 seek 短暂失败会保留待跳转并提示继续加载", async () => {
    vi.mocked(seekPlayback).mockRejectedValue({
      code: "libmpv_command_failed",
      message: "libmpv 播放命令执行失败",
      recoverable: true,
    });
    const playback = usePlaybackStore();
    playback.current = {
      itemId: "item-1",
      mediaSourceId: "source-1",
      playMethod: "direct",
    };
    playback.phase = "loadingVideo";
    playback.seekReady = true;
    playback.setPlaybackMetadata({ durationSeconds: 1200 });

    await playback.seek(360);

    expect(playback.error).toBeNull();
    expect(playback.pendingSeekSeconds).toBe(360);
    expect(playback.positionSeconds).toBe(360);
    expect(playback.loadingDetail).toBe("正在等待视频加载");
  });

  it("刷新运行状态时展示加载速度并在有播放进度后进入播放状态", async () => {
    const session = useSessionStore();
    session.activeSession = {
      server: { id: "server-1", name: "Home", url: "https://emby.example.test" },
      account: { id: "user-1", serverId: "server-1", name: "alice" },
      accessToken: "token-1",
    };
    vi.mocked(startPlayback).mockResolvedValue({
      itemId: "item-1",
      mediaSourceId: "source-1",
      playMethod: "direct",
    });
    const playback = usePlaybackStore();
    vi.mocked(getPlaybackStatus)
      .mockResolvedValueOnce({
        coreReady: true,
        mediaLoaded: true,
        paused: false,
        pausedForCache: true,
        cacheSpeedBytesPerSecond: 1_572_864,
        positionSeconds: 0,
      })
      .mockResolvedValueOnce({
        coreReady: true,
        mediaLoaded: true,
        paused: false,
        pausedForCache: false,
        cacheSpeedBytesPerSecond: null,
        positionSeconds: 3.2,
      });

    await playback.playItem("item-1");
    await playback.refreshStatus();

    expect(playback.phase).toBe("loadingVideo");
    expect(playback.loadingDetail).toBe("下行速度 1.5 MB/s");

    await playback.refreshStatus();

    expect(playback.phase).toBe("playing");
    expect(playback.positionSeconds).toBe(3);
  });

  it("enters playing when runtime is ready even if position remains zero", async () => {
    const session = useSessionStore();
    session.activeSession = {
      server: { id: "server-1", name: "Home", url: "https://emby.example.test" },
      account: { id: "user-1", serverId: "server-1", name: "alice" },
      accessToken: "token-1",
    };
    vi.mocked(startPlayback).mockResolvedValue({
      itemId: "item-1",
      mediaSourceId: "source-1",
      playMethod: "direct",
    });
    vi.mocked(getPlaybackStatus).mockResolvedValue({
      coreReady: true,
      mediaLoaded: true,
      paused: false,
      pausedForCache: false,
      cacheSpeedBytesPerSecond: null,
      positionSeconds: 0,
    });
    const playback = usePlaybackStore();

    await playback.playItem("item-1");
    await playback.refreshStatus();

    expect(playback.phase).toBe("playing");
    expect(playback.positionSeconds).toBe(0);
  });

  it("keeps loading when runtime is paused for cache at position zero", async () => {
    const session = useSessionStore();
    session.activeSession = {
      server: { id: "server-1", name: "Home", url: "https://emby.example.test" },
      account: { id: "user-1", serverId: "server-1", name: "alice" },
      accessToken: "token-1",
    };
    vi.mocked(startPlayback).mockResolvedValue({
      itemId: "item-1",
      mediaSourceId: "source-1",
      playMethod: "direct",
    });
    vi.mocked(getPlaybackStatus).mockResolvedValue({
      coreReady: true,
      mediaLoaded: true,
      paused: false,
      pausedForCache: true,
      cacheSpeedBytesPerSecond: 1_572_864,
      positionSeconds: 0,
    });
    const playback = usePlaybackStore();

    await playback.playItem("item-1");
    await playback.refreshStatus();

    expect(playback.phase).toBe("loadingVideo");
    expect(playback.loadingDetail).toBe("下行速度 1.5 MB/s");
  });

  it("进入稳定播放后仅放大一次缓存配置", async () => {
    const session = useSessionStore();
    session.activeSession = {
      server: { id: "server-1", name: "Home", url: "https://emby.example.test" },
      account: { id: "user-1", serverId: "server-1", name: "alice" },
      accessToken: "token-1",
    };
    vi.mocked(startPlayback).mockResolvedValue({
      itemId: "item-1",
      mediaSourceId: "source-1",
      playMethod: "direct",
    });
    vi.mocked(stopPlayback).mockResolvedValue(undefined);
    vi.mocked(setPlaybackBufferProfile).mockResolvedValue(undefined);
    vi.mocked(getPlaybackStatus)
      .mockResolvedValueOnce({
        coreReady: true,
        mediaLoaded: true,
        paused: false,
        pausedForCache: true,
        cacheSpeedBytesPerSecond: 1_024_000,
        positionSeconds: 0,
      })
      .mockResolvedValueOnce({
        coreReady: true,
        mediaLoaded: true,
        paused: false,
        pausedForCache: false,
        cacheSpeedBytesPerSecond: null,
        positionSeconds: 5,
      })
      .mockResolvedValueOnce({
        coreReady: true,
        mediaLoaded: true,
        paused: false,
        pausedForCache: false,
        cacheSpeedBytesPerSecond: null,
        positionSeconds: 8,
      });
    const playback = usePlaybackStore();

    await playback.playItem("item-1");
    expect(setPlaybackBufferProfile).toHaveBeenCalledWith("startup");

    await playback.refreshStatus();
    expect(setPlaybackBufferProfile).toHaveBeenCalledTimes(1);

    await playback.refreshStatus();
    expect(setPlaybackBufferProfile).toHaveBeenNthCalledWith(2, "steady");

    await playback.refreshStatus();
    expect(setPlaybackBufferProfile).toHaveBeenCalledTimes(2);

    await playback.stop();
  });

  it("播放状态轮询请求未完成时不重复发起下一次状态查询", async () => {
    vi.useFakeTimers();
    const session = useSessionStore();
    session.activeSession = {
      server: { id: "server-1", name: "Home", url: "https://emby.example.test" },
      account: { id: "user-1", serverId: "server-1", name: "alice" },
      accessToken: "token-1",
    };
    vi.mocked(startPlayback).mockResolvedValue({
      itemId: "item-1",
      mediaSourceId: "source-1",
      playMethod: "direct",
    });
    let finishStatus!: () => void;
    vi.mocked(getPlaybackStatus).mockReturnValue(
      new Promise((resolve) => {
        finishStatus = () =>
          resolve({
            coreReady: true,
            mediaLoaded: true,
            paused: false,
            pausedForCache: false,
            cacheSpeedBytesPerSecond: null,
            positionSeconds: 10,
          });
      }),
    );
    const playback = usePlaybackStore();

    await playback.playItem("item-1");
    await vi.advanceTimersByTimeAsync(1500);

    expect(getPlaybackStatus).toHaveBeenCalledTimes(1);

    finishStatus();
    await vi.runOnlyPendingTimersAsync();
    vi.useRealTimers();
  });

  it("停止后忽略尚未返回的旧状态轮询结果", async () => {
    const session = useSessionStore();
    session.activeSession = {
      server: { id: "server-1", name: "Home", url: "https://emby.example.test" },
      account: { id: "user-1", serverId: "server-1", name: "alice" },
      accessToken: "token-1",
    };
    vi.mocked(startPlayback).mockResolvedValue({
      itemId: "item-1",
      mediaSourceId: "source-1",
      playMethod: "direct",
    });
    vi.mocked(stopPlayback).mockResolvedValue(undefined);
    let finishStatus!: () => void;
    vi.mocked(getPlaybackStatus).mockReturnValue(
      new Promise((resolve) => {
        finishStatus = () =>
          resolve({
            coreReady: true,
            mediaLoaded: true,
            paused: false,
            pausedForCache: false,
            cacheSpeedBytesPerSecond: null,
            positionSeconds: 30,
          });
      }),
    );
    const playback = usePlaybackStore();
    await playback.playItem("item-1");

    const statusPromise = playback.refreshStatus();
    await playback.stop();
    finishStatus();
    await statusPromise;

    expect(playback.playbackVisible).toBe(false);
    expect(playback.phase).toBe("idle");
    expect(playback.positionSeconds).toBe(0);
  });

  it("播放状态同步临时失败时不退出播放控制状态", async () => {
    const session = useSessionStore();
    session.activeSession = {
      server: { id: "server-1", name: "Home", url: "https://emby.example.test" },
      account: { id: "user-1", serverId: "server-1", name: "alice" },
      accessToken: "token-1",
    };
    vi.mocked(startPlayback).mockResolvedValue({
      itemId: "item-1",
      mediaSourceId: "source-1",
      playMethod: "direct",
    });
    vi.mocked(getPlaybackStatus).mockRejectedValue(new Error("mpv status busy"));
    const playback = usePlaybackStore();

    await playback.playItem("item-1");
    await playback.refreshStatus();

    expect(playback.playbackVisible).toBe(true);
    expect(playback.phase).toBe("loadingVideo");
    expect(playback.loadingDetail).toBe("播放状态同步暂不可用");
  });

  it("元数据缺少时长时，媒体加载完成后使用播放内核返回的总时长", async () => {
    const session = useSessionStore();
    session.activeSession = {
      server: { id: "server-1", name: "Home", url: "https://emby.example.test" },
      account: { id: "user-1", serverId: "server-1", name: "alice" },
      accessToken: "token-1",
    };
    vi.mocked(startPlayback).mockResolvedValue({
      itemId: "item-1",
      mediaSourceId: "source-1",
      playMethod: "direct",
    });
    vi.mocked(getPlaybackStatus).mockResolvedValue({
      coreReady: true,
      mediaLoaded: true,
      paused: false,
      pausedForCache: false,
      cacheSpeedBytesPerSecond: null,
      positionSeconds: 12,
      durationSeconds: 3661,
    });
    const playback = usePlaybackStore();

    await playback.playItem("item-1");
    expect(playback.durationSeconds).toBeNull();

    await playback.refreshStatus();

    expect(playback.durationSeconds).toBe(3661);
  });

  it("播放状态轮询间隔为 0.5 秒", async () => {
    vi.useFakeTimers();
    const session = useSessionStore();
    session.activeSession = {
      server: { id: "server-1", name: "Home", url: "https://emby.example.test" },
      account: { id: "user-1", serverId: "server-1", name: "alice" },
      accessToken: "token-1",
    };
    vi.mocked(startPlayback).mockResolvedValue({
      itemId: "item-1",
      mediaSourceId: "source-1",
      playMethod: "direct",
    });
    vi.mocked(getPlaybackStatus).mockResolvedValue({
      coreReady: true,
      mediaLoaded: true,
      paused: false,
      pausedForCache: false,
      cacheSpeedBytesPerSecond: null,
      positionSeconds: 1,
    });
    const playback = usePlaybackStore();

    await playback.playItem("item-1");
    await vi.advanceTimersByTimeAsync(499);
    expect(getPlaybackStatus).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(getPlaybackStatus).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it("点击停止后立即隐藏播放层，不等待后端销毁完成", async () => {
    const session = useSessionStore();
    session.activeSession = {
      server: { id: "server-1", name: "Home", url: "https://emby.example.test" },
      account: { id: "user-1", serverId: "server-1", name: "alice" },
      accessToken: "token-1",
    };
    vi.mocked(startPlayback).mockResolvedValue({
      itemId: "item-1",
      mediaSourceId: "source-1",
      playMethod: "direct",
    });
    let finishStop!: () => void;
    vi.mocked(stopPlayback).mockReturnValue(
      new Promise<void>((resolve) => {
        finishStop = resolve;
      }),
    );
    const playback = usePlaybackStore();
    await playback.playItem("item-1", { durationSeconds: 5400, title: "Pilot" });

    const stopPromise = playback.stop();

    expect(playback.playbackVisible).toBe(false);
    expect(playback.current).toBeNull();
    expect(playback.mediaTitle).toBe("");
    expect(playback.durationSeconds).toBeNull();

    finishStop();
    await stopPromise;
  });

  it("播放时默认选择偏好的字幕，并支持关闭字幕", async () => {
    const session = useSessionStore();
    session.activeSession = {
      server: { id: "server-1", name: "Home", url: "https://emby.example.test" },
      account: { id: "user-1", serverId: "server-1", name: "alice" },
      accessToken: "token-1",
    };
    vi.mocked(startPlayback).mockResolvedValue({
      itemId: "item-1",
      mediaSourceId: "source-1",
      playMethod: "direct",
    });
    vi.mocked(loadSubtitle).mockResolvedValue(undefined);
    vi.mocked(disableSubtitle).mockResolvedValue(undefined);
    const playback = usePlaybackStore();

    await playback.playItem("item-1", {
      subtitles: [
        { id: "en", mediaSourceId: "source-1", streamIndex: 2, codec: "srt", language: "eng", label: "English" },
        { id: "zh", mediaSourceId: "source-1", streamIndex: 3, codec: "ass", language: "chi", label: "中文" },
      ],
      subtitleLanguages: ["fr-FR"],
    });

    expect(playback.subtitleTracks.map((track) => track.label)).toEqual(["English", "中文"]);
    expect(playback.selectedSubtitleId).toBe("zh");
    expect(loadSubtitle).toHaveBeenCalledWith(
      "https://emby.example.test/Videos/item-1/source-1/Subtitles/3/Stream.ass?api_key=token-1",
    );

    await playback.selectSubtitle(null);

    expect(playback.selectedSubtitleId).toBeNull();
    expect(disableSubtitle).toHaveBeenCalled();
  });

  it("播放时对内嵌字幕直接切换播放器轨道，即使支持外部流", async () => {
    const session = useSessionStore();
    session.activeSession = {
      server: { id: "server-1", name: "Home", url: "https://emby.example.test" },
      account: { id: "user-1", serverId: "server-1", name: "alice" },
      accessToken: "token-1",
    };
    vi.mocked(startPlayback).mockResolvedValue({
      itemId: "item-1",
      mediaSourceId: "source-1",
      playMethod: "direct",
    });
    vi.mocked(selectEmbeddedSubtitle).mockResolvedValue(undefined);
    const playback = usePlaybackStore();

    await playback.playItem("item-1", {
      subtitles: [
        {
          id: "srt-zh",
          mediaSourceId: "source-1",
          streamIndex: 2,
          codec: "subrip",
          language: "chi",
          label: "中文 SRT",
          isExternal: false,
          isTextSubtitleStream: true,
          supportsExternalStream: true,
        },
      ],
      subtitleLanguages: ["zh-CN"],
    });

    expect(selectEmbeddedSubtitle).toHaveBeenCalledWith(2);
    expect(loadSubtitle).not.toHaveBeenCalled();
    expect(playback.selectedSubtitleId).toBe("srt-zh");
  });

  it("默认字幕加载失败时不应中断已经启动的播放", async () => {
    const session = useSessionStore();
    session.activeSession = {
      server: { id: "server-1", name: "Home", url: "https://emby.example.test" },
      account: { id: "user-1", serverId: "server-1", name: "alice" },
      accessToken: "token-1",
    };
    vi.mocked(startPlayback).mockResolvedValue({
      itemId: "item-1",
      mediaSourceId: "source-1",
      playMethod: "direct",
    });
    vi.mocked(loadSubtitle).mockRejectedValue(new Error("subtitle load failed"));
    const playback = usePlaybackStore();

    await playback.playItem("item-1", {
      subtitles: [
        { id: "zh", mediaSourceId: "source-1", streamIndex: 3, codec: "ass", language: "chi", label: "中文" },
      ],
      subtitleLanguages: ["zh-CN"],
    });

    expect(playback.current?.itemId).toBe("item-1");
    expect(playback.playbackVisible).toBe(true);
    expect(playback.phase).toBe("loadingVideo");
    expect(playback.error).toBeNull();
    expect(playback.selectedSubtitleId).toBeNull();
  });

  it("播放时只暴露当前媒体源的字幕，并拒绝切换到其他媒体源字幕", async () => {
    const session = useSessionStore();
    session.activeSession = {
      server: { id: "server-1", name: "Home", url: "https://emby.example.test" },
      account: { id: "user-1", serverId: "server-1", name: "alice" },
      accessToken: "token-1",
    };
    vi.mocked(startPlayback).mockResolvedValue({
      itemId: "item-1",
      mediaSourceId: "source-1",
      playMethod: "direct",
    });
    vi.mocked(loadSubtitle).mockResolvedValue(undefined);
    const playback = usePlaybackStore();

    await playback.playItem("item-1", {
      subtitles: [
        { id: "zh-1", mediaSourceId: "source-1", streamIndex: 3, codec: "ass", language: "chi", label: "中文" },
        { id: "en-2", mediaSourceId: "source-2", streamIndex: 4, codec: "srt", language: "eng", label: "English" },
      ],
      subtitleLanguages: ["zh-CN"],
    });

    expect(playback.subtitleTracks.map((track) => track.id)).toEqual(["zh-1"]);

    await playback.selectSubtitle("en-2");

    expect(loadSubtitle).toHaveBeenCalledTimes(1);
    expect(playback.selectedSubtitleId).toBe("zh-1");
  });

  it("字幕切换失败时保留原选中状态并结束切换中状态", async () => {
    const session = useSessionStore();
    session.activeSession = {
      server: { id: "server-1", name: "Home", url: "https://emby.example.test" },
      account: { id: "user-1", serverId: "server-1", name: "alice" },
      accessToken: "token-1",
    };
    vi.mocked(startPlayback).mockResolvedValue({
      itemId: "item-1",
      mediaSourceId: "source-1",
      playMethod: "direct",
    });
    vi.mocked(loadSubtitle)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("subtitle switch failed"));
    const playback = usePlaybackStore();

    await playback.playItem("item-1", {
      subtitles: [
        { id: "zh", mediaSourceId: "source-1", streamIndex: 3, codec: "ass", language: "chi", label: "中文" },
        { id: "en", mediaSourceId: "source-1", streamIndex: 4, codec: "srt", language: "eng", label: "English" },
      ],
      subtitleLanguages: ["zh-CN"],
    });

    await playback.selectSubtitle("en");

    expect(playback.selectedSubtitleId).toBe("zh");
    expect(playback.pendingSubtitleId).toBeNull();
    expect(playback.error?.message).toContain("subtitle switch failed");
  });

  it("刷新和清理本地视频缓存状态", async () => {
    vi.mocked(getPlaybackCacheStatus).mockResolvedValue({ sizeBytes: 5 * 1024 * 1024, path: "/tmp/cache" });
    vi.mocked(clearPlaybackCache).mockResolvedValue({ sizeBytes: 0, path: "/tmp/cache" });
    const playback = usePlaybackStore();

    await playback.refreshCacheStatus();

    expect(playback.cacheSizeLabel).toBe("5.0 MB");

    await playback.clearCache();

    expect(clearPlaybackCache).toHaveBeenCalled();
    expect(playback.cacheSizeLabel).toBe("0 KB");
  });
});
