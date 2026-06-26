import { invoke } from "@tauri-apps/api/core";

export type StartPlaybackRequest = {
  serverId: string;
  userId: string;
  itemId: string;
  mediaSourceId?: string;
};

export type StartPlaybackResult = {
  itemId: string;
  mediaSourceId: string;
  playMethod: "direct" | "transcode";
};

export type PlaybackRuntimeStatus = {
  coreReady: boolean;
  mediaLoaded: boolean;
  paused: boolean;
  pausedForCache: boolean;
  cacheSpeedBytesPerSecond: number | null;
  positionSeconds: number;
  durationSeconds?: number | null;
};

export type PlaybackCacheStatus = {
  sizeBytes: number;
  path: string;
};

export type PlaybackBufferProfile = "startup" | "steady";

export type PlaybackProgressReport = {
  positionSeconds: number;
  isPaused: boolean;
};

export function startPlayback(request: StartPlaybackRequest) {
  return invoke<StartPlaybackResult>("start_playback", { request });
}

export function stopPlayback(positionSeconds?: number) {
  if (positionSeconds === undefined) {
    return invoke<void>("mpv_stop");
  }

  return invoke<void>("mpv_stop", { positionSeconds });
}

export function pausePlayback() {
  return invoke<void>("mpv_pause");
}

export function resumePlayback() {
  return invoke<void>("mpv_resume");
}

export function seekPlayback(positionSeconds: number) {
  return invoke<void>("mpv_seek", { seconds: positionSeconds });
}

export function setPlaybackRate(rate: number) {
  return invoke<void>("mpv_set_speed", { speed: rate });
}

export function setPlaybackVolume(volume: number) {
  return invoke<void>("mpv_set_volume", { volume });
}

export function setPlaybackMuted(muted: boolean) {
  return invoke<void>("mpv_set_muted", { muted });
}

export function setPlaybackFullscreen(fullscreen: boolean) {
  return invoke<void>("mpv_set_fullscreen", { fullscreen });
}

export function loadSubtitle(path: string) {
  return invoke<void>("mpv_load_subtitle", { path });
}

export function selectEmbeddedSubtitle(streamIndex: number) {
  return invoke<void>("mpv_select_embedded_subtitle", { streamIndex });
}

export function disableSubtitle() {
  return invoke<void>("mpv_disable_subtitle");
}

export function getPlaybackStatus() {
  return invoke<PlaybackRuntimeStatus>("mpv_get_status");
}

export function getPlaybackCacheStatus() {
  return invoke<PlaybackCacheStatus>("get_playback_cache_status");
}

export function clearPlaybackCache() {
  return invoke<PlaybackCacheStatus>("clear_playback_cache_command");
}

export function setPlaybackBufferProfile(profile: PlaybackBufferProfile) {
  return invoke<void>("mpv_set_buffer_profile", { profile });
}

export function reportPlaybackProgress(report: PlaybackProgressReport) {
  return invoke<void>("report_playback_progress", { report });
}
