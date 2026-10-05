import { useMemo, useState } from 'react';
import { Check, X } from 'lucide-react';
import { fuzzyMatch } from '../../lib/fuzzy';
import { displayName } from '../../lib/format';
import type { Employee, UserShort } from '../../lib/types';
import { Avatar } from '../../ui/Avatar';
import { SearchField } from '../../ui/Field';
import { Spinner } from '../../ui/Spinner';
import { useUsers } from './queries';
import s from './UserPicker.module.css';

/** Кого можно выбрать: сотрудник с должностью (как в /api/users и /api/users/assignable). */
export type PickableUser = UserShort & { role_name?: string | null; role_color?: string | null };

interface Props {
  /** Свой список вместо всех активных сотрудников (например, «кому можно ставить задачи»). */
  users?: PickableUser[];
  loading?: boolean;
  /** Подписать пункт текущего пользователя «(вы)». */
  meId?: number;
  /** Кого не показывать (я, уже участники). */
  exclude?: number[];
  /** Один выбор — сразу onPick; несколько — галочки и чипы. */
  multiple?: boolean;
  selected?: number[];
  onToggle?: (id: number) => void;
  onPick?: (user: Employee | PickableUser) => void;
  autoFocus?: boolean;
}

/** Список сотрудников с поиском (имя, логин, должность; раскладка и транслит учитываются). */
export function UserPicker({ users: own, loading, meId, exclude = [], multiple, selected = [], onToggle, onPick, autoFocus }: Props) {
  const all = useUsers(!own);
  const users: PickableUser[] | undefined = own ?? all.data;
  const isLoading = own ? !!loading : all.isLoading;
  const [query, setQuery] = useState('');
  const excluded = useMemo(() => new Set(exclude), [exclude]);

  const list = useMemo(() => {
    const base = (users || []).filter((u) => !excluded.has(u.id) && u.is_active !== false);
    if (!query.trim()) return [...base].sort((a, b) => displayName(a).localeCompare(displayName(b), 'ru'));
    return base
      .map((u) => ({ u, r: fuzzyMatch(`${u.display_name || ''} ${u.username} ${u.role_name || ''}`, query) }))
      .filter((x) => x.r.match)
      .sort((a, b) => a.r.rank - b.r.rank)
      .map((x) => x.u);
  }, [users, excluded, query]);

  const chosen = (users || []).filter((u) => selected.includes(u.id));

  return (
    <div className={s.wrap}>
      {multiple && chosen.length > 0 && (
        <div className={s.chips}>
          {chosen.map((u) => (
            <button key={u.id} type="button" className={s.chip} onClick={() => onToggle?.(u.id)} aria-label={`Убрать ${displayName(u)}`}>
              <Avatar name={displayName(u)} src={u.avatar_url} size={24} />
              <span>{displayName(u).split(' ')[0]}</span>
              <X size={14} />
            </button>
          ))}
        </div>
      )}
      <div className={s.search}>
        <SearchField value={query} onChange={setQuery} placeholder="Поиск сотрудников" autoFocus={autoFocus} />
      </div>
      <div className={s.list}>
        {isLoading ? (
          <div className={s.center}>
            <Spinner />
          </div>
        ) : list.length === 0 ? (
          <div className={s.center}>{query ? 'Никого не нашли' : 'Некого добавить'}</div>
        ) : (
          list.map((u) => {
            const on = selected.includes(u.id);
            return (
              <button
                key={u.id}
                type="button"
                className={[s.row, on && s.rowOn].filter(Boolean).join(' ')}
                onClick={() => (multiple ? onToggle?.(u.id) : onPick?.(u))}
              >
                <Avatar name={displayName(u)} src={u.avatar_url} size={44} />
                <span className={s.body}>
                  <span className={s.name}>
                    {displayName(u)}
                    {u.id === meId ? ' (вы)' : ''}
                  </span>
                  <span className={s.sub} style={u.role_color ? { color: u.role_color } : undefined}>
                    {u.role_name || `@${u.username}`}
                  </span>
                </span>
                {multiple && <span className={[s.check, on && s.checkOn].filter(Boolean).join(' ')}>{on && <Check size={14} strokeWidth={3} />}</span>}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
