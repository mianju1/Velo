import type { MediaKind, SortBy } from "../../services/emby/media";

export const libraryEntries: Array<{ kind: MediaKind; label: string; description: string }> = [
  { kind: "continue", label: "继续观看", description: "未看完的电影、剧集和其他媒体" },
  { kind: "favorites", label: "收藏", description: "已标记收藏的媒体" },
];

export const sortOptions: Array<{ value: SortBy; label: string }> = [
  { value: "DateCreated", label: "最近添加" },
  { value: "SortName", label: "名称" },
  { value: "DatePlayed", label: "最近播放" },
];

export function getLibraryLabel(kind: string) {
  return libraryEntries.find((entry) => entry.kind === kind)?.label ?? "媒体库";
}

export function isMediaKind(kind: string): kind is MediaKind {
  return libraryEntries.some((entry) => entry.kind === kind);
}
