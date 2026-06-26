import { describe, expect, it } from "vitest";
import { libraryEntries } from "./media-labels";

describe("媒体入口标签", () => {
  it("主页固定入口只保留继续观看和收藏，搜索入口单独展示", () => {
    expect(libraryEntries.map((entry) => entry.kind)).toEqual(["continue", "favorites"]);
  });
});
