// Совместимость со старыми экранами сайта (src/screens/*), пока они не переписаны
// на новую основу: токен и профиль берутся из той же сессии, что и у новых экранов.
import { getToken as getSessionToken, setToken as setSessionToken } from './lib/http';
import { storage } from './lib/storage';

export const SERVER_URL = '';

const USER_KEY = 'current_user';

export function getToken(): string | null {
  return getSessionToken();
}

export function setToken(token: string): void {
  setSessionToken(token);
}

export function clearToken(): void {
  setSessionToken(null);
}

export function setCurrentUser(user: unknown): void {
  storage.setJSON(USER_KEY, user);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getCurrentUser(): any {
  return storage.getJSON(USER_KEY);
}
