import { useMemo, useState, type CSSProperties } from 'react';
import { Check, HandHeart, X } from 'lucide-react';
import { fuzzyMatch } from '../../lib/fuzzy';
import { displayName } from '../../lib/format';
import { firstNameOf } from '../../lib/names';
import type { AssignableUser } from '../../lib/types';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { SearchField } from '../../ui/Field';
import { Spinner } from '../../ui/Spinner';
import type { TaskKind } from './types';
import s from './AssigneePicker.module.css';

interface Group {
  key: string;
  title: string;
  hint?: string;
  icon?: string | null;
  color?: string | null;
  users: AssignableUser[];
}

const byName = (a: AssignableUser, b: AssignableUser) => displayName(a).localeCompare(displayName(b), 'ru');

/**
 * Кого назначить. Запрос: сначала коллеги вашей должности, потом остальные —
 * по ролям (коллеги своего уровня, затем подчинённые), в конце — себе.
 * Задача: себе и подчинённые по ролям; коллегам — только запросом (подсказка
 * с переключением).
 */
export function groupAssignees(users: AssignableUser[], kind: TaskKind, myRole: string | null): Group[] {
  const allowed = users.filter((u) => u.is_active !== false && (kind === 'request' ? u.can_request !== false : u.can_task !== false));
  const self = allowed.filter((u) => u.relation === 'self');
  const sameRole = allowed.filter((u) => u.relation === 'colleague' && u.same_role).sort(byName);
  const rest = allowed.filter((u) => u.relation !== 'self' && !(u.relation === 'colleague' && u.same_role));
  const roles = new Map<string, Group>();
  for (const u of rest) {
    const key = `${u.relation === 'colleague' ? 0 : 1}:${u.role_name || '—'}`;
    if (!roles.has(key)) {
      roles.set(key, {
        key,
        title: u.role_name || 'Без должности',
        hint: u.relation === 'colleague' ? 'коллеги вашего уровня' : 'подчинённые',
        icon: u.role_icon,
        color: u.role_color,
        users: [],
      });
    }
    roles.get(key)!.users.push(u);
  }
  const roleGroups = [...roles.values()]
    .sort((a, b) => a.key.localeCompare(b.key, 'ru'))
    .map((g) => ({ ...g, users: g.users.sort(byName) }));
  const selfGroup: Group[] = self.length ? [{ key: 'self', title: kind === 'request' ? 'Себе — как напоминание' : 'Себе', users: self }] : [];
  const sameGroup: Group[] = sameRole.length
    ? [{ key: 'same', title: myRole ? `Коллеги — ${myRole}` : 'Коллеги вашей должности', hint: 'ваша должность', icon: sameRole[0].role_icon, color: sameRole[0].role_color, users: sameRole }]
    : [];
  return kind === 'request' ? [...sameGroup, ...roleGroups, ...selfGroup] : [...selfGroup, ...roleGroups];
}

interface Props {
  users: AssignableUser[] | undefined;
  loading?: boolean;
  kind: TaskKind;
  meId: number;
  myRole: string | null;
  selected: number[];
  onToggle: (user: AssignableUser) => void;
  /** Задача: коллегам — только запросом. Переключить форму на запрос. */
  onSwitchToRequest?: () => void;
}

export function AssigneePicker({ users, loading, kind, meId, myRole, selected, onToggle, onSwitchToRequest }: Props) {
  const [query, setQuery] = useState('');
  const groups = useMemo(() => groupAssignees(users || [], kind, myRole), [users, kind, myRole]);
  const flat = useMemo(() => groups.flatMap((g) => g.users), [groups]);
  const found = useMemo(() => {
    const q = query.trim();
    if (!q) return null;
    return flat
      .map((u) => ({ u, r: fuzzyMatch(`${u.display_name || ''} ${u.username} ${u.role_name || ''}`, q) }))
      .filter((x) => x.r.match)
      .sort((a, b) => a.r.rank - b.r.rank)
      .map((x) => x.u);
  }, [flat, query]);
  const colleagues = (users || []).filter((u) => u.relation === 'colleague').length;
  const chosen = flat.filter((u) => selected.includes(u.id));
  const request = kind === 'request';

  const row = (u: AssignableUser) => {
    const on = selected.includes(u.id);
    return (
      <button key={u.id} type="button" className={[s.row, on && s.rowOn, request && s.rowRequest].filter(Boolean).join(' ')} onClick={() => onToggle(u)}>
        <Avatar name={displayName(u)} src={u.avatar_url} size={42} />
        <span className={s.body}>
          <span className={s.name}>
            {displayName(u)}
            {u.id === meId ? ' (вы)' : ''}
          </span>
          <span className={s.sub}>{u.role_name || `@${u.username}`}</span>
        </span>
        <span className={[s.check, on && s.checkOn].filter(Boolean).join(' ')}>{on && <Check size={14} strokeWidth={3} />}</span>
      </button>
    );
  };

  return (
    <div className={[s.wrap, request && s.request].filter(Boolean).join(' ')}>
      {chosen.length > 0 && (
        <div className={s.chips}>
          {chosen.map((u) => (
            <button key={u.id} type="button" className={s.chip} onClick={() => onToggle(u)} aria-label={`Убрать ${displayName(u)}`}>
              <Avatar name={displayName(u)} src={u.avatar_url} size={24} />
              <span>{firstNameOf(u)}</span>
              <X size={14} />
            </button>
          ))}
        </div>
      )}
      <div className={s.search}>
        <SearchField value={query} onChange={setQuery} placeholder={request ? 'Кого попросить?' : 'Поиск сотрудников'} autoFocus />
      </div>
      <div className={s.list}>
        {loading ? (
          <div className={s.center}>
            <Spinner />
          </div>
        ) : found ? (
          found.length ? found.map(row) : <div className={s.center}>Никого не нашли</div>
        ) : flat.length === 0 ? (
          <div className={s.center}>{request ? 'Пока некого попросить' : 'Пока некому поставить задачу'}</div>
        ) : (
          groups.map((g) => (
            <section key={g.key} className={s.group}>
              <div className={s.groupHead} style={g.color ? ({ '--role': g.color } as CSSProperties) : undefined}>
                {g.icon ? <span className={s.groupIcon}>{g.icon}</span> : <span className={s.groupDot} />}
                <span className={s.groupTitle}>{g.title}</span>
                {g.hint && <span className={s.groupHint}>{g.hint}</span>}
                <span className={s.groupCount}>{g.users.length}</span>
              </div>
              {g.users.map(row)}
            </section>
          ))
        )}
        {!request && !query && colleagues > 0 && onSwitchToRequest && (
          <div className={s.tip}>
            <span className={s.tipIcon}>
              <HandHeart size={18} />
            </span>
            <span className={s.tipText}>
              <b>Нужна помощь коллеги?</b>
              <span>Коллегам своего уровня ставят не задачу, а запрос — без проверки и важности.</span>
            </span>
            <Button size="sm" variant="soft" onClick={onSwitchToRequest}>
              Запрос
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
