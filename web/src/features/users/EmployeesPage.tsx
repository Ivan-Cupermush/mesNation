import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Network, UserPlus, Users } from 'lucide-react';
import { useMe } from '../auth/AuthProvider';
import { api } from '../../lib/http';
import { fuzzyMatch } from '../../lib/fuzzy';
import { displayName, plural } from '../../lib/format';
import type { Employee } from '../../lib/types';
import { Avatar } from '../../ui/Avatar';
import { Button, IconButton } from '../../ui/Button';
import { Chips, SearchField } from '../../ui/Field';
import { EmptyState } from '../../ui/EmptyState';
import { Page, PageBody, PageHeader } from '../../ui/Page';
import { Spinner } from '../../ui/Spinner';
import { userKeys } from './queries';
import s from './EmployeesPage.module.css';

type Status = 'active' | 'inactive' | 'all';

/** Совпадения: сначала по имени, потом по должности, логину и почте (как в приложении). */
function score(e: Employee, q: string): number {
  const fields = [displayName(e), e.role_name || '', e.username, e.email || ''];
  for (let i = 0; i < fields.length; i++) {
    const r = fuzzyMatch(fields[i], q);
    if (r.match) return i * 10 + r.rank;
  }
  return -1;
}

/**
 * Сотрудники компании — как в приложении: поиск по имени, должности,
 * логину и почте, активные и деактивированные, переход в профиль
 * (там сброс пароля и деактивация) и в дерево ролей.
 */
export default function EmployeesPage() {
  const me = useMe();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Status>('active');
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: userKeys.withInactive,
    queryFn: () => api.get<Employee[]>('/api/users', { include_inactive: 'true' }),
  });

  const all = useMemo(() => data || [], [data]);
  const inactive = all.filter((e) => !e.is_active).length;
  const list = useMemo(() => {
    const base = all.filter((e) => (status === 'all' ? true : status === 'active' ? e.is_active : !e.is_active));
    const q = query.trim();
    if (!q) return [...base].sort((a, b) => displayName(a).localeCompare(displayName(b), 'ru'));
    return base
      .map((e) => ({ e, sc: score(e, q) }))
      .filter((x) => x.sc >= 0)
      .sort((a, b) => a.sc - b.sc)
      .map((x) => x.e);
  }, [all, status, query]);

  return (
    <Page>
      <PageHeader
        title="Сотрудники"
        subtitle={data ? `${all.length - inactive} ${plural(all.length - inactive, ['активный', 'активных', 'активных'])}${inactive ? ` · ${inactive} неактивн.` : ''}` : undefined}
        back={true}
        actions={
          me.is_director ? (
            <Button size="sm" icon={<UserPlus size={16} />} onClick={() => navigate('/create-user')}>
              Добавить
            </Button>
          ) : undefined
        }
      >
        <div className={s.tools}>
          <SearchField value={query} onChange={setQuery} placeholder="Имя, должность, логин или почта" autoFocus />
          <Chips
            value={status}
            onChange={setStatus}
            options={[
              { key: 'active', label: 'Активные' },
              { key: 'inactive', label: `Неактивные${inactive ? ` ${inactive}` : ''}` },
              { key: 'all', label: 'Все' },
            ]}
          />
        </div>
      </PageHeader>
      <PageBody>
        {isLoading ? (
          <div className={s.center}>
            <Spinner />
          </div>
        ) : error ? (
          <EmptyState title="Не удалось загрузить сотрудников" action={<Button onClick={() => refetch()}>Повторить</Button>} />
        ) : list.length === 0 ? (
          <EmptyState icon={<Users size={40} />} title={query ? 'Никого не нашли' : 'Нет сотрудников'} compact />
        ) : (
          <div className={s.grid}>
            {list.map((e) => (
              <div key={e.id} className={[s.row, !e.is_active && s.inactive].filter(Boolean).join(' ')}>
                <button type="button" className={s.main} onClick={() => navigate(`/users/${e.id}`)}>
                  <Avatar name={displayName(e)} src={e.avatar_url} size={46} />
                  <span className={s.body}>
                    <span className={s.name}>
                      {displayName(e)}
                      {e.id === me.id ? ' (вы)' : ''}
                    </span>
                    <span className={s.meta}>
                      <span className={s.role} style={e.role_color ? { color: e.role_color, background: `color-mix(in srgb, ${e.role_color} 12%, transparent)` } : undefined}>
                        {e.role_name || 'Без роли'}
                      </span>
                      {!e.is_active && <span className={s.off}>деактивирован</span>}
                    </span>
                    {e.email && <span className={s.email}>{e.email}</span>}
                  </span>
                </button>
                {e.role_node_id && (
                  <IconButton label="Показать в дереве ролей" size={36} onClick={() => navigate(`/roles?node=${e.role_node_id}&user=${e.id}`)}>
                    <Network size={17} />
                  </IconButton>
                )}
              </div>
            ))}
          </div>
        )}
      </PageBody>
    </Page>
  );
}
