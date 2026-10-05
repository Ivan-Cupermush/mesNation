export interface MenuAnchor {
  x: number;
  y: number;
  /** Верх кнопки: если снизу не хватает места, меню открывается над ней. */
  yUp?: number;
}

/** Точка для меню из события мыши или из элемента-кнопки. */
export function anchorFrom(e: { clientX: number; clientY: number } | HTMLElement): MenuAnchor {
  if (e instanceof HTMLElement) {
    const r = e.getBoundingClientRect();
    return { x: r.right, y: r.bottom + 4, yUp: r.top - 4 };
  }
  return { x: e.clientX, y: e.clientY };
}
