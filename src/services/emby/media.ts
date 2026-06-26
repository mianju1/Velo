export type MediaKind = "continue" | "latest" | "favorites" | "movies" | "series" | "music" | "photos" | "livetv";

export type SortBy = "DateCreated" | "SortName" | "DatePlayed";

export type SortOrder = "Ascending" | "Descending";

export type MediaQuery = {
  serverUrl: string;
  userId: string;
  token: string;
  kind: MediaKind;
  searchTerm?: string;
  sortBy?: SortBy;
  sortOrder?: SortOrder;
  startIndex?: number;
  limit?: number;
};

export type LibraryViewsQuery = {
  serverUrl: string;
  userId: string;
  token: string;
};

export type LibraryItemsQuery = {
  serverUrl: string;
  userId: string;
  token: string;
  parentId: string;
  collectionType?: string | null;
  searchTerm?: string;
  sortBy?: SortBy;
  sortOrder?: SortOrder;
  startIndex?: number;
  limit?: number;
};

export type EpisodeItemsQuery = {
  serverUrl: string;
  userId: string;
  token: string;
  seriesId: string;
  seasonId?: string;
};

export type SeasonItemsQuery = {
  serverUrl: string;
  userId: string;
  token: string;
  seriesId: string;
};

export type SearchQuery = {
  serverUrl: string;
  userId: string;
  token: string;
  query: string;
  limit?: number;
};

export type ImageQuery = {
  serverUrl: string;
  itemId: string;
  imageType: "Primary" | "Backdrop" | "Logo" | "Thumb";
  token: string;
  tag?: string;
  maxWidth?: number;
};

export type SubtitleStreamQuery = {
  serverUrl: string;
  itemId: string;
  mediaSourceId: string;
  streamIndex: number;
  codec?: string;
  token: string;
};

export type ClearPlaybackProgressQuery = {
  serverUrl: string;
  userId: string;
  itemId: string;
  token: string;
};

export type FavoriteItemQuery = ClearPlaybackProgressQuery;

export type EmbyItem = {
  Id: string;
  Name: string;
  Type: string;
  Album?: string;
  Artists?: string[];
  DateCreated?: string;
  Genres?: string[];
  IndexNumber?: number;
  OfficialRating?: string;
  ParentIndexNumber?: number;
  ProductionYear?: number;
  RunTimeTicks?: number;
  CumulativeRunTimeTicks?: number;
  SeasonId?: string;
  SeriesId?: string;
  SeriesName?: string;
  Overview?: string;
  CommunityRating?: number;
  ImageTags?: Record<string, string>;
  BackdropImageTags?: string[];
  PrimaryImageItemId?: string;
  ParentPrimaryImageTag?: string;
  SeriesPrimaryImageTag?: string;
  ParentBackdropImageTags?: string[];
  ParentBackdropItemId?: string;
  MediaSources?: EmbyMediaSource[];
  ChildCount?: number;
  UserData?: EmbyUserData;
};

export type EmbyUserData = {
  IsFavorite?: boolean;
  PlaybackPositionTicks?: number;
  PlayedPercentage?: number;
  LastPlayedDate?: string;
};

export type EmbyMediaSource = {
  Id?: string;
  RunTimeTicks?: number;
  Size?: number;
  MediaStreams?: EmbyMediaStream[];
};

export type EmbyMediaStream = {
  Index?: number;
  Type?: string;
  Codec?: string;
  DisplayTitle?: string;
  Language?: string;
  IsExternal?: boolean;
  IsTextSubtitleStream?: boolean;
  SupportsExternalStream?: boolean;
  Width?: number;
  Height?: number;
  Profile?: string;
  VideoRange?: string;
};

export type EmbyItemsResponse = {
  Items?: EmbyItem[];
  TotalRecordCount?: number;
};

export type EmbyLibraryView = {
  Id: string;
  Name: string;
  Type: string;
  CollectionType?: string | null;
  ChildCount?: number;
};

export type EmbyLibraryViewsResponse = {
  Items?: EmbyLibraryView[];
};

export type LibraryView = {
  id: string;
  name: string;
  type: string;
  collectionType?: string | null;
  childCount?: number;
};

export type MediaSubtitleTrack = {
  id: string;
  mediaSourceId: string;
  streamIndex: number;
  codec?: string;
  language?: string;
  label: string;
  isExternal?: boolean;
  isTextSubtitleStream?: boolean;
  supportsExternalStream?: boolean;
};

