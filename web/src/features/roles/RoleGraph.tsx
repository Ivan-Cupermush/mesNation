import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minus, Plus, Users } from 'lucide-react';
import { plural } from '../../lib/format';
import { NODE_HEIGHT, NODE_WIDTH, buildForest, flatten, type GraphNode } from './treeLayout';
import s from './RoleGraph.module.css';

const MIN_SCALE = 0.3;
const MAX_SCALE = 2.2;
/** Место под кнопкой «+» под нижним рядом ролей. */
const ADD_ZONE = 44;
const ADD_SIZE = 26;
const DRAG_THRESHOLD = 4;

const clamp = (v: number) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, v));

interface Props<N extends GraphNode> {
  nodes: N[];
  selected?: number | null;
  onSelect: (node: N) => void;
  /** «+» под ролью — добавить роль уровнем ниже (только у директора). */
  onAddChild?: (node: N) => void;
  /** Роли, которые нельзя выбрать (например, ветка переносимой роли). */
  disabled?: Set<number>;
  /** Сотрудников во всей ветке роли — показываем, если больше, чем в самой роли. */
  totals?: Map<number, number>;
  className?: string;
}

/**
 * Дерево ролей как оргструктура — как в приложении (TreeGraphView): карточки
 * ролей, связи «шиной» со скруглениями, перемещение мышью или пальцем,
 * масштаб колесом с Ctrl, щипком на тачпаде и телефоне или кнопками.
 */
