import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, AlertCircle, Info } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { errorText } from '../lib/format';
import s from './feedback.module.css';

/**
 * Обратная связь интерфейса вместо alert/confirm браузера:
 * - toast('Сохранено') / toast.error(e) — всплывающие уведомления;
 * - await confirm({...}) — подтверждение действия;
 * - await prompt({...}) — ввод текста (например, причина отклонения).
 */

type ToastKind = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  kind: ToastKind;
  /** Что не получилось (у ошибки), текст — почему. */
  title?: string;
  text: string;
  leaving?: boolean;
}

interface ConfirmOptions {
  title: string;
  text?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

interface PromptOptions extends ConfirmOptions {
  label?: string;
  placeholder?: string;
  initialValue?: string;
  required?: boolean;
  multiline?: boolean;
  maxLength?: number;
}

interface ToastFn {
  (text: string, kind?: ToastKind): void;
  success: (text: string) => void;
  error: (e: unknown, fallback?: string) => void;
}

interface FeedbackValue {
  toast: ToastFn;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  prompt: (opts: PromptOptions) => Promise<string | null>;
}

const Ctx = createContext<FeedbackValue | null>(null);

type Dialog =
  | { type: 'confirm'; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { type: 'prompt'; opts: PromptOptions; resolve: (v: string | null) => void };

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [value, setValue] = useState('');
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => {
    // Сначала плавно уезжает, потом убираем.
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 200);
  }, []);

  const push = useCallback(
    (text: string, kind: ToastKind = 'info', title?: string) => {
      const id = ++seq.current;
      setToasts((prev) => {
        // Такое же уже на экране — не дублируем.
        if (prev.some((t) => !t.leaving && t.text === text && t.kind === kind)) return prev;
        return [...prev.slice(-2), { id, kind, text, title }];
      });
      setTimeout(() => dismiss(id), kind === 'error' ? 5500 : Math.min(5000, 2400 + text.length * 25));
    },
    [dismiss],
  );

  const api = useMemo<FeedbackValue>(() => {
    const toast = ((text: string, kind?: ToastKind) => push(text, kind)) as ToastFn;
    toast.success = (text) => push(text, 'success');
    toast.error = (e, fallback) => {
      // Есть причина от сервера — заголовок «что не получилось», ниже «почему».
      const reason = errorText(e, '');
      if (fallback && reason && reason !== fallback) push(reason, 'error', fallback);
      else push(reason || fallback || 'Что-то пошло не так', 'error');
    };
    return {
      toast,
      confirm: (opts) => new Promise<boolean>((resolve) => setDialog({ type: 'confirm', opts, resolve })),
      prompt: (opts) =>
        new Promise<string | null>((resolve) => {
          setValue(opts.initialValue || '');
          setDialog({ type: 'prompt', opts, resolve });
        }),
    };
  }, [push]);

  const close = (result: boolean) => {
    if (!dialog) return;
    if (dialog.type === 'confirm') dialog.resolve(result);
    else dialog.resolve(result ? value.trim() : null);
    setDialog(null);
  };

  const promptInvalid = dialog?.type === 'prompt' && dialog.opts.required && !value.trim();

  return (
    <Ctx.Provider value={api}>
      {children}
      {createPortal(
        <div className={s.toasts} aria-live="polite">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={[s.toast, s[t.kind], t.leaving && s.leaving].filter(Boolean).join(' ')}
              role={t.kind === 'error' ? 'alert' : 'status'}
              onClick={() => dismiss(t.id)}
            >
              <span className={s.toastIcon}>
                {t.kind === 'success' ? <Check size={14} strokeWidth={3} /> : t.kind === 'error' ? <AlertCircle size={15} strokeWidth={2.6} /> : <Info size={15} strokeWidth={2.6} />}
              </span>
              <span className={s.toastBody}>
                {t.title && <b>{t.title}</b>}
                <span>{t.text}</span>
              </span>
            </div>
          ))}
        </div>,
        document.body,
      )}
      <Modal
        open={!!dialog}
        onClose={() => close(false)}
        title={dialog?.opts.title}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => close(false)}>
              {dialog?.opts.cancelText || 'Отмена'}
            </Button>
            <Button variant={dialog?.opts.danger ? 'danger' : 'primary'} onClick={() => close(true)} disabled={promptInvalid}>
              {dialog?.opts.confirmText || 'OK'}
            </Button>
          </>
        }
      >
        {dialog?.opts.text && <div className={s.dialogText}>{dialog.opts.text}</div>}
        {dialog?.type === 'prompt' && (
          <label className={s.promptField}>
            {dialog.opts.label && <span className={s.promptLabel}>{dialog.opts.label}</span>}
            {dialog.opts.multiline ? (
              <textarea
                autoFocus
                rows={4}
                value={value}
                maxLength={dialog.opts.maxLength}
                placeholder={dialog.opts.placeholder}
                onChange={(e) => setValue(e.target.value)}
              />
            ) : (
              <input
                autoFocus
                value={value}
                maxLength={dialog.opts.maxLength}
                placeholder={dialog.opts.placeholder}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !promptInvalid && close(true)}
              />
            )}
          </label>
        )}
      </Modal>
    </Ctx.Provider>
  );
}

export function useFeedback(): FeedbackValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useFeedback вне FeedbackProvider');
  return ctx;
}
