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
import KnowledgeScreen from './screens/KnowledgeScreen';
import ProfileScreen from './screens/ProfileScreen';
import SettingsScreen from './screens/SettingsScreen';
import ImportExcelScreen from './screens/ImportExcelScreen';
import EmployeeStatsScreen from './screens/EmployeeStatsScreen';
import RoleTreeScreen from './screens/RoleTreeScreen';
import CreateUserScreen from './screens/CreateUserScreen';
import { getToken } from './utils';



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
    </BrowserRouter>
  );
}

export default App;



