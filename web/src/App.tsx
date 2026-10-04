import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { getToken } from './utils';

// Статические импорты — нужны сразу
import LoginScreen from './screens/LoginScreen';
import Layout from './screens/Layout';

// Ленивые импорты — подгружаются только когда пользователь заходит на страницу
const KpiScreen = lazy(() => import('./screens/KpiScreen'));
const TasksScreen = lazy(() => import('./screens/TasksScreen'));
const CreateTaskScreen = lazy(() => import('./screens/CreateTaskScreen'));
const TaskDetailScreen = lazy(() => import('./screens/TaskDetailScreen'));
const NotesScreen = lazy(() => import('./screens/NotesScreen'));
const NoteEditorScreen = lazy(() => import('./screens/NoteEditorScreen'));
const KnowledgeScreen = lazy(() => import('./screens/KnowledgeScreen'));
const ProfileScreen = lazy(() => import('./screens/ProfileScreen'));
const SettingsScreen = lazy(() => import('./screens/SettingsScreen'));
const ImportExcelScreen = lazy(() => import('./screens/ImportExcelScreen'));
const EmployeeStatsScreen = lazy(() => import('./screens/EmployeeStatsScreen'));
const RoleTreeScreen = lazy(() => import('./screens/RoleTreeScreen'));
const CreateUserScreen = lazy(() => import('./screens/CreateUserScreen'));

// Заглушка во время загрузки
const LoadingFallback = () => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    background: '#FAFAF8',
    fontSize: 16,
    color: '#6F6F73',
    fontFamily: 'system-ui, sans-serif'
  }}>
    Загрузка...
  </div>
);

const PrivateRoute = ({ children }: { children: React.ReactElement }) => {
  const token = getToken();
  return token ? children : <Navigate to="/login" replace />;
};

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/login" element={<LoginScreen />} />
          <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index element={<KpiScreen />} />
            <Route path="tasks" element={<TasksScreen />} />
            <Route path="tasks/new" element={<CreateTaskScreen />} />
            <Route path="tasks/:id" element={<TaskDetailScreen />} />
            <Route path="notes" element={<NotesScreen />} />
            <Route path="notes/new" element={<NoteEditorScreen />} />
            <Route path="notes/:id" element={<NoteEditorScreen />} />
            <Route path="knowledge" element={<KnowledgeScreen />} />
            <Route path="settings" element={<SettingsScreen />} />
            <Route path="profile" element={<ProfileScreen />} />
            <Route path="import" element={<ImportExcelScreen />} />
            <Route path="roles" element={<RoleTreeScreen />} />
            <Route path="create-user" element={<CreateUserScreen />} />
            <Route path="employee/:userId" element={<EmployeeStatsScreen />} />
          </Route>
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
