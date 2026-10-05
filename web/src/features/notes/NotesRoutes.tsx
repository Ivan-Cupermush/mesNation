import { lazy, Suspense, useMemo, useState } from 'react';
import { Outlet, Route, Routes, useLocation, useMatch, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { BookOpen, Copy, CopyPlus, FileText, MoreHorizontal, NotebookPen, Paperclip, Plus, Star, Trash2 } from 'lucide-react';
import { api } from '../../lib/http';
import { fuzzyMatch } from '../../lib/fuzzy';
import { formatDate, toDateKey, toMonthKey } from '../../lib/format';
import { useMedia } from '../../lib/useMedia';
import { IconButton } from '../../ui/Button';
import { SearchField } from '../../ui/Field';
import { EmptyState } from '../../ui/EmptyState';
import { PageLoader, Spinner } from '../../ui/Spinner';
import { ErrorBoundary } from '../../ui/ErrorBoundary';
import { MonthCalendar } from '../../ui/MonthCalendar';
import { ActionMenu, type MenuItem } from '../../ui/ActionMenu';
import { anchorFrom, type MenuAnchor } from '../../ui/menuAnchor';
import { useFeedback } from '../../ui/feedback';
import { noteKeys, noteText, useAllNotes, useFavoriteNotes, useNoteDays, useNotesByDate, type Note } from './queries';
import { NotesContext, useNotesContext, type NotesState } from './context';
import s from './NotesRoutes.module.css';

const NoteEditor = lazy(() => import('./NoteEditor'));

/** Ключ сеанса редактора: новая заметка после первого сохранения получает адрес, но не перезапускается. */
const editorSession = (loc: { pathname: string; search: string; state: unknown }) =>
  (loc.state as { session?: string } | null)?.session ?? loc.pathname + loc.search;

/**
 * Раздел «Заметки» — как в приложении: календарь с отметками дней,
 * записи за выбранный день или избранное. На широком экране редактор
 * открывается справа, на телефоне — отдельным экраном.
 */
export default function NotesRoutes() {
  return (
    <Routes>
      <Route element={<NotesLayout />}>
        <Route index element={<Nothing />} />
        <Route path="new" element={<NoteEditor />} />
        <Route path=":id" element={<NoteEditor />} />
      </Route>
    </Routes>
  );
}

function NotesLayout() {
  const location = useLocation();
  const wide = useMedia('(min-width: 1100px)');
  const atIndex = /^\/notes\/?$/.test(location.pathname);
  const [state, setState] = useState<NotesState>(() => ({ date: toDateKey(new Date()), month: new Date(), favorites: false, query: '' }));
  const update = (patch: Partial<NotesState>) => setState((p) => ({ ...p, ...patch }));
  const showList = wide || atIndex;
  const showEditor = wide || !atIndex;

  return (
    <NotesContext.Provider value={{ state, update, split: wide }}>
      <div className={[s.layout, wide && s.split].filter(Boolean).join(' ')}>
        {showList && (
          <aside className={s.list}>
            <NotesList />
          </aside>
        )}
        {showEditor && (
          <section className={s.detail}>
            <ErrorBoundary key={editorSession(location)}>
              <Suspense fallback={<PageLoader />}>
                <Outlet />
              </Suspense>
            </ErrorBoundary>
          </section>
        )}
      </div>
    </NotesContext.Provider>
  );
}

function Nothing() {
  return (
    <div className={s.placeholder}>
      <EmptyState icon={<NotebookPen size={48} strokeWidth={1.5} />} title="Выберите заметку" text="Откройте запись слева или создайте новую кнопкой «+»." />
    </div>
  );
}

function NotesList() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast, confirm } = useFeedback();
  const { state, update } = useNotesContext();
  const match = useMatch('/notes/:id');
  const activeId = Number(match?.params.id) || null;
  const searching = state.query.trim().length > 0;
  const days = useNoteDays(toMonthKey(state.month));
  const byDate = useNotesByDate(state.date, !state.favorites && !searching);
  const favorites = useFavoriteNotes(state.favorites && !searching);
  const all = useAllNotes(searching);
  const [menu, setMenu] = useState<{ note: Note; anchor: MenuAnchor } | null>(null);

  const source = searching ? all : state.favorites ? favorites : byDate;
  const notes = useMemo(() => {
    const list = source.data || [];
    if (!searching) return list;
    return list
      .map((n) => ({ n, r: fuzzyMatch(`${n.title} ${n.content || ''}`, state.query) }))
      .filter((x) => x.r.match)
      .sort((a, b) => a.r.rank - b.r.rank)
      .map((x) => x.n);
  }, [source.data, searching, state.query]);

  const refresh = () => qc.invalidateQueries({ queryKey: noteKeys.all });

  const items = (n: Note): MenuItem[] => [
    {
      key: 'copy',
      label: 'Скопировать текст',
      icon: <Copy size={19} />,
      onSelect: async () => {
        try {
          await navigator.clipboard.writeText(noteText(n));
          toast('Текст скопирован');
        } catch {
          toast.error('Не удалось скопировать');
        }
      },
    },
    {
      key: 'duplicate',
      label: 'Создать копию',
      icon: <CopyPlus size={19} />,
      onSelect: async () => {
        try {
          const copy = await api.post<Note>(`/api/notes/${n.id}/duplicate`, {});
          refresh();
          navigate(`/notes/${copy.id}`);
        } catch (e) {
          toast.error(e, 'Не удалось скопировать заметку');
        }
      },
    },
    {
      key: 'delete',
      label: 'Удалить',
      danger: true,
      icon: <Trash2 size={19} />,
      onSelect: async () => {
        if (!(await confirm({ title: 'Удалить заметку?', text: 'Заметка и её вложения будут удалены без возможности восстановления.', confirmText: 'Удалить', danger: true }))) return;
        try {
          await api.delete(`/api/notes/${n.id}`);
          refresh();
          if (activeId === n.id) navigate('/notes', { replace: true });
        } catch (e) {
          toast.error(e, 'Не удалось удалить заметку');
        }
      },
    },
  ];

  const heading = searching ? 'Найдено' : state.favorites ? 'Избранные заметки' : 'Записи за день';

  return (
    <div className={s.listWrap}>
      <header className={s.header}>
        <div className={s.titles}>
          <h1 className={`${s.title} display-title`}>Заметки</h1>
          <div className={s.subtitle}>{formatDate(state.date + 'T00:00:00')}</div>
        </div>
        <IconButton label="Новая заметка" tone="soft" size={42} onClick={() => navigate(`/notes/new?date=${state.date}`)}>
          <Plus size={22} />
        </IconButton>
      </header>

      <div className={s.scroll}>
        <div className={s.search}>
          <SearchField value={state.query} onChange={(query) => update({ query })} placeholder="Поиск по всем заметкам" />
        </div>
        {!searching && (
          <div className={s.calendar}>
            <MonthCalendar
              month={state.month}
              selected={state.favorites ? null : state.date}
              marks={days.data}
              onSelect={(date) => update({ date, favorites: false })}
              onMonthChange={(month) => update({ month })}
            />
          </div>
        )}

        <div className={s.listHead}>
          <h2 className={s.listTitle}>{heading}</h2>
          <span className={s.count}>{notes.length}</span>
          {!searching && (
            <button
              type="button"
              className={[s.star, state.favorites && s.starOn].filter(Boolean).join(' ')}
              onClick={() => update({ favorites: !state.favorites })}
              aria-pressed={state.favorites}
              title={state.favorites ? 'Показать записи за день' : 'Показать избранное'}
            >
              <Star size={18} fill="currentColor" />
            </button>
          )}
        </div>

        {source.isLoading ? (
          <div className={s.center}>
            <Spinner />
          </div>
        ) : notes.length === 0 ? (
          <EmptyState
            compact
            icon={<FileText size={36} strokeWidth={1.6} />}
            title={searching ? 'Ничего не найдено' : 'Нет заметок'}
            text={searching ? 'Попробуйте другой запрос' : state.favorites ? 'Добавьте заметки в избранное, нажав на звёздочку' : 'Создайте первую заметку для этой даты'}
          />
        ) : (
          <div className={s.cards}>
            {notes.map((n) => (
              <div
                key={n.id}
                role="button"
                tabIndex={0}
                className={[s.card, n.id === activeId && s.active].filter(Boolean).join(' ')}
                onClick={() => navigate(`/notes/${n.id}`)}
                onKeyDown={(e) => e.key === 'Enter' && navigate(`/notes/${n.id}`)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ note: n, anchor: { x: e.clientX, y: e.clientY } });
                }}
              >
                <div className={s.cardHead}>
                  <span className={s.cardIcon}>
                    <BookOpen size={19} strokeWidth={2.2} />
                  </span>
                  <span className={s.cardTitles}>
                    <span className={s.cardTitle}>{n.title || 'Без названия'}</span>
                    <span className={s.cardDate}>{formatDate(n.note_date + 'T00:00:00')}</span>
                  </span>
                  {n.is_favorite && <Star size={16} className={s.fav} fill="currentColor" />}
                  <button
                    type="button"
                    className={s.more}
                    aria-label={`Действия: ${n.title || 'без названия'}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenu({ note: n, anchor: anchorFrom(e.currentTarget) });
                    }}
                  >
                    <MoreHorizontal size={18} />
                  </button>
                </div>
                {n.content && <div className={s.preview}>{n.content}</div>}
                {n.files_count > 0 && (
                  <div className={s.files}>
                    <Paperclip size={13} /> {n.files_count}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <ActionMenu open={!!menu} anchor={menu?.anchor ?? null} title={menu?.note.title || 'Без названия'} items={menu ? items(menu.note) : []} onClose={() => setMenu(null)} />
    </div>
  );
}
