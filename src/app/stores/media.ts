import { defineStore } from "pinia";
import { reactive } from "vue";
import { useSessionStore } from "./session";
import {
  type MediaItem,
  type MediaKind,
  type LibraryView,
  type SortBy,
  type SortOrder,
  clearItemPlaybackProgress,
  favoriteMediaItem,
  fetchMediaDetail,
  fetchEpisodeItems,
  fetchMediaItems,
  fetchLibraryItems,
  fetchLibraryViews,
  fetchSeasonItems,
  mergeMediaItemsForList,
  searchMediaItems,
  unfavoriteMediaItem,
} from "../../services/emby/media";
import { type AppError, toAppError } from "../../shared/types/app-error";

const DEFAULT_LIBRARY_PAGE_SIZE = 48;
const SEARCH_HISTORY_STORAGE_KEY = "velo:search-history";
const SEARCH_HISTORY_LIMIT = 10;

type LoadableList = {
  items: MediaItem[];
  total: number;
  loadedCount: number;
  loadingMore: boolean;
  hasMore: boolean;
  loading: boolean;
  error: AppError | null;
};

type LoadableDetail = {
  item: MediaItem | null;
  episodes: MediaItem[];
  seasons: MediaItem[];
  loading: boolean;
  error: AppError | null;
};

type LoadableViews = {
  items: LibraryView[];
  loading: boolean;
  error: AppError | null;
};

