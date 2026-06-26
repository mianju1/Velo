<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { useMediaStore } from "../../../app/stores/media";
import logoUrl from "../../../assets/velo-logo.svg";
import { defaultLibraryRoute, libraryViewRoute } from "../library-routes";
import SettingsDialog from "./SettingsDialog.vue";

const media = useMediaStore();
const route = useRoute();
const settingsOpen = ref(false);

const kind = computed(() => String(route.params.kind ?? ""));
const libraryId = computed(() => String(route.params.libraryId ?? ""));
const fixedSidebarEntries = [
  { label: "收藏", path: "/library/favorites", kind: "favorites", icon: "star" },
  { label: "历史记录", path: "/library/continue", kind: "continue", icon: "notebook" },
] as const;

function isFixedEntryActive(entryKind: string) {
  return !libraryId.value && kind.value === entryKind;
}

function isLibraryViewActive(viewId: string) {
  return libraryId.value === viewId;
}

onMounted(() => {
  void media.loadViews();
});
</script>

<template>
  <aside class="media-sidebar" aria-label="媒体导航">
    <RouterLink class="media-sidebar-logo" :to="defaultLibraryRoute(media.views.items)" aria-label="返回资源库">
      <img :src="logoUrl" alt="" />
      <strong>Velo</strong>
    </RouterLink>

    <nav class="media-sidebar-nav" aria-label="快捷列表">
      <RouterLink
        class="media-sidebar-link media-sidebar-search-link"
        :class="{ 'media-sidebar-link--active': route.path === '/search' }"
        to="/search"
      >
        <svg class="media-sidebar-svg" data-icon="search" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="10.5" cy="10.5" r="6.25"></circle>
          <path d="M15.2 15.2 20 20"></path>
        </svg>
        <span>搜索</span>
      </RouterLink>
      <RouterLink
        v-for="entry in fixedSidebarEntries"
        :key="entry.path"
        class="media-sidebar-link"
        :class="{ 'media-sidebar-link--active': isFixedEntryActive(entry.kind) }"
        :to="entry.path"
      >
        <svg
          v-if="entry.icon === 'star'"
          class="media-sidebar-svg"
          data-icon="star"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d="m12 3.8 2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6L7.1 19l.9-5.5-4-3.9 5.5-.8L12 3.8Z"></path>
        </svg>
        <svg v-else class="media-sidebar-svg" data-icon="notebook" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 4.5h9.2c1 0 1.8.8 1.8 1.8v11.4c0 1-.8 1.8-1.8 1.8H8c-1 0-1.8-.8-1.8-1.8V6.3c0-1 .8-1.8 1.8-1.8Z"></path>
          <path d="M9.2 8.2h6.6M9.2 12h6.6M9.2 15.8h4.4M5 6h2.4M5 10h2.4M5 14h2.4M5 18h2.4"></path>
        </svg>
        <span>{{ entry.label }}</span>
      </RouterLink>
      <button type="button" class="media-sidebar-link media-settings-trigger" @click="settingsOpen = true">
        <svg class="media-sidebar-svg" data-icon="gear" viewBox="0 0 24 24" aria-hidden="true">
          <path
            data-role="gear-teeth"
            d="M12 3.4 13.2 5.1c.4.1.9.2 1.3.4l1.9-.8 2.1 2.1-.8 1.9c.2.4.4.8.5 1.3l1.7 1.2v3l-1.7 1.2c-.1.5-.3.9-.5 1.3l.8 1.9-2.1 2.1-1.9-.8c-.4.2-.8.3-1.3.4L12 20.6l-1.2-1.7c-.5-.1-.9-.2-1.3-.4l-1.9.8-2.1-2.1.8-1.9c-.2-.4-.4-.8-.5-1.3L4.1 12.8v-3l1.7-1.2c.1-.5.3-.9.5-1.3l-.8-1.9 2.1-2.1 1.9.8c.4-.2.8-.3 1.3-.4L12 3.4Z"
          ></path>
          <circle cx="12" cy="12" r="3.2"></circle>
        </svg>
        <span>设置</span>
      </button>
    </nav>

    <div class="media-sidebar-divider" aria-hidden="true"></div>

    <nav class="media-sidebar-nav media-sidebar-nav--libraries" aria-label="服务器资源库">
      <p class="media-sidebar-title">资源库</p>
      <p v-if="media.views.loading" class="media-sidebar-muted">正在加载</p>
      <p v-else-if="media.views.error" class="media-sidebar-muted">{{ media.views.error.message }}</p>
      <template v-else>
        <RouterLink
          v-for="view in media.views.items"
          :key="view.id"
          class="media-sidebar-link"
          :class="{ 'media-sidebar-link--active': isLibraryViewActive(view.id) }"
          :to="libraryViewRoute(view)"
        >
          <svg class="media-sidebar-svg" data-icon="library" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4.8 7.8c0-1 .8-1.8 1.8-1.8h10.8c1 0 1.8.8 1.8 1.8v8.4c0 1-.8 1.8-1.8 1.8H6.6c-1 0-1.8-.8-1.8-1.8V7.8Z"></path>
            <path d="M7.2 9.2h9.6M7.2 12h9.6"></path>
          </svg>
          <span>{{ view.name }}</span>
        </RouterLink>
      </template>
    </nav>

    <SettingsDialog v-if="settingsOpen" @close="settingsOpen = false" />
  </aside>
</template>
