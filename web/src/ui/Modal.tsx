import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import s from './Modal.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Не закрывать по клику на фон (например, во время сохранения). */
  persistent?: boolean;
  /** Без внутренних отступов (галерея, списки на всю ширину). */
  flush?: boolean;
}

/** Открытые окна по порядку: Esc и Tab обрабатывает только верхнее. */
const stack: symbol[] = [];

/**
 * Окно поверх страницы. На компьютере — диалог по центру, на телефоне —
 * шторка снизу (как в приложении). Esc и клик по фону закрывают,
 * фокус остаётся внутри окна и возвращается на место после закрытия.
 */
export function Modal({ open, onClose, title, children, footer, size = 'md', persistent, flush }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const me = Symbol('modal');
    stack.push(me);
    document.body.style.overflow = 'hidden';
    const focusFirst = () => {
      // Фокус уже внутри (autoFocus нужного поля или человек успел нажать) — не перехватываем.
      if (panelRef.current?.contains(document.activeElement)) return;
      const el = panelRef.current?.querySelector<HTMLElement>('[autofocus], input, textarea, select, button:not([data-close])');
      (el || panelRef.current)?.focus();
    };
    const t = setTimeout(focusFirst, 30);
    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== me) return;
      if (e.key === 'Escape' && !persistent) {
        e.stopPropagation();
        onCloseRef.current();
      }
      if (e.key === 'Tab' && panelRef.current) {
        const items = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      const i = stack.indexOf(me);
      if (i >= 0) stack.splice(i, 1);
      if (!stack.length) document.body.style.overflow = '';
      previouslyFocused?.focus?.();
    };
  }, [open, persistent]);

  if (!open) return null;
  return createPortal(
    <div className={s.backdrop} onMouseDown={(e) => e.target === e.currentTarget && !persistent && onClose()}>
      <div
        ref={panelRef}
        className={[s.panel, s[size]].join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
      >
        <div className={s.grabber} aria-hidden />
        {title !== undefined && (
          <div className={s.header}>
            <h2 id={titleId} className={s.title}>
              {title}
            </h2>
            <button type="button" className={s.close} onClick={onClose} aria-label="Закрыть" data-close>
              <X size={20} />
            </button>
          </div>
        )}
        <div className={[s.body, flush && s.flush].filter(Boolean).join(' ')}>{children}</div>
        {footer && <div className={s.footer}>{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
