const MEDIA_TILE_MIN_WIDTH = 172;
const MEDIA_TILE_GAP = 26;
const DEFAULT_PAGE_ROWS = 4;

export function calculateMediaPageLimit(
  availableWidth: number,
  options: { tileMinWidth?: number; gap?: number; rows?: number } = {},
) {
  const tileMinWidth = options.tileMinWidth ?? MEDIA_TILE_MIN_WIDTH;
  const gap = options.gap ?? MEDIA_TILE_GAP;
  const rows = options.rows ?? DEFAULT_PAGE_ROWS;
  const columns = Math.max(1, Math.floor((Math.max(0, availableWidth) + gap) / (tileMinWidth + gap)));

  return columns * rows;
}
