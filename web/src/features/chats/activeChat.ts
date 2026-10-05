/**
 * Какой чат сейчас открыт на экране. Уведомления о его сообщениях не
 * показываются, пока вкладка видна (как в приложении: notifications/state.ts).
 */
let active: { chatId: string; topicId: number | null } | null = null;

export function setActiveChat(chatId: string, topicId: number | null) {
  active = { chatId: String(chatId), topicId };
}

export function clearActiveChat(chatId: string, topicId: number | null) {
  if (active && active.chatId === String(chatId) && active.topicId === topicId) active = null;
}

export function isChatOpen(chatId: string | number, topicId: number | null): boolean {
  if (!active || typeof document === 'undefined' || document.visibilityState !== 'visible') return false;
  return active.chatId === String(chatId) && active.topicId === (topicId ?? null);
}

/** Открыт ли чат (любая его тема) на видимой вкладке. */
export function isChatVisible(chatId: string | number): boolean {
  if (!active || typeof document === 'undefined' || document.visibilityState !== 'visible') return false;
  return active.chatId === String(chatId);
}
