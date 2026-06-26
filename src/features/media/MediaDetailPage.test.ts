// @vitest-environment jsdom
import { createPinia } from "pinia";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, nextTick, type App } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { useMediaStore } from "../../app/stores/media";
import { usePlaybackStore } from "../../app/stores/playback";
import { useSessionStore } from "../../app/stores/session";
import { favoriteMediaItem, unfavoriteMediaItem } from "../../services/emby/media";
import { startPlayback } from "../../services/playback/playback";
import MediaDetailPage from "./MediaDetailPage.vue";

vi.mock("../../services/emby/media", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/emby/media")>();
  return {
    ...actual,
    favoriteMediaItem: vi.fn(),
    unfavoriteMediaItem: vi.fn(),
  };
});

vi.mock("../../services/playback/playback", () => ({
  clearPlaybackCache: vi.fn(),
  disableSubtitle: vi.fn(),
  getPlaybackCacheStatus: vi.fn().mockResolvedValue({ sizeBytes: 0, path: "/tmp/cache" }),
  getPlaybackStatus: vi.fn(),
  loadSubtitle: vi.fn(),
  pausePlayback: vi.fn(),
  reportPlaybackProgress: vi.fn(),
  resumePlayback: vi.fn(),
  seekPlayback: vi.fn(),
  selectEmbeddedSubtitle: vi.fn(),
  setPlaybackBufferProfile: vi.fn(),
  setPlaybackFullscreen: vi.fn(),
  setPlaybackMuted: vi.fn(),
  setPlaybackRate: vi.fn(),
  setPlaybackVolume: vi.fn(),
  startPlayback: vi.fn(),
  stopPlayback: vi.fn(),
}));

let app: App<Element> | null = null;

