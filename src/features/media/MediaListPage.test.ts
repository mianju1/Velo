// @vitest-environment jsdom
import { createPinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, nextTick, type App } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { useMediaStore } from "../../app/stores/media";
import { useSessionStore } from "../../app/stores/session";
import MediaListPage from "./MediaListPage.vue";
import packageJson from "../../../package.json";
import { fetchLibraryItems, fetchLibraryViews, fetchMediaItems } from "../../services/emby/media";

vi.mock("../../services/emby/media", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/emby/media")>();
  return {
    ...actual,
    fetchLibraryItems: vi.fn(),
    fetchLibraryViews: vi.fn(),
    fetchMediaItems: vi.fn(),
  };
});

let app: App<Element> | null = null;
let clientWidthMock: ReturnType<typeof vi.spyOn> | null = null;

describe("MediaListPage", () => {
  beforeEach(() => {
    vi.mocked(fetchLibraryViews).mockResolvedValue([
      { id: "library-1", name: "外语影片", type: "CollectionFolder", collectionType: "movies" },
      { id: "library-2", name: "动画", type: "CollectionFolder", collectionType: "tvshows" },
    ]);
    vi.mocked(fetchLibraryItems).mockResolvedValue({
      total: 1,
      rawItemCount: 1,
      items: [
        {
          id: "movie-1",
          name: "星际穿越",
          type: "Movie",
          year: 2014,
          runtimeMinutes: 169,
          genres: ["科幻"],
          videoHeight: 2160,
        },
      ],
    });
    vi.mocked(fetchMediaItems).mockResolvedValue({
      total: 1,
      rawItemCount: 1,
      items: [{ id: "favorite-1", name: "Favorite Movie", type: "Movie" }],
    });
  });

  afterEach(() => {
    app?.unmount();
    app = null;
    clientWidthMock?.mockRestore();
    clientWidthMock = null;
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("渲染带资源库导航的影视列表页面", async () => {
    const root = await mountMediaListPage();

    expect(root.querySelector(".media-sidebar-logo")?.textContent).toContain("Velo");
    expect(root.querySelector(".media-sidebar-divider")).not.toBeNull();
    expect(root.querySelector(".media-sidebar-search-input")).toBeNull();
    expect(root.querySelector(".media-sidebar-search-link")).not.toBeNull();
    expect(root.querySelector(".media-sidebar-search-link svg[data-icon='search']")).not.toBeNull();
    expect(sidebarText(root)).toContain("收藏");
    expect(sidebarText(root)).toContain("历史记录");
    expect(sidebarText(root)).toContain("设置");
    expect(root.querySelector("svg[data-icon='notebook']")).not.toBeNull();
    expect(root.querySelector("svg[data-icon='gear']")).not.toBeNull();
    expect(root.querySelector("svg[data-icon='gear'] path[data-role='gear-teeth']")).not.toBeNull();
    expect(sidebarText(root)).toContain("外语影片");
    expect(sidebarText(root)).toContain("动画");
    expect(root.querySelector(".media-browser-content h1")?.textContent).toBe("外语影片");
    expect(root.querySelector(".toolbar .local-library-search-input")).not.toBeNull();
    expect(root.querySelector(".toolbar .ghost")).toBeNull();
    expect(root.querySelector(".media-tile")?.textContent).toContain("星际穿越");
    expect(root.querySelector(".resolution-badge")?.textContent).toBe("4K");
  });

  it("搜索按钮位于收藏上方并进入全局搜索页面", async () => {
    const root = await mountMediaListPage();
    const search = root.querySelector(".media-sidebar-search-link");
    const favorite = [...root.querySelectorAll(".media-sidebar-link")].find((link) => link.textContent?.includes("收藏"));
    expect(
      Boolean(search && favorite && search.compareDocumentPosition(favorite) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);
    expect(search?.parentElement).toBe(favorite?.parentElement);

    expect((search as HTMLAnchorElement).getAttribute("href")).toBe("/search");
  });

  it("初次进入资源库时按当前行数的 4 倍请求分页数量", async () => {
    await mountMediaListPage({ contentWidth: 5 * 172 + 4 * 26 });

    expect(fetchLibraryItems).toHaveBeenCalledWith(
      expect.objectContaining({
        startIndex: 0,
        limit: 20,
      }),
    );
  });

  it("在当前资源库内搜索时只向当前分类列表请求搜索结果", async () => {
    const root = await mountMediaListPage({ contentWidth: 5 * 172 + 4 * 26 });

    const input = root.querySelector<HTMLInputElement>(".local-library-search-input")!;
    input.value = "星际";
    input.dispatchEvent(new Event("input"));
    root.querySelector<HTMLFormElement>(".local-library-search")?.dispatchEvent(new Event("submit"));
    await flush();

    expect(fetchLibraryItems).toHaveBeenLastCalledWith(
      expect.objectContaining({
        parentId: "library-1",
        collectionType: "movies",
        searchTerm: "星际",
        startIndex: 0,
        limit: 20,
      }),
    );
  });

  it("点击设置后弹出包含常规账号关于分类的小窗口", async () => {
    const root = await mountMediaListPage({ contentWidth: 5 * 172 + 4 * 26 });

    root.querySelector<HTMLButtonElement>(".media-settings-trigger")?.click();
    await nextTick();

    expect(root.querySelector(".media-sidebar .settings-dialog")).toBeNull();
    const dialog = document.body.querySelector<HTMLElement>(".settings-dialog");
    expect(dialog).not.toBeNull();
    const closeButton = document.body.querySelector<HTMLButtonElement>(".settings-close");
    expect(closeButton?.textContent?.trim()).toBe("");
    expect(closeButton?.querySelector(".settings-close-icon")).not.toBeNull();
    expect(dialog?.textContent).toContain("常规");
    expect(dialog?.textContent).toContain("缓存");
    expect(dialog?.textContent).toContain("清理缓存");

    findSettingsTab(document.body, "账号").click();
    await nextTick();
    expect(dialog?.textContent).toContain("切换账号");

    findSettingsTab(document.body, "关于").click();
    await nextTick();
    expect(dialog?.textContent).toContain("Velo");
    expect(dialog?.textContent).toContain(`v${packageJson.version}`);
    expect(dialog?.textContent).not.toContain("https://baidu.com/");
  });

  it("设置常规页提供三档软件主题滑动切换并立即应用主题", async () => {
    const root = await mountMediaListPage({ contentWidth: 5 * 172 + 4 * 26 });

    root.querySelector<HTMLButtonElement>(".media-settings-trigger")?.click();
    await nextTick();

    const switcher = document.body.querySelector<HTMLElement>(".theme-switch");
    const lightButton = document.body.querySelector<HTMLButtonElement>("[data-theme-option='light']");
    const darkButton = document.body.querySelector<HTMLButtonElement>("[data-theme-option='dark']");
    const autoButton = document.body.querySelector<HTMLButtonElement>("[data-theme-option='auto']");

    expect(switcher).not.toBeNull();
    expect(lightButton?.querySelector("svg[data-icon='sun']")).not.toBeNull();
    expect(darkButton?.querySelector("svg[data-icon='moon']")).not.toBeNull();
    expect(autoButton?.textContent?.trim()).toBe("A");

    darkButton?.click();
    await nextTick();

    expect(document.documentElement.dataset.themePreference).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(switcher?.classList.contains("theme-switch--dark")).toBe(true);

    lightButton?.click();
    await nextTick();

    expect(document.documentElement.dataset.themePreference).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(switcher?.classList.contains("theme-switch--light")).toBe(true);
  });

  it("滚动到底部时加载下一页并保留已展示内容", async () => {
    vi.mocked(fetchLibraryItems)
      .mockResolvedValueOnce({
        total: 2,
        rawItemCount: 1,
        items: [{ id: "movie-1", name: "星际穿越", type: "Movie", genres: ["科幻"] }],
      })
      .mockResolvedValueOnce({
        total: 2,
        rawItemCount: 1,
        items: [{ id: "movie-2", name: "盗梦空间", type: "Movie", genres: ["科幻"] }],
    });
    const root = await mountMediaListPage();
    const content = root.querySelector<HTMLElement>(".media-browser-content")!;

    Object.defineProperty(content, "clientHeight", { configurable: true, value: 600 });
    Object.defineProperty(content, "scrollTop", { configurable: true, value: 420 });
    Object.defineProperty(content, "scrollHeight", { configurable: true, value: 1000 });
    content.dispatchEvent(new Event("scroll"));
    await flush();

    expect(fetchLibraryItems).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        startIndex: 1,
        limit: 20,
      }),
    );
    expect(root.querySelector(".media-grid")?.textContent).toContain("星际穿越");
    expect(root.querySelector(".media-grid")?.textContent).toContain("盗梦空间");
  });

  it("页面滚动后显示 SVG 回到顶部按钮并平滑返回顶部", async () => {
    const root = await mountMediaListPage();
    const content = root.querySelector<HTMLElement>(".media-browser-content")!;
    const scrollTo = vi.fn();
    Object.defineProperty(content, "scrollTo", { configurable: true, value: scrollTo });

    expect(root.querySelector(".back-to-top-button")).toBeNull();

    Object.defineProperty(content, "clientHeight", { configurable: true, value: 600 });
    Object.defineProperty(content, "scrollTop", { configurable: true, value: 240 });
    Object.defineProperty(content, "scrollHeight", { configurable: true, value: 2000 });
    content.dispatchEvent(new Event("scroll"));
    await nextTick();

    const button = root.querySelector<HTMLButtonElement>(".back-to-top-button");
    expect(button).not.toBeNull();
    expect(button?.textContent?.trim()).toBe("");
    expect(button?.querySelector("svg[data-icon='back-to-top']")).not.toBeNull();

    button?.click();

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
  });

  it("does not refetch sidebar library views when opening favorites with cached views", async () => {
    await mountFavoritesPageWithCachedViews();

    expect(fetchMediaItems).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "favorites",
        startIndex: 0,
      }),
    );
    expect(fetchLibraryViews).not.toHaveBeenCalled();
  });
});

