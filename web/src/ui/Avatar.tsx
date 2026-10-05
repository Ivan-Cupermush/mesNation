import { useState } from 'react';
import { hashColor, initials } from '../lib/format';
import s from './Avatar.module.css';

interface Props {
  name?: string | null;
  src?: string | null;
  size?: number;
  online?: boolean;
  /** Квадрат со скруглением (группы, роли) вместо круга. */
  rounded?: boolean;
  className?: string;
}

/** Аватар: фото или инициалы на цветном фоне (цвет зависит от имени, как в приложении). */
export function Avatar({ name, src, size = 44, online, rounded, className }: Props) {
  const [broken, setBroken] = useState<string | null>(null);
  const showImage = !!src && broken !== src;
  return (
    <span
      className={[s.wrap, className].filter(Boolean).join(' ')}
      style={{ width: size, height: size }}
    >
      <span
        className={s.avatar}
        style={{
          background: showImage ? 'var(--c-input-bg)' : hashColor(name),
          borderRadius: rounded ? Math.round(size * 0.3) : '50%',
          fontSize: Math.max(11, Math.round(size * 0.36)),
        }}
      >
        {showImage ? (
          <img src={src!} alt="" loading="lazy" onError={() => setBroken(src!)} draggable={false} />
        ) : (
          initials(name)
        )}
      </span>
      {online && <span className={s.online} style={{ width: Math.max(10, size * 0.28), height: Math.max(10, size * 0.28) }} />}
    </span>
  );
}
