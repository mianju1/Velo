import { defineStore } from "pinia";
import { computed, ref } from "vue";
import {
  type AccountSummary,
  type AuthSession,
  type SavedSessions,
  type ServerSummary,
  listSavedSessions,
  login,
  removeAccount,
  removeServer,
  restoreSession,
  validateServer,
} from "../../services/emby/session";
import { type AppError, toAppError } from "../../shared/types/app-error";

const LOGIN_CONNECTION_TIMEOUT_MS = 15_000;

export const useSessionStore = defineStore("session", () => {
  const servers = ref<ServerSummary[]>([]);
  const accounts = ref<AccountSummary[]>([]);
  const activeSession = ref<AuthSession | null>(null);
  const loading = ref(false);
  const error = ref<AppError | null>(null);

  const hasSavedSessions = computed(() => servers.value.length > 0);

  function applySavedSessions(saved: SavedSessions) {
    servers.value = saved.servers;
    accounts.value = saved.accounts;
  }

  async function loadSavedSessions() {
    loading.value = true;
    error.value = null;
    try {
      applySavedSessions(await listSavedSessions());
    } catch (caught) {
      error.value = toAppError(caught);
    } finally {
      loading.value = false;
    }
  }

  async function checkServer(serverUrl: string) {
    loading.value = true;
    error.value = null;
    try {
      return await validateServer(serverUrl);
    } catch (caught) {
      error.value = toAppError(caught);
      throw error.value;
    } finally {
      loading.value = false;
    }
  }

  async function signIn(serverUrl: string, username: string, password: string) {
    loading.value = true;
    error.value = null;
    try {
      const session = await withLoginTimeout(login(serverUrl, username, password));
      activeSession.value = session;
      await loadSavedSessions();
      return session;
    } catch (caught) {
      error.value = toAppError(caught);
      throw error.value;
    } finally {
      loading.value = false;
    }
  }

  async function activate(serverId: string, accountId: string) {
    loading.value = true;
    error.value = null;
    try {
      activeSession.value = await withLoginTimeout(restoreSession(serverId, accountId));
      return activeSession.value;
    } catch (caught) {
      const appError = toAppError(caught);
      error.value =
        appError.code === "token_expired"
          ? { ...appError, message: "登录已失效，请重新输入密码。" }
          : appError;
      activeSession.value = null;
      throw error.value;
    } finally {
      loading.value = false;
    }
  }

  async function forgetServer(serverId: string) {
    loading.value = true;
    error.value = null;
    try {
      applySavedSessions(await removeServer(serverId));
      if (activeSession.value?.server.id === serverId) {
        activeSession.value = null;
      }
    } catch (caught) {
      error.value = toAppError(caught);
      throw error.value;
    } finally {
      loading.value = false;
    }
  }

  async function forgetAccount(serverId: string, accountId: string) {
    loading.value = true;
    error.value = null;
    try {
      applySavedSessions(await removeAccount(serverId, accountId));
      if (
        activeSession.value?.server.id === serverId &&
        activeSession.value.account.id === accountId
      ) {
        activeSession.value = null;
      }
    } catch (caught) {
      error.value = toAppError(caught);
      throw error.value;
    } finally {
      loading.value = false;
    }
  }

  return {
    accounts,
    activeSession,
    error,
    hasSavedSessions,
    loading,
    servers,
    activate,
    checkServer,
    forgetAccount,
    forgetServer,
    loadSavedSessions,
    signIn,
  };
});

function withLoginTimeout<T>(operation: Promise<T>) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(loginTimeoutError());
    }, LOGIN_CONNECTION_TIMEOUT_MS);
  });

  return Promise.race([operation, timeout]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}

function loginTimeoutError(): AppError {
  return {
    code: "login_timeout",
    message: "连接超时，请检查服务器地址或网络后重试。",
    recoverable: true,
  };
}
