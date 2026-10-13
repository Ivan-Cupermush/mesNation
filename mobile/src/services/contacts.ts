import { useEffect, useState } from 'react';
import { request } from './http';

/**
 * Свои имена для коллег («Изменить контакт», как в Telegram). Видны только
 * мне: в списке чатов, шапке чата и подписях сообщений. В профиле сотрудника
 * остаются его настоящие данные.
 */

export interface ContactName {
  user_id: number;
  first_name: string;
  last_name: string;
}

let names = new Map<number, ContactName>();
let version = 0;
const listeners = new Set<(v: number) => void>();

const emit = () => {
  version += 1;
  listeners.forEach((l) => l(version));
};

export async function loadContactNames(): Promise<void> {
  try {
    const list = await request<ContactName[]>('/api/contacts/names');
    names = new Map(list.map((c) => [c.user_id, c]));
    emit();
  } catch {
    // нет сети — покажем настоящие имена
  }
}

export function resetContactNames() {
  names = new Map();
  emit();
}

/** Своё имя для сотрудника или undefined. */
export function contactName(userId?: number | null): string | undefined {
  if (!userId) return undefined;
  const c = names.get(userId);
  const full = c ? `${c.first_name} ${c.last_name}`.trim() : '';
  return full || undefined;
}

export function contactRecord(userId: number): ContactName | undefined {
  return names.get(userId);
}

/** Имя для показа: своё, если задано, иначе настоящее. */
export function displayNameFor(userId: number | null | undefined, real: string): string {
  return contactName(userId) || real;
}

export async function saveContactName(userId: number, firstName: string, lastName: string): Promise<void> {
  const r = await request<ContactName & { reset?: boolean }>(`/api/contacts/${userId}/name`, {
    method: 'PUT',
    body: { first_name: firstName, last_name: lastName },
  });
  if (r.reset) names.delete(userId);
  else names.set(userId, { user_id: userId, first_name: r.first_name, last_name: r.last_name });
  emit();
}

/** Перерисовать экран, когда имена контактов поменялись. */
export function useContactNames(): number {
  const [v, setV] = useState(version);
  useEffect(() => {
    listeners.add(setV);
    return () => {
      listeners.delete(setV);
    };
  }, []);
  return v;
}
