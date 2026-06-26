<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useMediaStore } from "../../app/stores/media";
import { usePlaybackStore } from "../../app/stores/playback";
import { useSessionStore } from "../../app/stores/session";
import {
  buildImageUrl,
  formatMediaSize,
  mediaResolutionLabel,
  type MediaItem,
} from "../../services/emby/media";
import { type PlaybackEpisode } from "../../app/stores/playback";
import { runtimeMinutesToSeconds } from "../playback/playback-controls";
import StateBlock from "./components/StateBlock.vue";

const route = useRoute();
const router = useRouter();
const media = useMediaStore();
const playback = usePlaybackStore();
const session = useSessionStore();
const itemId = computed(() => String(route.params.itemId ?? ""));
const favoriteLoading = ref(false);

const imageUrl = computed(() => {
  const item = media.detail.item;
  const activeSession = session.activeSession;
  if (!item?.primaryImageTag || !activeSession) {
    return "";
  }

  return buildImageUrl({
    serverUrl: activeSession.server.url,
    itemId: item.imageItemId ?? item.id,
    imageType: "Primary",
    tag: item.primaryImageTag,
    maxWidth: 520,
    token: activeSession.accessToken,
  });
});

const detailBackgroundUrl = computed(() => imageUrl.value);

const metadata = computed(() => {
  const item = media.detail.item;
  if (!item) {
    return [];
  }

  return [
    item.year?.toString(),
    item.communityRating ? `${item.communityRating.toFixed(1)} 分` : undefined,
    item.officialRating,
    item.type === "Season" ? undefined : item.seriesName,
    item.type === "Season" ? undefined : seasonLabel(item.seasonNumber),
    item.episodeNumber ? `第 ${item.episodeNumber} 集` : undefined,
    item.album,
    item.trackNumber ? `第 ${item.trackNumber} 首` : undefined,
    item.artists?.join(" / "),
    item.dateCreated ? formatDate(item.dateCreated) : undefined,
  ].filter(Boolean);
});

const detailTitle = computed(() => {
  const item = media.detail.item;
  if (!item) {
    return "";
  }

  if (item.type === "Season") {
    return item.seriesName || stripSeasonLabel(item.name, item.seasonNumber) || item.name;
  }

  return item.name;
});

const seasonSubtitle = computed(() => {
  const item = media.detail.item;
  if (!item || item.type !== "Season" || !item.seasonNumber || media.detail.seasons.length <= 1) {
    return "";
  }

  return seasonLabel(item.seasonNumber);
});

const currentItemPlaying = computed(
  () => playback.playing && playback.current?.itemId === itemId.value,
);
const playButtonLabel = computed(() => {
  if (playback.phase === "creatingKernel") {
    return "正在创建播放内核";
  }
  if (playback.loading) {
    return "正在启动";
  }
  if (currentItemPlaying.value) {
    return "播放中";
  }

  return "播放";
});
const playMethodLabel = computed(() => {
  if (playback.current?.playMethod === "transcode") {
    return "转码";
  }

  return "直连";
});
const hasKnownPlaybackMediaInfo = computed(() => {
  const item = media.detail.item;
  if (!item) {
    return false;
  }

  return isKnownVideoResolution(item.videoHeight) && isKnownVideoSize(item.sizeBytes);
});

const detailResolutionLabel = computed(() => {
  const item = media.detail.item;
  return item && hasKnownPlaybackMediaInfo.value ? mediaResolutionLabel(item) : "";
});

const detailVideoSize = computed(() => {
  const item = media.detail.item;
  return item && hasKnownPlaybackMediaInfo.value ? formatMediaSize(item.sizeBytes) : "";
});

const hasDetailTags = computed(() => {
  const item = media.detail.item;
  return Boolean(detailResolutionLabel.value || item?.genres?.length || item?.dolbySupported);
});

const playbackEpisodes = computed<PlaybackEpisode[]>(() =>
  media.detail.episodes.map((episode) => ({
    itemId: episode.id,
    title: episodeTitle(episode),
    durationSeconds: runtimeMinutesToSeconds(episode.runtimeMinutes),
    initialPositionSeconds: playbackPositionSeconds(episode),
    imageUrl: itemImageUrl(episode, 320),
    seasonNumber: episode.seasonNumber,
    episodeNumber: episode.episodeNumber,
    subtitles: episode.subtitleTracks ?? [],
  })),
);