export function RoleGraph<N extends GraphNode>({ nodes, selected, onSelect, onAddChild, disabled, totals, className }: Props<N>) {
  const forest = useMemo(() => buildForest(nodes), [nodes]);
  const all = useMemo(() => forest.flatMap(flatten), [forest]);
  const bounds = useMemo(() => {
    let w = 0;
    let h = 0;
    for (const n of all) {
      w = Math.max(w, n.x + NODE_WIDTH);
      h = Math.max(h, n.y + NODE_HEIGHT);
    }
    return { w, h: h + (onAddChild ? ADD_ZONE : 12) };
  }, [all, onAddChild]);

  // Связи: вертикаль от руководителя, общая «шина» и вертикали к подчинённым.
  const edges = useMemo(() => {
    const list: { key: string; d: string }[] = [];
    const R = 10;
    for (const ln of all) {
      if (!ln.children.length) continue;
      const px = ln.x + NODE_WIDTH / 2;
      const py = ln.y + NODE_HEIGHT;
      const my = py + (ln.children[0].y - py) / 2;
      for (const c of ln.children) {
        const cx = c.x + NODE_WIDTH / 2;
        const dx = cx - px;
        const key = `${ln.node.id}-${c.node.id}`;
        if (Math.abs(dx) < 1) {
          list.push({ key, d: `M ${px} ${py} V ${c.y}` });
          continue;
        }
        const r = Math.min(R, Math.abs(dx) / 2, (c.y - my) / 2);
        const sx = Math.sign(dx);
        list.push({ key, d: `M ${px} ${py} V ${my - r} Q ${px} ${my} ${px + sx * r} ${my} H ${cx - sx * r} Q ${cx} ${my} ${cx} ${my + r} V ${c.y}` });
      }
    }
    return list;
  }, [all]);

  // ---------- Камера: экранная точка = (x, y) + s · точка холста ----------
  const viewRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const cam = useRef({ x: 0, y: 0, s: 1 });
  const [view, setView] = useState({ w: 0, h: 0 });
  const fitted = useRef(false);
  const [animating, setAnimating] = useState(false);

  const apply = useCallback((x: number, y: number, sc: number, animate = false) => {
    cam.current = { x, y, s: sc };
    const el = canvasRef.current;
    if (!el) return;
    setAnimating(animate);
    el.style.transform = `translate(${x}px, ${y}px) scale(${sc})`;
  }, []);

  const fit = useCallback(
    (animate: boolean) => {
      if (!view.w || !view.h || !bounds.w) return;
      const pad = 28;
      const sc = clamp(Math.min((view.w - pad * 2) / bounds.w, (view.h - pad * 2) / bounds.h, 1));
      const x = (view.w - bounds.w * sc) / 2;
      const y = Math.max(pad, (view.h - bounds.h * sc) / 2);
      apply(x, y, sc, animate);
    },
    [view, bounds, apply],
  );

  useLayoutEffect(() => {
    const el = viewRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setView({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!fitted.current && view.w && bounds.w) {
      fitted.current = true;
      fit(false);
    }
  }, [view, bounds, fit]);

  const zoomAt = useCallback(
    (fx: number, fy: number, k: number, animate = false) => {
      const { x, y, s: s0 } = cam.current;
      const s1 = clamp(s0 * k);
      const px = (fx - x) / s0;
      const py = (fy - y) / s0;
      apply(fx - px * s1, fy - py * s1, s1, animate);
    },
    [apply],
  );

  // Колесо: с Ctrl (и щипок на тачпаде) — масштаб у курсора, без — прокрутка холста.
  useEffect(() => {
    const el = viewRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.01));
      } else {
        const { x, y, s: sc } = cam.current;
        apply(x - e.deltaX, y - e.deltaY, sc);
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [apply, zoomAt]);

  // Перетаскивание и щипок пальцами — через pointer events.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef({ moved: false, startX: 0, startY: 0, camX: 0, camY: 0, dist: 0, camS: 1, fx: 0, fy: 0 });

  const local = (e: React.PointerEvent) => {
    const rect = viewRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const begin = () => {
    const pts = [...pointers.current.values()];
    const d = drag.current;
    d.camX = cam.current.x;
    d.camY = cam.current.y;
    d.camS = cam.current.s;
    if (pts.length >= 2) {
      d.dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      d.fx = (pts[0].x + pts[1].x) / 2;
      d.fy = (pts[0].y + pts[1].y) / 2;
    } else if (pts.length === 1) {
      d.startX = pts[0].x;
      d.startY = pts[0].y;
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    pointers.current.set(e.pointerId, local(e));
    if (pointers.current.size === 1) drag.current.moved = false;
    begin();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, local(e));
    const pts = [...pointers.current.values()];
    const d = drag.current;
    if (pts.length >= 2) {
      d.moved = true;
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const fx = (pts[0].x + pts[1].x) / 2;
      const fy = (pts[0].y + pts[1].y) / 2;
      const s1 = clamp(d.camS * (dist / (d.dist || dist)));
      const px = (d.fx - d.camX) / d.camS;
      const py = (d.fy - d.camY) / d.camS;
      apply(fx - px * s1, fy - py * s1, s1);
      return;
    }
    const dx = pts[0].x - d.startX;
    const dy = pts[0].y - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!d.moved) {
      d.moved = true;
      viewRef.current?.setPointerCapture(e.pointerId);
    }
    apply(d.camX + dx, d.camY + dy, cam.current.s);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    // Убрали один палец из двух — продолжаем двигать без скачка.
    begin();
  };

  /** Клик по карточке — только если холст не двигали. */
  const click = (fn: () => void) => () => {
    if (!drag.current.moved) fn();
  };

  if (!nodes.length) return <div className={s.empty}>Дерево ролей пока пустое</div>;

  const center = () => ({ x: view.w / 2, y: view.h / 2 });

  return (
    <div
      ref={viewRef}
      className={[s.view, className].filter(Boolean).join(' ')}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div ref={canvasRef} className={[s.canvas, animating && s.animating].filter(Boolean).join(' ')} style={{ width: bounds.w, height: bounds.h }} onTransitionEnd={() => setAnimating(false)}>
        <svg className={s.edges} width={bounds.w} height={bounds.h} aria-hidden>
          {edges.map((e) => (
            <path key={e.key} d={e.d} />
          ))}
        </svg>
        {all.map(({ node, x, y, children }) => {
          const color = node.color || 'var(--c-accent)';
          const count = Number(node.users_count) || 0;
          const total = totals?.get(node.id) ?? count;
          const off = disabled?.has(node.id);
          const isRoot = !!node.is_root || node.parent_id == null;
          return (
            <div key={node.id}>
              <button
                type="button"
                className={[s.node, isRoot && s.root, selected === node.id && s.selected, off && s.off].filter(Boolean).join(' ')}
                style={{ left: x, top: y, width: NODE_WIDTH, height: NODE_HEIGHT, ['--role' as string]: color }}
                onClick={click(() => !off && onSelect(node as N))}
                disabled={off}
                aria-pressed={selected === node.id}
                title={[node.description, total > count ? `В роли: ${count}, во всей ветке: ${total}` : ''].filter(Boolean).join('\n') || undefined}
              >
                <span className={s.stripe} />
                <span className={s.icon}>{node.icon?.trim() || '👤'}</span>
                <span className={s.text}>
                  <span className={s.name}>{node.name}</span>
                  <span className={[s.meta, !count && s.vacant].filter(Boolean).join(' ')}>
                    <Users size={11} strokeWidth={2.2} />
                    {count ? `${count} ${plural(count, ['человек', 'человека', 'человек'])}` : 'вакансия'}
                    {total > count && <span className={s.branch}> · в ветке {total}</span>}
                  </span>
                </span>
              </button>
              {onAddChild && (
                <button
                  type="button"
                  className={s.add}
                  style={{ left: x + NODE_WIDTH / 2 - ADD_SIZE / 2, top: y + NODE_HEIGHT + (children.length ? 6 : 10), width: ADD_SIZE, height: ADD_SIZE }}
                  onClick={click(() => onAddChild(node as N))}
                  aria-label={`Добавить роль под «${node.name}»`}
                  title="Добавить роль уровнем ниже"
                >
                  <Plus size={14} strokeWidth={2.8} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className={s.zoom} onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" onClick={() => zoomAt(center().x, center().y, 1.25, true)} aria-label="Приблизить" title="Приблизить">
          <Plus size={18} />
        </button>
        <span />
        <button type="button" onClick={() => fit(true)} aria-label="Показать всё дерево" title="Показать всё дерево">
          <Maximize2 size={16} />
        </button>
        <span />
        <button type="button" onClick={() => zoomAt(center().x, center().y, 0.8, true)} aria-label="Отдалить" title="Отдалить">
          <Minus size={18} />
        </button>
      </div>
    </div>
  );
}
