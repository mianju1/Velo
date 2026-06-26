import { defineStore } from "pinia";
import { computed, ref } from "vue";

export type ThemePreference = "light" | "dark" | "auto";
export type ResolvedTheme = "light" | "dark";

const THEME_STORAGE_KEY = "velo-theme-preference";
const themePreferences = new Set<ThemePreference>(["light", "dark", "auto"]);

export const themeOptions: Array<{ value: ThemePreference; label: string }> = [
  { value: "light", label: "白天" },
  { value: "dark", label: "黑夜" },
  { value: "auto", label: "自动" },
];

export const useThemeStore = defineStore("theme", () => {
  const preference = ref<ThemePreference>(readStoredPreference());
  const systemTheme = ref<ResolvedTheme>(readSystemTheme());
  const resolvedTheme = computed<ResolvedTheme>(() =>
    preference.value === "auto" ? systemTheme.value : preference.value,
  );

  function setPreference(nextPreference: ThemePreference) {
    preference.value = nextPreference;
    writeStoredPreference(nextPreference);
    applyToDocument();
  }

  function applyToDocument() {
    if (!isBrowser()) {
      return;
    }

    document.documentElement.dataset.themePreference = preference.value;
    document.documentElement.dataset.theme = resolvedTheme.value;
  }

  function startSystemThemeSync() {
    if (!isBrowser() || !window.matchMedia) {
      applyToDocument();
      return () => undefined;
    }

    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemTheme = () => {
      systemTheme.value = query.matches ? "dark" : "light";
      applyToDocument();
    };

    updateSystemTheme();
    query.addEventListener("change", updateSystemTheme);

    return () => {
      query.removeEventListener("change", updateSystemTheme);
    };
  }

  applyToDocument();

  return {
    preference,
    resolvedTheme,
    setPreference,
    applyToDocument,
    startSystemThemeSync,
  };
});

function readStoredPreference(): ThemePreference {
  if (!isBrowser()) {
    return "auto";
  }

  try {
    const storedPreference = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(storedPreference) ? storedPreference : "auto";
  } catch {
    return "auto";
  }
}

function writeStoredPreference(preference: ThemePreference) {
  if (!isBrowser()) {
    return;
  }

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // 本地存储不可用时仍允许本次会话内切换主题。
  }
}

function readSystemTheme(): ResolvedTheme {
  if (!isBrowser() || !window.matchMedia) {
    return "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function isThemePreference(value: string | null): value is ThemePreference {
  return Boolean(value && themePreferences.has(value as ThemePreference));
}

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}
