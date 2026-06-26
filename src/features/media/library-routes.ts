import type { RouteLocationRaw } from "vue-router";
import type { LibraryView } from "../../services/emby/media";

export function libraryViewRoute(view: LibraryView): RouteLocationRaw {
  return {
    path: `/library-view/${view.id}`,
    query: {
      name: view.name,
      collectionType: view.collectionType ?? "",
    },
  };
}

export function defaultLibraryRoute(views: LibraryView[]): RouteLocationRaw {
  const firstView = views[0];
  return firstView ? libraryViewRoute(firstView) : { path: "/library/continue" };
}
