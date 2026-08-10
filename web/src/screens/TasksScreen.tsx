import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import {
  Plus, Calendar, Users, CheckCircle2, Clock, AlertCircle,
  Eye, RotateCcw, Circle, ListTodo,
} from 'lucide-react';
import { api } from '../services/api';
import { getCurrentUser } from '../utils';
import { theme } from '../styles/theme';

type StatusFilter = 'all' | 'new' | 'in_progress' | 'on_review' | 'done' | 'overdue' | 'archived';

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'new', label: 'Новые' },
  { id: 'in_progress', label: 'В работе' },
  { id: 'on_review', label: 'На проверке' },
  { id: 'done', label: 'Выполнено' },
  { id: 'overdue', label: 'Просрочено' },
];

const IMPORTANCE_COLORS: Record<string, string> = {
  green: '#1F7A52',
  yellow: '#F59E0B',
  red: '#DC2626',
};

const STATUS_META: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  new: { label: 'Новая', color: '#3B82F6', bg: '#DBEAFE', icon: Circle },
  in_progress: { label: 'В работе', color: '#3B82F6', bg: '#DBEAFE', icon: Clock },
  on_review: { label: 'На проверке', color: '#F59E0B', bg: '#FEF3C7', icon: Eye },
  done: { label: 'Выполнено', color: '#1F7A52', bg: '#D1FAE5', icon: CheckCircle2 },
  overdue: { label: 'Просрочено', color: '#DC2626', bg: '#FEE2E2', icon: AlertCircle },
  rejected: { label: 'Отклонено', color: '#DC2626', bg: '#FEE2E2', icon: RotateCcw },
  archived: { label: 'Архив', color: '#6F6F73', bg: '#F3F4F6', icon: Circle },
};

const fmtDeadline = (d: string | null): string => {
  if (!d) return '';
  const date = new Date(d);
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
};

const TasksScreen: React.FC = () => {
  const navigate = useNavigate();
  const currentUser = getCurrentUser();

  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>('all');

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getTasks();
      const list = Array.isArray(data) ? data : ((data as any)?.tasks || (data as any)?.data || []);
      setTasks(list);
    } catch (e) {
      console.error('Tasks load error:', e);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  const filteredTasks = useMemo(() => {
    if (filter === 'all') return tasks.filter(t => String(t.status_new || t.status) !== 'archived');
    return tasks.filter(t => String(t.status_new || t.status) === filter);
  }, [tasks, filter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0 };
    tasks.forEach(t => {
      const st = String(t.status_new || t.status);
      if (st !== 'archived') c.all = (c.all || 0) + 1;
      c[st] = (c[st] || 0) + 1;
    });
    return c;
  }, [tasks]);

  return (
    <Container>
      <Header>
        <BigTitle>ЗАДАЧИ</BigTitle>
        <Subtitle>{currentUser?.display_name || currentUser?.username || 'Управление и контроль'}</Subtitle>
      </Header>

      {/* Фильтры */}
      <FilterRow>
        {STATUS_FILTERS.map(f => (
          <FilterChip
            key={f.id}
            $active={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
            {counts[f.id] ? <Count>{counts[f.id]}</Count> : null}
          </FilterChip>
        ))}
      </FilterRow>

      {/* Список */}
      {loading ? (
        <EmptyState>
          <Loader />
        </EmptyState>
      ) : filteredTasks.length === 0 ? (
        <EmptyState>
          <EmptyIconWrap>
            <ListTodo size={32} color="#9CA3AF" strokeWidth={1.8} />
          </EmptyIconWrap>
          <EmptyTitle>Нет задач</EmptyTitle>
          <EmptySubtitle>
            {filter === 'all'
              ? 'Создайте первую задачу, нажав на кнопку +'
              : 'В этой категории пока пусто'}
          </EmptySubtitle>
        </EmptyState>
      ) : (
        <TaskList>
          {filteredTasks.map(task => {
            const st = String(task.status_new || task.status);
            const meta = STATUS_META[st] || STATUS_META.new;
            const Icon = meta.icon;
            const impColor = IMPORTANCE_COLORS[task.importance] || '#6F6F73';
            return (
              <TaskCard key={String(task.id)} onClick={() => navigate(`/tasks/${task.id}`)}>
                <ImportanceBar $color={impColor} />
                <TaskBody>
                  <TaskTop>
                    <TaskTitle>{task.title || 'Без названия'}</TaskTitle>
                    <StatusBadge $color={meta.color} $bg={meta.bg}>
                      <Icon size={13} strokeWidth={2.4} />
                      {meta.label}
                    </StatusBadge>
                  </TaskTop>

                  {task.description && (
                    <TaskDesc>{task.description}</TaskDesc>
                  )}

                  <TaskMeta>
                    {task.hard_deadline && (
                      <MetaItem>
                        <Calendar size={14} color="#6F6F73" strokeWidth={2.2} />
                        <span>{fmtDeadline(task.hard_deadline)}</span>
                      </MetaItem>
                    )}
                    {(task.assignees_count > 0 || task.assignees?.length > 0) && (
                      <MetaItem>
                        <Users size={14} color="#6F6F73" strokeWidth={2.2} />
                        <span>{task.assignees_count || task.assignees.length}</span>
                      </MetaItem>
                    )}
                    {task.creator_name && (
                      <MetaItem>
                        <span style={{ color: '#BDBDBD' }}>от</span>
                        <span>{task.creator_name}</span>
                      </MetaItem>
                    )}
                  </TaskMeta>
                </TaskBody>
              </TaskCard>
            );
          })}
        </TaskList>
      )}

      <div style={{ height: 100 }} />

      <Fab onClick={() => navigate('/tasks/new')} title="Создать задачу">
        <Plus size={26} color="#fff" strokeWidth={2.5} />
      </Fab>
    </Container>
  );
};

