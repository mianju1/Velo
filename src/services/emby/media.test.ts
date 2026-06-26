import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildImageUrl,
  buildEpisodeItemsUrl,
  buildItemsUrl,
  buildLibraryItemsUrl,
  buildLibraryViewsUrl,
  buildFavoriteItemUrl,
  buildSeasonItemsUrl,
  buildClearPlaybackProgressUrl,
  buildSearchUrl,
  buildSubtitleStreamUrl,
  fetchLibraryItems,
  favoriteMediaItem,
  fetchMediaItems,
  searchMediaItems,
  fetchSeasonItems,
  formatMediaRuntime,
  formatMediaSize,
  mediaResolutionLabel,
  normalizeMediaItem,
  normalizeMediaItemsForList,
  selectPreferredSubtitleTrack,
  unfavoriteMediaItem,
} from "./media";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Emby 媒体 API URL", () => {
  it("图片 URL 携带 itemId、类型和 api_key", () => {
    const url = buildImageUrl({
      serverUrl: "https://emby.example.test/",
      itemId: "item-1",
      imageType: "Primary",
      tag: "abc",
      token: "token-1",
    });

    expect(url).toBe(
      "https://emby.example.test/Items/item-1/Images/Primary?tag=abc&api_key=token-1",
    );
  });

  it("媒体列表 URL 包含类型、排序和分页参数", () => {
    const url = buildItemsUrl({
      serverUrl: "https://emby.example.test",
      userId: "user-1",
      token: "token-1",
      kind: "movies",
      sortBy: "DateCreated",
      sortOrder: "Descending",
      startIndex: 20,
      limit: 40,
    });

    expect(url).toContain("/Users/user-1/Items?");
    expect(url).toContain("IncludeItemTypes=Movie");
    expect(url).toContain("SortBy=DateCreated");
    expect(url).toContain("SortOrder=Descending");
    expect(url).toContain("StartIndex=20");
    expect(url).toContain("Limit=40");
    expect(url).toContain("api_key=token-1");
  });

  it("继续观看列表包含剧集和季用于合集聚合", () => {
    const url = buildItemsUrl({
      serverUrl: "https://emby.example.test",
      userId: "user-1",
      token: "token-1",
      kind: "continue",
    });

    expect(url).toContain("IncludeItemTypes=Movie%2CSeries%2CSeason%2CEpisode%2CAudio%2CPhoto%2CLiveTvChannel");
  });

  it("搜索 URL 只包含作品级媒体类型，不搜索单集", () => {
    const url = buildSearchUrl({
      serverUrl: "https://emby.example.test",
      userId: "user-1",
      token: "token-1",
      query: "blade runner",
    });

    expect(url).toContain("SearchTerm=blade+runner");
    expect(url).toContain("Recursive=true");
    expect(url).toContain("IncludeItemTypes=Movie%2CSeries%2CSeason%2CAudio%2CPhoto%2CLiveTvChannel");
    expect(url).not.toContain("Episode");
  });

  it("资源库视图 URL 查询当前用户可见资源库", () => {
    const url = buildLibraryViewsUrl({
      serverUrl: "https://emby.example.test",
      userId: "user-1",
      token: "token-1",
    });

    expect(url).toBe("https://emby.example.test/Users/user-1/Views?api_key=token-1");
  });

  it("服务端资源库列表 URL 使用 ParentId 查询对应资源库", () => {
    const url = buildLibraryItemsUrl({
      serverUrl: "https://emby.example.test",
      userId: "user-1",
      token: "token-1",
      parentId: "library-1",
      collectionType: "movies",
    });

    expect(url).toContain("/Users/user-1/Items?");
    expect(url).toContain("ParentId=library-1");
    expect(url).toContain("IncludeItemTypes=Movie");
    expect(url).toContain("Recursive=true");
  });

  it("电视剧资源库列表只请求剧集和季，不直接展示散落单集", () => {
    const url = buildLibraryItemsUrl({
      serverUrl: "https://emby.example.test",
      userId: "user-1",
      token: "token-1",
      parentId: "library-1",
      collectionType: "tvshows",
    });

    expect(url).toContain("IncludeItemTypes=Series%2CSeason");
    expect(url).not.toContain("Episode");
  });

  it("剧集列表 URL 使用剧集所属剧集 ID 和季 ID 查询", () => {
    const url = buildEpisodeItemsUrl({
      serverUrl: "https://emby.example.test",
      userId: "user-1",
      token: "token-1",
      seriesId: "series-1",
      seasonId: "season-1",
    });

    expect(url).toContain("/Shows/series-1/Episodes?");
    expect(url).toContain("UserId=user-1");
    expect(url).toContain("SeasonId=season-1");
    expect(url).toContain("Fields=PrimaryImageAspectRatio%2COverview%2CCommunityRating%2CRunTimeTicks%2CCumulativeRunTimeTicks%2CProductionYear%2CGenres%2CDateCreated%2COfficialRating%2CMediaSources");
    expect(url).toContain("api_key=token-1");
  });

  it("季列表 URL 使用剧集 ID 查询同剧所有季", () => {
    const url = buildSeasonItemsUrl({
      serverUrl: "https://emby.example.test",
      userId: "user-1",
      token: "token-1",
      seriesId: "series-1",
    });

    expect(url).toContain("/Shows/series-1/Seasons?");
    expect(url).toContain("UserId=user-1");
    expect(url).toContain("Fields=PrimaryImageAspectRatio%2COverview%2CCommunityRating%2CRunTimeTicks%2CCumulativeRunTimeTicks%2CProductionYear%2CGenres%2CDateCreated%2COfficialRating%2CMediaSources");
    expect(url).toContain("api_key=token-1");
  });

  it("字幕流 URL 指向 Emby 字幕接口", () => {
    const url = buildSubtitleStreamUrl({
      serverUrl: "https://emby.example.test",
      itemId: "item-1",
      mediaSourceId: "source-1",
      streamIndex: 4,
      codec: "ass",
      token: "token-1",
    });

    expect(url).toBe(
      "https://emby.example.test/Videos/item-1/source-1/Subtitles/4/Stream.ass?api_key=token-1",
    );
  });

  it("清理观看进度 URL 指向 Emby 未播放接口", () => {
    const url = buildClearPlaybackProgressUrl({
      serverUrl: "https://emby.example.test",
      userId: "user-1",
      itemId: "episode-1",
      token: "token-1",
    });

    expect(url).toBe("https://emby.example.test/Users/user-1/PlayedItems/episode-1?api_key=token-1");
  });

  it("收藏条目 URL 指向 Emby 云端收藏接口", () => {
    const url = buildFavoriteItemUrl({
      serverUrl: "https://emby.example.test",
      userId: "user-1",
      itemId: "movie-1",
      token: "token-1",
    });

    expect(url).toBe("https://emby.example.test/Users/user-1/FavoriteItems/movie-1?api_key=token-1");
  });

  it("资源库列表 URL 支持当前分类内搜索", () => {
    const url = buildLibraryItemsUrl({
      serverUrl: "https://emby.example.test",
      userId: "user-1",
      token: "token-1",
      parentId: "library-1",
      collectionType: "movies",
      searchTerm: "星际",
    });

    expect(url).toContain("ParentId=library-1");
    expect(url).toContain("SearchTerm=%E6%98%9F%E9%99%85");
  });
});

