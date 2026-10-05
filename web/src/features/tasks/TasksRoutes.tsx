import { lazy, Suspense, useState } from 'react';
import { Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ListTodo } from 'lucide-react';
import { storage } from '../../lib/storage';
import { useMedia } from '../../lib/useMedia';
import { EmptyState } from '../../ui/EmptyState';
import { PageLoader } from '../../ui/Spinner';
import { ErrorBoundary } from '../../ui/ErrorBoundary';
import { SplitContext } from './layout';
import TaskList, { type ListState } from './TaskList';
import s from './TasksRoutes.module.css';

const TaskDetailPage = lazy(() => import('./TaskDetail'));
const TaskForm = lazy(() => import('./TaskForm'));
const TaskCalendar = lazy(() => import('./TaskCalendar'));

const VIEW_KEY = 'offix.tasks.view';
const SORT_KEY = 'offix.tasks.sort';

/**
 * Раздел «Задачи». Широкий экран: список слева, задача справа.
 * Узкий экран и телефон: список и задача — отдельные экраны (как в приложении).
 * Календарь занимает всю ширину, задача из него открывается отдельно.
 */
export default function TasksRoutes() {
  return (
    <Routes>
      <Route element={<TasksLayout />}>
        <Route index element={<NothingSelected />} />
        <Route path="new" element={<TaskForm />} />
        <Route path=":id" element={<TaskDetailPage />} />
        <Route path=":id/edit" element={<TaskForm />} />
      </Route>
    </Routes>
  );
}

function TasksLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const wide = useMedia('(min-width: 1180px)');
  const atIndex = /^\/tasks\/?$/.test(location.pathname);
  // Фильтры живут здесь: при переходе в задачу и обратно они не сбрасываются.
  const [state, setState] = useState<ListState>(() => ({
    filter: 'all',
    status: 'any',
    query: '',
    sort: storage.get(SORT_KEY) === 'priority' ? 'priority' : 'deadline',
    view: storage.get(VIEW_KEY) === 'calendar' ? 'calendar' : 'list',
  }));
  const update = (patch: Partial<ListState>) => {
    if (patch.view) storage.set(VIEW_KEY, patch.view);
    if (patch.sort) storage.set(SORT_KEY, patch.sort);
    // Календарь занимает всю ширину: открытая задача закрывается, чтобы его было видно.
    if (patch.view === 'calendar' && !atIndex) navigate('/tasks');
    setState((prev) => ({ ...prev, ...patch }));
  };

  const calendar = state.view === 'calendar';
  const split = wide && !calendar;
  const showList = split || atIndex;
  const showDetail = split || !atIndex;

  return (
    <div className={[s.layout, split && s.split].filter(Boolean).join(' ')}>
      {showList && (
        <aside className={[s.list, calendar && s.listWide].filter(Boolean).join(' ')}>
          <TaskList state={state} onChange={update}>
            {calendar ? (
              <Suspense fallback={<PageLoader />}>
                <TaskCalendar state={state} />
              </Suspense>
            ) : null}
          </TaskList>
        </aside>
      )}
      {showDetail && (
        <section className={s.detail}>
          <SplitContext.Provider value={split}>
            <ErrorBoundary key={location.pathname}>
              <Suspense fallback={<PageLoader />}>
                <Outlet />
              </Suspense>
            </ErrorBoundary>
          </SplitContext.Provider>
        </section>
      )}
    </div>
  );
}

function NothingSelected() {
  return (
    <div className={s.placeholder}>
      <EmptyState icon={<ListTodo size={48} strokeWidth={1.5} />} title="Выберите задачу" text="Откройте задачу слева или создайте новую кнопкой «+»." />
    </div>
  );
}
