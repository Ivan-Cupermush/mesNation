import { MessagesSquare } from 'lucide-react';
import s from './BrandMark.module.css';

/** Фирменный знак Offix — как в приложении: плитка цвета акцента, название, подпись Dixit. */
export function BrandMark({ size = 72, caption = true, compact }: { size?: number; caption?: boolean; compact?: boolean }) {
  return (
    <div className={[s.wrap, compact && s.compact].filter(Boolean).join(' ')}>
      <div className={s.tile} style={{ width: size, height: size, borderRadius: size * 0.3 }}>
        <MessagesSquare size={size * 0.48} strokeWidth={2} />
      </div>
      {!compact && <div className={s.name}>Offix</div>}
      {!compact && caption && <div className={s.caption}>коммуникационный шлюз Dixit</div>}
    </div>
  );
}
