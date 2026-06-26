// @vitest-environment jsdom
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSessionStore } from "./session";
import { useMediaStore } from "./media";
import {
  clearItemPlaybackProgress,
  fetchEpisodeItems,
  fetchLibraryItems,
  fetchMediaDetail,
  fetchMediaItems,
  fetchSeasonItems,
  searchMediaItems,
} from "../../services/emby/media";

vi.mock("../../services/emby/media", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/emby/media")>();

  return {
    ...actual,
    clearItemPlaybackProgress: vi.fn(),
    fetchEpisodeItems: vi.fn(),
    fetchLibraryItems: vi.fn(),
    fetchMediaDetail: vi.fn(),
    fetchMediaItems: vi.fn(),
    fetchSeasonItems: vi.fn(),
    searchMediaItems: vi.fn(),
  };
});

describe("media store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(fetchEpisodeItems).mockReset();
    vi.mocked(fetchLibraryItems).mockReset();
    vi.mocked(fetchMediaDetail).mockReset();
    vi.mocked(fetchMediaItems).mockReset();
    vi.mocked(fetchSeasonItems).mockReset();
    vi.mocked(searchMediaItems).mockReset();
    vi.mocked(clearItemPlaybackProgress).mockReset();
    vi.mocked(fetchSeasonItems).mockResolvedValue([]);
    localStorage.clear();
  });

  it("使用当前会话加载媒体列表", async () => {
    const session = useSessionStore();
    session.activeSession = {
      server: { id: "server-1", name: "Home", url: "https://emby.example.test" },
      account: { id: "user-1", serverId: "server-1", name: "alice" },
      accessToken: "token-1",
    };
    vi.mocked(fetchMediaItems).mockResolvedValue({
      items: [{ id: "movie-1", name: "Movie", type: "Movie" }],
      total: 1,
      rawItemCount: 1,
    });
    const media = useMediaStore();

    await media.loadLibrary("movies");

    expect(fetchMediaItems).toHaveBeenCalledWith(
      expect.objectContaining({
        serverUrl: "https://emby.example.test",
        userId: "user-1",
        token: "token-1",
        kind: "movies",
      }),
    );
    expect(media.library.items).toHaveLength(1);
    expect(media.library.loading).toBe(false);
  });

  it("没有活动会话时进入错误状态", async () => {
    const media = useMediaStore();

    await media.loadLibrary("movies");

    expect(media.library.error?.code).toBe("session_required");
    expect(fetchMediaItems).not.toHaveBeenCalled();
  });

  it("加载资源库下一页时保留第一页内容并追加新内容", async () => {
    const session = useSessionStore();
    session.activeSession = {
      server: { id: "server-1", name: "Home", url: "https://emby.example.test" },
      account: { id: "user-1", serverId: "server-1", name: "alice" },
      accessToken: "token-1",
    };
    vi.mocked(fetchLibraryItems)
      .mockResolvedValueOnce({
        items: [{ id: "movie-1", name: "Movie 1", type: "Movie" }],
        total: 3,
        rawItemCount: 1,
      })
      .mockResolvedValueOnce({
        items: [{ id: "movie-2", name: "Movie 2", type: "Movie" }],
        total: 3,
        rawItemCount: 1,
      });
    const media = useMediaStore();

    await media.loadLibraryView("library-1", { collectionType: "movies", limit: 1 });
    await media.loadNextLibraryViewPage("library-1", { collectionType: "movies", limit: 1 });

    expect(fetchLibraryItems).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        parentId: "library-1",
        startIndex: 1,
        limit: 1,
      }),
    );
    expect(media.library.items.map((item) => item.id)).toEqual(["movie-1", "movie-2"]);
    expect(media.library.total).toBe(3);
    expect(media.library.hasMore).toBe(true);
  });

  it("已无更多资源库内容时不会继续请求下一页", async () => {
    const session = useSessionStore();
    session.activeSession = {
      server: { id: "server-1", name: "Home", url: "https://emby.example.test" },
      account: { id: "user-1", serverId: "server-1", name: "alice" },
      accessToken: "token-1",
    };
    vi.mocked(fetchLibraryItems).mockResolvedValue({
      items: [{ id: "movie-1", name: "Movie 1", type: "Movie" }],
      total: 1,
      rawItemCount: 1,
    });
    const media = useMediaStore();

    await media.loadLibraryView("library-1", { collectionType: "movies", limit: 1 });
    await media.loadNextLibraryViewPage("library-1", { collectionType: "movies", limit: 1 });

    expect(fetchLibraryItems).toHaveBeenCalledTimes(1);
    expect(media.library.hasMore).toBe(false);
  });

  it("加载单集详情时同步加载同季选集", async () => {
    const session = useSessionStore();
    session.activeSession = {
      server: { id: "server-1", name: "Home", url: "https://emby.example.test" },
      account: { id: "user-1", serverId: "server-1", name: "alice" },
      accessToken: "token-1",
    };
    vi.mocked(fetchMediaDetail).mockResolvedValue({
      id: "episode-2",
      name: "第二集",
      type: "Episode",
      seriesId: "series-1",
      seasonId: "season-1",
    });
    vi.mocked(fetchEpisodeItems).mockResolvedValue([
      { id: "episode-1", name: "第一集", type: "Episode" },
      { id: "episode-2", name: "第二集", type: "Episode" },
    ]);
    const media = useMediaStore();

    await media.loadDetail("episode-2");

    expect(fetchEpisodeItems).toHaveBeenCalledWith({
      serverUrl: "https://emby.example.test",
      userId: "user-1",
      token: "token-1",
      seriesId: "series-1",
      seasonId: "season-1",
    });
    expect(media.detail.episodes.map((episode) => episode.id)).toEqual(["episode-1", "episode-2"]);
  });

  it("加载季详情时同步加载该季选集", async () => {
    const session = useSessionStore();
    session.activeSession = {
      server: { id: "server-1", name: "Home", url: "https://emby.example.test" },
      account: { id: "user-1", serverId: "server-1", name: "alice" },
      accessToken: "token-1",
    };
    vi.mocked(fetchMediaDetail).mockResolvedValue({
      id: "season-1",
      name: "追番 第 1 季",
      type: "Season",
      seriesId: "series-1",
      seasonId: "season-1",
    });
    vi.mocked(fetchEpisodeItems).mockResolvedValue([
      { id: "episode-1", name: "第一集", type: "Episode" },
      { id: "episode-2", name: "第二集", type: "Episode" },
    ]);
    vi.mocked(fetchSeasonItems).mockResolvedValue([
      { id: "season-1", name: "追番 第 1 季", type: "Season", seasonNumber: 1 },
      { id: "season-2", name: "追番 第 2 季", type: "Season", seasonNumber: 2 },
    ]);
    const media = useMediaStore();

    await media.loadDetail("season-1");

    expect(fetchSeasonItems).toHaveBeenCalledWith({
      serverUrl: "https://emby.example.test",
      userId: "user-1",
      token: "token-1",
      seriesId: "series-1",
    });
    expect(fetchEpisodeItems).toHaveBeenCalledWith({
      serverUrl: "https://emby.example.test",
      userId: "user-1",
      token: "token-1",
      seriesId: "series-1",
      seasonId: "season-1",
    });
    expect(media.detail.seasons.map((season) => season.id)).toEqual(["season-1", "season-2"]);
    expect(media.detail.episodes.map((episode) => episode.id)).toEqual(["episode-1", "episode-2"]);
  });

  it("同季多集都有观看进度时只保留最新记录并清理旧记录", async () => {
    const session = useSessionStore();
    session.activeSession = {
      server: { id: "server-1", name: "Home", url: "https://emby.example.test" },
      account: { id: "user-1", serverId: "server-1", name: "alice" },
      accessToken: "token-1",
    };
    vi.mocked(fetchMediaDetail).mockResolvedValue({
      id: "season-1",
      name: "追番 第 1 季",
      type: "Season",
      seriesId: "series-1",
      seasonId: "season-1",
    });
    vi.mocked(fetchEpisodeItems).mockResolvedValue([
      {
        id: "episode-1",
        name: "第一集",
        type: "Episode",
        episodeNumber: 1,
        playbackPositionTicks: 300_000_000,
        lastPlayedDate: "2026-05-22T10:00:00.0000000Z",
        playedPercentage: 20,
        progressLabel: "观看到第 1 季第 1 集",
      },
      {
        id: "episode-3",
        name: "第三集",
        type: "Episode",
        episodeNumber: 3,
        playbackPositionTicks: 900_000_000,
        lastPlayedDate: "2026-05-23T10:00:00.0000000Z",
        playedPercentage: 50,
        progressLabel: "观看到第 1 季第 3 集",
      },
    ]);
    vi.mocked(clearItemPlaybackProgress).mockResolvedValue(undefined);
    const media = useMediaStore();

    await media.loadDetail("season-1");

    expect(clearItemPlaybackProgress).toHaveBeenCalledWith({
      serverUrl: "https://emby.example.test",
      userId: "user-1",
      token: "token-1",
      itemId: "episode-1",
    });
    expect(media.detail.episodes).toEqual([
      expect.objectContaining({
        id: "episode-1",
        playbackPositionTicks: undefined,
        lastPlayedDate: undefined,
        playedPercentage: undefined,
        progressLabel: undefined,
      }),
      expect.objectContaining({
        id: "episode-3",
        playbackPositionTicks: 900_000_000,
        lastPlayedDate: "2026-05-23T10:00:00.0000000Z",
      }),
    ]);
  });

  it("搜索完成后记录搜索关键词，并保留最近记录优先", async () => {
    const session = useSessionStore();
    session.activeSession = {
      server: { id: "server-1", name: "Home", url: "https://emby.example.test" },
      account: { id: "user-1", serverId: "server-1", name: "alice" },
      accessToken: "token-1",
    };
    vi.mocked(searchMediaItems).mockResolvedValue({
      items: [],
      total: 0,
      rawItemCount: 0,
    });
    const media = useMediaStore();

    await media.runSearch("星际穿越");
    await media.runSearch("盗梦空间");
    await media.runSearch("星际穿越");

    expect(searchMediaItems).toHaveBeenCalledWith(
      expect.objectContaining({
        serverUrl: "https://emby.example.test",
        userId: "user-1",
        token: "token-1",
        query: "星际穿越",
      }),
    );
    expect(media.searchHistory).toEqual(["星际穿越", "盗梦空间"]);
    expect(JSON.parse(localStorage.getItem("velo:search-history") ?? "[]")).toEqual(["星际穿越", "盗梦空间"]);
  });
});
