import { lazy, Suspense } from 'react';
import { Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { EmptyState } from '../../ui/EmptyState';
import { PageLoader } from '../../ui/Spinner';
import { ErrorBoundary } from '../../ui/ErrorBoundary';
import { useChats } from './queries';
import ChatList from './ChatList';
import s from './ChatsRoutes.module.css';

const ChatView = lazy(() => import('./ChatView'));
const TopicList = lazy(() => import('./TopicList'));
const ChatInfo = lazy(() => import('./ChatInfo'));
const CreateChat = lazy(() => import('./CreateChat'));
const MediaList = lazy(() => import('./MediaList'));

/**
 * Раздел «Чаты». Компьютер: список слева, открытый чат справа (как Telegram Desktop).
 * Телефон: список и чат — отдельные экраны.
 */
export default function ChatsRoutes() {
  return (
    <Routes>
      <Route element={<ChatsLayout />}>
        <Route index element={<NothingSelected />} />
        <Route path="new" element={<CreateChat />} />
        <Route path=":chatId" element={<ChatEntry />} />
        <Route path=":chatId/topic/:topicId" element={<ChatView />} />
        <Route path=":chatId/info" element={<ChatInfo />} />
        <Route path=":chatId/topic/:topicId/info" element={<ChatInfo />} />
        <Route path=":chatId/media" element={<MediaList />} />
        <Route path=":chatId/topic/:topicId/media" element={<MediaList />} />
      </Route>
    </Routes>
  );
}

function ChatsLayout() {
  const location = useLocation();
  const atList = /^\/chats\/?$/.test(location.pathname);
  return (
    <div className={[s.layout, atList ? s.atList : s.atDetail].join(' ')}>
      <aside className={s.list}>
        <ChatList />
      </aside>
      <section className={s.detail}>
        <ErrorBoundary key={location.pathname}>
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </section>
    </div>
  );
}

/** Супергруппа открывается списком тем, обычный чат — лентой сообщений. */
function ChatEntry() {
  const { chatId } = useParams();
  const { data: chats, isLoading } = useChats();
  if (isLoading && !chats) return <PageLoader />;
  const chat = chats?.find((c) => String(c.id) === chatId);
  if (chat?.is_supergroup) return <TopicList />;
  return <ChatView />;
}

function NothingSelected() {
  return (
    <div className={s.placeholder}>
      <EmptyState icon={<MessageCircle size={48} strokeWidth={1.5} />} title="Выберите чат" text="Откройте переписку слева или начните новую кнопкой «+»." />
    </div>
  );
}
