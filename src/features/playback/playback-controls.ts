export type PlaybackControlPhase =
  | "idle"
  | "creatingKernel"
  | "loadingVideo"
  | "playing"
  | "failed"
  | "stopping";

export const TOOLBAR_HIDE_DELAY_MS = 500;
export const KEYBOARD_SEEK_STEP_SECONDS = 15;
export const KEYBOARD_VOLUME_STEP = 5;
export const RIGHT_ARROW_HOLD_SPEED_DELAY_MS = 500;

export type PlaybackShortcutAction =
  | { type: "togglePause" }
  | { type: "toggleFullscreen" }
  | { type: "exitFullscreen" }
  | { type: "volumeDelta"; delta: number }
  | { type: "seekDelta"; delta: number }
  | { type: "rightArrowDown" };

export type PlaybackShortcutContext = {
  key: string;
  repeat: boolean;
  playbackVisible: boolean;
  targetEditable: boolean;
  fullscreen: boolean;
};

export function canUsePlaybackControls(phase: PlaybackControlPhase) {
  return phase === "loadingVideo" || phase === "playing";
}

export function formatPlaybackTime(totalSeconds: number) {
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

export function formatPlaybackMinuteTime(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function progressPercent(positionSeconds: number, durationSeconds: number) {
  if (durationSeconds <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round((positionSeconds / durationSeconds) * 100)));
}

export function runtimeMinutesToSeconds(runtimeMinutes: number | undefined) {
  return runtimeMinutes === undefined ? undefined : Math.max(0, Math.round(runtimeMinutes * 60));
}

export function isPointerInToolbarRevealZone(
  pointerX: number,
  pointerY: number,
  viewportWidth: number,
  viewportHeight: number,
) {
  const edgeRevealSize = 96;
  const insideViewport = pointerX >= 0 && pointerX <= viewportWidth && pointerY >= 0 && pointerY <= viewportHeight;

  return (
    insideViewport &&
    (pointerX <= edgeRevealSize ||
      pointerX >= viewportWidth - edgeRevealSize ||
      pointerY <= edgeRevealSize ||
      pointerY >= viewportHeight - edgeRevealSize)
  );
}

export function shouldHideToolbar(canAutoHide: boolean, pointerInsideToolbar: boolean) {
  return canAutoHide && !pointerInsideToolbar;
}

export function shouldRenderPlaybackOverlay(playbackVisible: boolean) {
  return playbackVisible;
}

export function shouldUsePlaybackLoadingBackdrop(phase: PlaybackControlPhase) {
  return phase === "creatingKernel" || phase === "loadingVideo";
}

export function keyboardShortcutAction(context: PlaybackShortcutContext): PlaybackShortcutAction | null {
  if (!context.playbackVisible || context.targetEditable) {
    return null;
  }

  switch (context.key) {
    case " ":
    case "Spacebar":
      return { type: "togglePause" };
    case "f":
    case "F":
      return { type: "toggleFullscreen" };
    case "ArrowUp":
      return { type: "volumeDelta", delta: KEYBOARD_VOLUME_STEP };
    case "ArrowDown":
      return { type: "volumeDelta", delta: -KEYBOARD_VOLUME_STEP };
    case "ArrowLeft":
      return { type: "seekDelta", delta: -KEYBOARD_SEEK_STEP_SECONDS };
    case "ArrowRight":
      return { type: "rightArrowDown" };
    case "Escape":
      return context.fullscreen ? { type: "exitFullscreen" } : null;
    default:
      return null;
  }
}

export function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}
