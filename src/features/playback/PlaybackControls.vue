<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { usePlaybackStore } from "../../app/stores/playback";
import {
  canUsePlaybackControls,
  formatPlaybackMinuteTime,
  formatPlaybackTime,
  isEditableShortcutTarget,
  isPointerInToolbarRevealZone,
  keyboardShortcutAction,
  progressPercent,
  RIGHT_ARROW_HOLD_SPEED_DELAY_MS,
  KEYBOARD_SEEK_STEP_SECONDS,
  shouldHideToolbar,
  shouldRenderPlaybackOverlay,
  TOOLBAR_HIDE_DELAY_MS,
} from "./playback-controls";

const playback = usePlaybackStore();
const rateOptions = [0.5, 0.75, 1, 1.25, 1.5, 2];
const toolbarHidden = ref(false);
const pointerInsideToolbar = ref(false);
const playbackOverlay = ref<HTMLElement | null>(null);
const episodeMenuOpen = ref(false);
const canSeek = computed(() => (playback.durationSeconds ?? 0) > 0);
const canInteractWithTimeline = computed(() => canSeek.value && playback.seekReady);
const canControlPlayback = computed(() => canUsePlaybackControls(playback.phase));
const canAutoHide = computed(() => playback.playbackVisible && playback.phase !== "failed");
const sliderValue = computed(() => playback.seekPreviewSeconds ?? playback.positionSeconds);
const progress = computed(() => progressPercent(sliderValue.value, playback.durationSeconds ?? 0));
const hoverProgress = ref(0);
const hoverPreviewSeconds = ref<number | null>(null);
const elapsedLabel = computed(() => formatPlaybackTime(sliderValue.value));
const durationLabel = computed(() =>
  playback.durationSeconds === null ? "--:--" : formatPlaybackTime(playback.durationSeconds),
);
const hoverPreviewLabel = computed(() => {
  if (hoverPreviewSeconds.value === null || playback.durationSeconds === null) {
    return "";
  }

  return `${formatPlaybackMinuteTime(hoverPreviewSeconds.value)}/${formatPlaybackMinuteTime(playback.durationSeconds)}`;
});
const title = computed(() => playback.mediaTitle || playback.current?.itemId || "正在播放");
const statusTitle = computed(() => {
  if (playback.phase === "creatingKernel") {
    return "正在创建播放内核";
  }
  if (playback.phase === "loadingVideo") {
    return "正在加载视频";
  }
  if (playback.phase === "failed") {
    return "播放失败";
  }
  return "";
});
let hideTimer: ReturnType<typeof setTimeout> | null = null;
let rightArrowHoldTimer: ReturnType<typeof setTimeout> | null = null;
let shortcutFeedbackTimer: ReturnType<typeof setTimeout> | null = null;
const fastForwardBaseRate = ref<number | null>(null);
const shortcutFeedback = ref("");

onMounted(() => {
  window.addEventListener("blur", scheduleToolbarHide);
  window.addEventListener("keydown", onWindowKeyDown, true);
  window.addEventListener("keyup", onWindowKeyUp, true);
});

onUnmounted(() => {
  window.removeEventListener("blur", scheduleToolbarHide);
  window.removeEventListener("keydown", onWindowKeyDown, true);
  window.removeEventListener("keyup", onWindowKeyUp, true);
  clearHideTimer();
  clearRightArrowHold(false);
  clearShortcutFeedback();
});

watch(
  () => playback.playbackVisible,
  (visible) => {
    toolbarHidden.value = false;
    if (visible) {
      focusPlaybackOverlay();
      scheduleToolbarHide();
    } else {
      clearHideTimer();
      clearRightArrowHold(false);
      clearShortcutFeedback();
      episodeMenuOpen.value = false;
    }
  },
);

function togglePaused() {
  if (playback.paused) {
    void playback.resume();
    return;
  }

  void playback.pause();
}

function onSeekInput(event: Event) {
  if (!canInteractWithTimeline.value) {
    return;
  }

  playback.updateSeekPreview(Number((event.target as HTMLInputElement).value));
}

function commitSeek() {
  if (!canInteractWithTimeline.value) {
    playback.cancelSeekPreview();
    return;
  }

  void playback.commitSeekPreview();
}

