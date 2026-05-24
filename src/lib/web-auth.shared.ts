export const WEB_WALLET_SESSION_STORAGE = "walletbred-web-session-token";
export const LEGACY_WEB_WALLET_ID_STORAGE = "walletbred-web-user-id";
export const WEB_WALLET_SESSION_HEADER = "x-wallet-web-session";

export function getStoredWebSessionToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(WEB_WALLET_SESSION_STORAGE);
}

export function storeWebSessionToken(token: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WEB_WALLET_SESSION_STORAGE, token);
  window.localStorage.removeItem(LEGACY_WEB_WALLET_ID_STORAGE);
}

export function clearWebSessionToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(WEB_WALLET_SESSION_STORAGE);
  window.localStorage.removeItem(LEGACY_WEB_WALLET_ID_STORAGE);
}
