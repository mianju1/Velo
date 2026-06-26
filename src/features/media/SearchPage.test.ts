// @vitest-environment jsdom
import { createPinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, nextTick, type App } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { useSessionStore } from "../../app/stores/session";
import { searchMediaItems } from "../../services/emby/media";
import SearchPage from "./SearchPage.vue";

vi.mock("../../services/emby/media", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/emby/media")>();
  return {
    ...actual,
    searchMediaItems: vi.fn(),
  };
});

let app: App<Element> | null = null;

describe("SearchPage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(searchMediaItems).mockResolvedValue({
      total: 1,
      rawItemCount: 1,
      items: [{ id: "movie-1", name: "星际穿越", type: "Movie" }],
    });
  });

  afterEach(() => {
    app?.unmount();
    app = null;
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("提交关键词后执行 Emby 全局搜索并展示搜索记录", async () => {
    const root = await mountSearchPage();

    expect(root.querySelector(".media-sidebar")).not.toBeNull();
    expect(root.querySelector(".media-sidebar-search-link")?.classList.contains("media-sidebar-link--active")).toBe(true);
    expect(root.querySelector(".back-button")).toBeNull();

    const input = root.querySelector<HTMLInputElement>(".global-search-input")!;
    input.value = "星际";
    input.dispatchEvent(new Event("input"));
    root.querySelector<HTMLButtonElement>(".global-search-submit")?.click();
    await flush();

    expect(searchMediaItems).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "星际",
        serverUrl: "https://emby.example.test",
        userId: "user-1",
        token: "token-1",
      }),
    );
    expect(root.querySelector(".search-history")?.textContent).toContain("星际");
    expect(root.querySelector(".media-grid")?.textContent).toContain("星际穿越");
  });

  it("搜索列表滚动后显示 SVG 回到顶部按钮并平滑返回顶部", async () => {
    const root = await mountSearchPage();
    const content = root.querySelector<HTMLElement>(".media-browser-content")!;
    const scrollTo = vi.fn();
    Object.defineProperty(content, "scrollTo", { configurable: true, value: scrollTo });

    expect(root.querySelector(".back-to-top-button")).toBeNull();

    Object.defineProperty(content, "scrollTop", { configurable: true, value: 220 });
    content.dispatchEvent(new Event("scroll"));
    await nextTick();

    const button = root.querySelector<HTMLButtonElement>(".back-to-top-button");
    expect(button).not.toBeNull();
    expect(button?.textContent?.trim()).toBe("");
    expect(button?.querySelector("svg[data-icon='back-to-top']")).not.toBeNull();

    button?.click();

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
  });
});

async function mountSearchPage() {
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/search", component: SearchPage },
      { path: "/media/:itemId", component: { template: "<div />" } },
      { path: "/library/continue", component: { template: "<div />" } },
    ],
  });
  router.push("/search");
  await router.isReady();

  const root = document.createElement("div");
  document.body.append(root);
  app = createApp(SearchPage);
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

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
}
