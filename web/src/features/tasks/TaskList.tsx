import { useState, type ReactNode } from 'react';
import { useMatch, useNavigate } from 'react-router-dom';
import { ArrowDownUp, CalendarRange, Check, List, ListTodo, Plus, SlidersHorizontal } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { Button, IconButton } from '../../ui/Button';
import { Chips, SearchField } from '../../ui/Field';
import { EmptyState } from '../../ui/EmptyState';
import { Modal } from '../../ui/Modal';
import { Spinner } from '../../ui/Spinner';
import TaskCard from './TaskCard';
import { ROLE_FILTERS, STATUS_FILTERS, useFilteredTasks, type TaskFilterState } from './filters';
import s from './TaskList.module.css';

export interface ListState extends TaskFilterState {
  view: 'list' | 'calendar';
}

interface Props {
  state: ListState;
  onChange: (patch: Partial<ListState>) => void;
  /** Календарь вместо списка карточек. */
  children?: ReactNode;
}

/** Список задач: поиск, фильтры по роли и статусу, сортировка, переключатель «список / календарь». */
export default function TaskList({ state, onChange, children }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const match = useMatch('/tasks/:id/*');
  const activeId = Number(match?.params.id) || null;
  const { tasks, counts, manager, isLoading, error, refetch } = useFilteredTasks(state);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const chips = ROLE_FILTERS.filter((f) => !f.managersOnly || manager).map((f) => ({
    key: f.key,
    label:
      f.key === 'review' && counts.review ? (
        <>
          {f.label} <span className={s.count}>{counts.review}</span>
        </>
      ) : f.key === 'overdue' && counts.overdue ? (
        <>
          {f.label} <span className={[s.count, s.countDanger].join(' ')}>{counts.overdue}</span>
        </>
      ) : (
        f.label
      ),
  }));
  const tuned = state.status !== 'any' || state.sort !== 'deadline';

  return (
    <div className={s.wrap}>
      <header className={s.header}>
        <div className={s.titles}>
          <h1 className={`${s.title} display-title`}>Задачи</h1>
          {user?.company_name && <div className={s.company}>{user.company_name}</div>}
        </div>
        <div className={s.switch} role="tablist" aria-label="Вид">
          <button type="button" role="tab" aria-selected={state.view === 'list'} className={state.view === 'list' ? s.switchOn : undefined} onClick={() => onChange({ view: 'list' })} title="Список">
            <List size={18} />
          </button>
          <button type="button" role="tab" aria-selected={state.view === 'calendar'} className={state.view === 'calendar' ? s.switchOn : undefined} onClick={() => onChange({ view: 'calendar' })} title="Календарь">
            <CalendarRange size={18} />
          </button>
        </div>
        <IconButton label="Новая задача" tone="soft" size={42} onClick={() => navigate('/tasks/new')}>
          <Plus size={22} />
        </IconButton>
      </header>

      <div className={s.search}>
        <SearchField value={state.query} onChange={(query) => onChange({ query })} placeholder="Поиск задач" />
        <IconButton label="Сортировка и статус" active={tuned} onClick={() => setSettingsOpen(true)}>
          <SlidersHorizontal size={19} />
        </IconButton>
      </div>
      <Chips className={s.filters} value={state.filter} onChange={(filter) => onChange({ filter })} options={chips} />
      {state.status !== 'any' && (
        <div className={s.activeStatus}>
          Статус: {STATUS_FILTERS.find((f) => f.key === state.status)?.label}
          <button type="button" onClick={() => onChange({ status: 'any' })}>
            сбросить
          </button>
        </div>
      )}

      {children || (
        <div className={s.scroll}>
          {isLoading ? (
            <div className={s.center}>
              <Spinner />
            </div>
          ) : error ? (
            <EmptyState compact title="Не удалось загрузить задачи" text={error instanceof Error ? error.message : undefined} action={<Button size="sm" onClick={() => refetch()}>Повторить</Button>} />
          ) : tasks.length === 0 ? (
            <EmptyState
              compact
              icon={<ListTodo size={40} strokeWidth={1.5} />}
              title={state.query.trim() ? 'Ничего не найдено' : 'Задач пока нет'}
              text={state.query.trim() || state.filter !== 'all' || state.status !== 'any' ? 'Попробуйте изменить запрос или фильтр' : 'Нажмите «+», чтобы создать первую задачу'}
            />
          ) : (
            <div className={s.cards}>
              {tasks.map((t) => (
                <TaskCard key={t.id} task={t} active={t.id === activeId} onOpen={(task) => navigate(`/tasks/${task.id}`)} />
              ))}
            </div>
          )}
        </div>
      )}

      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Сортировка и статус" size="sm">
        <div className={s.section}>Сортировка</div>
        {(
          [
            { key: 'deadline', title: 'По дедлайну', hint: 'Ближайшие сроки → важные' },
            { key: 'priority', title: 'По приоритету', hint: 'Важные задачи → ближайшие сроки' },
          ] as const
        ).map((o) => (
          <button key={o.key} type="button" className={[s.option, state.sort === o.key && s.optionOn].filter(Boolean).join(' ')} onClick={() => onChange({ sort: o.key })}>
            <ArrowDownUp size={19} />
            <span className={s.optionBody}>
              <b>{o.title}</b>
              <small>{o.hint}</small>
            </span>
            {state.sort === o.key && <Check size={18} />}
          </button>
        ))}
        <div className={s.section}>Статус</div>
        <div className={s.statuses}>
          {STATUS_FILTERS.map((f) => (
            <button key={f.key} type="button" className={[s.status, state.status === f.key && s.statusOn].filter(Boolean).join(' ')} onClick={() => onChange({ status: f.key })}>
              {f.label}
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
