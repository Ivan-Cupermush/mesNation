import type { ReactNode } from 'react';
import { Switch } from './Field';
import s from './SwitchRow.module.css';

/** Строка с переключателем: название, пояснение и (необязательно) пометка справа. */
export function SwitchRow({
  title,
  hint,
  note,
  checked,
  onChange,
  disabled,
}: {
  title: string;
  hint?: ReactNode;
  note?: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={[s.row, disabled && s.disabled].filter(Boolean).join(' ')}>
      <span className={s.text}>
        <b>{title}</b>
        {hint && <small>{hint}</small>}
        {note && <em>{note}</em>}
      </span>
      <Switch checked={checked} onChange={onChange} label={title} disabled={disabled} />
    </label>
  );
}

/** Карточка со строками-переключателями. */
export function SwitchList({ children }: { children: ReactNode }) {
  return <div className={s.list}>{children}</div>;
}
