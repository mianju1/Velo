import { describe, expect, it } from "vitest";
import { calculateMediaPageLimit } from "./media-pagination";

describe("media pagination", () => {
  it("按当前一行可展示数量的 4 倍计算每页加载数量", () => {
    const fiveColumnsWidth = 5 * 172 + 4 * 26;

    expect(calculateMediaPageLimit(fiveColumnsWidth)).toBe(20);
  });

  it("宽度不足一列时至少加载 4 个条目", () => {
    expect(calculateMediaPageLimit(120)).toBe(4);
  });

  it("不同窗口宽度会得到对应行数的倍数", () => {
    const threeColumnsWidth = 3 * 172 + 2 * 26;
    const sixColumnsWidth = 6 * 172 + 5 * 26;

    expect(calculateMediaPageLimit(threeColumnsWidth)).toBe(12);
    expect(calculateMediaPageLimit(sixColumnsWidth)).toBe(24);
  });
});
