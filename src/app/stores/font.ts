import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { listSystemFonts } from "../../services/system/fonts";

export type FontOptionSource = "built-in" | "system";
export type FontOption = {
  family: string;
  label: string;
  source: FontOptionSource;
};

export const DEFAULT_APP_FONT_FAMILY = "MapleMono-CN";
const FONT_STORAGE_KEY = "velo-font-family";
const BUILT_IN_FONT_OPTION: FontOption = {
  family: DEFAULT_APP_FONT_FAMILY,
  label: DEFAULT_APP_FONT_FAMILY,
  source: "built-in",
};

export const useFontStore = defineStore("font", () => {
  const selectedFamily = ref(readStoredFontFamily());
  const systemFonts = ref<string[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const fontOptions = computed<FontOption[]>(() => [
    BUILT_IN_FONT_OPTION,
    ...systemFonts.value
      .filter((family) => family.toLocaleLowerCase() !== DEFAULT_APP_FONT_FAMILY.toLocaleLowerCase())
      .map((family) => ({ family, label: family, source: "system" as const })),
  ]);

  async function loadSystemFonts() {
    loading.value = true;
    error.value = null;

    try {
      systemFonts.value = normalizeSystemFonts(await listSystemFonts());
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : "无法读取系统字体";
    } finally {
      loading.value = false;
    }
  }

  function setFontFamily(nextFamily: string) {
    const normalizedFamily = normalizeFontFamily(nextFamily);
    selectedFamily.value = normalizedFamily;
    writeStoredFontFamily(normalizedFamily);
    applyToDocument();
  }

  function applyToDocument() {
    if (!isBrowser()) {
      return;
    }

    document.documentElement.dataset.fontFamily = selectedFamily.value;
    document.documentElement.style.setProperty("--app-font-family", formatFontFamily(selectedFamily.value));
  }

  applyToDocument();

  return {
    selectedFamily,
    systemFonts,
    fontOptions,
    loading,
    error,
    loadSystemFonts,
    setFontFamily,
    applyToDocument,
  };
});

export function formatFontFamily(family: string) {
  return `"${family.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function readStoredFontFamily() {
  if (!isBrowser()) {
    return DEFAULT_APP_FONT_FAMILY;
  }

  try {
    return normalizeFontFamily(window.localStorage.getItem(FONT_STORAGE_KEY));
  } catch {
    return DEFAULT_APP_FONT_FAMILY;
  }
}

function writeStoredFontFamily(family: string) {
  if (!isBrowser()) {
    return;
  }

  try {
    window.localStorage.setItem(FONT_STORAGE_KEY, family);
  } catch {
    // Storage can be unavailable in restricted webviews; keep the session value applied.
  }
}

function normalizeFontFamily(family: string | null) {
  const normalizedFamily = family?.trim();
  return normalizedFamily ? normalizedFamily : DEFAULT_APP_FONT_FAMILY;
}

function normalizeSystemFonts(families: string[]) {
  const seenFamilies = new Set<string>();

  return families
    .map((family) => family.trim())
    .filter((family) => family.length > 0)
    .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }))
    .filter((family) => {
      const key = family.toLocaleLowerCase();
      if (seenFamilies.has(key)) {
        return false;
      }

      seenFamilies.add(key);
      return true;
    });
}

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}
