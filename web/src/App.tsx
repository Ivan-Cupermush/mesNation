import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from './lib/http';
import { ThemeProvider } from './theme/ThemeProvider';
import { FeedbackProvider } from './ui/feedback';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { PageLoader } from './ui/Spinner';
import { AuthProvider, useAuth } from './features/auth/AuthProvider';
import AuthPage from './features/auth/AuthPage';
import OfflinePage from './features/auth/OfflinePage';
import AppShell from './app/AppShell';
import { Legacy } from './app/Legacy';

// Новые разделы
const ChatsRoutes = lazy(() => import('./features/chats/ChatsRoutes'));
const UserProfile = lazy(() => import('./features/users/UserProfile'));
const TasksRoutes = lazy(() => import('./features/tasks/TasksRoutes'));
const NotesRoutes = lazy(() => import('./features/notes/NotesRoutes'));
const ProfilePage = lazy(() => import('./features/account/ProfilePage'));
const SettingsPage = lazy(() => import('./features/account/SettingsPage'));
const AppearancePage = lazy(() => import('./features/account/AppearancePage'));
const NotificationsPage = lazy(() => import('./features/account/NotificationsPage'));
const EmployeesPage = lazy(() => import('./features/users/EmployeesPage'));
const CreateUserPage = lazy(() => import('./features/users/CreateUserPage'));
const RolesPage = lazy(() => import('./features/roles/RolesPage'));

// Разделы старой версии — до переноса на новую основу
const KpiScreen = lazy(() => import('./screens/KpiScreen'));
const KnowledgeScreen = lazy(() => import('./screens/KnowledgeScreen'));
const ImportExcelScreen = lazy(() => import('./screens/ImportExcelScreen'));
const EmployeeStatsScreen = lazy(() => import('./screens/EmployeeStatsScreen'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Ошибки доступа и «не найдено» повторять бессмысленно; сеть — пару раз.
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
      refetchOnWindowFocus: true,
    },
  },
});

function AppRoutes() {
  const { status } = useAuth();
  if (status === 'loading') return <PageLoader />;
  if (status === 'offline') return <OfflinePage />;
  if (status === 'anonymous') {
    return (
      <Routes>
        <Route path="*" element={<AuthPage />} />
      </Routes>
    );
  }
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/tasks" replace />} />
          <Route path="chats/*" element={<ChatsRoutes />} />
          <Route path="users/:id" element={<UserProfile />} />

          <Route path="tasks/*" element={<TasksRoutes />} />
          <Route path="notes/*" element={<NotesRoutes />} />
          <Route path="stats" element={<Legacy><KpiScreen /></Legacy>} />
          <Route path="employee/:userId" element={<Legacy><EmployeeStatsScreen /></Legacy>} />
          <Route path="import" element={<Legacy><ImportExcelScreen /></Legacy>} />
          <Route path="knowledge" element={<Legacy><KnowledgeScreen /></Legacy>} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="settings/appearance" element={<AppearancePage />} />
          <Route path="settings/notifications" element={<NotificationsPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="employees" element={<EmployeesPage />} />
          <Route path="roles" element={<RolesPage />} />
          <Route path="create-user" element={<CreateUserPage />} />

          <Route path="*" element={<Navigate to="/tasks" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <FeedbackProvider>
            <BrowserRouter>
              <AuthProvider>
                <AppRoutes />
              </AuthProvider>
            </BrowserRouter>
          </FeedbackProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
