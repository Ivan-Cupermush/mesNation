import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { FileText, SquarePen } from 'lucide-react';
import { useMedia } from '../../lib/useMedia';
import { IconButton } from '../../ui/Button';
import { PageLoader } from '../../ui/Spinner';
import { ErrorBoundary } from '../../ui/ErrorBoundary';
import { KbChat } from './KbChat';
import { SessionList } from './SessionList';
import { useKbSessions } from './queries';
import s from './knowledge.module.css';

const DocumentsPage = lazy(() => import('./DocumentsPage'));

/**
 * «База знаний». Широкий экран: диалоги слева, переписка справа.
 * Телефон: сразу последний диалог (как в приложении), история — по кнопке.
 */
export default function KnowledgeRoutes() {
  return (
    <Routes>
      <Route
        path="documents"
        element={
          <Suspense fallback={<PageLoader />}>
            <DocumentsPage />
          </Suspense>
        }
      />
      <Route index element={<LatestSession />} />
      <Route path="new" element={<KbLayout sessionId={0} />} />
      <Route path=":id" element={<SessionRoute />} />
    </Routes>
  );
}

/** Открываем последний диалог, а если их нет — новый. */
function LatestSession() {
  const { data, isLoading, error } = useKbSessions();
  if (isLoading) return <PageLoader />;
  if (!error && data?.length) return <Navigate to={`/knowledge/${data[0].id}`} replace />;
  return <KbLayout sessionId={0} />;
}

function SessionRoute() {
  const { id } = useParams();
  const sessionId = Number(id);
  if (!Number.isInteger(sessionId) || sessionId <= 0) return <Navigate to="/knowledge" replace />;
  return <KbLayout sessionId={sessionId} />;
}

function KbLayout({ sessionId }: { sessionId: number }) {
  const wide = useMedia('(min-width: 900px)');
  const navigate = useNavigate();
  return (
    <div className={s.layout}>
      {wide && (
        <aside className={s.sidebar}>
          <div className={s.sideHead}>
            <div>
              <h1 className="display-title">База знаний</h1>
              <span>AI-ассистент компании</span>
            </div>
            <IconButton label="Документы базы знаний" onClick={() => navigate('/knowledge/documents')}>
              <FileText size={20} />
            </IconButton>
            <IconButton label="Новый диалог" tone="soft" size={42} onClick={() => navigate('/knowledge/new')}>
              <SquarePen size={20} />
            </IconButton>
          </div>
          <SessionList activeId={sessionId} />
        </aside>
      )}
      <section className={s.main}>
        <ErrorBoundary key={sessionId}>
          <KbChat key={sessionId} sessionId={sessionId} wide={wide} />
        </ErrorBoundary>
      </section>
    </div>
  );
}