function load() {
  if (itemId.value) {
    void media.loadDetail(itemId.value);
  }
}

function startCurrentPlayback() {
  const item = media.detail.item;
  if (!itemId.value || !item || playback.loading) {
    return;
  }

  const playableItem = item.type === "Series" || item.type === "Season" ? media.detail.episodes[0] : item;
  if (!playableItem) {
    return;
  }

  void playback.playItem(playableItem.id, {
    durationSeconds: runtimeMinutesToSeconds(playableItem.runtimeMinutes),
    initialPositionSeconds: playbackPositionSeconds(playableItem),
    title: episodeTitle(playableItem),
    subtitles: playableItem.subtitleTracks ?? [],
    episodes: playbackEpisodes.value,
  });
}

function playEpisode(episode: MediaItem) {
  if (playback.loading) {
    return;
  }

  void playback.playItem(episode.id, {
    durationSeconds: runtimeMinutesToSeconds(episode.runtimeMinutes),
    initialPositionSeconds: playbackPositionSeconds(episode),
    title: episodeTitle(episode),
    subtitles: episode.subtitleTracks ?? [],
    episodes: playbackEpisodes.value,
  });
}

function goBack() {
  if (window.history.length > 1) {
    router.back();
    return;
  }

  void router.push("/library/continue");
}

async function toggleFavoriteCurrentItem() {
  if (!media.detail.item || favoriteLoading.value) {
    return;
  }

  favoriteLoading.value = true;
  try {
    await media.toggleDetailFavorite();
  } finally {
    favoriteLoading.value = false;
  }
}

onMounted(load);
watch(itemId, load);

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function itemImageUrl(item: MediaItem, maxWidth: number) {
  const activeSession = session.activeSession;
  if (!item.primaryImageTag || !activeSession) {
    return "";
  }

  return buildImageUrl({
    serverUrl: activeSession.server.url,
    itemId: item.imageItemId ?? item.id,
    imageType: "Primary",
    tag: item.primaryImageTag,
    maxWidth,
    token: activeSession.accessToken,
  });
}

function episodeTitle(item: MediaItem) {
  if (item.type === "Episode" && item.episodeNumber) {
    if (isGenericEpisodeName(item.name, item.episodeNumber)) {
      const seriesTitle = item.seriesName || detailTitle.value;
      return seriesTitle ? `${seriesTitle} 第 ${item.episodeNumber} 集` : `第 ${item.episodeNumber} 集`;
    }

    return `第 ${item.episodeNumber} 集 ${item.name}`;
  }

  return item.name;
}

function isGenericEpisodeName(name: string, episodeNumber: number) {
  const normalized = name.replace(/\s+/g, "");
  return normalized === `第${episodeNumber}集` || normalized === `第${episodeNumber.toString().padStart(2, "0")}集`;
}

function seasonLabel(seasonNumber: number | undefined) {
  return seasonNumber ? `第 ${seasonNumber} 季` : undefined;
}

function stripSeasonLabel(name: string, seasonNumber: number | undefined) {
  if (!seasonNumber) {
    return name;
  }

  const compactSeason = `第\\s*${seasonNumber}\\s*季`;
  return name
    .replace(new RegExp(`\\s*${compactSeason}\\s*$`), "")
    .trim();
}

function playbackPositionSeconds(item: MediaItem) {
  if (!item.playbackPositionTicks || !Number.isFinite(item.playbackPositionTicks)) {
    return undefined;
  }

  const seconds = Math.floor(item.playbackPositionTicks / 10_000_000);
  return seconds > 0 ? seconds : undefined;
}

function resumeLabel(item: MediaItem) {
  const seconds = playbackPositionSeconds(item);
  return seconds === undefined ? "" : `上次看到 ${formatShortTime(seconds)}`;
}