export type MediaItem = {
  id: string;
  name: string;
  type: string;
  year?: number;
  runtimeMinutes?: number;
  imageItemId?: string;
  primaryImageTag?: string;
  backdropImageItemId?: string;
  backdropImageTag?: string;
  overview?: string;
  communityRating?: number;
  album?: string;
  artists?: string[];
  dateCreated?: string;
  episodeNumber?: number;
  genres?: string[];
  officialRating?: string;
  seasonId?: string;
  seasonNumber?: number;
  seriesId?: string;
  seriesName?: string;
  trackNumber?: number;
  sizeBytes?: number;
  episodeCount?: number;
  videoWidth?: number;
  videoHeight?: number;
  dolbySupported?: boolean;
  subtitleTracks?: MediaSubtitleTrack[];
  playbackPositionTicks?: number;
  playedPercentage?: number;
  isFavorite?: boolean;
  lastPlayedDate?: string;
  progressLabel?: string;
};

export type MediaItemsResult = {
  items: MediaItem[];
  total: number;
  rawItemCount: number;
};

const itemTypesByKind: Record<MediaKind, string[]> = {
  continue: ["Movie", "Series", "Season", "Episode", "Audio", "Photo", "LiveTvChannel"],
  latest: ["Movie", "Series", "Season", "Episode", "Audio", "Photo", "LiveTvChannel"],
  favorites: ["Movie", "Series", "Season", "Episode", "Audio", "Photo", "LiveTvChannel"],
  movies: ["Movie"],
  series: ["Series"],
  music: ["Audio"],
  photos: ["Photo"],
  livetv: ["LiveTvChannel"],
};

const searchItemTypes = ["Movie", "Series", "Episode", "Audio", "Photo", "LiveTvChannel"];
const listSearchItemTypes = ["Movie", "Series", "Season", "Audio", "Photo", "LiveTvChannel"];

const itemTypesByCollectionType: Record<string, string[]> = {
  movies: ["Movie"],
  tvshows: ["Series", "Season"],
  music: ["Audio"],
  playlists: ["Playlist"],
  boxsets: ["BoxSet"],
};

const detailFields =
  "PrimaryImageAspectRatio,Overview,CommunityRating,RunTimeTicks,CumulativeRunTimeTicks,ProductionYear,Genres,DateCreated,OfficialRating,MediaSources";
const listFields =
  "PrimaryImageAspectRatio,Overview,CommunityRating,RunTimeTicks,CumulativeRunTimeTicks,ProductionYear,Genres,MediaSources,ChildCount";

export function buildItemsUrl(query: MediaQuery) {
  const url = new URL(`/Users/${query.userId}/Items`, normalizeServerUrl(query.serverUrl));
  const params = url.searchParams;

  params.set("api_key", query.token);
  params.set("Recursive", "true");
  params.set("Fields", listFields);
  params.set("IncludeItemTypes", itemTypesByKind[query.kind].join(","));
  params.set("StartIndex", String(query.startIndex ?? 0));
  params.set("Limit", String(query.limit ?? 48));
  if (query.searchTerm?.trim()) {
    params.set("SearchTerm", query.searchTerm.trim());
  }

  if (query.kind === "continue") {
    params.set("SortBy", "DatePlayed");
    params.set("SortOrder", "Descending");
    params.set("Filters", "IsResumable");
  } else if (query.kind === "favorites") {
    params.set("Filters", "IsFavorite");
    params.set("SortBy", query.sortBy ?? "SortName");
    params.set("SortOrder", query.sortOrder ?? "Ascending");
  } else {
    params.set("SortBy", query.sortBy ?? "DateCreated");
    params.set("SortOrder", query.sortOrder ?? "Descending");
  }

  return url.toString();
}

export function buildEpisodeItemsUrl(query: EpisodeItemsQuery) {
  const url = new URL(`/Shows/${query.seriesId}/Episodes`, normalizeServerUrl(query.serverUrl));
  const params = url.searchParams;

  params.set("api_key", query.token);
  params.set("UserId", query.userId);
  params.set("Fields", detailFields);
  if (query.seasonId) {
    params.set("SeasonId", query.seasonId);
  }

  return url.toString();
}

export function buildSeasonItemsUrl(query: SeasonItemsQuery) {
  const url = new URL(`/Shows/${query.seriesId}/Seasons`, normalizeServerUrl(query.serverUrl));
  const params = url.searchParams;

  params.set("api_key", query.token);
  params.set("UserId", query.userId);
  params.set("Fields", detailFields);

  return url.toString();
}

