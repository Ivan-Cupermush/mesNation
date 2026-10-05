import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, api, getToken, onUnauthorized, request, setToken } from '../../lib/http';
import { disconnectSocket } from '../../lib/socket';
import { storage } from '../../lib/storage';
import type { Profile } from '../../lib/types';

/**
 * Сессия пользователя.
 * - loading: проверяем сохранённый токен;
 * - offline: токен есть, но сервер недоступен — НЕ выходим из аккаунта
 *   (раньше обрыв сети на старте разлогинивал), показываем «Повторить»;
 * - anonymous / authenticated.
 */

type Status = 'loading' | 'offline' | 'anonymous' | 'authenticated';

interface AuthValue {
  status: Status;
  user: Profile | null;
  login: (login: string, password: string) => Promise<void>;
  setupCompany: (data: { company_name: string; username: string; email: string; password: string; display_name?: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  retry: () => void;
  /** Обновить профиль локально (после смены имени/аватара). */
  patchUser: (patch: Partial<Profile>) => void;
}

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>(() => (getToken() ? 'loading' : 'anonymous'));
  const [user, setUser] = useState<Profile | null>(null);

  const loadMe = useCallback(async () => {
    if (!getToken()) {
      setStatus('anonymous');
      return;
    }
    try {
      const me = await request<Profile>('/api/auth/me', { timeoutMs: 15_000 });
      setUser(me);
      // Кэш профиля для старых экранов больше не нужен — убираем у тех, у кого остался.
      storage.remove('current_user');
      setStatus('authenticated');
    } catch (e) {
      if (e instanceof ApiError && e.isNetwork) setStatus('offline');
      else if (!getToken()) setStatus('anonymous');
      else setStatus('offline');
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const reset = useCallback(() => {
    disconnectSocket();
    queryClient.clear();
    setUser(null);
    setStatus('anonymous');
  }, [queryClient]);

  useEffect(() => onUnauthorized(reset), [reset]);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      user,
      login: async (login, password) => {
        const res = await request<{ token: string }>('/api/auth/login', {
          method: 'POST',
          anonymous: true,
          body: login.includes('@') ? { email: login.trim(), password } : { username: login.trim(), password },
        });
        setToken(res.token);
        await loadMe();
      },
      setupCompany: async (data) => {
        const res = await request<{ token: string }>('/api/auth/setup-company', { method: 'POST', anonymous: true, body: data });
        setToken(res.token);
        await loadMe();
      },
      logout: async () => {
        await api.post('/api/auth/logout').catch(() => undefined);
        setToken(null);
        reset();
      },
      refreshUser: loadMe,
      retry: () => {
        setStatus('loading');
        loadMe();
      },
      patchUser: (patch) => setUser((u) => (u ? { ...u, ...patch } : u)),
    }),
    [status, user, loadMe, reset],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth вне AuthProvider');
  return ctx;
}

/** Текущий пользователь на экранах, доступных только после входа. */
export function useMe(): Profile {
  const { user } = useAuth();
  if (!user) throw new Error('useMe без входа');
  return user;
}
