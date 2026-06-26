import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { useSessionStore } from "./session";
import {
  type MediaSubtitleTrack,
  buildSubtitleStreamUrl,
  selectPreferredSubtitleTrack,
} from "../../services/emby/media";
import {
  type PlaybackBufferProfile,
  type PlaybackRuntimeStatus,
  type StartPlaybackResult,
  clearPlaybackCache,
  disableSubtitle,
  getPlaybackCacheStatus,
  getPlaybackStatus,
  loadSubtitle,
  pausePlayback,
  reportPlaybackProgress,
  resumePlayback,
  seekPlayback,
  selectEmbeddedSubtitle,
  setPlaybackBufferProfile,
  setPlaybackFullscreen,
  setPlaybackMuted,
  setPlaybackRate,
  setPlaybackVolume,
  startPlayback,
  stopPlayback,
} from "../../services/playback/playback";
import { type AppError, toAppError } from "../../shared/types/app-error";

const DEFAULT_INTRO_SKIP_SECONDS = 90;
const DEFAULT_OUTRO_REMAINING_SECONDS = 30;
const STATUS_POLL_INTERVAL_MS = 500;
const CACHE_STATUS_REFRESH_INTERVAL_MS = 5000;
const PLAYBACK_PROGRESS_REPORT_STEP_SECONDS = 10;

type PlaybackPhase = "idle" | "creatingKernel" | "loadingVideo" | "playing" | "failed" | "stopping";

type PlaybackMetadata = {
  durationSeconds?: number;
  initialPositionSeconds?: number;
  title?: string;
  subtitles?: MediaSubtitleTrack[];
  subtitleLanguages?: readonly string[];
  episodes?: PlaybackEpisode[];
};

export type PlaybackEpisode = {
  itemId: string;
  title: string;
  durationSeconds?: number;
  initialPositionSeconds?: number;
  imageUrl?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  subtitles?: MediaSubtitleTrack[];
};

type PlaybackSnapshot = {
  current: StartPlaybackResult;
  phase: PlaybackPhase;
  loadingDetail: string;
  paused: boolean;
  positionSeconds: number;
  seekReady: boolean;
  durationSeconds: number | null;
  mediaTitle: string;
  rate: number;
  volume: number;
  muted: boolean;
  fullscreen: boolean;
  subtitleTracks: MediaSubtitleTrack[];
  episodes: PlaybackEpisode[];
  selectedSubtitleId: string | null;
  pendingSubtitleId: string | null;
  pendingSeekSeconds: number | null;
};