function updateTimelineHoverPreview(event: PointerEvent) {
  if (!canSeek.value || playback.durationSeconds === null) {
    hoverPreviewSeconds.value = null;
    return;
  }

  const ratio = timelinePointerRatio(event);
  hoverProgress.value = ratio * 100;
  hoverPreviewSeconds.value = Math.round(playback.durationSeconds * ratio);
}

function clearTimelineHoverPreview() {
  hoverPreviewSeconds.value = null;
}

function beginTimelinePointerSeek(event: PointerEvent) {
  if (event.button !== 0) {
    return;
  }
  const targetSeconds = timelinePointerSeconds(event);
  if (targetSeconds === null) {
    return;
  }

  playback.beginSeekPreview();
  playback.updateSeekPreview(targetSeconds);
}

function commitTimelinePointerSeek(event: PointerEvent) {
  const targetSeconds = timelinePointerSeconds(event);
  if (targetSeconds === null) {
    return;
  }

  playback.updateSeekPreview(targetSeconds);
  void playback.commitSeekPreview();
}

function timelinePointerSeconds(event: PointerEvent) {
  if (!canInteractWithTimeline.value || playback.durationSeconds === null) {
    return null;
  }

  return Math.round(playback.durationSeconds * timelinePointerRatio(event));
}

function timelinePointerRatio(event: PointerEvent) {
  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  return rect.width <= 0 ? 0 : Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
}

function onRateChange(event: Event) {
  void playback.setRate(Number((event.target as HTMLSelectElement).value));
}

function onSubtitleChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value;
  focusPlaybackOverlay();
  void playback.selectSubtitle(value === "off" ? null : value);
}

function onVolumeInput(event: Event) {
  void playback.setVolume(Number((event.target as HTMLInputElement).value));
}

function toggleMuted() {
  void playback.setMuted(!playback.muted);
}

function toggleEpisodeMenu() {
  episodeMenuOpen.value = !episodeMenuOpen.value;
}

function playEpisode(itemId: string) {
  episodeMenuOpen.value = false;
  void playback.playEpisode(itemId);
}

function onWindowPointerMove(event: PointerEvent) {
  if (!playback.playbackVisible) {
    return;
  }

  focusPlaybackOverlay();

  if (
    toolbarHidden.value &&
    isPointerInToolbarRevealZone(event.clientX, event.clientY, window.innerWidth, window.innerHeight)
  ) {
    showToolbarFromRevealZone();
    return;
  }

  if (!toolbarHidden.value) {
    scheduleToolbarHide();
  }
}

function showToolbar() {
  toolbarHidden.value = false;
  scheduleToolbarHide();
}

function showToolbarFromRevealZone() {
  toolbarHidden.value = false;
  scheduleToolbarHide();
}

function onToolbarPointerEnter() {
  pointerInsideToolbar.value = true;
  showToolbar();
}

function onToolbarPointerLeave() {
  pointerInsideToolbar.value = false;
  scheduleToolbarHide();
}

function scheduleToolbarHide() {
  clearHideTimer();
  if (!shouldHideToolbar(canAutoHide.value, pointerInsideToolbar.value)) {
    return;
  }

  hideTimer = setTimeout(() => {
    if (shouldHideToolbar(canAutoHide.value, pointerInsideToolbar.value)) {
      toolbarHidden.value = true;
    }
  }, TOOLBAR_HIDE_DELAY_MS);
}

function clearHideTimer() {
  if (hideTimer === null) {
    return;
  }

  clearTimeout(hideTimer);
  hideTimer = null;
}

function focusPlaybackOverlay() {
  void nextTick(() => {
    playbackOverlay.value?.focus({ preventScroll: true });
  });
}

function onWindowKeyDown(event: KeyboardEvent) {
  const action = keyboardShortcutAction({
    key: event.key,
    repeat: event.repeat,
    playbackVisible: playback.playbackVisible,
    targetEditable: isEditableShortcutTarget(event.target),
    fullscreen: playback.fullscreen,
  });
  if (!action) {
    return;
  }

  event.preventDefault();
  runShortcutAction(action);
}

function onWindowKeyUp(event: KeyboardEvent) {
  if (!playback.playbackVisible || event.key !== "ArrowRight") {
    return;
  }

  if (rightArrowHoldTimer !== null) {
    event.preventDefault();
    clearRightArrowHold(false);
    void playback.seek(playback.positionSeconds + KEYBOARD_SEEK_STEP_SECONDS);
    showShortcutFeedback("+15s");
    return;
  }

  if (fastForwardBaseRate.value === null) {
    return;
  }

  event.preventDefault();
  const rate = fastForwardBaseRate.value;
  fastForwardBaseRate.value = null;
  void playback.setRate(rate);
}

