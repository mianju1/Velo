<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useMediaStore } from "../../app/stores/media";
import { useSessionStore } from "../../app/stores/session";
import logoUrl from "../../assets/velo-logo.svg";
import { defaultLibraryRoute } from "../media/library-routes";
import { buildServerUrl } from "./server-url";

const router = useRouter();
const session = useSessionStore();
const media = useMediaStore();
const NEW_CONNECTION_VALUE = "new";
const serverCheck = ref("");
const selectedConnectionValue = ref(NEW_CONNECTION_VALUE);
const loginStatus = ref("");
const form = reactive({
  serverHost: "",
  serverPort: "443",
  username: "",
  password: "",
});

const savedConnections = computed(() =>
  session.servers.flatMap((server) =>
    session.accounts
      .filter((account) => account.serverId === server.id)
      .map((account) => ({
        value: savedConnectionValue(server.id, account.id),
        server,
        account,
        label: `${account.name} · ${server.name}`,
        detail: server.url,
      })),
  ),
);

const selectedSavedConnection = computed(() =>
  savedConnections.value.find((connection) => connection.value === selectedConnectionValue.value),
);
const showNewConnectionForm = computed(
  () => selectedConnectionValue.value === NEW_CONNECTION_VALUE || !selectedSavedConnection.value,
);
const loginBusy = computed(() => Boolean(loginStatus.value));
const loginErrorMessage = computed(() => {
  if (!session.error) {
    return "";
  }

  return `${session.error.code} - ${session.error.detail ?? session.error.message}`;
});
const loginButtonText = computed(() => {
  if (loginStatus.value) {
    return loginStatus.value;
  }

  return showNewConnectionForm.value ? "登录并保存" : "继续登录";
});

onMounted(async () => {
  await session.loadSavedSessions();
  selectDefaultConnection();
});

watch(savedConnections, (connections) => {
  if (selectedConnectionValue.value === NEW_CONNECTION_VALUE) {
    return;
  }

  if (!connections.some((connection) => connection.value === selectedConnectionValue.value)) {
    selectDefaultConnection();
  }
});

watch(selectedConnectionValue, () => {
  serverCheck.value = "";
});

async function validateCurrentServer() {
  const info = await session.checkServer(currentServerUrl());
  serverCheck.value = `${info.name}${info.version ? ` · ${info.version}` : ""}`;
}

async function submitLogin() {
  try {
    loginStatus.value = "登录中";
    await session.signIn(currentServerUrl(), form.username, form.password);
    await enterFirstLibrary();
  } catch {
    loginStatus.value = "";
  }
}

async function continueSavedLogin() {
  const connection = selectedSavedConnection.value;
  if (!connection) {
    return;
  }

  try {
    loginStatus.value = "登录中";
    await session.activate(connection.server.id, connection.account.id);
    await enterFirstLibrary();
  } catch {
    loginStatus.value = "";
  }
}

async function deleteSelectedLogin() {
  const connection = selectedSavedConnection.value;
  if (!connection) {
    return;
  }

  await session.forgetAccount(connection.server.id, connection.account.id);
}

function currentServerUrl() {
  return buildServerUrl(form.serverHost, form.serverPort);
}

function selectDefaultConnection() {
  const active = session.activeSession;
  if (active) {
    const activeValue = savedConnectionValue(active.server.id, active.account.id);
    if (savedConnections.value.some((connection) => connection.value === activeValue)) {
      selectedConnectionValue.value = activeValue;
      return;
    }
  }

  const latestConnection = savedConnections.value[savedConnections.value.length - 1];
  selectedConnectionValue.value = latestConnection?.value ?? NEW_CONNECTION_VALUE;
}

function savedConnectionValue(serverId: string, accountId: string) {
  return `saved:${serverId}:${accountId}`;
}

async function enterFirstLibrary() {
  loginStatus.value = "正在载入视频列表";
  await media.loadViews();
  await router.replace(defaultLibraryRoute(media.views.items));
}
</script>

<template>
  <main class="server-shell">
    <section class="login-panel">
      <img class="login-logo" :src="logoUrl" alt="Velo" />
      <div class="section-heading">
        <p class="eyebrow">Velo</p>
        <h1>{{ showNewConnectionForm ? "登录 Emby" : "选择连接" }}</h1>
      </div>

      <label class="connection-field">
        连接
        <select v-model="selectedConnectionValue" aria-label="连接">
          <option :value="NEW_CONNECTION_VALUE">新增 Emby 连接</option>
          <option
            v-for="connection in savedConnections"
            :key="connection.value"
            :value="connection.value"
          >
            {{ connection.label }}
          </option>
        </select>
      </label>

      <p v-if="session.loading && !session.hasSavedSessions" class="muted">正在读取本地配置...</p>
      <div v-if="loginStatus" class="login-progress" role="status" aria-live="polite">
        <span class="login-progress-spinner" aria-hidden="true"></span>
        <span>{{ loginStatus }}...</span>
      </div>

      <div v-if="!showNewConnectionForm && selectedSavedConnection" class="saved-login-card">
        <div class="saved-login-avatar" aria-hidden="true">
          {{ selectedSavedConnection.account.name.slice(0, 1).toUpperCase() }}
        </div>
        <div class="saved-login-copy">
          <span>{{ selectedSavedConnection.server.name }}</span>
          <strong>{{ selectedSavedConnection.account.name }}</strong>
          <small>{{ selectedSavedConnection.detail }}</small>
        </div>
        <div class="saved-login-actions">
          <button
            type="button"
            class="saved-login-action"
            :disabled="session.loading || loginBusy"
            @click="continueSavedLogin"
          >
            {{ loginButtonText }}
          </button>
          <button
            type="button"
            class="saved-login-delete ghost"
            :disabled="session.loading || loginBusy"
            @click="deleteSelectedLogin"
          >
            删除
          </button>
        </div>
      </div>

      <form v-else class="login-form" @submit.prevent="submitLogin">
        <label>
          域名
          <input v-model.trim="form.serverHost" placeholder="https://example.com" required />
        </label>
        <label>
          端口
          <input v-model.trim="form.serverPort" inputmode="numeric" placeholder="443" />
        </label>
        <div class="server-check-row">
          <button type="button" class="secondary" @click="validateCurrentServer">校验服务器</button>
          <span v-if="serverCheck">{{ serverCheck }} · {{ currentServerUrl() }}</span>
        </div>
        <label>
          用户名
          <input v-model.trim="form.username" autocomplete="username" required />
        </label>
        <label>
          密码
          <input v-model="form.password" type="password" autocomplete="current-password" required />
        </label>
        <button type="submit" :disabled="session.loading || loginBusy">{{ loginButtonText }}</button>
      </form>

      <p v-if="session.error" class="error">{{ loginErrorMessage }}</p>
    </section>
  </main>
</template>
