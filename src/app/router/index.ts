import { createRouter, createWebHashHistory } from "vue-router";
import ServersPage from "../../features/servers/ServersPage.vue";
import MediaDetailPage from "../../features/media/MediaDetailPage.vue";
import MediaListPage from "../../features/media/MediaListPage.vue";
import SearchPage from "../../features/media/SearchPage.vue";

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", component: ServersPage },
    { path: "/library/:kind", component: MediaListPage },
    { path: "/library-view/:libraryId", component: MediaListPage },
    { path: "/media/:itemId", component: MediaDetailPage },
    { path: "/search", component: SearchPage },
  ],
});