export function buildSearchUrl(query: SearchQuery) {
  const url = new URL(`/Users/${query.userId}/Items`, normalizeServerUrl(query.serverUrl));
  const params = url.searchParams;

  params.set("api_key", query.token);
  params.set("Recursive", "true");
  params.set("SearchTerm", query.query);
  params.set("IncludeItemTypes", listSearchItemTypes.join(","));
  params.set("Fields", listFields);
  params.set("Limit", String(query.limit ?? 60));

  return url.toString();
}

export function buildLibraryViewsUrl(query: LibraryViewsQuery) {
  const url = new URL(`/Users/${query.userId}/Views`, normalizeServerUrl(query.serverUrl));
  url.searchParams.set("api_key", query.token);
  return url.toString();
}

export function buildLibraryItemsUrl(query: LibraryItemsQuery) {
  const url = new URL(`/Users/${query.userId}/Items`, normalizeServerUrl(query.serverUrl));
  const params = url.searchParams;
  const includeTypes = itemTypesByCollectionType[query.collectionType ?? ""] ?? searchItemTypes;

  params.set("api_key", query.token);
  params.set("ParentId", query.parentId);
  params.set("Recursive", "true");
  params.set("IncludeItemTypes", includeTypes.join(","));
  params.set("Fields", listFields);
  params.set("SortBy", query.sortBy ?? "SortName");
  params.set("SortOrder", query.sortOrder ?? "Ascending");
  params.set("StartIndex", String(query.startIndex ?? 0));
  params.set("Limit", String(query.limit ?? 48));
  if (query.searchTerm?.trim()) {
    params.set("SearchTerm", query.searchTerm.trim());
  }

  return url.toString();
}

export function buildSubtitleStreamUrl(query: SubtitleStreamQuery) {
  const extension = subtitleExtension(query.codec);
  const url = new URL(
    `/Videos/${query.itemId}/${query.mediaSourceId}/Subtitles/${query.streamIndex}/Stream.${extension}`,
    normalizeServerUrl(query.serverUrl),
  );
  url.searchParams.set("api_key", query.token);
  return url.toString();
}

export function buildClearPlaybackProgressUrl(query: ClearPlaybackProgressQuery) {
  const url = new URL(`/Users/${query.userId}/PlayedItems/${query.itemId}`, normalizeServerUrl(query.serverUrl));
  url.searchParams.set("api_key", query.token);
  return url.toString();
}

export function buildFavoriteItemUrl(query: FavoriteItemQuery) {
  const url = new URL(`/Users/${query.userId}/FavoriteItems/${query.itemId}`, normalizeServerUrl(query.serverUrl));
  url.searchParams.set("api_key", query.token);
  return url.toString();
}

export function buildImageUrl(query: ImageQuery) {
  const url = new URL(`/Items/${query.itemId}/Images/${query.imageType}`, normalizeServerUrl(query.serverUrl));
  const params = url.searchParams;

  if (query.tag) {
    params.set("tag", query.tag);
  }
  if (query.maxWidth) {
    params.set("maxWidth", String(query.maxWidth));
  }
  params.set("api_key", query.token);

  return url.toString();
}

export function normalizeMediaItem(item: EmbyItem): MediaItem {
  const primaryImage = primaryImageFromItem(item);
  const backdropImage = backdropImageFromItem(item);
  return {
    id: item.Id,
    name: item.Name,
    type: item.Type,
    year: item.ProductionYear,
    runtimeMinutes: runtimeMinutesFromItem(item),
    imageItemId: primaryImage.itemId ?? (item.BackdropImageTags?.[0] ? item.Id : undefined),
    primaryImageTag: primaryImage.tag,
    backdropImageItemId: backdropImage.itemId,
    backdropImageTag: backdropImage.tag,
    overview: item.Overview,
    communityRating: item.CommunityRating,
    album: item.Album,
    artists: item.Artists,
    dateCreated: item.DateCreated,
    episodeNumber: item.Type === "Episode" ? item.IndexNumber : undefined,
    genres: item.Genres,
    officialRating: item.OfficialRating,
    seasonId: item.Type === "Season" ? item.Id : item.SeasonId,
    seasonNumber: item.ParentIndexNumber,
    seriesId: item.SeriesId,
    seriesName: item.SeriesName,
    trackNumber: item.Type === "Audio" ? item.IndexNumber : undefined,
    sizeBytes: sizeBytesFromItem(item),
    episodeCount: episodeCountFromItem(item),
    videoWidth: videoStreamFromItem(item)?.Width,
    videoHeight: videoStreamFromItem(item)?.Height,
    dolbySupported: dolbySupportedFromItem(item),
    subtitleTracks: subtitleTracksFromItem(item),
    playbackPositionTicks: item.UserData?.PlaybackPositionTicks,
    playedPercentage: item.UserData?.PlayedPercentage,
    isFavorite: item.UserData?.IsFavorite,
    lastPlayedDate: item.UserData?.LastPlayedDate,
    progressLabel: progressLabelFromItem(item),
  };
}

