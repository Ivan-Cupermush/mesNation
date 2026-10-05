export interface MenuAnchor {
  x: number;
  y: number;
}

/** Точка для меню из события мыши или из элемента-кнопки. */
export function anchorFrom(e: { clientX: number; clientY: number } | HTMLElement): MenuAnchor {
  if (e instanceof HTMLElement) {
    const r = e.getBoundingClientRect();
    return { x: r.right, y: r.bottom + 4 };
  }
  return { x: e.clientX, y: e.clientY };
}
