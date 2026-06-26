import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFontStore } from "./font";
import { listSystemFonts } from "../../services/system/fonts";

vi.mock("../../services/system/fonts", () => ({
  listSystemFonts: vi.fn(),
}));

describe("font store", () => {
  beforeEach(() => {
    const styleValues = new Map<string, string>();
    const localStorageValues = new Map<string, string>();

    vi.stubGlobal("document", {
      documentElement: {
        dataset: {} as Record<string, string>,
        style: {
          getPropertyValue: (name: string) => styleValues.get(name) ?? "",
          removeProperty: (name: string) => {
            styleValues.delete(name);
          },
          setProperty: (name: string, value: string) => {
            styleValues.set(name, value);
          },
        },
      },
    });
    vi.stubGlobal("window", {
      localStorage: {
        clear: () => localStorageValues.clear(),
        getItem: (key: string) => localStorageValues.get(key) ?? null,
        setItem: (key: string, value: string) => {
          localStorageValues.set(key, value);
        },
      },
    });
    setActivePinia(createPinia());
    vi.mocked(listSystemFonts).mockReset();
  });

  it("defaults to bundled MapleMono-CN and applies it globally", () => {
    const font = useFontStore();

    expect(font.selectedFamily).toBe("MapleMono-CN");
    expect(document.documentElement.dataset.fontFamily).toBe("MapleMono-CN");
    expect(document.documentElement.style.getPropertyValue("--app-font-family")).toBe('"MapleMono-CN"');
  });

  it("persists selected system font and reapplies it on next store creation", () => {
    const font = useFontStore();

    font.setFontFamily("Segoe UI");

    expect(window.localStorage.getItem("velo-font-family")).toBe("Segoe UI");
    expect(document.documentElement.dataset.fontFamily).toBe("Segoe UI");
    expect(document.documentElement.style.getPropertyValue("--app-font-family")).toBe('"Segoe UI"');

    setActivePinia(createPinia());
    const restoredFont = useFontStore();

    expect(restoredFont.selectedFamily).toBe("Segoe UI");
  });

  it("loads system fonts after the built-in option without duplicates", async () => {
    vi.mocked(listSystemFonts).mockResolvedValue(["Segoe UI", "MapleMono-CN", "Arial", "segoe ui"]);
    const font = useFontStore();

    await font.loadSystemFonts();

    expect(font.fontOptions).toEqual([
      { family: "MapleMono-CN", label: "MapleMono-CN", source: "built-in" },
      { family: "Arial", label: "Arial", source: "system" },
      { family: "Segoe UI", label: "Segoe UI", source: "system" },
    ]);
  });
});
