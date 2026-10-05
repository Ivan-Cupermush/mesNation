import { useState } from 'react';
import { ChevronDown, ChevronRight, Users } from 'lucide-react';
import type { TreeItem } from './queries';
import s from './RoleTree.module.css';

interface Props {
  items: TreeItem[];
  selected?: number | null;
  onSelect: (id: number) => void;
  /** Узлы, которые нельзя выбрать (например, поддерево переносимой роли). */
  disabled?: Set<number>;
  /** Изначально раскрыть всё (по умолчанию — первые два уровня). */
  expandAll?: boolean;
}

/** Дерево ролей: раскрываемые ветки, цвет и значок роли, число сотрудников (своих и всего поддерева). */
export function RoleTree({ items, selected, onSelect, disabled, expandAll }: Props) {
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());

  const isOpen = (it: TreeItem) => (expandAll || it.depth < 2 ? !collapsed.has(it.node.id) : expanded.has(it.node.id));
  const toggle = (it: TreeItem) => {
    const id = it.node.id;
    if (expandAll || it.depth < 2) setCollapsed((p) => toggleIn(p, id));
    else setExpanded((p) => toggleIn(p, id));
  };

  const render = (it: TreeItem) => {
    const n = it.node;
    const open = isOpen(it);
    const off = disabled?.has(n.id);
    return (
      <li key={n.id}>
        <div className={[s.row, selected === n.id && s.selected, off && s.disabled].filter(Boolean).join(' ')} style={{ paddingLeft: 8 + it.depth * 22 }}>
          {it.children.length ? (
            <button type="button" className={s.toggle} onClick={() => toggle(it)} aria-label={open ? 'Свернуть' : 'Развернуть'} aria-expanded={open}>
              {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
          ) : (
            <span className={s.toggle} />
          )}
          <button type="button" className={s.main} onClick={() => !off && onSelect(n.id)} disabled={off}>
            <span className={s.icon} style={{ background: `color-mix(in srgb, ${n.color || '#6366F1'} 16%, transparent)`, color: n.color || '#6366F1' }}>
              {n.icon || '👤'}
            </span>
            <span className={s.body}>
              <span className={s.name}>{n.name}</span>
              {n.description && <span className={s.desc}>{n.description}</span>}
            </span>
            <span className={s.count} title={`В роли: ${n.users_count}, во всей ветке: ${it.total}`}>
              <Users size={13} />
              {n.users_count}
              {it.children.length > 0 && it.total !== n.users_count && <span className={s.total}>/{it.total}</span>}
            </span>
          </button>
        </div>
        {open && it.children.length > 0 && <ul className={s.list}>{it.children.map(render)}</ul>}
      </li>
    );
  };

  return <ul className={s.list}>{items.map(render)}</ul>;
}

function toggleIn(set: Set<number>, id: number) {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}
