import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell as BellIcon } from 'lucide-react';
import { useUnreadNotifications } from './api';
import s from './inbox.module.css';

/**
 * Колокольчик рядом с профилем: новые задачи и запросы заметок.
 * Пришло новое — колокольчик качнётся, на нём счётчик.
 */
export default function Bell({ className, size = 40 }: { className?: string; size?: number }) {
  const navigate = useNavigate();
  const count = useUnreadNotifications();
  const prev = useRef(count);
  const [ring, setRing] = useState(0);

  useEffect(() => {
    if (count > prev.current) setRing((r) => r + 1);
    prev.current = count;
  }, [count]);

  return (
    <button
      type="button"
      className={[s.bell, className].filter(Boolean).join(' ')}
      style={{ width: size, height: size }}
      onClick={(e) => {
        e.stopPropagation();
        navigate('/notifications');
      }}
      aria-label={count ? `Уведомления, новых: ${count}` : 'Уведомления'}
      title="Уведомления"
    >
      <span key={ring} className={ring ? s.ring : undefined}>
        <BellIcon size={20} strokeWidth={2} />
      </span>
      {count > 0 && <span className={s.bellBadge}>{count > 99 ? '99+' : count}</span>}
    </button>
  );
}
