// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { createApp, nextTick, type App } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import MediaGrid from "./MediaGrid.vue";

describe("MediaGrid", () => {
  let app: App<Element> | null = null;

  afterEach(() => {
    app?.unmount();
    app = null;
    document.body.innerHTML = "";
  });

  it("展示合集历史观看到的集数", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/", component: { template: "<div />" } },
        { path: "/media/:itemId", component: { template: "<div />" } },
      ],
    });
    app = createApp(MediaGrid, {
      serverUrl: "https://emby.example.test",
      token: "token-1",
      items: [
        {
          id: "season-1",
          name: "追番 第 1 季",
          type: "Season",
          progressLabel: "观看到第 1 季第 2 集",
        },
      ],
    });
    app.use(router);
    app.mount(root);
    await nextTick();

    expect(root.querySelector(".media-progress")?.textContent).toBe("观看到第 1 季第 2 集");
  });

  it("展示影视卡片的总集数、类型标签和最高分辨率，不展示总时长", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/", component: { template: "<div />" } },
        { path: "/media/:itemId", component: { template: "<div />" } },
      ],
    });
    app = createApp(MediaGrid, {
      serverUrl: "https://emby.example.test",
      token: "token-1",
      items: [
        {
          id: "season-1",
          name: "外语影片 第 2 季",
          type: "Season",
          seasonNumber: 2,
          episodeCount: 12,
          runtimeMinutes: 120,
          genres: ["剧情", "科幻"],
          videoHeight: 2160,
        },
      ],
    });
    app.use(router);
    app.mount(root);
    await nextTick();

    expect(root.querySelector(".resolution-badge")?.textContent).toBe("4K");
    expect(root.querySelector(".media-season")).toBeNull();
    expect(root.querySelector(".media-copy strong")?.textContent).toBe("外语影片 第 2 季");
    expect(root.querySelector(".media-episode-count")?.textContent).toBe("共 12 集");
    expect(root.querySelector(".media-runtime")).toBeNull();
    const tags = [...root.querySelectorAll(".media-tag")];
    expect(tags.map((tag) => tag.textContent)).toEqual([
      "剧情",
      "科幻",
    ]);
    expect(tags.every((tag) => tag.classList.contains("media-tag--genre"))).toBe(true);
  });

  it("影视卡片海报上不展示播放按钮", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/", component: { template: "<div />" } },
        { path: "/media/:itemId", component: { template: "<div />" } },
      ],
    });
    app = createApp(MediaGrid, {
      serverUrl: "https://emby.example.test",
      token: "token-1",
      items: [
        {
          id: "movie-1",
          name: "电影",
          type: "Movie",
        },
      ],
    });
    app.use(router);
    app.mount(root);
    await nextTick();

    expect(root.querySelector(".poster-play-indicator")).toBeNull();
    expect(root.querySelector("svg[data-icon='poster-play']")).toBeNull();
  });

  it("单季剧集卡片标题下方不展示季数字样", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/", component: { template: "<div />" } },
        { path: "/media/:itemId", component: { template: "<div />" } },
      ],
    });
    app = createApp(MediaGrid, {
      serverUrl: "https://emby.example.test",
      token: "token-1",
      items: [
        {
          id: "season-1",
          name: "摇滚萝莉",
          type: "Season",
          seasonNumber: 1,
          episodeCount: 26,
        },
      ],
    });
    app.use(router);
    app.mount(root);
    await nextTick();

    expect(root.querySelector(".media-copy strong")?.textContent).toBe("摇滚萝莉");
    expect(root.querySelector(".media-season")).toBeNull();
    expect(root.querySelector(".media-episode-count")?.textContent).toBe("共 26 集");
  });
});