function runShortcutAction(action: ReturnType<typeof keyboardShortcutAction>) {
  if (!action) {
    return;
  }

  switch (action.type) {
    case "togglePause":
      showShortcutFeedback(playback.paused ? "播放" : "暂停");
      togglePaused();
      return;
    case "toggleFullscreen":
      void playback.setFullscreen(!playback.fullscreen);
      return;
    case "exitFullscreen":
      void playback.setFullscreen(false);
      return;
    case "volumeDelta":
      showShortcutFeedback(`当前音量：${clampVolume(playback.volume + action.delta)}%`);
      void playback.setVolume(playback.volume + action.delta);
      return;
    case "seekDelta":
      showShortcutFeedback(formatSeekDelta(action.delta));
      void playback.seek(playback.positionSeconds + action.delta);
      return;
    case "rightArrowDown":
      startRightArrowHold();
      return;
  }
}

function startRightArrowHold() {
  if (rightArrowHoldTimer !== null || fastForwardBaseRate.value !== null) {
    return;
  }

  rightArrowHoldTimer = setTimeout(() => {
    rightArrowHoldTimer = null;
    startTemporaryFastForward();
  }, RIGHT_ARROW_HOLD_SPEED_DELAY_MS);
}

function startTemporaryFastForward() {
  if (fastForwardBaseRate.value !== null) {
    return;
  }

  fastForwardBaseRate.value = playback.rate;
  showShortcutFeedback(formatRate(2));
  void playback.setRate(2);
}

function clearRightArrowHold(restoreRate: boolean) {
  if (rightArrowHoldTimer !== null) {
    clearTimeout(rightArrowHoldTimer);
    rightArrowHoldTimer = null;
  }

  if (!restoreRate) {
    fastForwardBaseRate.value = null;
  }
}

function showShortcutFeedback(message: string) {
  shortcutFeedback.value = message;
  if (shortcutFeedbackTimer !== null) {
    clearTimeout(shortcutFeedbackTimer);
  }

  shortcutFeedbackTimer = setTimeout(() => {
    shortcutFeedback.value = "";
    shortcutFeedbackTimer = null;
  }, 1200);
}

function clearShortcutFeedback() {
  if (shortcutFeedbackTimer !== null) {
    clearTimeout(shortcutFeedbackTimer);
    shortcutFeedbackTimer = null;
  }
  shortcutFeedback.value = "";
}

function clampVolume(volume: number) {
  return Math.min(100, Math.max(0, Math.round(volume)));
}

function formatSeekDelta(delta: number) {
  return delta > 0 ? `+${delta}s` : `${delta}s`;
}

function formatRate(value: number) {
  return `${Number.isInteger(value) ? value.toFixed(0) : value}x`;
}
</script>