export const useMediaStore = defineStore("media", () => {
  let loadedViewsSessionKey: string | null = null;
  let loadingViewsSessionKey: string | null = null;
  const views = reactive<LoadableViews>({
    items: [],
    loading: false,
    error: null,
  });
  const library = reactive<LoadableList>({
    items: [],
    total: 0,
    loadedCount: 0,
    loadingMore: false,
    hasMore: false,
    loading: false,
    error: null,
  });
  const search = reactive<LoadableList>({
    items: [],
    total: 0,
    loadedCount: 0,
    loadingMore: false,
    hasMore: false,
    loading: false,
    error: null,
  });
  const searchHistory = reactive<string[]>(loadSearchHistory());
  const detail = reactive<LoadableDetail>({
    item: null,
    episodes: [],
    seasons: [],
    loading: false,
    error: null,
  });

  async function loadLibrary(
    kind: MediaKind,
    options: { sortBy?: SortBy; sortOrder?: SortOrder; searchTerm?: string; startIndex?: number; limit?: number } = {},
  ) {
    const context = requireSession();
    if (!context) {
      setListError(library, sessionRequiredError());
      return;
    }

    setListLoading(library);
    try {
      const result = await fetchMediaItems({
        ...context,
        kind,
        searchTerm: options.searchTerm,
        sortBy: options.sortBy,
        sortOrder: options.sortOrder,
        startIndex: options.startIndex ?? 0,
        limit: options.limit ?? DEFAULT_LIBRARY_PAGE_SIZE,
      });
      replaceListItems(library, result);
    } catch (caught) {
      setListError(library, toAppError(caught));
    } finally {
      library.loading = false;
    }
  }

  async function loadNextLibraryPage(
    kind: MediaKind,
    options: { sortBy?: SortBy; sortOrder?: SortOrder; searchTerm?: string; limit?: number } = {},
  ) {
    const context = requireSession();
    if (!context) {
      setListError(library, sessionRequiredError());
      return;
    }
    if (!canLoadNextPage(library)) {
      return;
    }

    library.loadingMore = true;
    library.error = null;
    try {
      const result = await fetchMediaItems({
        ...context,
        kind,
        searchTerm: options.searchTerm,
        sortBy: options.sortBy,
        sortOrder: options.sortOrder,
        startIndex: library.loadedCount,
        limit: options.limit ?? DEFAULT_LIBRARY_PAGE_SIZE,
      });
      appendListItems(library, result);
    } catch (caught) {
      library.error = toAppError(caught);
    } finally {
      library.loadingMore = false;
    }
  }

  async function loadViews() {
    const context = requireSession();
    if (!context) {
      views.items = [];
      views.error = sessionRequiredError();
      loadedViewsSessionKey = null;
      loadingViewsSessionKey = null;
      return;
    }
    const sessionKey = viewSessionKey(context);
    if (loadedViewsSessionKey === sessionKey || (views.loading && loadingViewsSessionKey === sessionKey)) {
      return;
    }

    views.loading = true;
    loadingViewsSessionKey = sessionKey;
    views.error = null;
    try {
      views.items = await fetchLibraryViews(context);
      loadedViewsSessionKey = sessionKey;
    } catch (caught) {
      views.items = [];
      views.error = toAppError(caught);
      loadedViewsSessionKey = null;
    } finally {
      views.loading = false;
      loadingViewsSessionKey = null;
    }
  }

  async function loadLibraryView(
    parentId: string,
    options: {
      collectionType?: string | null;
      searchTerm?: string;
      sortBy?: SortBy;
      sortOrder?: SortOrder;
      startIndex?: number;
      limit?: number;
    } = {},
  ) {
    const context = requireSession();
    if (!context) {
      setListError(library, sessionRequiredError());
      return;
    }

    setListLoading(library);
    try {
      const result = await fetchLibraryItems({
        ...context,
        parentId,
        collectionType: options.collectionType,
        searchTerm: options.searchTerm,
        sortBy: options.sortBy,
        sortOrder: options.sortOrder,
        startIndex: options.startIndex ?? 0,
        limit: options.limit ?? DEFAULT_LIBRARY_PAGE_SIZE,
      });
      replaceListItems(library, result);
    } catch (caught) {
      setListError(library, toAppError(caught));
    } finally {
      library.loading = false;
    }
  }

  async function loadNextLibraryViewPage(
    parentId: string,
    options: {
      collectionType?: string | null;
      searchTerm?: string;
      sortBy?: SortBy;
      sortOrder?: SortOrder;
      limit?: number;
    } = {},
  ) {
    const context = requireSession();
    if (!context) {
      setListError(library, sessionRequiredError());
      return;
    }
    if (!canLoadNextPage(library)) {
      return;
    }

    library.loadingMore = true;
    library.error = null;
    try {
      const result = await fetchLibraryItems({
        ...context,
        parentId,
        collectionType: options.collectionType,
        searchTerm: options.searchTerm,
        sortBy: options.sortBy,
        sortOrder: options.sortOrder,
        startIndex: library.loadedCount,
        limit: options.limit ?? DEFAULT_LIBRARY_PAGE_SIZE,
      });
      appendListItems(library, result);
    } catch (caught) {
      library.error = toAppError(caught);
    } finally {
      library.loadingMore = false;
    }
  }

  async function runSearch(query: string) {
    const context = requireSession();
    if (!context) {
      setListError(search, sessionRequiredError());
      return;
    }

    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      return;
    }

    setListLoading(search);
    try {
      const result = await searchMediaItems({ ...context, query: normalizedQuery });
      search.items = result.items;
      search.total = result.total;
      search.loadedCount = result.rawItemCount;
      search.hasMore = false;
      recordSearchHistory(searchHistory, normalizedQuery);
    } catch (caught) {
      setListError(search, toAppError(caught));
    } finally {
      search.loading = false;
    }
  }

  async function loadDetail(itemId: string) {
    const context = requireSession();
    if (!context) {
      detail.item = null;
      detail.error = sessionRequiredError();
      return;
    }

    detail.loading = true;
    detail.error = null;
    try {
      const item = await fetchMediaDetail(context.serverUrl, context.userId, context.token, itemId);
      detail.item = item;
      const [episodes, seasons] = await Promise.all([
        loadEpisodesForItem(context, item),
        loadSeasonsForItem(context, item),
      ]);
      detail.episodes = episodes;
      detail.seasons = seasons;
    } catch (caught) {
      detail.error = toAppError(caught);
      detail.item = null;
      detail.episodes = [];
      detail.seasons = [];
    } finally {
      detail.loading = false;
    }
  }

  async function toggleDetailFavorite() {
    const context = requireSession();
    const item = detail.item;
    if (!context || !item) {
      return;
    }

    const nextFavoriteState = !item.isFavorite;
    if (nextFavoriteState) {
      await favoriteMediaItem({
        ...context,
        itemId: item.id,
      });
    } else {
      await unfavoriteMediaItem({
        ...context,
        itemId: item.id,
      });
    }

    detail.item = {
      ...item,
      isFavorite: nextFavoriteState,
    };
  }

  return {
    detail,
    library,
    search,
    searchHistory,
    views,
    loadDetail,
    loadLibrary,
    loadLibraryView,
    loadNextLibraryPage,
    loadNextLibraryViewPage,
    loadViews,
    toggleDetailFavorite,
    runSearch,
  };
});

function requireSession() {
  const session = useSessionStore().activeSession;
  if (!session) {
    return null;
  }

  return {
    serverUrl: session.server.url,
    userId: session.account.id,
    token: session.accessToken,
  };
}

function viewSessionKey(context: { serverUrl: string; userId: string; token: string }) {
  return `${context.serverUrl}|${context.userId}|${context.token}`;
}

async function loadEpisodesForItem(
  context: { serverUrl: string; userId: string; token: string },
  item: MediaItem,
) {
  const seriesId = item.type === "Series" ? item.id : item.seriesId;
  if (!seriesId) {
    return [];
  }

  const episodes = await fetchEpisodeItems({
    ...context,
    seriesId,
    seasonId: item.type === "Episode" || item.type === "Season" ? item.seasonId : undefined,
  });
  return dedupeEpisodePlaybackProgress(context, episodes);
}

