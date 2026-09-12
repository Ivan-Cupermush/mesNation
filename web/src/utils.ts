export const SERVER_URL = 'https://offixcrm.ru';

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'current_user';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function setCurrentUser(user: any): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getCurrentUser(): any {
  const data = localStorage.getItem(USER_KEY);
  return data ? JSON.parse(data) : null;
}