export const usePlaybackStore = defineStore("playback", () => {
  const current = ref<StartPlaybackResult | null>(null);
  const loading = ref(false);
  const error = ref<AppError | null>(null);
  const phase = ref<PlaybackPhase>("idle");
  const loadingDetail = ref("");
  const paused = ref(false);
  const positionSeconds = ref(0);
  const seekReady = ref(false);
  const durationSeconds = ref<number | null>(null);
  const mediaTitle = ref("");
  const seekPreviewSeconds = ref<number | null>(null);
  const pendingSeekSeconds = ref<number | null>(null);
  const rate = ref(1);
  const volume = ref(100);
  const muted = ref(false);
  const fullscreen = ref(false);
  const subtitleTracks = ref<MediaSubtitleTrack[]>([]);
  const episodes = ref<PlaybackEpisode[]>([]);
  const selectedSubtitleId = ref<string | null>(null);
  const pendingSubtitleId = ref<string | null>(null);
  const cacheSizeBytes = ref(0);
  const cachePath = ref("");
  const cacheLoading = ref(false);
  let statusPollTimer: ReturnType<typeof setInterval> | null = null;
  let statusPollGeneration = 0;
  let statusPollInFlightGeneration: number | null = null;
  let pendingSeekInFlight = false;
  let appliedBufferProfile: PlaybackBufferProfile | null = null;
  let lastCacheStatusRefreshAt = 0;
  let lastReportedProgressSeconds = 0;
  let volumeBeforeMute = 100;
  const playbackVisible = computed(() => current.value !== null);
  const playing = computed(() => current.value !== null && !error.value && phase.value !== "failed");
  const cacheSizeLabel = computed(() => formatBytes(cacheSizeBytes.value));
  const currentEpisodeIndex = computed(() =>
    current.value === null ? -1 : episodes.value.findIndex((episode) => episode.itemId === current.value?.itemId),
  );
  const hasPreviousEpisode = computed(() => currentEpisodeIndex.value > 0);
  const hasNextEpisode = computed(
    () => currentEpisodeIndex.value >= 0 && currentEpisodeIndex.value < episodes.value.length - 1,
  );
  const seekPreviewLabel = computed(() => {
    if (seekPreviewSeconds.value === null) {
      return "";
    }

    const target = formatDuration(seekPreviewSeconds.value);
    if (durationSeconds.value === null) {
      return target;
    }

    return `${target} / -${formatDuration(durationSeconds.value - seekPreviewSeconds.value)}`;
  });

  async function playItem(itemId: string, options: PlaybackMetadata & { mediaSourceId?: string } = {}) {
    const session = useSessionStore().activeSession;
    if (!session) {
      current.value = null;
      error.value = sessionRequiredError();
      return;
    }

    const previousPlayback = current.value === null ? null : capturePlaybackSnapshot();
    loading.value = true;
    error.value = null;
    phase.value = "creatingKernel";
    loadingDetail.value = "正在创建播放内核";
    try {
      current.value = await startPlayback({
        serverId: session.server.id,
        userId: session.account.id,
        itemId,
        mediaSourceId: options.mediaSourceId,
      });
      paused.value = false;
      positionSeconds.value = 0;
      seekReady.value = false;
      setPlaybackMetadata(options);
      applyInitialPosition(options.initialPositionSeconds);
      rate.value = 1;
      phase.value = "loadingVideo";
      loadingDetail.value = "正在加载视频";
      await applyBufferProfile("startup");
      startStatusPolling();
      await trySelectDefaultSubtitle({
        serverUrl: session.server.url,
        token: session.accessToken,
        itemId,
        mediaSourceId: current.value.mediaSourceId,
        tracks: options.subtitles ?? [],
        languages: options.subtitleLanguages ?? systemSubtitleLanguages(),
      });
      void refreshCacheStatus();
    } catch (caught) {
      const appError = toAppError(caught);
      if (previousPlayback && appError.code === "playback_source_unavailable") {
        restorePlaybackSnapshot(previousPlayback);
        error.value = appError;
      } else {
        current.value = null;
        error.value = appError;
        phase.value = "failed";
        loadingDetail.value = "";
        stopStatusPolling();
      }
    } finally {
      loading.value = false;
    }
  }

  async function stop() {
    const finalPositionSeconds = current.value === null ? undefined : positionSeconds.value;
    loading.value = true;
    error.value = null;
    phase.value = "stopping";
    stopStatusPolling();
    hidePlaybackView();
    try {
      await stopPlayback(finalPositionSeconds);
      phase.value = "idle";
      void refreshCacheStatus();
    } catch (caught) {
      error.value = toAppError(caught);
      phase.value = "failed";
    } finally {
      loading.value = false;
    }
  }

  async function pause() {
    try {
      await pausePlayback();
      paused.value = true;
    } catch (caught) {
      error.value = toAppError(caught);
    }
  }

  async function resume() {
    try {
      await resumePlayback();
      paused.value = false;
    } catch (caught) {
      error.value = toAppError(caught);
    }
  }

  async function seek(position: number) {
    const target = clampPosition(position);
    if (current.value && !seekReady.value) {
      pendingSeekSeconds.value = target;
      positionSeconds.value = target;
      error.value = null;
      return;
    }

    try {
      await seekPlayback(target);
      positionSeconds.value = target;
      pendingSeekSeconds.value = null;
      error.value = null;
    } catch (caught) {
      const appError = toAppError(caught);
      if (current.value && isLoadingPlaybackCommandError(appError, phase.value)) {
        deferSeekUntilVideoReady(target);
        return;
      }

      error.value = appError;
    }
  }

  async function setRate(nextRate: number) {
    try {
      await setPlaybackRate(nextRate);
      rate.value = nextRate;
    } catch (caught) {
      error.value = toAppError(caught);
    }
  }

  async function setVolume(nextVolume: number) {
    const clamped = Math.min(100, Math.max(0, Math.round(nextVolume)));
    try {
      await setPlaybackVolume(clamped);
      volume.value = clamped;
      if (clamped > 0) {
        volumeBeforeMute = clamped;
      }
    } catch (caught) {
      error.value = toAppError(caught);
    }
  }

  async function setMuted(nextMuted: boolean) {
    const restoreVolume = Math.max(1, volumeBeforeMute);
    try {
      if (nextMuted) {
        volumeBeforeMute = volume.value > 0 ? volume.value : volumeBeforeMute;
        await setPlaybackMuted(true);
        await setPlaybackVolume(0);
        volume.value = 0;
        muted.value = true;
        return;
      }

      await setPlaybackMuted(false);
      await setPlaybackVolume(restoreVolume);
      volume.value = restoreVolume;
      muted.value = false;
    } catch (caught) {
      error.value = toAppError(caught);
    }
  }

  async function setFullscreen(nextFullscreen: boolean) {
    try {
      await setPlaybackFullscreen(nextFullscreen);
      fullscreen.value = nextFullscreen;
    } catch (caught) {
      error.value = toAppError(caught);
    }
  }

  async function playPreviousEpisode() {
    if (!hasPreviousEpisode.value) {
      return;
    }

    await playEpisodeAt(currentEpisodeIndex.value - 1);
  }

  async function playNextEpisode() {
    if (!hasNextEpisode.value) {
      return;
    }

    await playEpisodeAt(currentEpisodeIndex.value + 1);
  }

  async function playEpisode(itemId: string) {
    const index = episodes.value.findIndex((episode) => episode.itemId === itemId);
    if (index < 0) {
      return;
    }

    await playEpisodeAt(index);
  }

  async function selectSubtitle(subtitleId: string | null) {
    const previousSubtitleId = selectedSubtitleId.value;
    if (subtitleId === null) {
      try {
        pendingSubtitleId.value = "off";
        await disableSubtitle();
        selectedSubtitleId.value = null;
      } catch (caught) {
        error.value = toAppError(caught);
        selectedSubtitleId.value = previousSubtitleId;
      } finally {
        pendingSubtitleId.value = null;
      }
      return;
    }

    const session = useSessionStore().activeSession;
    const selected = subtitleTracks.value.find((track) => track.id === subtitleId);
    if (!session || !current.value || !selected || selected.mediaSourceId !== current.value.mediaSourceId) {
      return;
    }

    try {
      pendingSubtitleId.value = subtitleId;
      await applySubtitleTrack(current.value.itemId, session.server.url, session.accessToken, selected);
      selectedSubtitleId.value = subtitleId;
    } catch (caught) {
      selectedSubtitleId.value = previousSubtitleId;
      error.value = toAppError(caught);
    } finally {
      pendingSubtitleId.value = null;
    }
  }

  async function refreshCacheStatus() {
    try {
      const status = await getPlaybackCacheStatus();
      cacheSizeBytes.value = status.sizeBytes;
      cachePath.value = status.path;
    } catch (caught) {
      error.value = toAppError(caught);
    }
  }

  async function clearCache() {
    cacheLoading.value = true;
    try {
      const status = await clearPlaybackCache();
      cacheSizeBytes.value = status.sizeBytes;
      cachePath.value = status.path;
    } catch (caught) {
      error.value = toAppError(caught);
    } finally {
      cacheLoading.value = false;
    }
  }

  async function refreshStatus() {
    if (!current.value) {
      return;
    }
    const generation = statusPollGeneration;
    if (statusPollInFlightGeneration === generation) {
      return;
    }

    statusPollInFlightGeneration = generation;
    try {
      const status = await getPlaybackStatus();
      if (generation !== statusPollGeneration || !current.value) {
        return;
      }

      applyRuntimeStatus(status);
      await flushPendingSeekIfReady(status);
      refreshCacheStatusIfNeeded();
    } catch (caught) {
      if (generation !== statusPollGeneration || !current.value) {
        return;
      }

      // 播放内核在切片切换、缓冲或 seek 时可能短暂无法返回状态。
      // 这类同步失败不能直接关闭控制能力，否则会表现为按钮和快捷键失效。
      error.value = null;
      loadingDetail.value = "播放状态同步暂不可用";
      if (phase.value === "playing") {
        return;
      }
      phase.value = "loadingVideo";
    } finally {
      if (statusPollInFlightGeneration === generation) {
        statusPollInFlightGeneration = null;
      }
    }
  }

  function setPlaybackMetadata(metadata: PlaybackMetadata) {
    durationSeconds.value =
      metadata.durationSeconds === undefined ? null : Math.max(0, Math.round(metadata.durationSeconds));
    mediaTitle.value = metadata.title ?? "";
    episodes.value = metadata.episodes ?? [];
  }

  async function skipIntro() {
    await seek(Math.min(DEFAULT_INTRO_SKIP_SECONDS, durationSeconds.value ?? DEFAULT_INTRO_SKIP_SECONDS));
  }

  async function skipOutro() {
    if (durationSeconds.value === null) {
      return;
    }

    await seek(Math.max(0, durationSeconds.value - DEFAULT_OUTRO_REMAINING_SECONDS));
  }

  function beginSeekPreview() {
    seekPreviewSeconds.value = positionSeconds.value;
  }

  function updateSeekPreview(position: number) {
    seekPreviewSeconds.value = clampPosition(position);
  }

  async function commitSeekPreview() {
    if (seekPreviewSeconds.value === null) {
      return;
    }

    const target = seekPreviewSeconds.value;
    clearPreview();
    await seek(target);
  }

  function cancelSeekPreview() {
    clearPreview();
  }

  return {
    current,
    cacheLoading,
    cachePath,
    cacheSizeBytes,
    cacheSizeLabel,
    durationSeconds,
    error,
    loadingDetail,
    fullscreen,
    episodes,
    currentEpisodeIndex,
    hasNextEpisode,
    hasPreviousEpisode,
    loading,
    mediaTitle,
    muted,
    paused,
    phase,
    playbackVisible,
    playing,
    positionSeconds,
    rate,
    selectedSubtitleId,
    seekReady,
    pendingSubtitleId,
    pendingSeekSeconds,
    seekPreviewLabel,
    seekPreviewSeconds,
    subtitleTracks,
    volume,
    beginSeekPreview,
    cancelSeekPreview,
    clearCache,
    commitSeekPreview,
    pause,
    playItem,
    playEpisode,
    playNextEpisode,
    playPreviousEpisode,
    refreshStatus,
    refreshCacheStatus,
    resume,
    seek,
    setPlaybackMetadata,
    setFullscreen,
    setMuted,
    setRate,
    selectSubtitle,
    setVolume,
    skipIntro,
    skipOutro,
    stop,
    updateSeekPreview,
  };

  function clampPosition(position: number) {
    const safePosition = Math.max(0, Math.round(position));
    if (durationSeconds.value === null) {
      return safePosition;
    }

    return Math.min(durationSeconds.value, safePosition);
  }

  function clearPreview() {
    seekPreviewSeconds.value = null;
  }

  function hidePlaybackView() {
    current.value = null;
    paused.value = false;
    fullscreen.value = false;
    positionSeconds.value = 0;
    seekReady.value = false;
    clearPreview();
    setPlaybackMetadata({});
    subtitleTracks.value = [];
    episodes.value = [];
    selectedSubtitleId.value = null;
    pendingSubtitleId.value = null;
    pendingSeekSeconds.value = null;
    pendingSeekInFlight = false;
    appliedBufferProfile = null;
    lastReportedProgressSeconds = 0;
    loadingDetail.value = "";
  }

  function capturePlaybackSnapshot(): PlaybackSnapshot {
    return {
      current: current.value as StartPlaybackResult,
      phase: phase.value,
      loadingDetail: loadingDetail.value,
      paused: paused.value,
      positionSeconds: positionSeconds.value,
      seekReady: seekReady.value,
      durationSeconds: durationSeconds.value,
      mediaTitle: mediaTitle.value,
      rate: rate.value,
      volume: volume.value,
      muted: muted.value,
      fullscreen: fullscreen.value,
      subtitleTracks: [...subtitleTracks.value],
      episodes: [...episodes.value],
      selectedSubtitleId: selectedSubtitleId.value,
      pendingSubtitleId: pendingSubtitleId.value,
      pendingSeekSeconds: pendingSeekSeconds.value,
    };
  }

  function restorePlaybackSnapshot(snapshot: PlaybackSnapshot) {
    current.value = snapshot.current;
    phase.value = snapshot.phase;
    loadingDetail.value = snapshot.loadingDetail;
    paused.value = snapshot.paused;
    positionSeconds.value = snapshot.positionSeconds;
    seekReady.value = snapshot.seekReady;
    durationSeconds.value = snapshot.durationSeconds;
    mediaTitle.value = snapshot.mediaTitle;
    rate.value = snapshot.rate;
    volume.value = snapshot.volume;
    muted.value = snapshot.muted;
    fullscreen.value = snapshot.fullscreen;
    subtitleTracks.value = snapshot.subtitleTracks;
    episodes.value = snapshot.episodes;
    selectedSubtitleId.value = snapshot.selectedSubtitleId;
    pendingSubtitleId.value = snapshot.pendingSubtitleId;
    pendingSeekSeconds.value = snapshot.pendingSeekSeconds;
  }

  async function playEpisodeAt(index: number) {
    const episode = episodes.value[index];
    if (!episode) {
      return;
    }

    const queue = episodes.value;
    await playItem(episode.itemId, {
      title: episode.title,
      durationSeconds: episode.durationSeconds,
      initialPositionSeconds: episode.initialPositionSeconds,
      subtitles: episode.subtitles ?? [],
      episodes: queue,
    });
  }

  async function trySelectDefaultSubtitle(options: {
    serverUrl: string;
    token: string;
    itemId: string;
    mediaSourceId: string;
    tracks: MediaSubtitleTrack[];
    languages: readonly string[];
  }) {
    subtitleTracks.value = options.tracks.filter((track) => track.mediaSourceId === options.mediaSourceId);
    const preferred = selectPreferredSubtitleTrack(subtitleTracks.value, options.languages);

    if (!preferred) {
      selectedSubtitleId.value = null;
      return;
    }

    try {
      await applySubtitleTrack(options.itemId, options.serverUrl, options.token, preferred);
      selectedSubtitleId.value = preferred.id;
    } catch {
      // 默认字幕加载失败不应打断已经启动的视频播放，用户仍可稍后手动选择字幕。
      selectedSubtitleId.value = null;
    } finally {
      pendingSubtitleId.value = null;
    }
  }

  function applyRuntimeStatus(status: PlaybackRuntimeStatus) {
    paused.value = status.paused;
    updateDurationFromStatus(status.durationSeconds);
    positionSeconds.value = clampPosition(status.positionSeconds);
    seekReady.value = status.coreReady && status.mediaLoaded && !status.pausedForCache;

    if (!status.coreReady) {
      phase.value = "creatingKernel";
      loadingDetail.value = "正在创建播放内核";
      return;
    }

    if (!status.mediaLoaded || status.pausedForCache || positionSeconds.value === 0) {
      phase.value = "loadingVideo";
      loadingDetail.value = formatLoadingDetail(status.cacheSpeedBytesPerSecond);
      return;
    }

    phase.value = "playing";
    loadingDetail.value = "";
    void applyBufferProfile("steady");
    reportProgressIfNeeded(status);
  }

  function updateDurationFromStatus(nextDurationSeconds: number | null | undefined) {
    if (
      nextDurationSeconds === null ||
      nextDurationSeconds === undefined ||
      !Number.isFinite(nextDurationSeconds) ||
      nextDurationSeconds <= 0
    ) {
      return;
    }

    durationSeconds.value = Math.round(nextDurationSeconds);
  }

  function applyInitialPosition(initialPositionSeconds: number | undefined) {
    if (initialPositionSeconds === undefined || !Number.isFinite(initialPositionSeconds) || initialPositionSeconds <= 0) {
      return;
    }

    const target = clampPosition(initialPositionSeconds);
    positionSeconds.value = target;
    pendingSeekSeconds.value = target;
    lastReportedProgressSeconds = target;
  }

  function reportProgressIfNeeded(status: PlaybackRuntimeStatus) {
    if (!current.value || status.paused || status.pausedForCache || !status.mediaLoaded) {
      return;
    }

    const currentPosition = Math.max(0, Math.round(status.positionSeconds));
    if (currentPosition - lastReportedProgressSeconds < PLAYBACK_PROGRESS_REPORT_STEP_SECONDS) {
      return;
    }

    lastReportedProgressSeconds = currentPosition;
    void reportPlaybackProgress({
      positionSeconds: currentPosition,
      isPaused: status.paused,
    }).catch(() => {
      // 进度上报失败不应影响本地播放控制，停止播放时仍会再上报最终进度。
    });
  }

  async function applyBufferProfile(profile: PlaybackBufferProfile) {
    if (!current.value || appliedBufferProfile === profile) {
      return;
    }

    try {
      await setPlaybackBufferProfile(profile);
      appliedBufferProfile = profile;
    } catch (caught) {
      error.value = toAppError(caught);
    }
  }

  async function applySubtitleTrack(
    itemId: string,
    serverUrl: string,
    token: string,
    track: MediaSubtitleTrack,
  ) {
    if (track.isExternal === false) {
      await selectEmbeddedSubtitle(track.streamIndex);
      return;
    }

    await loadSubtitle(
      buildSubtitleStreamUrl({
        serverUrl,
        token,
        itemId,
        mediaSourceId: track.mediaSourceId,
        streamIndex: track.streamIndex,
        codec: track.codec,
      }),
    );
  }

  function startStatusPolling() {
    stopStatusPolling();
    statusPollGeneration += 1;
    lastCacheStatusRefreshAt = 0;
    statusPollTimer = setInterval(() => {
      void refreshStatus();
    }, STATUS_POLL_INTERVAL_MS);
  }

  function stopStatusPolling() {
    statusPollGeneration += 1;
    if (statusPollTimer === null) {
      return;
    }

    clearInterval(statusPollTimer);
    statusPollTimer = null;
  }

  function refreshCacheStatusIfNeeded() {
    const now = Date.now();
    if (now - lastCacheStatusRefreshAt < CACHE_STATUS_REFRESH_INTERVAL_MS) {
      return;
    }

    lastCacheStatusRefreshAt = now;
    void refreshCacheStatus();
  }

  async function flushPendingSeekIfReady(status: PlaybackRuntimeStatus) {
    if (pendingSeekInFlight || pendingSeekSeconds.value === null) {
      return;
    }
    if (!status.coreReady || !status.mediaLoaded || status.pausedForCache || !current.value) {
      return;
    }

    pendingSeekInFlight = true;
    const target = pendingSeekSeconds.value;
    try {
      await seekPlayback(target);
      positionSeconds.value = target;
      pendingSeekSeconds.value = null;
      error.value = null;
    } catch (caught) {
      const appError = toAppError(caught);
      if (isLoadingPlaybackCommandError(appError, phase.value)) {
        deferSeekUntilVideoReady(target);
        return;
      }

      error.value = appError;
    } finally {
      pendingSeekInFlight = false;
    }
  }

  function deferSeekUntilVideoReady(target: number) {
    pendingSeekSeconds.value = target;
    positionSeconds.value = target;
    error.value = null;
    phase.value = "loadingVideo";
    loadingDetail.value = "正在等待视频加载";
  }
});