function formatShortTime(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function isKnownVideoResolution(videoHeight: number | undefined) {
  return Boolean(videoHeight && Number.isFinite(videoHeight) && videoHeight > 0);
}

function isKnownVideoSize(sizeBytes: number | undefined) {
  return Boolean(sizeBytes && Number.isFinite(sizeBytes) && sizeBytes > 0);
}
</script>

<template>
  <main class="home-shell">
    <button type="button" class="ghost detail-back-button" aria-label="返回" @click="goBack">
      <svg data-icon="back-triangle" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 12 17 5v14L7 12Z"></path>
      </svg>
    </button>

    <StateBlock v-if="media.detail.loading" title="正在加载详情" loading />
    <StateBlock v-else-if="media.detail.error" title="详情加载失败" :detail="media.detail.error.message" />

    <article v-else-if="media.detail.item" class="detail-layout">
      <div
        v-if="detailBackgroundUrl"
        class="detail-backdrop"
        :style="{ backgroundImage: `url(${detailBackgroundUrl})` }"
        aria-hidden="true"
      ></div>
      <div class="detail-poster">
        <img v-if="imageUrl" :src="imageUrl" :alt="media.detail.item.name" />
        <span v-else>{{ media.detail.item.name.slice(0, 1) }}</span>
      </div>
      <section class="detail-copy">
        <p class="eyebrow">{{ media.detail.item.type }}</p>
        <h1>{{ detailTitle }}</h1>
        <p v-if="seasonSubtitle" class="muted season-subtitle">{{ seasonSubtitle }}</p>
        <p v-if="metadata.length" class="muted">{{ metadata.join(" · ") }}</p>
        <p v-if="media.detail.item.overview" class="overview">{{ media.detail.item.overview }}</p>
        <div v-if="hasDetailTags" class="tag-row detail-tag-row">
          <span v-if="detailResolutionLabel" class="detail-resolution-tag">{{ detailResolutionLabel }}</span>
          <span v-if="media.detail.item.dolbySupported" class="dolby-badge" aria-label="支持杜比" title="支持杜比">
            <svg data-icon="dolby" viewBox="0 0 28 16" aria-hidden="true">
              <path d="M2 2h6.5a6 6 0 0 1 0 12H2V2Zm24 0h-6.5a6 6 0 0 0 0 12H26V2Z"></path>
              <path d="M10 2h8v12h-8a6 6 0 0 0 0-12Zm8 0h-8v12h8a6 6 0 0 1 0-12Z"></path>
            </svg>
            杜比
          </span>
          <span v-for="genre in media.detail.item.genres ?? []" :key="genre" class="detail-genre-tag">{{ genre }}</span>
        </div>
        <p v-if="detailVideoSize" class="detail-video-size">视频大小 {{ detailVideoSize }}</p>
        <div class="action-row">
          <button
            type="button"
            :disabled="playback.loading"
            :aria-busy="playback.loading"
            @click="startCurrentPlayback"
          >
            {{ playButtonLabel }}
          </button>
          <button
            type="button"
            class="secondary favorite-button"
            :disabled="favoriteLoading"
            :aria-busy="favoriteLoading"
            @click="toggleFavoriteCurrentItem"
          >
            {{ media.detail.item.isFavorite ? "已收藏" : "收藏" }}
          </button>
          <span v-if="currentItemPlaying" class="playback-status">{{ playMethodLabel }}</span>
        </div>
        <p v-if="playback.error" class="error playback-error">{{ playback.error.message }}</p>
        <section v-if="media.detail.episodes.length > 1" class="detail-episode-section" aria-label="选集">
          <h2>选集</h2>
          <div class="detail-episode-grid">
            <button
              v-for="episode in media.detail.episodes"
              :key="episode.id"
              type="button"
              class="detail-episode-card"
              :class="{ 'detail-episode-card--resumable': playbackPositionSeconds(episode) !== undefined }"
              :disabled="playback.loading"
              @click="playEpisode(episode)"
            >
              <span class="detail-episode-thumb">
                <img v-if="itemImageUrl(episode, 240)" :src="itemImageUrl(episode, 240)" :alt="episodeTitle(episode)" />
                <span v-else>{{ episodeTitle(episode).slice(0, 1) }}</span>
              </span>
              <span class="detail-episode-copy">
                <strong>{{ episodeTitle(episode) }}</strong>
                <span v-if="resumeLabel(episode)" class="detail-episode-progress">{{ resumeLabel(episode) }}</span>
              </span>
            </button>
          </div>
        </section>
      </section>
    </article>
  </main>
</template>