describe("Emby 媒体分页响应", () => {
  it("发送收藏请求时使用 POST 并保存到 Emby 服务端", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await favoriteMediaItem({
      serverUrl: "https://emby.example.test",
      userId: "user-1",
      itemId: "movie-1",
      token: "token-1",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://emby.example.test/Users/user-1/FavoriteItems/movie-1?api_key=token-1",
      { method: "POST" },
    );
  });

  it("发送取消收藏请求时使用 DELETE 并保存到 Emby 服务端", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await unfavoriteMediaItem({
      serverUrl: "https://emby.example.test",
      userId: "user-1",
      itemId: "movie-1",
      token: "token-1",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://emby.example.test/Users/user-1/FavoriteItems/movie-1?api_key=token-1",
      { method: "DELETE" },
    );
  });

  it("媒体列表使用服务端 TotalRecordCount 作为总数，并保留本页原始条目数", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            TotalRecordCount: 120,
            Items: [
              { Id: "movie-1", Name: "影片 1", Type: "Movie" },
              { Id: "movie-2", Name: "影片 2", Type: "Movie" },
            ],
          }),
          { status: 200 },
        ),
      ),
    );

    const result = await fetchMediaItems({
      serverUrl: "https://emby.example.test",
      userId: "user-1",
      token: "token-1",
      kind: "movies",
      startIndex: 0,
      limit: 2,
    });

    expect(result.items.map((item) => item.id)).toEqual(["movie-1", "movie-2"]);
    expect(result.total).toBe(120);
    expect(result.rawItemCount).toBe(2);
  });

  it("全局搜索结果只保留名称或介绍匹配的作品，不保留单集", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            TotalRecordCount: 4,
            Items: [
              { Id: "movie-1", Name: "星际穿越", Type: "Movie", Overview: "虫洞和亲情" },
              { Id: "series-1", Name: "太空旅人", Type: "Series", Overview: "星际航线" },
              { Id: "episode-1", Name: "星际第一集", Type: "Episode", Overview: "单集内容" },
              { Id: "movie-2", Name: "海边假日", Type: "Movie", Overview: "家庭喜剧" },
            ],
          }),
          { status: 200 },
        ),
      ),
    );

    const result = await searchMediaItems({
      serverUrl: "https://emby.example.test",
      userId: "user-1",
      token: "token-1",
      query: "星际",
    });

    expect(result.items.map((item) => item.id)).toEqual(["movie-1", "series-1"]);
  });

  it("资源库列表使用服务端 TotalRecordCount 支持后续分页判断", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            TotalRecordCount: 80,
            Items: [{ Id: "series-1", Name: "剧集 1", Type: "Series" }],
          }),
          { status: 200 },
        ),
      ),
    );

    const result = await fetchLibraryItems({
      serverUrl: "https://emby.example.test",
      userId: "user-1",
      token: "token-1",
      parentId: "library-1",
      collectionType: "tvshows",
      startIndex: 0,
      limit: 1,
    });

    expect(result.total).toBe(80);
    expect(result.rawItemCount).toBe(1);
  });

  it("资源库季条目缺少总时长时补取单集并汇总总时长", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/Shows/series-1/Episodes?")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              Items: [
                { Id: "episode-1", Name: "第一集", Type: "Episode", RunTimeTicks: 1_800_000_0000 },
                {
                  Id: "episode-2",
                  Name: "第二集",
                  Type: "Episode",
                  RunTimeTicks: 2_700_000_0000,
                  MediaSources: [{ MediaStreams: [{ Type: "Video", Width: 3840, Height: 2160 }] }],
                },
              ],
            }),
            { status: 200 },
          ),
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            TotalRecordCount: 1,
            Items: [
              {
                Id: "season-1",
                Name: "第 1 季",
                Type: "Season",
                SeriesId: "series-1",
                SeriesName: "追番",
                ParentIndexNumber: 1,
                ChildCount: 2,
              },
            ],
          }),
          { status: 200 },
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchLibraryItems({
      serverUrl: "https://emby.example.test",
      userId: "user-1",
      token: "token-1",
      parentId: "library-1",
      collectionType: "tvshows",
      startIndex: 0,
      limit: 1,
    });

    expect(result.items[0]).toMatchObject({
      id: "season-1",
      runtimeMinutes: 75,
      videoHeight: 2160,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("读取剧集季列表并规范化季条目", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            Items: [
              {
                Id: "season-1",
                Name: "第 1 季",
                Type: "Season",
                SeriesId: "series-1",
                SeriesName: "追番",
                ParentIndexNumber: 1,
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );

    const seasons = await fetchSeasonItems({
      serverUrl: "https://emby.example.test",
      userId: "user-1",
      token: "token-1",
      seriesId: "series-1",
    });

    expect(seasons).toEqual([
      expect.objectContaining({
        id: "season-1",
        type: "Season",
        seriesId: "series-1",
        seasonNumber: 1,
      }),
    ]);
  });
});