export default TasksScreen;

// ===== STYLED =====
const Container = styled.div`
  max-width: 960px;
  margin: 0 auto;
  padding: 32px 24px;
`;

const Header = styled.div`
  margin-bottom: 24px;
`;

const BigTitle = styled.h1`
  font-family: ${theme.fonts.display};
  font-size: 40px;
  font-weight: 900;
  letter-spacing: -0.5px;
  line-height: 1.1;
  color: ${theme.colors.textPrimary};
`;

const Subtitle = styled.p`
  font-family: ${theme.fonts.serif};
  font-style: italic;
  font-size: 18px;
  color: ${theme.colors.textSecondary};
  margin-top: 4px;
`;

const FilterRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 20px;
`;

const FilterChip = styled.button<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 16px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  background: ${p => (p.$active ? theme.colors.primary : theme.colors.surface)};
  color: ${p => (p.$active ? '#fff' : theme.colors.textSecondary)};
  box-shadow: ${p => (p.$active ? theme.shadows.button : theme.shadows.card)};
  transition: all 0.2s;

  &:hover {
    color: ${p => (p.$active ? '#fff' : theme.colors.textPrimary)};
  }
`;

const Count = styled.span`
  font-size: 11px;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.2);
  padding: 1px 7px;
  border-radius: 8px;

  ${FilterChip}:not([class*='active']) & {
    background: #F3F4F6;
  }
`;

const TaskList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const TaskCard = styled.div`
  display: flex;
  background: ${theme.colors.surface};
  border-radius: ${theme.radius.lg};
  overflow: hidden;
  box-shadow: ${theme.shadows.card};
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;

  &:hover {
    transform: translateY(-2px);
    box-shadow: ${theme.shadows.elevated};
  }
`;

const ImportanceBar = styled.div<{ $color: string }>`
  width: 5px;
  background: ${p => p.$color};
`;

const TaskBody = styled.div`
  flex: 1;
  padding: 18px 20px;
`;

const TaskTop = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 6px;
`;

const TaskTitle = styled.div`
  font-size: 16px;
  font-weight: 700;
  color: ${theme.colors.textPrimary};
  flex: 1;
`;

const StatusBadge = styled.div<{ $color: string; $bg: string }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 700;
  color: ${p => p.$color};
  background: ${p => p.$bg};
  padding: 5px 10px;
  border-radius: 10px;
  white-space: nowrap;
`;

const TaskDesc = styled.div`
  font-size: 13px;
  color: ${theme.colors.textSecondary};
  line-height: 1.5;
  margin-bottom: 10px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const TaskMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
`;

const MetaItem = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 600;
  color: ${theme.colors.textSecondary};
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 24px;
`;

const EmptyIconWrap = styled.div`
  width: 72px;
  height: 72px;
  border-radius: 20px;
  background: #F3F4F6;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
`;

const EmptyTitle = styled.div`
  font-size: 18px;
  font-weight: 700;
  color: ${theme.colors.textPrimary};
  margin-top: 16px;
`;

const EmptySubtitle = styled.div`
  font-size: 14px;
  color: ${theme.colors.textSecondary};
  margin-top: 8px;
  text-align: center;
`;

const Loader = styled.div`
  width: 40px;
  height: 40px;
  border: 3px solid #F3F4F6;
  border-top-color: ${theme.colors.primary};
  border-radius: 50%;
  animation: spin 0.8s linear infinite;

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

const Fab = styled.button`
  position: fixed;
  right: 32px;
  bottom: 32px;
  width: 56px;
  height: 56px;
  border-radius: 28px;
  background: ${theme.colors.primary};
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: ${theme.shadows.button};
  transition: transform 0.15s;
  z-index: 50;
  &:hover { transform: scale(1.05); }
`;
