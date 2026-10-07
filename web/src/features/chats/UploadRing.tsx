import { X } from 'lucide-react';
import s from './UploadRing.module.css';

/** Кольцо загрузки с крестиком отмены. */
export function UploadRing({ progress, onCancel, size = 46 }: { progress?: number; onCancel?: () => void; size?: number }) {
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  const p = Math.max(0.03, Math.min(1, progress || 0));
  return (
    <button
      type="button"
      className={s.ring}
      style={{ width: size, height: size }}
      onClick={(e) => {
        e.stopPropagation();
        onCancel?.();
      }}
      aria-label="Отменить отправку"
      disabled={!onCancel}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth={3} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#fff"
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.2s' }}
        />
      </svg>
      {onCancel && <X size={size * 0.38} className={s.ringX} />}
    </button>
  );
}