function sessionRequiredError(): AppError {
  return {
    code: "session_required",
    message: "请先选择服务器并登录账号。",
    recoverable: true,
  };
}

function isLoadingPlaybackCommandError(error: AppError, phase: PlaybackPhase) {
  return (
    error.code === "libmpv_command_failed" &&
    (phase === "creatingKernel" || phase === "loadingVideo")
  );
}

function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  const minuteSecond = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;

  if (hours === 0) {
    return minuteSecond;
  }

  return `${hours}:${minuteSecond}`;
}

function formatLoadingDetail(bytesPerSecond: number | null) {
  if (bytesPerSecond === null || !Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) {
    return "正在等待视频数据";
  }

  const mibPerSecond = bytesPerSecond / 1024 / 1024;
  if (mibPerSecond >= 1) {
    return `下行速度 ${mibPerSecond.toFixed(1)} MB/s`;
  }

  return `下行速度 ${(bytesPerSecond / 1024).toFixed(0)} KB/s`;
}

function systemSubtitleLanguages() {
  if (typeof navigator === "undefined") {
    return ["zh-CN", "en-US"];
  }

  return navigator.languages.length > 0 ? navigator.languages : [navigator.language];
}

function formatBytes(bytes: number) {
  const safeBytes = Math.max(0, Math.round(bytes));
  const mib = safeBytes / 1024 / 1024;
  if (mib >= 1) {
    return `${mib.toFixed(1)} MB`;
  }

  return `${Math.round(safeBytes / 1024)} KB`;
}