describe("MediaDetailPage", () => {
  afterEach(() => {
    app?.unmount();
    app = null;
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("多集详情页展示单集历史进度并点击续播对应集数", async () => {
    vi.mocked(startPlayback).mockResolvedValue({
      itemId: "episode-3",
      mediaSourceId: "source-3",
      playMethod: "direct",
    });
    const { root, pinia } = await mountDetailPage();
    const media = useMediaStore(pinia);
    media.detail.item = {
      id: "season-1",
      name: "追番 第 1 季",
      type: "Season",
      seriesId: "series-1",
      seasonId: "season-1",
    };
    media.detail.episodes = [
      {
        id: "episode-1",
        name: "第一集",
        type: "Episode",
        episodeNumber: 1,
        runtimeMinutes: 30,
      },
      {
        id: "episode-3",
        name: "第三集",
        type: "Episode",
        episodeNumber: 3,
        runtimeMinutes: 45,
        playbackPositionTicks: 7_540_000_000,
      },
    ];
    media.detail.loading = false;
    media.detail.error = null;
    await nextTick();

    const episodeButtons = root.querySelectorAll<HTMLButtonElement>(".detail-episode-card");
    expect(episodeButtons).toHaveLength(2);
    expect(episodeButtons[1]?.classList.contains("detail-episode-card--resumable")).toBe(true);
    expect(episodeButtons[1]?.textContent).toContain("上次看到 12:34");

    episodeButtons[1]?.click();
    await nextTick();

    const playback = usePlaybackStore(pinia);
    expect(startPlayback).toHaveBeenCalledWith({
      serverId: "server-1",
      userId: "user-1",
      itemId: "episode-3",
      mediaSourceId: undefined,
    });
    expect(playback.pendingSeekSeconds).toBe(754);
    expect(playback.positionSeconds).toBe(754);
  });

  it("多集详情页默认每页展示 20 集并显示分页状态", async () => {
    const { root, pinia } = await mountDetailPage();
    const media = useMediaStore(pinia);
    media.detail.item = {
      id: "season-1",
      name: "Season 1",
      type: "Season",
      seriesId: "series-1",
      seasonId: "season-1",
    };
    media.detail.episodes = buildEpisodes(41);
    media.detail.loading = false;
    media.detail.error = null;
    await nextTick();

    const episodeButtons = root.querySelectorAll<HTMLButtonElement>(".detail-episode-card");
    expect(episodeButtons).toHaveLength(20);
    expect(episodeButtons[0]?.textContent).toContain("Episode 1");
    expect(episodeButtons[19]?.textContent).toContain("Episode 20");
    expect(root.textContent).not.toContain("Episode 21");
    expect(root.querySelector(".detail-episode-page-summary")?.textContent).toContain("1 / 3");
  });

  it("多集详情页可以手动输入页码跳转到对应分页", async () => {
    vi.mocked(startPlayback).mockResolvedValue({
      itemId: "episode-21",
      mediaSourceId: "source-21",
      playMethod: "direct",
    });
    const { root, pinia } = await mountDetailPage();
    const media = useMediaStore(pinia);
    media.detail.item = {
      id: "season-1",
      name: "Season 1",
      type: "Season",
      seriesId: "series-1",
      seasonId: "season-1",
    };
    media.detail.episodes = buildEpisodes(41);
    media.detail.loading = false;
    media.detail.error = null;
    await nextTick();

    const pageInput = root.querySelector<HTMLInputElement>(".detail-episode-page-input");
    expect(pageInput).not.toBeNull();

    pageInput!.value = "2";
    pageInput!.dispatchEvent(new Event("input"));
    await nextTick();

    const episodeButtons = root.querySelectorAll<HTMLButtonElement>(".detail-episode-card");
    expect(episodeButtons).toHaveLength(20);
    expect(episodeButtons[0]?.textContent).toContain("Episode 21");
    expect(episodeButtons[19]?.textContent).toContain("Episode 40");
    expect(root.querySelector(".detail-episode-page-summary")?.textContent).toContain("2 / 3");

    episodeButtons[0]?.click();
    await flush();

    const playback = usePlaybackStore(pinia);
    expect(playback.current?.itemId).toBe("episode-21");
    expect(playback.episodes).toHaveLength(41);
    expect(playback.episodes[0]?.itemId).toBe("episode-1");
    expect(playback.episodes[40]?.itemId).toBe("episode-41");
  });

  it("页码输入框只保留 1 到最大页码之间的数字", async () => {
    const { root, pinia } = await mountDetailPage();
    const media = useMediaStore(pinia);
    media.detail.item = {
      id: "season-1",
      name: "Season 1",
      type: "Season",
      seriesId: "series-1",
      seasonId: "season-1",
    };
    media.detail.episodes = buildEpisodes(41);
    media.detail.loading = false;
    media.detail.error = null;
    await nextTick();

    const pageInput = root.querySelector<HTMLInputElement>(".detail-episode-page-input");
    expect(pageInput).not.toBeNull();

    pageInput!.value = "abc";
    pageInput!.dispatchEvent(new Event("input"));
    await nextTick();
    expect(pageInput!.value).toBe("1");

    pageInput!.value = "0";
    pageInput!.dispatchEvent(new Event("input"));
    await nextTick();
    expect(pageInput!.value).toBe("1");

    pageInput!.value = "99";
    pageInput!.dispatchEvent(new Event("input"));
    await nextTick();
    expect(pageInput!.value).toBe("3");
    expect(root.querySelector(".detail-episode-page-summary")?.textContent).toContain("3 / 3");
  });

  it("单集视频详情页不展示选集区域，播放按钮仍启动当前条目", async () => {
    vi.mocked(startPlayback).mockResolvedValue({
      itemId: "movie-1",
      mediaSourceId: "source-1",
      playMethod: "direct",
    });
    const { root, pinia } = await mountDetailPage();
    const media = useMediaStore(pinia);
    media.detail.item = {
      id: "movie-1",
      name: "电影",
      type: "Movie",
      runtimeMinutes: 120,
    };
    media.detail.episodes = [];
    media.detail.loading = false;
    media.detail.error = null;
    await nextTick();

    expect(root.querySelector(".detail-episode-section")).toBeNull();
    expect(root.querySelector(".detail-episode-pagination")).toBeNull();

    root.querySelector<HTMLButtonElement>(".action-row button")?.click();
    await nextTick();

    expect(startPlayback).toHaveBeenCalledWith({
      serverId: "server-1",
      userId: "user-1",
      itemId: "movie-1",
      mediaSourceId: undefined,
    });
  });

  it("详情页展示图标返回按钮和收藏按钮，点击收藏写入 Emby 云端", async () => {
    vi.mocked(favoriteMediaItem).mockResolvedValue(undefined);
    const { root, pinia } = await mountDetailPage();
    const media = useMediaStore(pinia);
    media.detail.item = {
      id: "movie-1",
      name: "电影",
      type: "Movie",
    };
    media.detail.loading = false;
    media.detail.error = null;
    await nextTick();

    const backButton = root.querySelector<HTMLButtonElement>(".detail-back-button");
    expect(backButton?.textContent?.trim()).toBe("");
    expect(backButton?.querySelector("svg[data-icon='back-triangle']")).not.toBeNull();
    expect(root.querySelector(".back-button")).toBeNull();

    root.querySelector<HTMLButtonElement>(".favorite-button")?.click();
    await flush();

    expect(favoriteMediaItem).toHaveBeenCalledWith({
      serverUrl: "https://emby.example.test",
      userId: "user-1",
      token: "token-1",
      itemId: "movie-1",
    });
    expect(media.detail.item?.isFavorite).toBe(true);
  });

  it("已收藏条目再次点击收藏按钮时取消云端收藏", async () => {
    vi.mocked(unfavoriteMediaItem).mockResolvedValue(undefined);
    const { root, pinia } = await mountDetailPage();
    const media = useMediaStore(pinia);
    media.detail.item = {
      id: "movie-1",
      name: "电影",
      type: "Movie",
      isFavorite: true,
    };
    media.detail.loading = false;
    media.detail.error = null;
    await nextTick();

    const favoriteButton = root.querySelector<HTMLButtonElement>(".favorite-button");
    expect(favoriteButton?.disabled).toBe(false);
    expect(favoriteButton?.textContent).toContain("已收藏");

    favoriteButton?.click();
    await flush();

    expect(unfavoriteMediaItem).toHaveBeenCalledWith({
      serverUrl: "https://emby.example.test",
      userId: "user-1",
      token: "token-1",
      itemId: "movie-1",
    });
    expect(media.detail.item?.isFavorite).toBe(false);
  });

  it("详情页不展示视频总时长", async () => {
    const { root, pinia } = await mountDetailPage();
    const media = useMediaStore(pinia);
    media.detail.item = {
      id: "season-1",
      name: "追番 第 1 季",
      type: "Season",
      seriesId: "series-1",
      seasonId: "season-1",
    };
    media.detail.episodes = [
      { id: "episode-1", name: "第一集", type: "Episode", runtimeMinutes: 30 },
      { id: "episode-2", name: "第二集", type: "Episode", runtimeMinutes: 45 },
    ];
    media.detail.loading = false;
    media.detail.error = null;
    await nextTick();

    expect(root.querySelector(".playback-facts")).toBeNull();
    expect(root.textContent).not.toContain("1 小时 15 分钟");

    media.detail.item = {
      id: "movie-1",
      name: "电影",
      type: "Movie",
      runtimeMinutes: 120,
    };
    media.detail.episodes = [];
    await nextTick();

    expect(root.querySelector(".playback-facts")).toBeNull();
    expect(root.textContent).not.toContain("2 小时");
  });

  it("详情页按分辨率、杜比、类型顺序展示标签", async () => {
    const { root, pinia } = await mountDetailPage();
    const media = useMediaStore(pinia);
    media.detail.item = {
      id: "movie-1",
      name: "电影",
      type: "Movie",
      videoHeight: 1080,
    };
    media.detail.loading = false;
    media.detail.error = null;
    await nextTick();

    expect(root.querySelector(".playback-facts")).toBeNull();
    expect(root.querySelector(".detail-resolution-tag")).toBeNull();
    expect(root.querySelector(".detail-video-size")).toBeNull();

    media.detail.item = {
      id: "movie-1",
      name: "电影",
      type: "Movie",
      sizeBytes: 8_589_934_592,
    };
    await nextTick();

    expect(root.querySelector(".playback-facts")).toBeNull();
    expect(root.querySelector(".detail-resolution-tag")).toBeNull();
    expect(root.querySelector(".detail-video-size")).toBeNull();

    media.detail.item = {
      id: "movie-1",
      name: "电影",
      type: "Movie",
      videoHeight: 1080,
      sizeBytes: 8_589_934_592,
      dolbySupported: false,
      genres: ["剧情"],
    };
    await nextTick();

    expect(root.querySelector(".playback-facts")).toBeNull();
    expect(root.querySelector(".detail-resolution-tag")?.textContent).toBe("1080P");
    expect(root.querySelector(".detail-video-size")?.textContent).toContain("视频大小 8.0 GB");
    expect(root.querySelector(".dolby-badge")).toBeNull();

    media.detail.item = {
      id: "movie-1",
      name: "电影",
      type: "Movie",
      videoHeight: 1080,
      sizeBytes: 8_589_934_592,
      dolbySupported: true,
      genres: ["剧情", "动作"],
    };
    await nextTick();

    const tags = [...root.querySelectorAll(".detail-tag-row > span")];
    expect(tags.map((tag) => tag.textContent?.trim())).toEqual(["1080P", "杜比", "剧情", "动作"]);
    expect(tags[0]?.classList.contains("detail-resolution-tag")).toBe(true);
    expect(tags[1]?.classList.contains("dolby-badge")).toBe(true);
    expect(tags.slice(2).every((tag) => tag.classList.contains("detail-genre-tag"))).toBe(true);
    expect(root.querySelector("svg[data-icon='dolby']")).not.toBeNull();
  });

  it("详情页没有 backdrop 时使用海报作为虚化背景", async () => {
    const { root, pinia } = await mountDetailPage();
    const media = useMediaStore(pinia);
    media.detail.item = {
      id: "movie-1",
      name: "电影",
      type: "Movie",
      primaryImageTag: "primary-tag",
    };
    media.detail.loading = false;
    media.detail.error = null;
    await nextTick();

    const backdrop = root.querySelector<HTMLElement>(".detail-backdrop");
    expect(backdrop).not.toBeNull();
    expect(backdrop?.style.backgroundImage).toContain("/Items/movie-1/Images/Primary");
  });

  it("详情页优先使用海报作为虚化背景", async () => {
    const { root, pinia } = await mountDetailPage();
    const media = useMediaStore(pinia);
    media.detail.item = {
      id: "season-1",
      name: "第 1 季",
      type: "Season",
      primaryImageTag: "primary-tag",
      backdropImageItemId: "series-1",
      backdropImageTag: "backdrop-tag",
    };
    media.detail.loading = false;
    media.detail.error = null;
    await nextTick();

    const backdrop = root.querySelector<HTMLElement>(".detail-backdrop");
    expect(backdrop).not.toBeNull();
    expect(backdrop?.style.backgroundImage).toContain("/Items/season-1/Images/Primary");
  });

  it("季详情页大标题只展示片名，小标题按规则展示季数", async () => {
    const { root, pinia } = await mountDetailPage();
    const media = useMediaStore(pinia);
    media.detail.item = {
      id: "season-2",
      name: "追番 第 2 季",
      type: "Season",
      seriesId: "series-1",
      seasonId: "season-2",
      seriesName: "追番",
      seasonNumber: 2,
    };
    media.detail.seasons = [
      { id: "season-1", name: "追番 第 1 季", type: "Season", seasonNumber: 1 },
      { id: "season-2", name: "追番 第 2 季", type: "Season", seasonNumber: 2 },
    ];
    media.detail.episodes = [];
    media.detail.loading = false;
    media.detail.error = null;
    await nextTick();

    expect(root.querySelector("h1")?.textContent).toBe("追番");
    expect(root.querySelector(".season-subtitle")?.textContent).toBe("第 2 季");

    media.detail.item = {
      id: "season-1",
      name: "追番 第 1 季",
      type: "Season",
      seriesId: "series-1",
      seasonId: "season-1",
      seriesName: "追番",
      seasonNumber: 1,
    };
    media.detail.seasons = [
      { id: "season-1", name: "追番 第 1 季", type: "Season", seasonNumber: 1 },
    ];
    await nextTick();

    expect(root.querySelector("h1")?.textContent).toBe("追番");
    expect(root.querySelector(".season-subtitle")).toBeNull();
  });

  it("剧集没有单独名称时避免显示重复集数，改用片名加集数", async () => {
    const { root, pinia } = await mountDetailPage();
    const media = useMediaStore(pinia);
    media.detail.item = {
      id: "season-1",
      name: "追番 第 1 季",
      type: "Season",
      seriesId: "series-1",
      seasonId: "season-1",
      seriesName: "追番",
      seasonNumber: 1,
    };
    media.detail.episodes = [
      {
        id: "episode-1",
        name: "第1集",
        type: "Episode",
        seriesName: "追番",
        episodeNumber: 1,
      },
      {
        id: "episode-2",
        name: "特别篇",
        type: "Episode",
        seriesName: "追番",
        episodeNumber: 2,
      },
    ];
    media.detail.loading = false;
    media.detail.error = null;
    await nextTick();

    const titles = [...root.querySelectorAll(".detail-episode-copy strong")].map((node) => node.textContent);

    expect(titles).toEqual(["追番 第 1 集", "第 2 集 特别篇"]);
  });
});

async function mountDetailPage() {
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: { template: "<div />" } },
      { path: "/media/:itemId", component: MediaDetailPage },
    ],
  });
  router.push("/media/season-1");
  await router.isReady();

  const root = document.createElement("div");
  document.body.append(root);
  useSessionStore(pinia).activeSession = {
    server: { id: "server-1", name: "Home", url: "https://emby.example.test" },
    account: { id: "user-1", serverId: "server-1", name: "alice" },
    accessToken: "token-1",
  };
  vi.spyOn(useMediaStore(pinia), "loadDetail").mockResolvedValue(undefined);
  app = createApp(MediaDetailPage);
  app.use(pinia);
  app.use(router);
  app.mount(root);
  await nextTick();

  return { root, pinia };
}

function buildEpisodes(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const episodeNumber = index + 1;
    return {
      id: `episode-${episodeNumber}`,
      name: `Episode ${episodeNumber}`,
      type: "Episode" as const,
      episodeNumber,
      runtimeMinutes: 30,
    };
  });
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
}
