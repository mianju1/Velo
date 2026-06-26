<script setup lang="ts">
import { ref } from "vue";
import { useMediaStore } from "../../app/stores/media";
import { useSessionStore } from "../../app/stores/session";
import BackToTopButton from "./components/BackToTopButton.vue";
import MediaGrid from "./components/MediaGrid.vue";
import MediaSidebar from "./components/MediaSidebar.vue";
import StateBlock from "./components/StateBlock.vue";

const media = useMediaStore();
const session = useSessionStore();
const query = ref("");
const contentRef = ref<HTMLElement | null>(null);
const showBackToTop = ref(false);

async function submit() {
  const value = query.value.trim();
  if (value) {
    await media.runSearch(value);
  }
}

async function searchFromHistory(value: string) {
  query.value = value;
  await media.runSearch(value);
}

function handleContentScroll() {
  const scroller = contentRef.value;
  showBackToTop.value = Boolean(scroller && scroller.scrollTop > 120);
}

function scrollToTop() {
  contentRef.value?.scrollTo?.({ top: 0, behavior: "smooth" });
}
</script>

<template>
  <main class="media-browser-shell">
    <MediaSidebar />

    <section ref="contentRef" class="media-browser-content" @scroll.passive="handleContentScroll">
      <header class="media-browser-topbar">
        <div>
          <p class="eyebrow">搜索</p>
          <h1>跨媒体搜索</h1>
        </div>
      </header>

      <form class="search-row global-search-row" @submit.prevent="submit">
        <input v-model="query" class="global-search-input" placeholder="电影、剧集、音乐、照片或频道" />
        <button type="submit" class="global-search-submit">搜索</button>
      </form>

      <section v-if="media.searchHistory.length > 0" class="search-history" aria-label="搜索记录">
        <p class="search-history-title">搜索记录</p>
        <div class="search-history-list">
          <button
            v-for="record in media.searchHistory"
            :key="record"
            type="button"
            class="search-history-item"
            @click="searchFromHistory(record)"
          >
            {{ record }}
          </button>
        </div>
      </section>

      <StateBlock v-if="media.search.loading" title="正在搜索" loading />
      <StateBlock v-else-if="media.search.error" title="搜索失败" :detail="media.search.error.message" />
      <StateBlock v-else-if="media.search.items.length === 0" title="暂无搜索结果" />
      <MediaGrid
        v-else-if="session.activeSession"
        :items="media.search.items"
        :server-url="session.activeSession.server.url"
        :token="session.activeSession.accessToken"
      />
    </section>

    <Transition name="back-to-top">
      <BackToTopButton v-if="showBackToTop" @back-to-top="scrollToTop" />
    </Transition>
  </main>
</template>
