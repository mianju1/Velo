<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { buildImageUrl, mediaResolutionLabel, type MediaItem } from "../../../services/emby/media";

const props = defineProps<{
  items: MediaItem[];
  serverUrl: string;
  token: string;
}>();

function posterUrl(item: MediaItem) {
  if (!item.primaryImageTag) {
    return "";
  }

  return buildImageUrl({
    serverUrl: props.serverUrl,
    itemId: item.imageItemId ?? item.id,
    imageType: "Primary",
    tag: item.primaryImageTag,
    maxWidth: 360,
    token: props.token,
  });
}

const hasItems = computed(() => props.items.length > 0);

function resolutionLabel(item: MediaItem) {
  const label = mediaResolutionLabel(item);
  return label === "未知" ? "" : label;
}

function episodeCountLabel(item: MediaItem) {
  if (item.episodeCount && item.episodeCount > 1) {
    return `共 ${item.episodeCount} 集`;
  }

  if (item.type === "Movie" || item.type === "Episode") {
    return "单集";
  }

  return "";
}

function mediaTags(item: MediaItem): Array<{ label: string; kind: "genre" | "type" }> {
  const tags = item.genres?.filter(Boolean).slice(0, 3) ?? [];
  return tags.length > 0
    ? tags.map((tag) => ({ label: tag, kind: "genre" }))
    : [{ label: mediaTypeLabel(item.type), kind: "type" }];
}

function mediaTypeLabel(type: string) {
  const labels: Record<string, string> = {
    Movie: "电影",
    Series: "剧集",
    Season: "剧集",
    Episode: "剧集",
    Audio: "音乐",
    Photo: "图片",
    LiveTvChannel: "直播",
  };

  return labels[type] ?? type;
}
</script>

<template>
  <div v-if="hasItems" class="media-grid">
    <RouterLink v-for="item in items" :key="item.id" class="media-tile" :to="`/media/${item.id}`">
      <div class="poster-frame">
        <span v-if="resolutionLabel(item)" class="resolution-badge">{{ resolutionLabel(item) }}</span>
        <img v-if="posterUrl(item)" :src="posterUrl(item)" :alt="item.name" loading="lazy" />
        <span v-else class="poster-placeholder">{{ item.name.slice(0, 1) }}</span>
      </div>
      <div class="media-copy">
        <strong>{{ item.name }}</strong>
        <span v-if="item.progressLabel" class="media-progress">{{ item.progressLabel }}</span>
        <span class="media-meta">
          <span v-if="episodeCountLabel(item)" class="media-episode-count">{{ episodeCountLabel(item) }}</span>
          <span v-if="item.year">{{ item.year }}</span>
        </span>
        <span class="media-tags">
          <span
            v-for="tag in mediaTags(item)"
            :key="tag.label"
            class="media-tag"
            :class="`media-tag--${tag.kind}`"
          >
            {{ tag.label }}
          </span>
        </span>
      </div>
    </RouterLink>
  </div>
</template>
