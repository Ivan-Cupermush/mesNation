import type { ReactNode } from 'react';
import s from './EmptyState.module.css';

interface Props {
  icon?: ReactNode;
  title: string;
  text?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}

export function EmptyState({ icon, title, text, action, compact }: Props) {
  return (
    <div className={[s.empty, compact && s.compact].filter(Boolean).join(' ')}>
      {icon && <div className={s.icon}>{icon}</div>}
      <div className={s.title}>{title}</div>
      {text && <div className={s.text}>{text}</div>}
      {action && <div className={s.action}>{action}</div>}
    </div>
  );
}
