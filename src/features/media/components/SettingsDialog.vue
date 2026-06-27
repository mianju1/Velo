<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useFontStore } from "../../../app/stores/font";
import { usePlaybackStore } from "../../../app/stores/playback";
import { useSessionStore } from "../../../app/stores/session";
import { themeOptions, useThemeStore, type ThemePreference } from "../../../app/stores/theme";
import { DISPLAY_APP_VERSION } from "../../../app/version";
import logoUrl from "../../../assets/velo-logo.svg";

const emit = defineEmits<{
  close: [];
}>();

const router = useRouter();
const font = useFontStore();
const playback = usePlaybackStore();
const session = useSessionStore();
const theme = useThemeStore();
const activeTab = ref<"general" | "account" | "about">("general");

const themeSwitchClass = computed(() => `theme-switch--${theme.preference}`);

function switchAccount() {
  session.activeSession = null;
  emit("close");
  void router.push("/");
}

function selectTheme(preference: ThemePreference) {
  theme.setPreference(preference);
}

function selectFont(event: Event) {
  const select = event.currentTarget as HTMLSelectElement;
  font.setFontFamily(select.value);
}
</script>

<template>
  <Teleport to="body">
    <div class="settings-backdrop" role="presentation" @click.self="emit('close')">
      <section class="settings-dialog" role="dialog" aria-modal="true" aria-label="设置">
        <aside class="settings-tabs" aria-label="设置分类">
          <button
            type="button"
            class="settings-tab"
            :class="{ 'settings-tab--active': activeTab === 'general' }"
            @click="activeTab = 'general'"
          >
            常规
          </button>
          <button
            type="button"
            class="settings-tab"
            :class="{ 'settings-tab--active': activeTab === 'account' }"
            @click="activeTab = 'account'"
          >
            账号
          </button>
          <button
            type="button"
            class="settings-tab"
            :class="{ 'settings-tab--active': activeTab === 'about' }"
            @click="activeTab = 'about'"
          >
            关于
          </button>
        </aside>

        <div class="settings-content">
          <header class="settings-header">
            <div>
              <p class="eyebrow">设置</p>
              <h2>{{ activeTab === "general" ? "常规" : activeTab === "account" ? "账号" : "关于" }}</h2>
            </div>
            <button type="button" class="settings-close" aria-label="关闭设置" @click="emit('close')">
              <span class="settings-close-icon" aria-hidden="true"></span>
            </button>
          </header>

          <section v-if="activeTab === 'general'" class="settings-panel">
            <div class="settings-card settings-theme-card">
              <span>软件主题</span>
              <div class="theme-switch" :class="themeSwitchClass" role="radiogroup" aria-label="软件主题">
                <span class="theme-switch-thumb" aria-hidden="true"></span>
                <button
                  v-for="option in themeOptions"
                  :key="option.value"
                  type="button"
                  class="theme-switch-option"
                  :class="{ 'theme-switch-option--active': theme.preference === option.value }"
                  :data-theme-option="option.value"
                  :aria-label="option.label"
                  :aria-checked="theme.preference === option.value"
                  role="radio"
                  @click="selectTheme(option.value)"
                >
                  <svg v-if="option.value === 'light'" data-icon="sun" viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="4"></circle>
                    <path d="M12 2v2.2M12 19.8V22M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2 12h2.2M19.8 12H22M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6"></path>
                  </svg>
                  <svg v-else-if="option.value === 'dark'" data-icon="moon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M20 15.2A8.1 8.1 0 0 1 8.8 4a7.7 7.7 0 1 0 11.2 11.2Z"></path>
                  </svg>
                  <span v-else class="theme-switch-auto" aria-hidden="true">A</span>
                </button>
              </div>
            </div>
            <div class="settings-card settings-font-card">
              <label for="settings-font-select">界面字体</label>
              <select
                id="settings-font-select"
                aria-label="界面字体"
                :disabled="font.loading"
                :value="font.selectedFamily"
                @change="selectFont"
              >
                <option
                  v-for="option in font.fontOptions"
                  :key="`${option.source}:${option.family}`"
                  :value="option.family"
                >
                  {{ option.label }}{{ option.source === "built-in" ? "（默认）" : "" }}
                </option>
              </select>
              <small v-if="font.error" class="settings-font-error">{{ font.error }}</small>
            </div>
            <div class="settings-card">
              <span>缓存</span>
              <strong>{{ playback.cacheSizeLabel }}</strong>
              <button type="button" class="ghost" :disabled="playback.cacheLoading" @click="playback.clearCache">
                {{ playback.cacheLoading ? "清理中" : "清理缓存" }}
              </button>
            </div>
          </section>

          <section v-else-if="activeTab === 'account'" class="settings-panel">
            <div class="settings-card">
              <span>当前账号</span>
              <strong>{{ session.activeSession?.account.name ?? "未登录" }}</strong>
              <button type="button" class="ghost" @click="switchAccount">切换账号</button>
            </div>
          </section>

          <section v-else class="settings-panel settings-about">
            <img :src="logoUrl" alt="Velo" />
            <strong>Velo</strong>
            <span class="settings-about-version">{{ DISPLAY_APP_VERSION }}</span>
          </section>
        </div>
      </section>
    </div>
  </Teleport>
</template>
