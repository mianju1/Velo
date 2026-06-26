import { invoke } from "@tauri-apps/api/core";

export type ServerSummary = {
  id: string;
  name: string;
  url: string;
};

export type AccountSummary = {
  id: string;
  serverId: string;
  name: string;
};

export type SavedSessions = {
  servers: ServerSummary[];
  accounts: AccountSummary[];
};

export type ServerInfo = ServerSummary & {
  version?: string;
};

export type AuthSession = {
  server: ServerSummary;
  account: AccountSummary;
  accessToken: string;
};

export function listSavedSessions() {
  return invoke<SavedSessions>("list_saved_sessions");
}

export function validateServer(serverUrl: string) {
  return invoke<ServerInfo>("validate_server", { serverUrl });
}

export function login(serverUrl: string, username: string, password: string) {
  return invoke<AuthSession>("login", { serverUrl, username, password });
}

export function restoreSession(serverId: string, accountId: string) {
  return invoke<AuthSession>("restore_session", { serverId, accountId });
}

export function removeAccount(serverId: string, accountId: string) {
  return invoke<SavedSessions>("remove_account", { serverId, accountId });
}

export function removeServer(serverId: string) {
  return invoke<SavedSessions>("remove_server", { serverId });
}