export function normalizeMediaItemsForList(items: EmbyItem[]): MediaItem[] {
  return mergeMediaItemsForList(items.map(normalizeMediaItem));
}

export function mergeMediaItemsForList(items: MediaItem[]) {
  return mergeSeasonEntries(items);
}

export function mediaResolutionLabel(item: Pick<MediaItem, "videoHeight"> | { videoHeight?: number }) {
  const height = item.videoHeight;
  if (!height || !Number.isFinite(height)) {
    return "未知";
  }

  if (height <= 720) {
    return "标清";
  }
  if (height <= 1080) {
    return "1080P";
  }
  if (height < 2160) {
    return "2K";
  }
  return "4K";
}

export function formatMediaRuntime(runtimeMinutes: number | undefined) {
  if (!runtimeMinutes || !Number.isFinite(runtimeMinutes) || runtimeMinutes <= 0) {
    return "未知";
  }

  const totalMinutes = Math.round(runtimeMinutes);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) {
    return `${hours} 小时 ${minutes} 分钟`;
  }
  if (hours > 0) {
    return `${hours} 小时`;
  }
  return `${minutes} 分钟`;
}

export function formatMediaSize(sizeBytes: number | undefined) {
  if (!sizeBytes || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return "未知";
  }

  const gib = sizeBytes / 1024 / 1024 / 1024;
  if (gib >= 1) {
    return `${gib.toFixed(1)} GB`;
  }

  const mib = sizeBytes / 1024 / 1024;
  return `${Math.max(1, Math.round(mib))} MB`;
}

export async function fetchMediaItems(query: MediaQuery): Promise<MediaItemsResult> {
  const response = await fetch(buildItemsUrl(query));
  const data = await readEmbyResponse<EmbyItemsResponse>(response);
  const items = normalizeMediaItemsForList(data.Items ?? []);

  return {
    items,
    total: data.TotalRecordCount ?? items.length,
    rawItemCount: data.Items?.length ?? items.length,
  };
}

export async function fetchLibraryViews(query: LibraryViewsQuery): Promise<LibraryView[]> {
  const response = await fetch(buildLibraryViewsUrl(query));
  const data = await readEmbyResponse<EmbyLibraryViewsResponse>(response);

  return (data.Items ?? []).map((view) => ({
    id: view.Id,
    name: view.Name,
    type: view.Type,
    collectionType: view.CollectionType,
    childCount: view.ChildCount,
  }));
}

export async function fetchLibraryItems(query: LibraryItemsQuery): Promise<MediaItemsResult> {
  const response = await fetch(buildLibraryItemsUrl(query));
  const data = await readEmbyResponse<EmbyItemsResponse>(response);
  const items = await enrichSeasonSummaries(query, normalizeMediaItemsForList(data.Items ?? []));

  return {
    items,
    total: data.TotalRecordCount ?? items.length,
    rawItemCount: data.Items?.length ?? items.length,
  };
}

export async function searchMediaItems(query: SearchQuery): Promise<MediaItemsResult> {
  const response = await fetch(buildSearchUrl(query));
  const data = await readEmbyResponse<EmbyItemsResponse>(response);
  const items = normalizeMediaItemsForList(data.Items ?? []).filter((item) => isSearchResultMatch(item, query.query));

  return {
    items,
    total: items.length,
    rawItemCount: data.Items?.length ?? items.length,
  };
}

export async function fetchMediaDetail(serverUrl: string, userId: string, token: string, itemId: string) {
  const url = new URL(`/Users/${userId}/Items/${itemId}`, normalizeServerUrl(serverUrl));
  url.searchParams.set("api_key", token);
  url.searchParams.set(
    "Fields",
    detailFields,
  );

  const response = await fetch(url.toString());
  return normalizeMediaItem(await readEmbyResponse<EmbyItem>(response));
}

