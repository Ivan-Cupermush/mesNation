import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BookOpen, ChartColumn, ListTodo, MessageCircle, NotebookPen, Settings, WifiOff } from 'lucide-react';
import { useAuth } from '../features/auth/AuthProvider';
import { useUnreadChatsCount } from '../features/chats/queries';
import { useChatNotifications } from '../features/chats/notifications';
import { useTaskNotifications } from '../features/tasks/notifications';
import { getSocket, onConnectionChange, isConnected } from '../lib/socket';
import { Avatar } from '../ui/Avatar';
import { BrandMark } from '../ui/BrandMark';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { displayName } from '../lib/format';
import s from './AppShell.module.css';

const NAV = [
  { to: '/tasks', label: 'Задачи', icon: ListTodo },
  { to: '/notes', label: 'Заметки', icon: NotebookPen },
  { to: '/stats', label: 'Статистика', icon: ChartColumn },
  { to: '/chats', label: 'Чаты', icon: MessageCircle },
  { to: '/knowledge', label: 'База', icon: BookOpen },
  // Настройки компании — только у директора (корень дерева ролей), как в приложении.
  { to: '/settings', label: 'Настройки', icon: Settings, directorOnly: true },
] as const;

/** Корневые экраны разделов: на телефоне только на них видны нижние вкладки (как в приложении). */
const ROOT_PATHS = new Set(['/tasks', '/notes', '/stats', '/chats', '/knowledge', '/settings']);

/**
 * Каркас сайта после входа.
 * - Компьютер: слева меню разделов (на средних экранах — только иконки),
 *   внизу меню — профиль.
 * - Телефон: нижние вкладки, внутри разделов они прячутся.
 * - Сверху — полоса «нет связи», если соединение с сервером пропало.
 */
export default function AppShell() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const unread = useUnreadChatsCount();
  useChatNotifications(user?.id ?? 0);
  // Задачи обновляются в реальном времени на всех экранах (и для уведомлений).
  useTaskNotifications();
  const offline = useOfflineBanner();
  const items = NAV.filter((n) => !('directorOnly' in n) || !!user?.is_director);
  const isRoot = ROOT_PATHS.has(location.pathname.replace(/\/$/, ''));

  useEffect(() => {
    // Соединение реального времени нужно на всех экранах: счётчики чатов, задачи, присутствие.
    getSocket();
  }, []);

  useEffect(() => {
    document.title = unread > 0 ? `(${unread}) Offix` : 'Offix';
  }, [unread]);

  return (
    <div className={[s.shell, !isRoot && s.nested].filter(Boolean).join(' ')}>
      <aside className={s.sidebar} aria-label="Разделы">
        <div className={s.brand}>
          <BrandMark size={40} compact />
          <div className={s.brandText}>
            <div className={s.brandName}>Offix</div>
            <div className={s.company}>{user?.company_name || 'Компания'}</div>
          </div>
        </div>
        <nav className={s.nav}>
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => [s.navItem, isActive && s.active].filter(Boolean).join(' ')} title={label}>
              <span className={s.navIcon}>
                <Icon size={22} strokeWidth={2} />
                {to === '/chats' && unread > 0 && <span className={s.badge}>{unread > 99 ? '99+' : unread}</span>}
              </span>
              <span className={s.navLabel}>{label}</span>
            </NavLink>
          ))}
        </nav>
        <button type="button" className={s.me} onClick={() => navigate('/profile')} title="Профиль">
          <Avatar name={displayName(user)} src={user?.avatar_url} size={38} />
          <span className={s.meText}>
            <span className={s.meName}>{displayName(user)}</span>
            <span className={s.meRole}>{user?.role_name || 'Сотрудник'}</span>
          </span>
        </button>
      </aside>

      <div className={s.main}>
        {offline && (
          <div className={s.offline} role="status">
            <WifiOff size={15} /> Нет связи с сервером — переподключаемся…
          </div>
        )}
        <main className={s.content}>
          <ErrorBoundary key={location.pathname.split('/')[1]}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      <nav className={s.tabbar} aria-label="Разделы">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => [s.tab, isActive && s.tabActive].filter(Boolean).join(' ')}>
            <span className={s.navIcon}>
              <Icon size={23} strokeWidth={2} />
              {to === '/chats' && unread > 0 && <span className={s.badge}>{unread > 99 ? '99+' : unread}</span>}
            </span>
            <span className={s.tabLabel}>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

/** Полоса «нет связи» — только если соединение пропало дольше чем на 4 секунды (короткие обрывы не мигают). */
function useOfflineBanner(): boolean {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const update = (connected: boolean) => {
      if (timer) clearTimeout(timer);
      if (connected && navigator.onLine) setOffline(false);
      else timer = setTimeout(() => setOffline(!isConnected() || !navigator.onLine), 4000);
    };
    const unsub = onConnectionChange(update);
    const onNet = () => update(isConnected());
    window.addEventListener('online', onNet);
    window.addEventListener('offline', onNet);
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
      window.removeEventListener('online', onNet);
      window.removeEventListener('offline', onNet);
    };
  }, []);
  return offline;
}
