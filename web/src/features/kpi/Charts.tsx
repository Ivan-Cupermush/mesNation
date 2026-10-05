import { useId, useLayoutEffect, useRef, useState } from 'react';
import { plural } from '../../lib/format';
import { money, moneyShort, number, toNum } from './format';
import type { SalesSummary } from './types';
import s from './kpi.module.css';

export interface ChartPoint {
  label: string;
  value: number;
  hint?: string;
}

/** Ширина элемента (для SVG, который рисуется в пикселях без растяжения текста). */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * Плавная кривая с заливкой — как AreaChart в приложении. Точки
 * подсвечиваются при наведении, значение — во всплывающей подписи.
 */
export function AreaChart({ data, height = 190 }: { data: ChartPoint[]; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const gradient = useId();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { top: 18, right: 14, bottom: 26, left: 14 };
  const cw = Math.max(0, width - pad.left - pad.right);
  const ch = height - pad.top - pad.bottom;
  const max = Math.max(...data.map((d) => d.value), 1) * 1.12;
  const pts = data.map((d, i) => ({
    x: pad.left + (data.length === 1 ? cw / 2 : (i / (data.length - 1)) * cw),
    y: pad.top + ch - (d.value / max) * ch,
  }));
  const line = pts.reduce((acc, p, i) => {
    if (i === 0) return `M ${p.x} ${p.y}`;
    const prev = pts[i - 1];
    const dx = (p.x - prev.x) / 3;
    return `${acc} C ${prev.x + dx} ${prev.y}, ${p.x - dx} ${p.y}, ${p.x} ${p.y}`;
  }, '');
  const area = pts.length ? `${line} L ${pts[pts.length - 1].x} ${pad.top + ch} L ${pts[0].x} ${pad.top + ch} Z` : '';
  const active = hover != null ? pts[hover] : null;

  return (
    <div ref={ref} className={s.chart} style={{ height }} onMouseLeave={() => setHover(null)}>
      {width > 0 && pts.length > 0 && (
        <svg width={width} height={height} role="img" aria-label="График">
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--c-accent)" stopOpacity={0.2} />
              <stop offset="100%" stopColor="var(--c-accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1={pad.left} x2={width - pad.right} y1={pad.top + ch * f} y2={pad.top + ch * f} className={s.gridLine} />
          ))}
          <path d={area} fill={`url(#${gradient})`} />
          <path d={line} fill="none" stroke="var(--c-accent)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          {pts.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r={hover === i ? 5.5 : 3.5} className={s.dot} />
              <text x={p.x} y={height - 7} textAnchor="middle" className={s.axisLabel}>
                {data[i].label.length > 12 ? `${data[i].label.slice(0, 11)}…` : data[i].label}
              </text>
              {/* Широкая невидимая полоса — удобно наводить и нажимать на телефоне. */}
              <rect
                x={p.x - cw / Math.max(1, (data.length - 1) * 2)}
                y={0}
                width={cw / Math.max(1, data.length - 1)}
                height={height}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onClick={() => setHover(i)}
              />
            </g>
          ))}
        </svg>
      )}
      {active && hover != null && (
        <div className={s.tooltip} style={{ left: Math.min(Math.max(active.x, 70), width - 70), top: Math.max(0, active.y - 52) }}>
          <b>{data[hover].label}</b>
          <span>{data[hover].hint || moneyShort(data[hover].value)}</span>
        </div>
      )}
    </div>
  );
}

const MEDALS = ['🥇', '🥈', '🥉'];

/** Топ товаров: график и рейтинг с долей выручки. */
export function TopProducts({ products }: { products: SalesSummary['topProducts'] }) {
  const items = products.slice(0, 5);
  const max = Math.max(...items.map((p) => toNum(p.total_amount)), 1);
  return (
    <div className={s.top}>
      {items.length > 1 && (
        <AreaChart
          data={items.map((p) => ({
            label: p.product_name,
            value: toNum(p.total_amount),
            hint: `${money(p.total_amount)} · ${number(p.total_quantity)} шт`,
          }))}
        />
      )}
      <ol className={s.topList}>
        {items.map((p, i) => (
          <li key={p.product_name}>
            <div className={s.topHead}>
              <span className={s.topName}>
                <span className={s.medal}>{MEDALS[i] || `${i + 1}.`}</span>
                {p.product_name}
              </span>
              <b>{money(p.total_amount)}</b>
            </div>
            <div className={s.bar}>
              <span style={{ width: `${Math.max(4, (toNum(p.total_amount) / max) * 100)}%` }} />
            </div>
            <span className={s.topMeta}>
              {number(p.total_quantity)} шт · {number(p.transactions_count)} {plural(toNum(p.transactions_count), ['сделка', 'сделки', 'сделок'])}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
