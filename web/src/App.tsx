import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginScreen from './screens/LoginScreen';
import Layout from './screens/Layout';
import KpiScreen from './screens/KpiScreen';
import TasksScreen from './screens/TasksScreen';
import CreateTaskScreen from './screens/CreateTaskScreen';
import TaskDetailScreen from './screens/TaskDetailScreen';
import NotesScreen from './screens/NotesScreen';
import NoteEditorScreen from './screens/NoteEditorScreen';
import { getToken } from './utils';

const Placeholder = ({ title }: { title: string }) => (
  <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px' }}>
    <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 40, color: '#141414' }}>{title}</h1>
    <p style={{ fontStyle: 'italic', color: '#6F6F73', marginTop: 4 }}>Скоро будет готово…</p>
  </div>
);

const PrivateRoute = ({ children }: { children: React.ReactElement }) => {
  const token = getToken();
  return token ? children : <Navigate to="/login" replace />;
};

function App() {
  return (
    <BrowserRouter>
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
          <Route path="knowledge" element={<Placeholder title="БАЗА ЗНАНИЙ" />} />
          <Route path="settings" element={<Placeholder title="НАСТРОЙКИ" />} />
          <Route path="profile" element={<Placeholder title="ПРОФИЛЬ" />} />
          <Route path="import" element={<Placeholder title="ИМПОРТ EXCEL" />} />
          <Route path="employee/:userId" element={<Placeholder title="СТАТИСТИКА СОТРУДНИКА" />} />
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
