import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import s from './SettingsList.module.css';

export type Tone = 'accent' | 'info' | 'warning' | 'danger' | 'violet' | 'muted';

/** Карточка со строками и необязательной подписью сверху (как группы настроек в приложении). */
export function SettingsSection({ title, children, footer }: { title?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <section className={s.section}>
      {title && <h2 className={s.title}>{title}</h2>}
      <div className={s.card}>{children}</div>
      {footer && <p className={s.footer}>{footer}</p>}
    </section>
  );
}

interface RowProps {
  icon?: ReactNode;
  tone?: Tone;
  title: ReactNode;
  hint?: ReactNode;
  /** Справа: значение, переключатель, кнопка. */
  right?: ReactNode;
  /** Стрелка «перейти». По умолчанию — если есть onClick и нет right. */
  chevron?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

/** Строка настроек: иконка в цветном квадрате, заголовок, подсказка, справа — значение или переключатель. */
export function SettingsRow({ icon, tone = 'accent', title, hint, right, chevron, danger, disabled, onClick }: RowProps) {
  const content = (
    <>
      {icon && <span className={[s.icon, s[tone], danger && s.danger].filter(Boolean).join(' ')}>{icon}</span>}
      <span className={s.body}>
        <span className={[s.rowTitle, danger && s.dangerText].filter(Boolean).join(' ')}>{title}</span>
        {hint && <span className={s.hint}>{hint}</span>}
      </span>
      {right && <span className={s.right}>{right}</span>}
      {(chevron ?? (!!onClick && !right)) && <ChevronRight size={18} className={s.chevron} />}
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={[s.row, s.clickable].join(' ')} onClick={onClick} disabled={disabled}>
        {content}
      </button>
    );
  }
  return <div className={[s.row, disabled && s.disabled].filter(Boolean).join(' ')}>{content}</div>;
}