export async function fetchEpisodeItems(query: EpisodeItemsQuery): Promise<MediaItem[]> {
  const response = await fetch(buildEpisodeItemsUrl(query));
  const data = await readEmbyResponse<EmbyItemsResponse>(response);

  return (data.Items ?? []).map(normalizeMediaItem);
}

export async function fetchSeasonItems(query: SeasonItemsQuery): Promise<MediaItem[]> {
  const response = await fetch(buildSeasonItemsUrl(query));
  const data = await readEmbyResponse<EmbyItemsResponse>(response);

  return (data.Items ?? []).map(normalizeMediaItem);
}

export async function clearItemPlaybackProgress(query: ClearPlaybackProgressQuery): Promise<void> {
  const response = await fetch(buildClearPlaybackProgressUrl(query), { method: "DELETE" });
  await readEmptyEmbyResponse(response);
}

export async function favoriteMediaItem(query: FavoriteItemQuery): Promise<void> {
  const response = await fetch(buildFavoriteItemUrl(query), { method: "POST" });
  await readEmptyEmbyResponse(response);
}

export async function unfavoriteMediaItem(query: FavoriteItemQuery): Promise<void> {
  const response = await fetch(buildFavoriteItemUrl(query), { method: "DELETE" });
  await readEmptyEmbyResponse(response);
}

