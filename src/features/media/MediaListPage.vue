<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useMediaStore } from "../../app/stores/media";
import { useSessionStore } from "../../app/stores/session";
import type { SortBy } from "../../services/emby/media";
import BackToTopButton from "./components/BackToTopButton.vue";
import MediaGrid from "./components/MediaGrid.vue";
import MediaSidebar from "./components/MediaSidebar.vue";
import StateBlock from "./components/StateBlock.vue";
import { defaultLibraryRoute } from "./library-routes";
import { getLibraryLabel, isMediaKind, sortOptions } from "./media-labels";
import { calculateMediaPageLimit } from "./media-pagination";

const route = useRoute();
const router = useRouter();
const media = useMediaStore();
const session = useSessionStore();
const sortBy = ref<SortBy>("DateCreated");
const sortOrder = ref<"Ascending" | "Descending">("Descending");
const localSearchInput = ref("");
const localSearchTerm = ref("");
const contentRef = ref<HTMLElement | null>(null);
const showBackToTop = ref(false);

const kind = computed(() => String(route.params.kind ?? ""));
const libraryId = computed(() => String(route.params.libraryId ?? ""));
const collectionType = computed(() => String(route.query.collectionType ?? "") || null);
const title = computed(() => String(route.query.name ?? "") || getLibraryLabel(kind.value));

async function load() {
  const limit = currentPageLimit();
  if (libraryId.value) {
    await media.loadLibraryView(libraryId.value, {
      collectionType: collectionType.value,
      searchTerm: localSearchTerm.value,
      sortBy: sortBy.value,
      sortOrder: sortOrder.value,
      limit,
    });
    return;
  }

  if (!isMediaKind(kind.value)) {
    void router.replace(defaultLibraryRoute(media.views.items));
    return;
  }

  await media.loadLibrary(kind.value, {
    searchTerm: localSearchTerm.value,
    sortBy: sortBy.value,
    sortOrder: sortOrder.value,
    limit,
  });
}

async function loadNextPage() {
  const limit = currentPageLimit();
  if (libraryId.value) {
    await media.loadNextLibraryViewPage(libraryId.value, {
      collectionType: collectionType.value,
      searchTerm: localSearchTerm.value,
      sortBy: sortBy.value,
      sortOrder: sortOrder.value,
      limit,
    });
    return;
  }

  if (!isMediaKind(kind.value)) {
    return;
  }

  await media.loadNextLibraryPage(kind.value, {
    searchTerm: localSearchTerm.value,
    sortBy: sortBy.value,
    sortOrder: sortOrder.value,
    limit,
  });
}

function currentPageLimit() {
  return calculateMediaPageLimit(contentRef.value?.clientWidth || window.innerWidth);
}

function handleContentScroll() {
  const scroller = contentRef.value;
  if (!scroller) {
    return;
  }
  const threshold = 180;
  const scrollBottom = scroller.scrollTop + scroller.clientHeight;
  const pageHeight = scroller.scrollHeight;
  showBackToTop.value = scroller.scrollTop > 120;
  if (scrollBottom + threshold >= pageHeight) {
    void loadNextPage();
  }
}

function scrollToTop() {
  contentRef.value?.scrollTo?.({ top: 0, behavior: "smooth" });
}

function submitLocalSearch() {
  localSearchTerm.value = localSearchInput.value.trim();
}

onMounted(() => {
  void load();
});
watch([kind, libraryId, collectionType], () => {
  localSearchInput.value = "";
  localSearchTerm.value = "";
  showBackToTop.value = false;
  contentRef.value?.scrollTo?.({ top: 0 });
  void load();
});
watch([sortBy, sortOrder, localSearchTerm], load);
</script>

<template>
  <main class="media-browser-shell">
    <MediaSidebar />

    <section ref="contentRef" class="media-browser-content" @scroll.passive="handleContentScroll">
      <header class="media-browser-topbar">
        <div>
          <p class="eyebrow">媒体库</p>
          <h1>{{ title }}</h1>
        </div>
        <div class="toolbar">
          <form class="local-library-search" role="search" @submit.prevent="submitLocalSearch">
            <input
              v-model="localSearchInput"
              class="local-library-search-input"
              type="search"
              :placeholder="`搜索${title}`"
              aria-label="搜索当前分类"
            />
          </form>
          <select v-model="sortBy" aria-label="排序字段">
            <option v-for="option in sortOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
          <select v-model="sortOrder" aria-label="排序方向">
            <option value="Descending">降序</option>
            <option value="Ascending">升序</option>
          </select>
        </div>
      </header>

      <StateBlock v-if="media.library.loading && media.library.items.length === 0" title="正在加载" loading />
      <StateBlock
        v-else-if="media.library.error && media.library.items.length === 0"
        title="加载失败"
        :detail="media.library.error.message"
      />
      <StateBlock v-else-if="media.library.items.length === 0" title="暂无内容" />
      <MediaGrid
        v-else-if="session.activeSession"
        :items="media.library.items"
        :server-url="session.activeSession.server.url"
        :token="session.activeSession.accessToken"
      />
      <div v-if="media.library.loadingMore" class="media-page-status" role="status">
        <span class="spinner" aria-hidden="true"></span>
        <span>正在加载更多</span>
      </div>
      <p v-else-if="media.library.error && media.library.items.length > 0" class="media-page-status media-page-status--error">
        {{ media.library.error.message }}
      </p>
      <p v-else-if="media.library.items.length > 0 && !media.library.hasMore" class="media-page-status">
        已加载全部内容
      </p>
    </section>

    <Transition name="back-to-top">
      <BackToTopButton v-if="showBackToTop" @back-to-top="scrollToTop" />
    </Transition>
  </main>
</template>