<template>
  <div
    v-if="shouldRenderPlaybackOverlay(playback.playbackVisible)"
    ref="playbackOverlay"
    class="playback-overlay"
    tabindex="-1"
    @pointerdown.capture="focusPlaybackOverlay"
    @pointermove="onWindowPointerMove"
  >
    <div v-if="shortcutFeedback" class="shortcut-feedback" role="status" aria-live="polite">
      {{ shortcutFeedback }}
    </div>
    <button
      type="button"
      class="icon-button stop-button"
      :class="{ 'stop-button--hidden': toolbarHidden }"
      :disabled="playback.phase === 'failed'"
      aria-label="停止"
      data-tooltip="停止"
      @click="playback.stop"
    >
      <svg class="control-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M15 18 9 12l6-6" />
      </svg>
    </button>
    <aside
      class="playback-controls"
      :class="{ 'playback-controls--hidden': toolbarHidden }"
      aria-label="播放控制"
      @pointerenter="onToolbarPointerEnter"
      @pointermove="onToolbarPointerEnter"
      @pointerleave="onToolbarPointerLeave"
      @focusin="onToolbarPointerEnter"
      @focusout="onToolbarPointerLeave"
    >
      <div v-if="statusTitle || playback.error" class="playback-status-panel" :class="{ failed: playback.phase === 'failed' }">
        <strong>{{ playback.error?.message ?? statusTitle }}</strong>
        <span v-if="!playback.error && playback.loadingDetail">{{ playback.loadingDetail }}</span>
      </div>

      <div class="timeline-row">
        <div
          class="timeline-wrap"
          :style="{ '--progress': `${progress}%`, '--hover-progress': `${hoverProgress}%` }"
          @pointerdown.capture="beginTimelinePointerSeek"
          @pointermove="updateTimelineHoverPreview"
          @pointerup.capture="commitTimelinePointerSeek"
          @pointerleave="clearTimelineHoverPreview"
        >
          <input
            type="range"
            min="0"
            :max="playback.durationSeconds ?? 0"
            step="1"
            :value="sliderValue"
            :disabled="!canInteractWithTimeline"
            aria-label="播放进度"
            @pointerdown="playback.beginSeekPreview"
            @input="onSeekInput"
            @change="commitSeek"
            @pointerup="commitSeek"
            @keyup.escape="playback.cancelSeekPreview"
          />
          <output v-if="playback.seekPreviewSeconds !== null" class="seek-preview">
            {{ playback.seekPreviewLabel }}
          </output>
          <output v-else-if="hoverPreviewSeconds !== null" class="timeline-hover-preview">
            {{ hoverPreviewLabel }}
          </output>
        </div>
      </div>

      <div class="playback-toolbar-row">
        <div class="playback-main">
          <button
            type="button"
            class="icon-button control-button"
            :disabled="playback.phase === 'failed'"
            aria-label="播放/暂停"
            :data-tooltip="playback.paused ? '播放' : '暂停'"
            @click="togglePaused"
          >
            <svg v-if="playback.paused" class="control-icon control-icon--filled" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
            <svg v-else class="control-icon control-icon--filled" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
            </svg>
          </button>
          <div class="volume-control">
            <button
              type="button"
              class="icon-button control-button"
              :disabled="playback.phase === 'failed'"
              aria-label="静音/取消静音"
              data-tooltip="静音/取消静音"
              @click="toggleMuted"
            >
              <svg
                v-if="playback.muted || playback.volume === 0"
                class="control-icon"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M11 5 6 9H3v6h3l5 4z" />
                <path d="m19 9-6 6M13 9l6 6" />
              </svg>
              <svg v-else class="control-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M11 5 6 9H3v6h3l5 4z" />
                <path d="M15 9.5a4 4 0 0 1 0 5M17.5 7a7 7 0 0 1 0 10" />
              </svg>
            </button>
            <label class="compact-field volume-field">
              <span class="sr-only">音量</span>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                :value="playback.volume"
                :disabled="playback.phase === 'failed'"
                aria-label="音量"
                @input="onVolumeInput"
              />
            </label>
          </div>
          <span class="time-readout">{{ elapsedLabel }} / {{ durationLabel }}</span>
          <div class="playback-title" :title="title">
            <strong>{{ title }}</strong>
          </div>
        </div>

        <div class="playback-actions">
          <button
            type="button"
            class="icon-button control-button"
            :disabled="!canControlPlayback"
            aria-label="跳过片头"
            data-tooltip="跳过片头"
            @click="playback.skipIntro"
          >
            <svg class="control-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 5v14l9-7z" />
              <path d="M19 5v14" />
            </svg>
          </button>
          <button
            type="button"
            class="icon-button control-button"
            :disabled="playback.durationSeconds === null || !canControlPlayback"
            aria-label="跳过片尾"
            data-tooltip="跳过片尾"
            @click="playback.skipOutro"
          >
            <svg class="control-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 5v14l9-7z" />
              <path d="M19 5v14" />
            </svg>
          </button>
          <button
            type="button"
            class="icon-button control-button"
            :disabled="!playback.hasPreviousEpisode"
            aria-label="上一集"
            data-tooltip="上一集"
            @click="playback.playPreviousEpisode"
          >
            <svg class="control-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M19 5v14l-9-7z" />
              <path d="M5 5v14" />
            </svg>
          </button>
          <button
            type="button"
            class="icon-button control-button"
            :disabled="!playback.hasNextEpisode"
            aria-label="下一集"
            data-tooltip="下一集"
            @click="playback.playNextEpisode"
          >
            <svg class="control-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 5v14l9-7z" />
              <path d="M19 5v14" />
            </svg>
          </button>
          <div class="episode-picker">
            <button
              type="button"
              class="icon-button control-button"
              :disabled="playback.episodes.length === 0"
              aria-label="选集"
              data-tooltip="选集"
              @click="toggleEpisodeMenu"
            >
              <svg class="control-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 7h14M5 12h14M5 17h14" />
              </svg>
            </button>
            <div v-if="episodeMenuOpen" class="episode-menu" role="menu" aria-label="选集列表">
              <button
                v-for="episode in playback.episodes"
                :key="episode.itemId"
                type="button"
                class="episode-menu-item"
                :class="{ 'episode-menu-item--active': episode.itemId === playback.current?.itemId }"
                role="menuitem"
                @click="playEpisode(episode.itemId)"
              >
                <img v-if="episode.imageUrl" :src="episode.imageUrl" :alt="episode.title" />
                <span v-else class="episode-thumb-placeholder">{{ episode.title.slice(0, 1) }}</span>
                <span>{{ episode.title }}</span>
              </button>
            </div>
          </div>

          <label class="compact-field">
            倍速
            <select :value="playback.rate" :disabled="playback.phase === 'failed'" @change="onRateChange">
              <option v-for="option in rateOptions" :key="option" :value="option">
                {{ option }}x
              </option>
            </select>
          </label>

          <label class="compact-field subtitle-field">
            字幕
            <select
              :value="playback.pendingSubtitleId ?? playback.selectedSubtitleId ?? 'off'"
              :disabled="playback.phase === 'failed' || playback.pendingSubtitleId !== null"
              @change="onSubtitleChange"
            >
              <option value="off">关闭</option>
              <option v-for="track in playback.subtitleTracks" :key="track.id" :value="track.id">
                {{ track.label }}
              </option>
            </select>
          </label>

          <button
            type="button"
            class="icon-button control-button"
            :disabled="playback.phase === 'failed'"
            aria-label="全屏"
            :data-tooltip="playback.fullscreen ? '退出全屏' : '全屏'"
            @click="playback.setFullscreen(!playback.fullscreen)"
          >
            <svg class="control-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M21 16v5h-5" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.playback-overlay {
  position: fixed;
  inset: 0;
  z-index: 20;
  background: transparent;
  outline: none;
  pointer-events: auto;
}

