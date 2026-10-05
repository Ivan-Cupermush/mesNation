import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Modal } from './Modal';
import { useIsMobile } from '../lib/useMedia';
import type { MenuAnchor } from './menuAnchor';
import s from './ActionMenu.module.css';

export interface MenuItem {
  key: string;
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

interface Props {
  open: boolean;
  anchor: MenuAnchor | null;
  items: MenuItem[];
  title?: string;
  /** Блок над пунктами (например, панель реакций или превью сообщения). */
  header?: ReactNode;
  onClose: () => void;
}

/**
 * Меню действий: на компьютере — всплывающее у курсора (правый клик / «⋯»),
 * на телефоне — шторка снизу, как ActionSheet в приложении.
 */
export function ActionMenu({ open, anchor, items, title, header, onClose }: Props) {
  const isMobile = useIsMobile();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || isMobile || !anchor || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const left = Math.min(Math.max(8, anchor.x - (anchor.x + r.width > window.innerWidth - 8 ? r.width : 0)), window.innerWidth - r.width - 8);
    const top = anchor.y + r.height > window.innerHeight - 8 ? Math.max(8, anchor.y - r.height) : anchor.y;
    setPos({ left, top });
  }, [open, anchor, isMobile, items.length]);

  useEffect(() => {
    if (!open || isMobile) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onScroll = () => onClose();
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, isMobile, onClose]);

  if (!open) return null;

  const list = (
    <div className={s.list} role="menu">
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          role="menuitem"
          className={[s.item, it.danger && s.danger].filter(Boolean).join(' ')}
          disabled={it.disabled}
          onClick={() => {
            onClose();
            it.onSelect();
          }}
        >
          {it.icon && <span className={s.icon}>{it.icon}</span>}
          <span className={s.label}>{it.label}</span>
        </button>
      ))}
    </div>
  );

  if (isMobile) {
    return (
      <Modal open onClose={onClose} title={title} size="sm" flush>
        {header}
        <div className={s.sheet}>{list}</div>
      </Modal>
    );
  }

  return createPortal(
    <div className={s.layer} onMouseDown={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }}>
      <div
        ref={ref}
        className={s.popover}
        style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {header}
        {list}
      </div>
    </div>,
    document.body,
  );
}