async function loadSeasonsForItem(
  context: { serverUrl: string; userId: string; token: string },
  item: MediaItem,
) {
  const seriesId = item.type === "Series" ? item.id : item.seriesId;
  if (!seriesId) {
    return [];
  }

  return fetchSeasonItems({
    ...context,
    seriesId,
  });
}

async function dedupeEpisodePlaybackProgress(
  context: { serverUrl: string; userId: string; token: string },
  episodes: MediaItem[],
) {
  const olderIds = findOlderProgressEpisodeIds(episodes);
  if (olderIds.size === 0) {
    return episodes;
  }

  await Promise.allSettled(
    [...olderIds].map((itemId) =>
      clearItemPlaybackProgress({
        ...context,
        itemId,
      }),
    ),
  );

  return episodes.map((episode) => (olderIds.has(episode.id) ? clearEpisodeProgress(episode) : episode));
}

function findOlderProgressEpisodeIds(episodes: MediaItem[]) {
  const groups = new Map<string, MediaItem[]>();
  episodes.filter(hasPlaybackProgress).forEach((episode) => {
    const key = episodeProgressGroupKey(episode);
    groups.set(key, [...(groups.get(key) ?? []), episode]);
  });

  const olderIds = new Set<string>();
  groups.forEach((items) => {
    if (items.length < 2) {
      return;
    }

    const latest = items.reduce((current, item) =>
      progressSortTime(item) >= progressSortTime(current) ? item : current,
    );
    items.forEach((item) => {
      if (item.id !== latest.id) {
        olderIds.add(item.id);
      }
    });
  });

  return olderIds;
}

function hasPlaybackProgress(item: MediaItem) {
  return Boolean(item.playbackPositionTicks && item.playbackPositionTicks > 0);
}

function episodeProgressGroupKey(item: MediaItem) {
  return `${item.seriesId ?? "unknown-series"}:${item.seasonId ?? item.seasonNumber ?? "unknown-season"}`;
}

function clearEpisodeProgress(item: MediaItem): MediaItem {
  return {
    ...item,
    playbackPositionTicks: undefined,
    playedPercentage: undefined,
    lastPlayedDate: undefined,
    progressLabel: undefined,
  };
}

function progressSortTime(item: MediaItem) {
  const parsedDate = item.lastPlayedDate ? Date.parse(item.lastPlayedDate) : Number.NaN;
  if (Number.isFinite(parsedDate)) {
    return parsedDate;
  }

  return item.playbackPositionTicks ?? 0;
}

function setListLoading(list: LoadableList) {
  list.items = [];
  list.total = 0;
  list.loadedCount = 0;
  list.loadingMore = false;
  list.hasMore = false;
  list.loading = true;
  list.error = null;
}

function setListError(list: LoadableList, error: AppError) {
  list.items = [];
  list.total = 0;
  list.loadedCount = 0;
  list.loadingMore = false;
  list.hasMore = false;
  list.error = error;
  list.loading = false;
}

function replaceListItems(list: LoadableList, result: { items: MediaItem[]; total: number; rawItemCount: number }) {
  list.items = result.items;
  list.total = result.total;
  list.loadedCount = result.rawItemCount;
  list.hasMore = result.rawItemCount > 0 && result.rawItemCount < result.total;
}

function appendListItems(list: LoadableList, result: { items: MediaItem[]; total: number; rawItemCount: number }) {
  list.items = mergeMediaItemsForList(dedupeById([...list.items, ...result.items]));
  list.total = result.total;
  list.loadedCount += result.rawItemCount;
  list.hasMore = result.rawItemCount > 0 && list.loadedCount < result.total;
}

function canLoadNextPage(list: LoadableList) {
  return list.hasMore && !list.loading && !list.loadingMore;
}

function dedupeById(items: MediaItem[]) {
  const byId = new Map<string, MediaItem>();
  items.forEach((item) => {
    byId.set(item.id, { ...byId.get(item.id), ...item });
  });
  return [...byId.values()];
}

function loadSearchHistory() {
  if (typeof localStorage === "undefined") {
    return [];
  }

  try {
    const parsed = JSON.parse(localStorage.getItem(SEARCH_HISTORY_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function recordSearchHistory(history: string[], query: string) {
  const next = [query, ...history.filter((item) => item !== query)].slice(0, SEARCH_HISTORY_LIMIT);
  history.splice(0, history.length, ...next);
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(SEARCH_HISTORY_STORAGE_KEY, JSON.stringify(next));
  }
}

function sessionRequiredError(): AppError {
  return {
    code: "session_required",
    message: "请先选择服务器并登录账号。",
    recoverable: true,
  };
}