.playback-controls {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 2;
  display: grid;
  gap: 6px;
  border: 0;
  border-radius: 0;
  padding: 22px 14px 10px;
  color: #f4f7fb;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.76), rgba(0, 0, 0, 0.42) 58%, rgba(0, 0, 0, 0));
  box-shadow: none;
  opacity: 1;
  transform: translateY(0);
  will-change: opacity, transform;
  transition:
    opacity 220ms ease-out,
    transform 280ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.shortcut-feedback {
  position: fixed;
  top: 18px;
  left: 18px;
  z-index: 3;
  border-radius: 6px;
  padding: 8px 12px;
  color: #ffffff;
  background: rgba(0, 0, 0, 0.62);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.2;
  pointer-events: none;
}

.playback-controls--hidden {
  pointer-events: none;
  opacity: 0;
  transform: translateY(calc(100% + 18px));
}

.stop-button {
  position: fixed;
  top: 12px;
  left: 12px;
  z-index: 3;
  background: transparent;
  color: #ffffff;
  opacity: 1;
  transform: translateY(0);
  transition:
    opacity 180ms ease-out,
    transform 220ms ease-out;
}

.stop-button--hidden {
  pointer-events: none;
  opacity: 0;
  transform: translateY(-14px);
}

.stop-button[data-tooltip]::after {
  top: calc(100% + 8px);
  bottom: auto;
}

.playback-main,
.playback-actions,
.playback-toolbar-row,
.timeline-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.playback-toolbar-row {
  justify-content: space-between;
  min-width: 0;
}

.playback-status-panel {
  display: grid;
  gap: 3px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 6px;
  padding: 8px 10px;
  background: rgba(22, 26, 30, 0.9);
}

.playback-status-panel strong,
.playback-status-panel span {
  line-height: 1.3;
}

.playback-status-panel span {
  color: #b9c3cc;
  font-size: 12px;
}

.playback-status-panel.failed {
  border-color: #a95050;
  color: #ffd2d2;
  background: rgba(88, 24, 24, 0.86);
}

.playback-title {
  max-width: min(32vw, 360px);
  min-width: 0;
}

.playback-title strong,
.playback-title span {
  display: block;
}

.playback-title strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.playback-title span,
.timeline-row span,
.time-readout {
  color: #b9c3cc;
  font-size: 12px;
}

.time-readout {
  color: #ffffff;
  white-space: nowrap;
}

.timeline-row {
  display: block;
}

.timeline-wrap {
  position: relative;
}

.timeline-wrap input {
  width: 100%;
  min-height: 16px;
  padding: 0;
  accent-color: #8fd8ff;
}

.seek-preview,
.timeline-hover-preview {
  position: absolute;
  bottom: 30px;
  left: var(--progress);
  transform: translateX(-50%);
  border-radius: 4px;
  padding: 4px 8px;
  color: #ffffff;
  background: rgba(0, 0, 0, 0.78);
  font-size: 12px;
  white-space: nowrap;
}

.timeline-hover-preview {
  left: var(--hover-progress);
}

.playback-actions {
  flex-wrap: wrap;
  justify-content: flex-end;
}

.control-button,
.icon-button {
  min-width: 34px;
  min-height: 34px;
}

.icon-button {
  border: 0;
  border-radius: 50%;
  font: inherit;
  cursor: pointer;
}

.icon-button {
  position: relative;
  display: inline-grid;
  place-items: center;
  padding: 0;
  background: transparent;
  color: #ffffff;
}

.icon-button:hover,
.icon-button:focus-visible {
  background: rgba(255, 255, 255, 0.16);
}

.control-icon {
  width: 22px;
  height: 22px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.2;
}

.control-icon--filled {
  fill: currentColor;
  stroke: none;
}

.icon-button:disabled {
  cursor: default;
  opacity: 0.48;
}

.icon-button[data-tooltip]::after {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  z-index: 5;
  transform: translateX(-50%) translateY(2px);
  border-radius: 4px;
  padding: 4px 7px;
  color: #ffffff;
  background: rgba(0, 0, 0, 0.84);
  content: attr(data-tooltip);
  font-size: 12px;
  line-height: 1.2;
  opacity: 0;
  pointer-events: none;
  white-space: nowrap;
  transition:
    opacity 120ms ease-out 500ms,
    transform 120ms ease-out 500ms;
}

.icon-button[data-tooltip]:hover::after,
.icon-button[data-tooltip]:focus-visible::after {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

.compact-field {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #d5dde5;
  font-size: 13px;
}

.compact-field select {
  width: 78px;
  min-height: 32px;
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 4px;
  color: #ffffff;
  background: rgba(0, 0, 0, 0.4);
}

.subtitle-field select {
  width: min(190px, 28vw);
}

.volume-field input {
  width: 96px;
  min-height: 28px;
  padding: 0;
  accent-color: #8fd8ff;
}

.volume-control {
  display: flex;
  align-items: center;
  gap: 6px;
}

.episode-picker {
  position: relative;
}

.episode-menu {
  position: absolute;
  right: 0;
  bottom: calc(100% + 10px);
  display: grid;
  gap: 6px;
  width: min(360px, 82vw);
  max-height: 360px;
  overflow: auto;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 8px;
  padding: 8px;
  background: rgba(0, 0, 0, 0.84);
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.42);
}

.episode-menu-item {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  border: 0;
  border-radius: 6px;
  padding: 6px;
  color: #ffffff;
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.episode-menu-item:hover,
.episode-menu-item:focus-visible,
.episode-menu-item--active {
  background: rgba(255, 255, 255, 0.14);
}

.episode-menu-item img,
.episode-thumb-placeholder {
  width: 88px;
  aspect-ratio: 16 / 9;
  border-radius: 4px;
  object-fit: cover;
  background: rgba(255, 255, 255, 0.12);
}

.episode-thumb-placeholder {
  display: grid;
  place-items: center;
  color: #d5dde5;
  font-weight: 700;
}

.episode-menu-item span:last-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sr-only {
  position: absolute;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  border: 0;
}

@media (max-width: 760px) {
  .playback-controls {
    padding: 20px 10px 8px;
  }

  .playback-main,
  .playback-actions,
  .playback-toolbar-row {
    align-items: center;
    flex-wrap: wrap;
  }

  .playback-title {
    display: none;
  }

  .compact-field,
  .compact-field select,
  .volume-field input {
    width: 100%;
  }
}
</style>