async function readEmbyResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`Emby 请求失败：${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function readEmptyEmbyResponse(response: Response): Promise<void> {
  if (!response.ok) {
    throw new Error(`Emby 请求失败：${response.status}`);
  }
}

function normalizeServerUrl(serverUrl: string) {
  return serverUrl.trim().replace(/\/+$/, "");
}

async function enrichSeasonSummaries(query: LibraryItemsQuery, items: MediaItem[]) {
  const candidates = items.filter(
    (item) =>
      item.type === "Season" &&
      item.seriesId &&
      item.seasonId &&
      (!isPositiveNumber(item.runtimeMinutes) || !isPositiveNumber(item.videoHeight)),
  );
  if (candidates.length === 0) {
    return items;
  }

  const enrichedById = new Map<string, MediaItem>();
  const results = await Promise.allSettled(
    candidates.map(async (item) => {
      const episodes = await fetchEpisodeItems({
        serverUrl: query.serverUrl,
        userId: query.userId,
        token: query.token,
        seriesId: item.seriesId as string,
        seasonId: item.seasonId,
      });
      enrichedById.set(item.id, seasonItemWithEpisodeSummary(item, episodes));
    }),
  );

  if (results.every((result) => result.status === "rejected")) {
    return items;
  }

  return items.map((item) => enrichedById.get(item.id) ?? item);
}

function seasonItemWithEpisodeSummary(item: MediaItem, episodes: MediaItem[]): MediaItem {
  const runtimeMinutes = sumRuntimeMinutes(episodes);
  const bestVideo = bestVideoSize([item, ...episodes]);

  return {
    ...item,
    runtimeMinutes: item.runtimeMinutes ?? runtimeMinutes,
    episodeCount: item.episodeCount ?? (episodes.length > 0 ? episodes.length : undefined),
    videoWidth: item.videoWidth ?? bestVideo.width,
    videoHeight: item.videoHeight ?? bestVideo.height,
    sizeBytes: item.sizeBytes ?? sumSizeBytes(episodes),
  };
}

function sumRuntimeMinutes(items: MediaItem[]) {
  const total = items.reduce((sum, item) => {
    const runtimeMinutes = item.runtimeMinutes;
    return sum + (isPositiveNumber(runtimeMinutes) ? runtimeMinutes : 0);
  }, 0);
  return total > 0 ? total : undefined;
}

function sumSizeBytes(items: MediaItem[]) {
  const total = items.reduce((sum, item) => {
    const sizeBytes = item.sizeBytes;
    return sum + (isPositiveNumber(sizeBytes) ? sizeBytes : 0);
  }, 0);
  return total > 0 ? total : undefined;
}

function bestVideoSize(items: MediaItem[]) {
  return items.reduce(
    (best, item) => {
      const videoHeight = item.videoHeight;
      if (!isPositiveNumber(videoHeight) || videoHeight < (best.height ?? 0)) {
        return best;
      }

      return {
        width: item.videoWidth,
        height: videoHeight,
      };
    },
    { width: undefined, height: undefined } as { width?: number; height?: number },
  );
}

function isPositiveNumber(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0;
}

function runtimeMinutesFromItem(item: EmbyItem) {
  const ticks =
    item.RunTimeTicks ??
    item.CumulativeRunTimeTicks ??
    item.MediaSources?.find((source) => source.RunTimeTicks && source.RunTimeTicks > 0)?.RunTimeTicks;
  return ticks ? Math.round(ticks / 600_000_000) : undefined;
}

function videoStreamFromItem(item: EmbyItem) {
  for (const source of item.MediaSources ?? []) {
    const videoStream = source.MediaStreams?.find((stream) => stream.Type === "Video" && (stream.Height || stream.Width));
    if (videoStream) {
      return videoStream;
    }
  }

  return undefined;
}

function sizeBytesFromItem(item: EmbyItem) {
  return item.MediaSources?.find((source) => source.Size && source.Size > 0)?.Size;
}

function dolbySupportedFromItem(item: EmbyItem) {
  return (item.MediaSources ?? []).some((source) =>
    (source.MediaStreams ?? []).some((stream) => {
      const text = [stream.Codec, stream.DisplayTitle, stream.Profile, stream.VideoRange]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return /dolby|dovi|atmos|truehd|eac3|e-ac-3|\bac3\b/.test(text);
    }),
  );
}

function primaryImageFromItem(item: EmbyItem) {
  if (item.ImageTags?.Primary) {
    return { itemId: item.Id, tag: item.ImageTags.Primary };
  }
  if (item.SeriesPrimaryImageTag && item.SeriesId) {
    return { itemId: item.SeriesId, tag: item.SeriesPrimaryImageTag };
  }
  if (item.ParentPrimaryImageTag && item.PrimaryImageItemId) {
    return { itemId: item.PrimaryImageItemId, tag: item.ParentPrimaryImageTag };
  }

  return {};
}

function backdropImageFromItem(item: EmbyItem) {
  if (item.BackdropImageTags?.[0]) {
    return { itemId: item.Id, tag: item.BackdropImageTags[0] };
  }
  if (item.ParentBackdropImageTags?.[0] && item.ParentBackdropItemId) {
    return { itemId: item.ParentBackdropItemId, tag: item.ParentBackdropImageTags[0] };
  }

  return {};
}

function isSearchResultMatch(item: MediaItem, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery || item.type === "Episode") {
    return false;
  }

  return [item.name, item.overview].some((text) => text?.toLowerCase().includes(normalizedQuery) ?? false);
}

function mergeSeasonEntries(items: MediaItem[]) {
  const seasonGroups = new Map<string, { item: MediaItem; seriesId?: string; fromDirectSeason: boolean }>();

  items.forEach((item) => {
    if (item.type !== "Episode" && item.type !== "Season") {
      return;
    }

    const key = seasonGroupKey(item);
    if (!key) {
      return;
    }

    const existing = seasonGroups.get(key);
    if (!existing) {
      seasonGroups.set(key, {
        item: seasonItemFromListItem(item),
        seriesId: item.seriesId,
        fromDirectSeason: item.type === "Season",
      });
      return;
    }

    existing.item = mergeSeasonItem(existing.item, item);
    existing.fromDirectSeason = existing.fromDirectSeason || item.type === "Season";
  });

  if (seasonGroups.size === 0) {
    return items;
  }

  const directSeasonCountBySeries = countDirectSeasonGroupsBySeries(seasonGroups);
  const groupByKey = new Map(
    [...seasonGroups].map(([key, group]) => [
      key,
      group.fromDirectSeason
        ? seasonItemWithListTitle(group.item, directSeasonCountBySeries.get(group.seriesId ?? "") ?? 0)
        : group.item,
    ]),
  );
  const seriesWithSeasonGroups = new Set(
    [...seasonGroups.values()].map((group) => group.seriesId).filter((seriesId): seriesId is string => Boolean(seriesId)),
  );
  const emittedGroups = new Set<string>();
  const result: MediaItem[] = [];

  items.forEach((item) => {
    const key = seasonGroupKey(item);
    if (key && groupByKey.has(key)) {
      if (!emittedGroups.has(key)) {
        result.push(groupByKey.get(key) as MediaItem);
        emittedGroups.add(key);
      }
      return;
    }

    if (item.type === "Series" && seriesWithSeasonGroups.has(item.id)) {
      return;
    }

    result.push(item);
  });

  return result;
}

function seasonGroupKey(item: MediaItem) {
  if (!item.seriesId) {
    return undefined;
  }

  const seasonIdentity = item.seasonId ?? item.seasonNumber;
  if (!seasonIdentity) {
    return undefined;
  }

  return `${item.seriesId}:${seasonIdentity}`;
}

function seasonItemFromListItem(item: MediaItem): MediaItem {
  if (item.type === "Season") {
    return item;
  }

  const seasonName = item.seasonNumber ? `第 ${item.seasonNumber} 季` : "季";
  return {
    ...item,
    id: item.seasonId ?? `${item.seriesId}:season:${item.seasonNumber ?? "unknown"}`,
    name: item.seriesName ? `${item.seriesName} ${seasonName}` : item.name,
    type: "Season",
    episodeCount: 1,
  };
}

function mergeSeasonItem(current: MediaItem, source: MediaItem): MediaItem {
  if (source.type === "Season") {
    return {
      ...source,
      episodeCount: source.episodeCount ?? current.episodeCount,
      runtimeMinutes: source.runtimeMinutes ?? current.runtimeMinutes,
      videoWidth: source.videoWidth ?? current.videoWidth,
      videoHeight: source.videoHeight ?? current.videoHeight,
      sizeBytes: source.sizeBytes ?? current.sizeBytes,
      progressLabel: current.progressLabel ?? source.progressLabel,
      playbackPositionTicks: current.playbackPositionTicks ?? source.playbackPositionTicks,
      playedPercentage: current.playedPercentage ?? source.playedPercentage,
      lastPlayedDate: current.lastPlayedDate ?? source.lastPlayedDate,
      backdropImageItemId: current.backdropImageItemId ?? source.backdropImageItemId,
      backdropImageTag: current.backdropImageTag ?? source.backdropImageTag,
    };
  }

  const next = { ...current };
  const currentProgressTime = progressSortTime(current);
  const sourceProgressTime = progressSortTime(source);
  if (sourceProgressTime >= currentProgressTime) {
    next.progressLabel = source.progressLabel;
    next.playbackPositionTicks = source.playbackPositionTicks;
    next.playedPercentage = source.playedPercentage;
    next.lastPlayedDate = source.lastPlayedDate;
    next.imageItemId = source.imageItemId ?? next.imageItemId;
    next.primaryImageTag = source.primaryImageTag ?? next.primaryImageTag;
    next.backdropImageItemId = source.backdropImageItemId ?? next.backdropImageItemId;
    next.backdropImageTag = source.backdropImageTag ?? next.backdropImageTag;
  }

  next.runtimeMinutes = sumRuntimeMinutes([next, source]) ?? next.runtimeMinutes;
  next.episodeCount = (next.episodeCount ?? 0) + (source.type === "Episode" ? 1 : 0);
  next.videoHeight = Math.max(next.videoHeight ?? 0, source.videoHeight ?? 0) || next.videoHeight;
  next.videoWidth = next.videoHeight === source.videoHeight ? source.videoWidth : next.videoWidth;
  return next;
}

function countDirectSeasonGroupsBySeries(
  seasonGroups: Map<string, { item: MediaItem; seriesId?: string; fromDirectSeason: boolean }>,
) {
  const counts = new Map<string, number>();
  seasonGroups.forEach((group) => {
    if (!group.fromDirectSeason || !group.seriesId) {
      return;
    }

    counts.set(group.seriesId, (counts.get(group.seriesId) ?? 0) + 1);
  });

  return counts;
}

function seasonItemWithListTitle(item: MediaItem, seriesSeasonCount: number): MediaItem {
  if (!item.seriesName) {
    return item;
  }

  if (seriesSeasonCount <= 1) {
    return { ...item, name: item.seriesName };
  }

  return {
    ...item,
    name: seasonNameIncludesSeriesName(item.name, item.seriesName)
      ? item.name
      : `${item.seriesName} ${seasonDisplayName(item)}`,
  };
}

function seasonDisplayName(item: MediaItem) {
  return item.name || (item.seasonNumber ? `第 ${item.seasonNumber} 季` : "季");
}

function seasonNameIncludesSeriesName(name: string, seriesName: string) {
  return name.trim().toLocaleLowerCase().includes(seriesName.trim().toLocaleLowerCase());
}

function episodeCountFromItem(item: EmbyItem) {
  if (item.Type === "Episode") {
    return 1;
  }

  return item.ChildCount;
}

function progressSortTime(item: MediaItem) {
  const parsedDate = item.lastPlayedDate ? Date.parse(item.lastPlayedDate) : Number.NaN;
  if (Number.isFinite(parsedDate)) {
    return parsedDate;
  }

  return item.playbackPositionTicks ?? 0;
}

function progressLabelFromItem(item: EmbyItem) {
  if (item.Type === "Episode") {
    const parts = [
      item.ParentIndexNumber ? `第 ${item.ParentIndexNumber} 季` : undefined,
      item.IndexNumber ? `第 ${item.IndexNumber} 集` : undefined,
    ].filter(Boolean);

    if (parts.length > 0) {
      return `观看到${parts.join("")}`;
    }
  }

  if (item.UserData?.PlayedPercentage && item.UserData.PlayedPercentage > 0) {
    return `已观看 ${Math.round(item.UserData.PlayedPercentage)}%`;
  }

  return undefined;
}

function subtitleTracksFromItem(item: EmbyItem): MediaSubtitleTrack[] {
  return (item.MediaSources ?? []).flatMap((source, sourceIndex) => {
    const mediaSourceId = source.Id ?? `${item.Id}-${sourceIndex}`;
    return (source.MediaStreams ?? [])
      .filter((stream) => stream.Type === "Subtitle" && stream.Index !== undefined)
      .map((stream) => ({
        id: `${mediaSourceId}:${stream.Index}`,
        mediaSourceId,
        streamIndex: stream.Index ?? 0,
        codec: stream.Codec,
        language: stream.Language,
        label: stream.DisplayTitle || subtitleLanguageLabel(stream.Language) || `字幕 ${stream.Index}`,
        isExternal: stream.IsExternal ?? false,
        isTextSubtitleStream: stream.IsTextSubtitleStream ?? true,
        supportsExternalStream: stream.SupportsExternalStream ?? true,
      }));
  });
}

export function selectPreferredSubtitleTrack(
  tracks: MediaSubtitleTrack[],
  languages: readonly string[],
) {
  if (tracks.length === 0) {
    return undefined;
  }

  const normalizedLanguages = languages.map(normalizeLanguage).filter(Boolean);
  for (const language of normalizedLanguages) {
    const matched = tracks.find((track) => subtitleLanguageMatches(track, language));
    if (matched) {
      return matched;
    }
  }

  return (
    tracks.find((track) => subtitleLanguageMatches(track, "zh")) ??
    tracks.find((track) => subtitleLanguageMatches(track, "en")) ??
    tracks[0]
  );
}

function subtitleLanguageMatches(track: MediaSubtitleTrack, language: string) {
  const normalizedTrackLanguage = normalizeLanguage(track.language);
  const normalizedLabel = track.label.toLowerCase();
  const aliases = languageAliases(language);

  if (normalizedTrackLanguage === language || aliases.includes(normalizedTrackLanguage)) {
    return true;
  }
  if (language === "zh") {
    return ["zh", "chi", "zho", "cmn"].includes(normalizedTrackLanguage) || /中文|简体|繁体|chinese/.test(normalizedLabel);
  }
  if (language === "en") {
    return ["en", "eng"].includes(normalizedTrackLanguage) || /english|英文/.test(normalizedLabel);
  }

  return normalizedTrackLanguage.startsWith(`${language}-`) || normalizedTrackLanguage.split("-")[0] === language;
}

function languageAliases(language: string) {
  switch (language.split("-")[0]) {
    case "ja":
      return ["jpn", "japanese"];
    case "ko":
      return ["kor", "korean"];
    case "fr":
      return ["fre", "fra", "french"];
    case "de":
      return ["ger", "deu", "german"];
    default:
      return [];
  }
}

function normalizeLanguage(language: string | undefined) {
  return language?.trim().toLowerCase().replace("_", "-") ?? "";
}

function subtitleLanguageLabel(language: string | undefined) {
  if (!language) {
    return undefined;
  }
  if (subtitleLanguageMatches({ id: "", mediaSourceId: "", streamIndex: 0, language, label: "" }, "zh")) {
    return "中文";
  }
  if (subtitleLanguageMatches({ id: "", mediaSourceId: "", streamIndex: 0, language, label: "" }, "en")) {
    return "英文";
  }
  return language;
}

function subtitleExtension(codec: string | undefined) {
  const normalized = codec?.trim().toLowerCase();
  if (!normalized) {
    return "srt";
  }
  if (normalized === "subrip") {
    return "srt";
  }
  if (normalized === "webvtt") {
    return "vtt";
  }
  return normalized.replace(/[^a-z0-9]/g, "") || "srt";
}
