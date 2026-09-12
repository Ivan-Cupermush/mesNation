import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp, Target, CheckCircle2, AlertTriangle } from 'lucide-react';
import { api } from '../services/api';

const EmployeeStatsScreen: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    api.getEmployeeStats(parseInt(userId)).then(setStats).catch(e => alert('Ошибка: ' + e.message)).finally(() => setLoading(false));
  }, [userId]);

  if (loading) return <Container><Content>Загрузка...</Content></Container>;
  if (!stats) return <Container><Content>Не удалось загрузить данные</Content></Container>;

  const { user, summary, tasks, taskStats } = stats;

  return (
    <Container>
      <Header>
        <BackBtn onClick={() => navigate(-1)}><ArrowLeft size={20} /> Назад</BackBtn>
        <Title>Статистика: {user?.display_name || user?.username}</Title>
        <RoleBadge>{user?.role_name}</RoleBadge>
      </Header>
      <Content>
        <StatsGrid>
          <StatCard><StatIcon $color="#1F7A52"><TrendingUp size={24} /></StatIcon><StatValue>{(summary?.total_amount || 0).toLocaleString('ru-RU')} ₽</StatValue><StatLabel>Сумма продаж</StatLabel></StatCard>
          <StatCard><StatIcon $color="#3B82F6"><CheckCircle2 size={24} /></StatIcon><StatValue>{summary?.total_transactions || 0}</StatValue><StatLabel>Сделок</StatLabel></StatCard>
          <StatCard><StatIcon $color="#D97706"><Target size={24} /></StatIcon><StatValue>{taskStats?.completed || 0}/{taskStats?.total || 0}</StatValue><StatLabel>Задач выполнено</StatLabel></StatCard>
          <StatCard><StatIcon $color="#DC2626"><AlertTriangle size={24} /></StatIcon><StatValue>{taskStats?.overdue || 0}</StatValue><StatLabel>Просрочено</StatLabel></StatCard>
        </StatsGrid>
        {tasks && tasks.length > 0 && (
          <Section>
            <SectionTitle>Активные задачи</SectionTitle>
            {tasks.map((t: any) => (
              <TaskItem key={t.id}><TaskTitle>{t.title}</TaskTitle><TaskStatus $status={t.status}>{t.status}</TaskStatus></TaskItem>
            ))}
          </Section>
        )}
      </Content>
    </Container>
  );
};

export default EmployeeStatsScreen;

const Container = styled.div`max-width: 960px; margin: 0 auto;`;
const Header = styled.div`padding: 32px 24px 24px; border-bottom: 1px solid #E5E5E5; display: flex; flex-direction: column; gap: 12px;`;
const BackBtn = styled.button`display: inline-flex; align-items: center; gap: 6px; background: none; border: none; color: #1F7A52; font-size: 14px; font-weight: 600; cursor: pointer; align-self: flex-start;`;
const Title = styled.h1`font-family: 'Bebas Neue', sans-serif; font-size: 40px; color: #141414; margin: 0;`;
const RoleBadge = styled.span`align-self: flex-start; padding: 4px 12px; background: #E8F3EE; color: #1F7A52; border-radius: 12px; font-size: 12px; font-weight: 600;`;
const Content = styled.div`padding: 24px;`;
const StatsGrid = styled.div`display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; margin-bottom: 32px;`;
const StatCard = styled.div`background: #fff; border: 1px solid #E5E5E5; border-radius: 16px; padding: 24px; display: flex; flex-direction: column; gap: 8px;`;
const StatIcon = styled.div<{ $color: string }>`width: 44px; height: 44px; border-radius: 12px; background: ${p => p.$color}20; color: ${p => p.$color}; display: flex; align-items: center; justify-content: center;`;
const StatValue = styled.div`font-size: 28px; font-weight: 700; color: #141414;`;
const StatLabel = styled.div`font-size: 13px; color: #6F6F73;`;
const Section = styled.div`background: #fff; border: 1px solid #E5E5E5; border-radius: 16px; padding: 24px;`;
const SectionTitle = styled.h2`font-size: 20px; color: #141414; margin: 0 0 16px;`;
const TaskItem = styled.div`padding: 12px 0; border-bottom: 1px solid #F0F0F0; display: flex; justify-content: space-between; align-items: center; &:last-child { border-bottom: none; }`;
const TaskTitle = styled.div`font-size: 14px; color: #141414;`;
const TaskStatus = styled.span<{ $status: string }>`padding: 4px 10px; background: ${p => (p.$status === 'done' ? '#DCFCE7' : p.$status === 'overdue' ? '#FEE2E2' : '#FEF3C7')}; color: ${p => (p.$status === 'done' ? '#166534' : p.$status === 'overdue' ? '#991B1B' : '#92400E')}; border-radius: 8px; font-size: 11px; font-weight: 600; text-transform: uppercase;`;
