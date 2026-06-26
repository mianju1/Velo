// @vitest-environment jsdom
import { createPinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, nextTick, type App } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import ServersPage from "./ServersPage.vue";
import { fetchLibraryViews } from "../../services/emby/media";
import { listSavedSessions, login, removeAccount, restoreSession } from "../../services/emby/session";

vi.mock("../../services/emby/media", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/emby/media")>();
  return {
    ...actual,
    fetchLibraryViews: vi.fn(),
  };
});

vi.mock("../../services/emby/session", () => ({
  listSavedSessions: vi.fn(),
  login: vi.fn(),
  removeAccount: vi.fn(),
  removeServer: vi.fn(),
  restoreSession: vi.fn(),
  validateServer: vi.fn(),
}));

let app: App<Element> | null = null;

describe("ServersPage", () => {
  beforeEach(() => {
    vi.mocked(listSavedSessions).mockResolvedValue({ servers: [], accounts: [] });
    vi.mocked(fetchLibraryViews).mockResolvedValue([
      { id: "library-1", name: "电影", type: "CollectionFolder", collectionType: "movies" },
      { id: "library-2", name: "动画", type: "CollectionFolder", collectionType: "tvshows" },
    ]);
    vi.mocked(login).mockResolvedValue({
      server: { id: "server-1", name: "Home", url: "https://emby.example.test" },
      account: { id: "user-1", serverId: "server-1", name: "alice" },
      accessToken: "token-1",
    });
    vi.mocked(restoreSession).mockResolvedValue({
      server: { id: "server-1", name: "Home", url: "https://emby.example.test" },
      account: { id: "user-2", serverId: "server-1", name: "bob" },
      accessToken: "token-2",
    });
  });

  afterEach(() => {
    app?.unmount();
    app = null;
    document.body.innerHTML = "";
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("首次登录时默认选择新增 Emby 连接并展示登录编辑框", async () => {
    const { root } = await mountServersPage();

    expect(connectionSelect(root).value).toBe("new");
    expect(connectionSelect(root).textContent).toContain("新增 Emby 连接");
    expect(root.querySelector(".login-logo")).not.toBeNull();
    expect(root.querySelector<HTMLInputElement>("input[autocomplete='username']")).not.toBeNull();
    expect(root.querySelector<HTMLInputElement>("input[type='password']")).not.toBeNull();
  });

  it("已有本地账号时默认选择最近账号，隐藏编辑框并可继续登录", async () => {
    vi.mocked(listSavedSessions).mockResolvedValue({
      servers: [{ id: "server-1", name: "Home", url: "https://emby.example.test" }],
      accounts: [
        { id: "user-1", serverId: "server-1", name: "alice" },
        { id: "user-2", serverId: "server-1", name: "bob" },
      ],
    });
    const { root } = await mountServersPage();

    expect(connectionSelect(root).value).toBe("saved:server-1:user-2");
    expect(root.querySelector(".login-logo")).not.toBeNull();
    expect(root.querySelector<HTMLInputElement>("input[autocomplete='username']")).toBeNull();
    expect(root.querySelector<HTMLInputElement>("input[type='password']")).toBeNull();

    root.querySelector<HTMLButtonElement>(".saved-login-action")?.click();
    await flush();

    expect(restoreSession).toHaveBeenCalledWith("server-1", "user-2");
  });

  it("点击继续登录后立即显示登录和载入视频列表状态", async () => {
    vi.mocked(listSavedSessions).mockResolvedValue({
      servers: [{ id: "server-1", name: "Home", url: "https://emby.example.test" }],
      accounts: [{ id: "user-2", serverId: "server-1", name: "bob" }],
    });
    let resolveRestore: (value: Awaited<ReturnType<typeof restoreSession>>) => void = () => {};
    vi.mocked(restoreSession).mockReturnValue(
      new Promise((resolve) => {
        resolveRestore = resolve;
      }),
    );
    let resolveViews: (value: Awaited<ReturnType<typeof fetchLibraryViews>>) => void = () => {};
    vi.mocked(fetchLibraryViews).mockReturnValue(
      new Promise((resolve) => {
        resolveViews = resolve;
      }),
    );
    const { root } = await mountServersPage();

    root.querySelector<HTMLButtonElement>(".saved-login-action")?.click();
    await nextTick();

    expect(root.querySelector(".login-progress")?.textContent).toContain("登录中");

    resolveRestore({
      server: { id: "server-1", name: "Home", url: "https://emby.example.test" },
      account: { id: "user-2", serverId: "server-1", name: "bob" },
      accessToken: "token-2",
    });
    await flush();

    expect(root.querySelector(".login-progress")?.textContent).toContain("正在载入视频列表");

    resolveViews([{ id: "library-1", name: "电影", type: "CollectionFolder", collectionType: "movies" }]);
    await flush();
  });

  it("登录成功后加载资源库并默认进入第一个资源库", async () => {
    const { root, router } = await mountServersPage();

    root.querySelector<HTMLInputElement>("input[placeholder='https://example.com']")!.value = "emby.example.test";
    root
      .querySelector<HTMLInputElement>("input[placeholder='https://example.com']")!
      .dispatchEvent(new Event("input"));
    root.querySelector<HTMLInputElement>("input[autocomplete='username']")!.value = "alice";
    root.querySelector<HTMLInputElement>("input[autocomplete='username']")!.dispatchEvent(new Event("input"));
    root.querySelector<HTMLInputElement>("input[type='password']")!.value = "secret";
    root.querySelector<HTMLInputElement>("input[type='password']")!.dispatchEvent(new Event("input"));
    root.querySelector<HTMLFormElement>(".login-form")?.dispatchEvent(new Event("submit"));
    await flush();
    await flush();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(login).toHaveBeenCalled();
    expect(fetchLibraryViews).toHaveBeenCalledWith({
      serverUrl: "https://emby.example.test",
      userId: "user-1",
      token: "token-1",
    });
    expect(router.currentRoute.value.path).toBe("/library-view/library-1");
    expect(router.currentRoute.value.query).toEqual({ name: "电影", collectionType: "movies" });
  });

  it("新连接登录失败时显示错误码和失败原因", async () => {
    vi.mocked(login).mockRejectedValue({
      code: "network_error",
      message: "连接失败",
      detail: "dial tcp timeout",
      recoverable: true,
    });
    const { root } = await mountServersPage();

    root.querySelector<HTMLInputElement>("input[placeholder='https://example.com']")!.value = "emby.example.test";
    root
      .querySelector<HTMLInputElement>("input[placeholder='https://example.com']")!
      .dispatchEvent(new Event("input"));
    root.querySelector<HTMLInputElement>("input[autocomplete='username']")!.value = "alice";
    root.querySelector<HTMLInputElement>("input[autocomplete='username']")!.dispatchEvent(new Event("input"));
    root.querySelector<HTMLInputElement>("input[type='password']")!.value = "secret";
    root.querySelector<HTMLInputElement>("input[type='password']")!.dispatchEvent(new Event("input"));
    root.querySelector<HTMLFormElement>(".login-form")?.dispatchEvent(new Event("submit"));
    await flush();

    expect(root.querySelector(".error")?.textContent).toContain("network_error - dial tcp timeout");
  });

  it("新连接登录超过 15 秒后提示连接超时并允许重新登录", async () => {
    vi.useFakeTimers();
    vi.mocked(login).mockReturnValue(new Promise(() => {}));
    const { root } = await mountServersPage();

    root.querySelector<HTMLInputElement>("input[placeholder='https://example.com']")!.value = "emby.example.test";
    root
      .querySelector<HTMLInputElement>("input[placeholder='https://example.com']")!
      .dispatchEvent(new Event("input"));
    root.querySelector<HTMLInputElement>("input[autocomplete='username']")!.value = "alice";
    root.querySelector<HTMLInputElement>("input[autocomplete='username']")!.dispatchEvent(new Event("input"));
    root.querySelector<HTMLInputElement>("input[type='password']")!.value = "secret";
    root.querySelector<HTMLInputElement>("input[type='password']")!.dispatchEvent(new Event("input"));
    root.querySelector<HTMLFormElement>(".login-form")?.dispatchEvent(new Event("submit"));
    await nextTick();

    expect(root.querySelector(".login-progress")?.textContent).toContain("登录中");

    await vi.advanceTimersByTimeAsync(15_000);
    await flush();

    expect(root.querySelector(".login-progress")).toBeNull();
    expect(root.querySelector(".error")?.textContent).toContain("连接超时");
    expect(root.querySelector<HTMLButtonElement>("button[type='submit']")?.disabled).toBe(false);
    vi.useRealTimers();
  });

  it("继续登录超过 15 秒后提示连接超时并允许重新登录", async () => {
    vi.useFakeTimers();
    vi.mocked(listSavedSessions).mockResolvedValue({
      servers: [{ id: "server-1", name: "Home", url: "https://emby.example.test" }],
      accounts: [{ id: "user-2", serverId: "server-1", name: "bob" }],
    });
    vi.mocked(restoreSession).mockReturnValue(new Promise(() => {}));
    const { root } = await mountServersPage();

    root.querySelector<HTMLButtonElement>(".saved-login-action")?.click();
    await nextTick();

    expect(root.querySelector(".login-progress")?.textContent).toContain("登录中");

    await vi.advanceTimersByTimeAsync(15_000);
    await flush();

    expect(root.querySelector(".login-progress")).toBeNull();
    expect(root.querySelector(".error")?.textContent).toContain("连接超时");
    expect(root.querySelector<HTMLButtonElement>(".saved-login-action")?.disabled).toBe(false);
    vi.useRealTimers();
  });

  it("从已保存账号切换到新增 Emby 连接后重新展示编辑框", async () => {
    vi.mocked(listSavedSessions).mockResolvedValue({
      servers: [{ id: "server-1", name: "Home", url: "https://emby.example.test" }],
      accounts: [{ id: "user-1", serverId: "server-1", name: "alice" }],
    });
    const { root } = await mountServersPage();

    connectionSelect(root).value = "new";
    connectionSelect(root).dispatchEvent(new Event("change"));
    await nextTick();

    expect(root.querySelector<HTMLInputElement>("input[autocomplete='username']")).not.toBeNull();
    expect(root.querySelector<HTMLInputElement>("input[type='password']")).not.toBeNull();
  });

  it("选中历史账号后可以只删除当前账号", async () => {
    vi.mocked(listSavedSessions).mockResolvedValue({
      servers: [{ id: "server-1", name: "Home", url: "https://emby.example.test" }],
      accounts: [
        { id: "user-1", serverId: "server-1", name: "alice" },
        { id: "user-2", serverId: "server-1", name: "bob" },
      ],
    });
    vi.mocked(removeAccount).mockResolvedValue({
      servers: [{ id: "server-1", name: "Home", url: "https://emby.example.test" }],
      accounts: [{ id: "user-1", serverId: "server-1", name: "alice" }],
    });
    const { root } = await mountServersPage();

    root.querySelector<HTMLButtonElement>(".saved-login-delete")?.click();
    await flush();

    expect(removeAccount).toHaveBeenCalledWith("server-1", "user-2");
    expect(connectionSelect(root).value).toBe("saved:server-1:user-1");
  });
});

async function mountServersPage() {
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: ServersPage },
      { path: "/library-view/:libraryId", component: { template: "<div />" } },
      { path: "/library/:kind", component: { template: "<div />" } },
    ],
  });
  router.push("/");
  await router.isReady();

  const root = document.createElement("div");
  document.body.append(root);
  app = createApp(ServersPage);
  app.use(pinia);
  app.use(router);
  app.mount(root);
  await flush();

  return { root, router };
}

async function flush() {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve();
  }
  await nextTick();
}

function connectionSelect(root: Element) {
  const select = root.querySelector<HTMLSelectElement>("select[aria-label='连接']");
  if (!select) {
    throw new Error("未找到连接下拉框");
  }

  return select;
}
