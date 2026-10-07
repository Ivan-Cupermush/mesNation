import { useMemo, useRef, type PointerEvent } from 'react';
import { resample } from './waveform';

const BAR = 2.5;
const GAP = 1.5;

/**
 * Волна голосового: прослушанная часть — ярким цветом, остальное — бледным.
 * Нажатие или протягивание — перемотка.
 */
export function Waveform({
  levels,
  progress,
  width = 168,
  height = 24,
  className,
  onSeek,
}: {
  levels: number[];
  progress: number;
  width?: number;
  height?: number;
  className?: string;
  onSeek?: (ratio: number) => void;
}) {
  const count = Math.max(8, Math.floor((width + GAP) / (BAR + GAP)));
  const bars = useMemo(() => resample(levels, count), [levels, count]);
  const dragging = useRef(false);

  const ratioAt = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  };

  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role={onSeek ? 'slider' : undefined}
      aria-label={onSeek ? 'Перемотка' : undefined}
      aria-valuenow={Math.round(progress * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      style={{ cursor: onSeek ? 'pointer' : undefined, touchAction: 'none', display: 'block' }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={
        onSeek
          ? (e) => {
              e.stopPropagation();
              dragging.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              onSeek(ratioAt(e));
            }
          : undefined
      }
      onPointerMove={onSeek ? (e) => dragging.current && onSeek(ratioAt(e)) : undefined}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
    >
      {bars.map((v, i) => {
        const h = Math.max(2, Math.round(v * height));
        const played = (i + 0.5) / bars.length <= progress;
        return (
          <rect
            key={i}
            x={i * (BAR + GAP)}
            y={height - h}
            width={BAR}
            height={h}
            rx={BAR / 2}
            fill="currentColor"
            opacity={played ? 1 : 0.38}
          />
        );
      })}
    </svg>
  );
}
