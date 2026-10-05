import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { EmptyState } from './EmptyState';
import { Button } from './Button';
import { storage } from '../lib/storage';

const RELOAD_KEY = 'offix.chunkReloadAt';

/** Ошибка загрузки части сайта после обновления версии на сервере. */
function isChunkError(error: unknown): boolean {
  const msg = String((error as Error)?.message || error);
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(msg);
}

/**
 * Ловит ошибки отрисовки, чтобы вместо белого экрана было понятное сообщение.
 * Если сайт обновился, пока вкладка была открыта, — один раз перезагружает страницу.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    if (isChunkError(error)) {
      const last = Number(storage.get(RELOAD_KEY) || 0);
      if (Date.now() - last > 30_000) {
        storage.set(RELOAD_KEY, String(Date.now()));
        window.location.reload();
        return;
      }
    }
    console.error('Ошибка интерфейса', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const chunk = isChunkError(this.state.error);
    return (
      <EmptyState
        icon={<AlertTriangle size={44} />}
        title={chunk ? 'Сайт обновился' : 'Что-то пошло не так'}
        text={chunk ? 'Перезагрузите страницу, чтобы открыть новую версию.' : 'Попробуйте обновить страницу. Если ошибка повторяется — сообщите администратору.'}
        action={<Button onClick={() => window.location.reload()}>Обновить страницу</Button>}
      />
    );
  }
}
