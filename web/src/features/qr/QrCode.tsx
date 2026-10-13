import { useId, useMemo } from 'react';
import { holeFor, qrMatrix, qrPaths } from './qrCore';

const LOGO_PATHS = [
  'M16 10a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 14.286V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z',
  'M20 9a2 2 0 0 1 2 2v10.286a.71.71 0 0 1-1.212.502l-2.202-2.202A2 2 0 0 0 17.172 19H10a2 2 0 0 1-2-2v-1',
];

/** QR-код: круглые точки с градиентом, скруглённые «глазки», знак Offix в центре. */
export function QrCode({ value, size, colors }: { value: string; size: number; colors: [string, string] }) {
  const id = useId().replace(/:/g, '');
  const m = useMemo(() => qrMatrix(value), [value]);
  const cell = size / m.size;
  const hole = holeFor(m.size);
  const p = useMemo(() => qrPaths(m, cell, hole), [m, cell, hole]);
  const logo = p.holeSize * 0.84;
  const lx = (size - logo) / 2;
  const scale = (logo * 0.52) / 24;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="QR-код">
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={colors[0]} />
          <stop offset="1" stopColor={colors[1]} />
        </linearGradient>
      </defs>
      <rect width={size} height={size} fill="#FFFFFF" />
      <path d={p.dots} fill={`url(#g${id})`} />
      <path d={p.eyes} fill={`url(#g${id})`} fillRule="evenodd" />
      <rect x={lx} y={lx} width={logo} height={logo} rx={logo * 0.3} fill={colors[0]} />
      <g transform={`translate(${size / 2 - 12 * scale} ${size / 2 - 12 * scale}) scale(${scale})`} fill="none" stroke="#FFFFFF" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        {LOGO_PATHS.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
    </svg>
  );
}

/**
 * Картинка для «Скачать» и «Поделиться»: постер с градиентом, аватаром,
 * кодом и именем — рисуется на canvas, без снимка страницы.
 */
export async function renderPosterPng(opts: {
  link: string;
  name: string;
  handle: string;
  avatarUrl: string | null;
  initials: string;
  avatarColor: string;
  bg: [string, string, string];
  dots: [string, string];
}): Promise<Blob> {
  const W = 1080;
  const pad = 72;
  const cardX = pad;
  const cardY = 250;
  const cardW = W - pad * 2;
  const qr = cardW - 180;
  const cardH = 190 + qr + 200;
  const H = cardY + cardH + 150;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, opts.bg[1]);
  bg.addColorStop(1, opts.bg[2]);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath();
  ctx.arc(W * 0.92, 120, 220, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(W * 0.04, H * 0.86, 320, 0, Math.PI * 2);
  ctx.fill();

  // Карточка
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, 72);
  ctx.fill();

  // Код
  const m = qrMatrix(opts.link);
  const cell = qr / m.size;
  const p = qrPaths(m, cell, holeFor(m.size));
  const qx = (W - qr) / 2;
  // Ниже аватара — «тихая зона» над кодом.
  const qy = cardY + 190;
  ctx.save();
  ctx.translate(qx, qy);
  const dg = ctx.createLinearGradient(0, 0, qr, qr);
  dg.addColorStop(0, opts.dots[0]);
  dg.addColorStop(1, opts.dots[1]);
  ctx.fillStyle = dg;
  ctx.fill(new Path2D(p.dots));
  ctx.fill(new Path2D(p.eyes), 'evenodd');
  const logo = p.holeSize * 0.84;
  ctx.fillStyle = opts.dots[0];
  ctx.beginPath();
  ctx.roundRect((qr - logo) / 2, (qr - logo) / 2, logo, logo, logo * 0.3);
  ctx.fill();
  const s = (logo * 0.52) / 24;
  ctx.translate(qr / 2 - 12 * s, qr / 2 - 12 * s);
  ctx.scale(s, s);
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const d of LOGO_PATHS) ctx.stroke(new Path2D(d));
  ctx.restore();

  // Имя и логин
  ctx.textAlign = 'center';
  ctx.fillStyle = opts.dots[0];
  ctx.font = '800 58px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(fit(ctx, opts.name, cardW - 120), W / 2, qy + qr + 100);
  ctx.fillStyle = '#6B7280';
  ctx.font = '500 38px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(fit(ctx, opts.handle, cardW - 120), W / 2, qy + qr + 156);

  // Подпись внизу
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '600 34px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('Offix · наведите камеру телефона', W / 2, cardY + cardH + 90);

  // Аватар поверх края карточки
  const A = 230;
  const ax = W / 2;
  const ay = cardY;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(ax, ay, A / 2 + 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(ax, ay, A / 2, 0, Math.PI * 2);
  ctx.clip();
  const img = opts.avatarUrl ? await loadImage(opts.avatarUrl).catch(() => null) : null;
  if (img) {
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, ax - A / 2, ay - A / 2, A, A);
  } else {
    ctx.fillStyle = opts.avatarColor;
    ctx.fillRect(ax - A / 2, ay - A / 2, A, A);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 88px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(opts.initials, ax, ay + 4);
  }
  ctx.restore();

  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Не удалось создать картинку'))), 'image/png'));
}

function fit(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
