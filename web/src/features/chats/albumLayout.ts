/** Раскладка альбома — как в приложении (mobile/src/components/chat/chatUtils.ts). */

export interface AlbumCell {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Раскладка альбома (упрощённая мозаика Telegram): одна картинка — по её
 * пропорциям; 2 — рядом (или друг под другом, если обе широкие); 3 — большая
 * слева + две справа; 4 — сетка 2×2; больше — строками по 2–3.
 */
export function albumLayout(ratios: number[], maxW: number, maxH: number, gap = 2): { cells: AlbumCell[]; width: number; height: number } {
  const n = ratios.length;
  const r = ratios.map((x) => (x > 0 && Number.isFinite(x) ? Math.min(Math.max(x, 0.4), 2.6) : 1));
  if (n === 1) {
    let w = maxW;
    let h = w / r[0];
    if (h > maxH) {
      h = maxH;
      w = Math.max(h * r[0], maxW * 0.55);
    }
    return { cells: [{ x: 0, y: 0, w, h }], width: w, height: h };
  }
  const W = maxW;
  if (n === 2) {
    if (r[0] > 1.2 && r[1] > 1.2) {
      const h0 = W / r[0];
      const h1 = W / r[1];
      return { cells: [{ x: 0, y: 0, w: W, h: h0 }, { x: 0, y: h0 + gap, w: W, h: h1 }], width: W, height: h0 + h1 + gap };
    }
    const h = Math.min(maxH, (W - gap) / (r[0] + r[1]));
    const w0 = h * r[0];
    return { cells: [{ x: 0, y: 0, w: w0, h }, { x: w0 + gap, y: 0, w: W - w0 - gap, h }], width: W, height: h };
  }
  if (n === 3) {
    const H = Math.min(maxH, W * 0.75);
    const leftW = Math.round(W * 0.62);
    const rightW = W - leftW - gap;
    const half = (H - gap) / 2;
    return {
      cells: [
        { x: 0, y: 0, w: leftW, h: H },
        { x: leftW + gap, y: 0, w: rightW, h: half },
        { x: leftW + gap, y: half + gap, w: rightW, h: half },
      ],
      width: W,
      height: H,
    };
  }
  // 4 и больше: строки по 2 (для 4) или по 3 с остатком из 2.
  const rows: number[] = [];
  if (n === 4) rows.push(2, 2);
  else {
    let left = n;
    while (left > 0) {
      if (left === 4) {
        rows.push(2, 2);
        left = 0;
      } else if (left === 2) {
        rows.push(2);
        left = 0;
      } else {
        rows.push(Math.min(3, left));
        left -= Math.min(3, left);
      }
    }
  }
  const cells: AlbumCell[] = [];
  let y = 0;
  for (const count of rows) {
    const rowH = Math.min(W / 2, (W - gap * (count - 1)) / count);
    const w = (W - gap * (count - 1)) / count;
    for (let k = 0; k < count; k++) {
      cells.push({ x: k * (w + gap), y, w, h: rowH });
    }
    y += rowH + gap;
  }
  return { cells, width: W, height: y - gap };
}