describe("Emby 媒体响应规范化", () => {
  it("将 Emby 条目规范化为前端媒体条目", () => {
    const item = normalizeMediaItem({
      Id: "item-1",
      Name: "The Movie",
      Type: "Movie",
      ProductionYear: 2024,
      RunTimeTicks: 7_200_000_0000,
      ImageTags: { Primary: "primary-tag" },
      BackdropImageTags: ["backdrop-tag"],
    });

    expect(item).toMatchObject({
      id: "item-1",
      name: "The Movie",
      type: "Movie",
      year: 2024,
      runtimeMinutes: 120,
      primaryImageTag: "primary-tag",
      backdropImageTag: "backdrop-tag",
      overview: undefined,
      communityRating: undefined,
    });
  });

  it("条目缺少 RunTimeTicks 时使用累计时长作为总时长", () => {
    const item = normalizeMediaItem({
      Id: "season-1",
      Name: "Season 1",
      Type: "Season",
      CumulativeRunTimeTicks: 14_400_000_0000,
    });

    expect(item.runtimeMinutes).toBe(240);
  });

  it("保留剧集单集的季集信息", () => {
    const item = normalizeMediaItem({
      Id: "episode-1",
      Name: "Pilot",
      Type: "Episode",
      SeriesId: "series-1",
      SeasonId: "season-1",
      SeriesName: "The Show",
      ParentIndexNumber: 1,
      IndexNumber: 2,
    });

    expect(item).toMatchObject({
      id: "episode-1",
      type: "Episode",
      seriesId: "series-1",
      seasonId: "season-1",
      seriesName: "The Show",
      seasonNumber: 1,
      episodeNumber: 2,
    });
  });

  it("季条目使用自身 ID 作为 seasonId", () => {
    const item = normalizeMediaItem({
      Id: "season-1",
      Name: "Season 1",
      Type: "Season",
      SeriesId: "series-1",
      SeriesName: "The Show",
      ParentIndexNumber: 1,
    });

    expect(item).toMatchObject({
      id: "season-1",
      type: "Season",
      seriesId: "series-1",
      seasonId: "season-1",
      seasonNumber: 1,
    });
  });

  it("季条目没有自身海报时回退使用所属剧集海报", () => {
    const item = normalizeMediaItem({
      Id: "season-1",
      Name: "第 1 季",
      Type: "Season",
      SeriesId: "series-1",
      SeriesName: "小熊查理",
      ParentIndexNumber: 1,
      SeriesPrimaryImageTag: "series-primary-tag",
    });

    expect(item).toMatchObject({
      id: "season-1",
      imageItemId: "series-1",
      primaryImageTag: "series-primary-tag",
    });
  });

  it("季条目使用父级 backdrop 作为详情背景图来源", () => {
    const item = normalizeMediaItem({
      Id: "season-1",
      Name: "第 1 季",
      Type: "Season",
      SeriesId: "series-1",
      SeriesName: "小熊查理",
      ParentBackdropItemId: "series-1",
      ParentBackdropImageTags: ["backdrop-tag"],
    });

    expect(item).toMatchObject({
      id: "season-1",
      backdropImageItemId: "series-1",
      backdropImageTag: "backdrop-tag",
    });
  });

  it("保留播放进度用于合集历史标注", () => {
    const item = normalizeMediaItem({
      Id: "episode-1",
      Name: "Pilot",
      Type: "Episode",
      SeriesId: "series-1",
      SeasonId: "season-1",
      SeriesName: "The Show",
      ParentIndexNumber: 1,
      IndexNumber: 2,
      UserData: {
        PlaybackPositionTicks: 1_800_000_0000,
        LastPlayedDate: "2026-05-22T10:00:00.0000000Z",
        PlayedPercentage: 50,
      },
    });

    expect(item).toMatchObject({
      progressLabel: "观看到第 1 季第 2 集",
      playbackPositionTicks: 1_800_000_0000,
      lastPlayedDate: "2026-05-22T10:00:00.0000000Z",
      playedPercentage: 50,
    });
  });

  it("列表中同一剧集同一季的多集会合并为季条目并标注最近观看集数", () => {
    const items = normalizeMediaItemsForList([
      {
        Id: "episode-1",
        Name: "第一集",
        Type: "Episode",
        SeriesId: "series-1",
        SeasonId: "season-1",
        SeriesName: "追番",
        ParentIndexNumber: 1,
        IndexNumber: 1,
        ImageTags: { Primary: "ep-1" },
        UserData: {
          PlaybackPositionTicks: 10,
          LastPlayedDate: "2026-05-21T10:00:00.0000000Z",
        },
      },
      {
        Id: "episode-2",
        Name: "第二集",
        Type: "Episode",
        SeriesId: "series-1",
        SeasonId: "season-1",
        SeriesName: "追番",
        ParentIndexNumber: 1,
        IndexNumber: 2,
        ImageTags: { Primary: "ep-2" },
        UserData: {
          PlaybackPositionTicks: 20,
          LastPlayedDate: "2026-05-22T10:00:00.0000000Z",
        },
      },
      {
        Id: "movie-1",
        Name: "电影",
        Type: "Movie",
      },
    ]);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      id: "season-1",
      name: "追番 第 1 季",
      type: "Season",
      seriesId: "series-1",
      seasonId: "season-1",
      seasonNumber: 1,
      episodeCount: 2,
      progressLabel: "观看到第 1 季第 2 集",
      primaryImageTag: "ep-2",
    });
    expect(items[1]).toMatchObject({ id: "movie-1", type: "Movie" });
  });

  it("列表中同一季多集会累加为季总时长", () => {
    const items = normalizeMediaItemsForList([
      {
        Id: "episode-1",
        Name: "第一集",
        Type: "Episode",
        SeriesId: "series-1",
        SeasonId: "season-1",
        SeriesName: "追番",
        ParentIndexNumber: 1,
        IndexNumber: 1,
        RunTimeTicks: 1_800_000_0000,
      },
      {
        Id: "episode-2",
        Name: "第二集",
        Type: "Episode",
        SeriesId: "series-1",
        SeasonId: "season-1",
        SeriesName: "追番",
        ParentIndexNumber: 1,
        IndexNumber: 2,
        RunTimeTicks: 2_700_000_0000,
      },
    ]);

    expect(items[0]).toMatchObject({
      type: "Season",
      runtimeMinutes: 75,
    });
  });

  it("列表中的单季季条目使用剧集名作为卡片标题", () => {
    const items = normalizeMediaItemsForList([
      {
        Id: "season-1",
        Name: "第一季",
        Type: "Season",
        SeriesId: "series-1",
        SeriesName: "摇滚萝莉",
        ParentIndexNumber: 1,
      },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "season-1",
      name: "摇滚萝莉",
      type: "Season",
      seriesId: "series-1",
      seasonNumber: 1,
    });
  });

  it("列表中的多季季条目使用剧集名加季名称作为卡片标题", () => {
    const items = normalizeMediaItemsForList([
      {
        Id: "season-1",
        Name: "第一季",
        Type: "Season",
        SeriesId: "series-1",
        SeriesName: "布鲁伊",
        ParentIndexNumber: 1,
      },
      {
        Id: "season-2",
        Name: "第二季",
        Type: "Season",
        SeriesId: "series-1",
        SeriesName: "布鲁伊",
        ParentIndexNumber: 2,
      },
    ]);

    expect(items.map((item) => item.name)).toEqual(["布鲁伊 第一季", "布鲁伊 第二季"]);
  });

  it("保留音乐和照片的类型化元数据", () => {
    const audio = normalizeMediaItem({
      Id: "audio-1",
      Name: "Track",
      Type: "Audio",
      Album: "Album",
      Artists: ["Alice", "Bob"],
      IndexNumber: 7,
    });
    const photo = normalizeMediaItem({
      Id: "photo-1",
      Name: "Photo",
      Type: "Photo",
      DateCreated: "2026-05-22T10:00:00.0000000Z",
    });

    expect(audio).toMatchObject({
      album: "Album",
      artists: ["Alice", "Bob"],
      trackNumber: 7,
    });
    expect(photo).toMatchObject({
      dateCreated: "2026-05-22T10:00:00.0000000Z",
    });
  });

  it("从媒体流中提取原始视频分辨率", () => {
    const item = normalizeMediaItem({
      Id: "movie-1",
      Name: "Movie",
      Type: "Movie",
      ChildCount: 3,
      MediaSources: [
        {
          MediaStreams: [
            { Type: "Audio" },
            { Type: "Video", Height: 1080, Width: 1920 },
          ],
        },
      ],
    });

    expect(item.videoHeight).toBe(1080);
    expect(item.episodeCount).toBe(3);
  });

  it("从媒体源提取详情页播放信息", () => {
    const item = normalizeMediaItem({
      Id: "movie-1",
      Name: "Movie",
      Type: "Movie",
      RunTimeTicks: 7_200_000_0000,
      MediaSources: [
        {
          Size: 8_589_934_592,
          MediaStreams: [
            { Type: "Video", Height: 2160, Width: 3840, VideoRange: "DOVI" },
            { Type: "Audio", Codec: "eac3" },
          ],
        },
      ],
    });

    expect(item.videoWidth).toBe(3840);
    expect(item.videoHeight).toBe(2160);
    expect(item.sizeBytes).toBe(8_589_934_592);
    expect(item.dolbySupported).toBe(true);
    expect(mediaResolutionLabel(item)).toBe("4K");
    expect(formatMediaRuntime(item.runtimeMinutes)).toBe("2 小时");
    expect(formatMediaSize(item.sizeBytes)).toBe("8.0 GB");
  });

  it("保留字幕轨道信息", () => {
    const item = normalizeMediaItem({
      Id: "movie-1",
      Name: "Movie",
      Type: "Movie",
      MediaSources: [
        {
          Id: "source-1",
          MediaStreams: [
            {
              Type: "Subtitle",
              Index: 3,
              Codec: "ass",
              Language: "chi",
              DisplayTitle: "中文 ASS",
              IsExternal: true,
              IsTextSubtitleStream: true,
              SupportsExternalStream: true,
            },
            {
              Type: "Subtitle",
              Index: 4,
              Codec: "PGSSUB",
              Language: "eng",
              DisplayTitle: "English PGS",
              IsExternal: false,
              IsTextSubtitleStream: false,
              SupportsExternalStream: false,
            },
          ],
        },
      ],
    });

    expect(item.subtitleTracks).toEqual([
      {
        id: "source-1:3",
        mediaSourceId: "source-1",
        streamIndex: 3,
        codec: "ass",
        language: "chi",
        label: "中文 ASS",
        isExternal: true,
        isTextSubtitleStream: true,
        supportsExternalStream: true,
      },
      {
        id: "source-1:4",
        mediaSourceId: "source-1",
        streamIndex: 4,
        codec: "PGSSUB",
        language: "eng",
        label: "English PGS",
        isExternal: false,
        isTextSubtitleStream: false,
        supportsExternalStream: false,
      },
    ]);
  });

  it("默认字幕优先系统语言，其次中文，再其次英文", () => {
    const tracks = [
      { id: "en", mediaSourceId: "source-1", streamIndex: 1, language: "eng", label: "English" },
      { id: "zh", mediaSourceId: "source-1", streamIndex: 2, language: "chi", label: "中文" },
      { id: "ja", mediaSourceId: "source-1", streamIndex: 3, language: "jpn", label: "日本語" },
    ];

    expect(selectPreferredSubtitleTrack(tracks, ["ja-JP"])?.id).toBe("ja");
    expect(selectPreferredSubtitleTrack(tracks, ["fr-FR"])?.id).toBe("zh");
    expect(selectPreferredSubtitleTrack([tracks[0]], ["fr-FR"])?.id).toBe("en");
  });

  it("按固定档位展示分辨率标签", () => {
    expect(mediaResolutionLabel({ videoHeight: 720 })).toBe("标清");
    expect(mediaResolutionLabel({ videoHeight: 1080 })).toBe("1080P");
    expect(mediaResolutionLabel({ videoHeight: 1440 })).toBe("2K");
    expect(mediaResolutionLabel({ videoHeight: 2160 })).toBe("4K");
  });
});
