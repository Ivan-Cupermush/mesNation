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
import { KIND_FILTERS, ROLE_FILTERS, STATUS_FILTERS, useFilteredTasks, type TaskFilterState } from './filters';
import { KindChooser } from './kind';
import s from './TaskList.module.css';
import ShellActions from '../inbox/ShellActions';

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
  const [choosing, setChoosing] = useState(false);

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
        <ShellActions />
        <IconButton label="Создать задачу или просьбу" tone="soft" size={42} onClick={() => setChoosing(true)}>
          <Plus size={22} />
        </IconButton>
      </header>

      <div className={s.search}>
        <SearchField value={state.query} onChange={(query) => onChange({ query })} placeholder="Поиск задач" />
        <IconButton label="Сортировка и статус" active={tuned} onClick={() => setSettingsOpen(true)}>
          <SlidersHorizontal size={19} />
        </IconButton>
      </div>
      <div className={s.kinds} role="tablist" aria-label="Задачи и просьбы">
        {KIND_FILTERS.map((k) => (
          <button
            key={k.key}
            type="button"
            role="tab"
            aria-selected={state.kind === k.key}
            className={[s.kind, state.kind === k.key && s.kindOn, k.key === 'request' && s.kindRequest].filter(Boolean).join(' ')}
            onClick={() => onChange({ kind: k.key })}
          >
            {k.label}
            {k.key === 'request' && counts.requests > 0 && <span className={[s.count, s.countRequest].join(' ')}>{counts.requests}</span>}
          </button>
        ))}
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
              title={state.query.trim() ? 'Ничего не найдено' : state.kind === 'request' ? 'Просьб пока нет' : 'Задач пока нет'}
              text={
                state.query.trim() || state.filter !== 'all' || state.status !== 'any'
                  ? 'Попробуйте изменить запрос или фильтр'
                  : state.kind === 'request'
                    ? 'Нужна помощь коллеги? Нажмите «+» и выберите «Просьба».'
                    : 'Нажмите «+», чтобы создать первую задачу или просьбу'
              }
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

      <KindChooser
        open={choosing}
        onClose={() => setChoosing(false)}
        onPick={(kind) => {
          setChoosing(false);
          navigate(kind === 'request' ? '/tasks/new?kind=request' : '/tasks/new');
        }}
      />

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