async function mountMediaListPage(options: { contentWidth?: number } = {}) {
  if (options.contentWidth) {
    clientWidthMock = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("media-browser-content") ? options.contentWidth ?? 0 : 0;
    });
  }

  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/library/:kind", component: MediaListPage },
      { path: "/library-view/:libraryId", component: MediaListPage },
      { path: "/media/:itemId", component: { template: "<div />" } },
      { path: "/search", component: { template: "<div />" } },
    ],
  });
  router.push({ path: "/library-view/library-1", query: { name: "外语影片", collectionType: "movies" } });
  await router.isReady();

  const root = document.createElement("div");
  document.body.append(root);
  app = createApp(MediaListPage);
  app.use(pinia);
  app.use(router);
  const session = useSessionStore();
  session.activeSession = {
    server: { id: "server-1", name: "Home", url: "https://emby.example.test" },
    account: { id: "user-1", serverId: "server-1", name: "alice" },
    accessToken: "token-1",
  };
  app.mount(root);
  await flush();

  return root;
}

async function mountFavoritesPageWithCachedViews() {
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/library/:kind", component: MediaListPage },
      { path: "/library-view/:libraryId", component: MediaListPage },
      { path: "/media/:itemId", component: { template: "<div />" } },
      { path: "/search", component: { template: "<div />" } },
    ],
  });
  router.push("/library/favorites");
  await router.isReady();

  const root = document.createElement("div");
  document.body.append(root);
  app = createApp(MediaListPage);
  app.use(pinia);
  app.use(router);
  const session = useSessionStore();
  session.activeSession = {
    server: { id: "server-1", name: "Home", url: "https://emby.example.test" },
    account: { id: "user-1", serverId: "server-1", name: "alice" },
    accessToken: "token-1",
  };

  await useMediaStore().loadViews();
  vi.mocked(fetchLibraryViews).mockClear();

  app.mount(root);
  await flush();

  return root;
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
}

function sidebarText(root: Element) {
  return root.querySelector(".media-sidebar")?.textContent ?? "";
}

function findSettingsTab(root: Element, label: string) {
  const button = [...root.querySelectorAll<HTMLButtonElement>(".settings-tab")].find((tab) =>
    tab.textContent?.includes(label),
  );
  if (!button) {
    throw new Error(`未找到设置分类：${label}`);
  }
  return button;
}
