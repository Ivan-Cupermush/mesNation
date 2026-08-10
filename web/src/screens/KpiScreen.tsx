import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import {
  Trophy, Medal, Wallet, TrendingUp, CreditCard,
  CheckCircle2, Clock, AlertCircle, Plus, Users, Search, ShoppingCart,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { api, getSalesTransactions } from '../services/api';
import { getCurrentUser } from '../utils';
import { theme } from '../styles/theme';

type Period = 'week' | 'month' | 'quarter';
const PERIODS: { id: Period; label: string }[] = [
  { id: 'week', label: 'Неделя' },
  { id: 'month', label: 'Месяц' },
  { id: 'quarter', label: 'Квартал' },
];

const fmt = (v: number | string): string => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (isNaN(n)) return '0 ₽';
  return new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽';
};

const fmtShort = (v: number): string => {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000) return Math.round(v / 1_000) + 'k';
  return String(v);
};

const fmtDate = (d: string | Date): string =>
  new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });

const KpiScreen: React.FC = () => {
  const navigate = useNavigate();
  const currentUser = getCurrentUser();

  const [period, setPeriod] = useState<Period>('month');
  const [summary, setSummary] = useState<any>(null);
  const [subordinates, setSubordinates] = useState<any[]>([]);
  const [myKpi, setMyKpi] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[] | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [myKpiData, summaryData, subData, txData, tasksData] = await Promise.all([
        api.getMyKpi().catch(() => null),
        api.getSalesSummary(period).catch(() => null),
        api.getSubordinates().catch(() => []),
        getSalesTransactions({ period }).catch(() => []),
        api.getTasks().catch(() => null),
      ]);
      setMyKpi(myKpiData);
      setSummary(summaryData);
      setSubordinates(Array.isArray(subData) ? subData : []);
      setTransactions(Array.isArray(txData) ? txData : []);
      setTasks(Array.isArray(tasksData) ? tasksData : null);
    } catch (e) {
      console.error('KPI load error:', e);
    }
  }, [period]);

  useEffect(() => { loadData(); }, [loadData]);

  const fact = summary?.fact;
  const targets = summary?.targets || [];
  const avgCheck = fact && Number(fact.total_transactions) > 0
    ? Number(fact.total_amount) / Number(fact.total_transactions) : 0;

  const chartData = (summary?.topProducts || []).slice(0, 5).map((p: any) => ({
    label: (p.product_name || '').length > 9 ? String(p.product_name).slice(0, 9) + '…' : p.product_name,
    value: Number(p.total_amount) || 0,
  }));

  const kpis = fact ? [
    { label: 'Выручка', value: fmt(fact.total_amount), icon: Wallet, color: '#1F7A52', bg: '#D1FAE5' },
    { label: 'Сделки', value: String(fact.total_transactions), icon: TrendingUp, color: '#3B82F6', bg: '#DBEAFE' },
    { label: 'Ср. чек', value: avgCheck ? fmt(avgCheck) : '—', icon: CreditCard, color: '#F59E0B', bg: '#FEF3C7' },
  ] : [];

  const taskStats = useMemo(() => {
    if (!tasks) return null;
    const now = new Date();
    let done = 0, inWork = 0, overdue = 0;
    tasks.forEach((t: any) => {
      const st = String(t.status_new || t.status || '').toLowerCase();
      const isDone = ['done', 'completed', 'complete', 'closed'].includes(st);
      const due = t.hard_deadline ? new Date(t.hard_deadline) : null;
      if (isDone) done++;
      else if (due && due < now) overdue++;
      else inWork++;
    });
    return { done, inWork, overdue };
  }, [tasks]);

  const filteredSubs = subordinates.filter((s: any) =>
    (s.display_name || s.username || '').toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  return (
    <Container>
      <Header>
        <BigTitle>СТАТИСТИКА</BigTitle>
        <Subtitle>{currentUser?.display_name || currentUser?.username || 'Продажи и динамика'}</Subtitle>
      </Header>

      <PeriodSwitch>
        {PERIODS.map(p => (
          <PeriodBtn key={p.id} $active={period === p.id} onClick={() => setPeriod(p.id)}>
            {p.label}
          </PeriodBtn>
        ))}
      </PeriodSwitch>

      {myKpi && (
        <Card>
          <CardHeader>
            <CardIcon $bg="#D1FAE5"><Trophy size={22} color="#1F7A52" strokeWidth={2.2} /></CardIcon>
            <div style={{ flex: 1 }}>
              <CardTitle>Общий план на месяц</CardTitle>
              <CardSubtitle>{myKpi.product_name || 'Личный KPI'}</CardSubtitle>
            </div>
          </CardHeader>
          <ProgressBg>
            <ProgressFill style={{ width: `${Math.min(100, Number(myKpi.progress_percent) || myKpi.progress || 0)}%` }} />
          </ProgressBg>
          <ProgressText>{myKpi.current_value || 0} / {myKpi.target_value || 0}</ProgressText>
        </Card>
      )}

      {targets.length > 0 && (
        <>
          <SectionTitle>Мои цели ({targets.length})</SectionTitle>
          {targets.map((t: any) => (
            <Card key={String(t.id)}>
              <CardHeader>
                <CardIcon $bg="#E0E7FF"><Medal size={22} color="#3B82F6" strokeWidth={2.2} /></CardIcon>
                <div style={{ flex: 1 }}>
                  <CardTitle>{t.product_name}</CardTitle>
                  <CardSubtitle>{t.metric_type === 'amount' ? 'Сумма (₽)' : t.metric_type === 'contracts' ? 'Контракты' : 'Количество (шт)'}</CardSubtitle>
                </div>
                <PercentBadge>{Number(t.progress_percent) || 0}%</PercentBadge>
              </CardHeader>
              <ProgressBg>
                <ProgressFill style={{ width: `${Math.min(100, Number(t.progress_percent) || 0)}%`, background: '#3B82F6' }} />
              </ProgressBg>
              <ProgressText>{t.current_value} / {t.target_value}</ProgressText>
            </Card>
          ))}
        </>
      )}

      {kpis.length > 0 && (
        <StatsGrid>
          {kpis.map((k: any, idx: number) => {
            const Icon = k.icon;
            return (
              <StatCard key={idx}>
                <StatIcon $bg={k.bg}><Icon size={22} color={k.color} strokeWidth={2.2} /></StatIcon>
                <StatValue>{k.value}</StatValue>
                <StatLabel>{k.label}</StatLabel>
              </StatCard>
            );
          })}
        </StatsGrid>
      )}

      {chartData.length > 0 && (
        <Card>
          <CardTitle>Топ товаров</CardTitle>
          <div style={{ width: '100%', height: 240, marginTop: 12 }}>
            <ResponsiveContainer>
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1F7A52" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#1F7A52" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6F6F73' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#6F6F73' }} axisLine={false} tickLine={false} tickFormatter={fmtShort} />
                <Tooltip formatter={(v: any) => fmt(Number(v))} contentStyle={{ borderRadius: 12, border: '1px solid #F3F4F6' }} />
                <Area type="monotone" dataKey="value" stroke="#1F7A52" strokeWidth={2.5} fill="url(#colorValue)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {taskStats && (
        <Card>
          <CardTitle>Статистика задач</CardTitle>
          <TasksRow>
            <TaskCell>
              <CheckCircle2 size={20} color="#10B981" />
              <TaskValue>{taskStats.done}</TaskValue>
              <TaskLabel>Выполнено</TaskLabel>
            </TaskCell>
            <TaskCell>
              <Clock size={20} color="#3B82F6" />
              <TaskValue>{taskStats.inWork}</TaskValue>
              <TaskLabel>В работе</TaskLabel>
            </TaskCell>
            <TaskCell>
              <AlertCircle size={20} color="#EF4444" />
              <TaskValue>{taskStats.overdue}</TaskValue>
              <TaskLabel>Просрочено</TaskLabel>
            </TaskCell>
          </TasksRow>
        </Card>
      )}

      {transactions.length > 0 && (
        <>
          <SectionTitle>История продаж ({transactions.length})</SectionTitle>
          <Card style={{ padding: 8 }}>
            {transactions.map((tx: any, idx: number) => (
              <TxRow key={String(tx.id || idx)} $border={idx < transactions.length - 1}>
                <TxIconWrap><ShoppingCart size={16} color="#1F7A52" /></TxIconWrap>
                <div style={{ flex: 1 }}>
                  <TxProduct>{tx.product_name || 'Товар'}</TxProduct>
                  <TxMeta>{fmtDate(tx.transaction_date)}{tx.client_name ? ` • ${tx.client_name}` : ''}</TxMeta>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <TxAmount>+{fmt(tx.amount || 0)}</TxAmount>
                  {Number(tx.quantity) > 1 && <TxQty>{tx.quantity} шт.</TxQty>}
                </div>
              </TxRow>
            ))}
          </Card>
        </>
      )}

      {subordinates.length > 0 && (
        <Card>
          <CardHeader>
            <Users size={20} color="#1F7A52" />
            <CardTitle style={{ marginLeft: 10 }}>Команда ({filteredSubs.length})</CardTitle>
          </CardHeader>
          <SearchBar>
            <Search size={18} color="#6F6F73" strokeWidth={2} />
            <SearchInput
              placeholder="Поиск по имени..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searchQuery && <ResetBtn onClick={() => setSearchQuery('')}>Сброс</ResetBtn>}
          </SearchBar>
          {filteredSubs.length === 0 && <EmptyText>Никого не нашли</EmptyText>}
          {filteredSubs.map((sub: any, idx: number) => (
            <SubRow
              key={String(sub.user_id || idx)}
              onClick={() => navigate(`/employee/${sub.user_id}`, { state: { userName: sub.display_name || sub.username } })}
            >
              <SubAvatar>{(sub.display_name || sub.username || '?').charAt(0)}</SubAvatar>
              <div style={{ flex: 1 }}>
                <SubName>{sub.display_name || sub.username}</SubName>
                <SubRole>{sub.role_name || 'Сотрудник'}</SubRole>
              </div>
              <SubKpi>{fmt(sub.total_amount || 0)}</SubKpi>
            </SubRow>
          ))}
        </Card>
      )}

      <div style={{ height: 100 }} />

      <Fab onClick={() => navigate('/import')} title="Импорт Excel">
        <Plus size={26} color="#fff" strokeWidth={2.5} />
      </Fab>
    </Container>
  );
};

export default KpiScreen;

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

const PeriodSwitch = styled.div`
  display: flex;
  background: ${theme.colors.surface};
  border-radius: 18px;
  padding: 4px;
  margin-bottom: 20px;
  box-shadow: ${theme.shadows.card};
`;

const PeriodBtn = styled.button<{ $active: boolean }>`
  flex: 1;
  height: 40px;
  border-radius: 14px;
  font-size: 14px;
  font-weight: 600;
  color: ${p => (p.$active ? '#fff' : theme.colors.textSecondary)};
  background: ${p => (p.$active ? theme.colors.primary : 'transparent')};
  transition: background 0.2s, color 0.2s;
`;

const SectionTitle = styled.h2`
  font-size: 20px;
  font-weight: 800;
  color: ${theme.colors.textPrimary};
  margin: 4px 0 12px;
`;

const Card = styled.div`
  background: ${theme.colors.surface};
  border-radius: ${theme.radius.lg};
  padding: 20px;
  margin-bottom: 16px;
  box-shadow: ${theme.shadows.card};
`;

const CardHeader = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 14px;
`;

const CardIcon = styled.div<{ $bg: string }>`
  width: 46px;
  height: 46px;
  border-radius: 14px;
  background: ${p => p.$bg};
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 12px;
`;

const CardTitle = styled.div`
  font-size: 17px;
  font-weight: 700;
  color: ${theme.colors.textPrimary};
`;

const CardSubtitle = styled.div`
  font-size: 12px;
  color: ${theme.colors.textSecondary};
  font-weight: 500;
  margin-top: 2px;
`;

const PercentBadge = styled.div`
  font-size: 13px;
  font-weight: 800;
  color: ${theme.colors.primary};
  background: ${theme.colors.primaryLight};
  padding: 5px 10px;
  border-radius: 10px;
`;

const ProgressBg = styled.div`
  height: 8px;
  background: #F3F4F6;
  border-radius: 4px;
  overflow: hidden;
`;

const ProgressFill = styled.div`
  height: 100%;
  background: ${theme.colors.primary};
  border-radius: 4px;
  transition: width 0.4s ease;
`;

const ProgressText = styled.div`
  font-size: 12px;
  color: ${theme.colors.textSecondary};
  font-weight: 600;
  margin-top: 8px;
  text-align: right;
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 16px;
`;

const StatCard = styled.div`
  background: ${theme.colors.surface};
  border-radius: ${theme.radius.lg};
  padding: 16px;
  text-align: center;
  box-shadow: ${theme.shadows.card};
`;

const StatIcon = styled.div<{ $bg: string }>`
  width: 46px;
  height: 46px;
  border-radius: 14px;
  background: ${p => p.$bg};
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 10px;
`;

const StatValue = styled.div`
  font-size: 18px;
  font-weight: 800;
  color: ${theme.colors.textPrimary};
  margin-bottom: 2px;
`;

const StatLabel = styled.div`
  font-size: 11px;
  color: ${theme.colors.textSecondary};
  font-weight: 600;
`;

const TasksRow = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-top: 14px;
`;

const TaskCell = styled.div`
  background: #F9FAFB;
  border-radius: 16px;
  padding: 14px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const TaskValue = styled.div`
  font-size: 22px;
  font-weight: 800;
  color: ${theme.colors.textPrimary};
  margin-top: 6px;
`;

const TaskLabel = styled.div`
  font-size: 11px;
  color: ${theme.colors.textSecondary};
  font-weight: 600;
  margin-top: 2px;
`;

const TxRow = styled.div<{ $border: boolean }>`
  display: flex;
  align-items: center;
  padding: 14px 12px;
  border-bottom: ${p => (p.$border ? '1px solid #F3F4F6' : 'none')};
`;

const TxIconWrap = styled.div`
  width: 38px;
  height: 38px;
  border-radius: 12px;
  background: ${theme.colors.primaryLight};
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 12px;
`;

const TxProduct = styled.div`
  font-size: 14px;
  font-weight: 700;
  color: ${theme.colors.textPrimary};
  margin-bottom: 2px;
`;

const TxMeta = styled.div`
  font-size: 11px;
  color: ${theme.colors.textSecondary};
  font-weight: 500;
`;

const TxAmount = styled.div`
  font-size: 14px;
  font-weight: 700;
  color: ${theme.colors.primary};
`;

const TxQty = styled.div`
  font-size: 10px;
  color: ${theme.colors.textSecondary};
  font-weight: 500;
  margin-top: 2px;
`;

const SearchBar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  background: #F9FAFB;
  border: 1px solid #F3F4F6;
  border-radius: 14px;
  padding: 0 12px;
  height: 44px;
  margin-bottom: 8px;
`;

const SearchInput = styled.input`
  flex: 1;
  font-size: 14px;
  color: ${theme.colors.textPrimary};
  font-weight: 500;
  &::placeholder { color: ${theme.colors.textMuted}; }
`;

const ResetBtn = styled.button`
  font-size: 12px;
  font-weight: 700;
  color: ${theme.colors.primary};
`;

const EmptyText = styled.div`
  font-size: 13px;
  color: ${theme.colors.textSecondary};
  text-align: center;
  padding: 12px 0;
`;

const SubRow = styled.div`
  display: flex;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid #F3F4F6;
  cursor: pointer;
  transition: background 0.15s;
  &:last-child { border-bottom: none; }
  &:hover { background: #FAFAF8; }
`;

const SubAvatar = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 20px;
  background: ${theme.colors.primary};
  color: #fff;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 12px;
`;

const SubName = styled.div`
  font-size: 14px;
  font-weight: 700;
  color: ${theme.colors.textPrimary};
  margin-bottom: 2px;
`;

const SubRole = styled.div`
  font-size: 11px;
  color: ${theme.colors.textSecondary};
  font-weight: 500;
`;

const SubKpi = styled.div`
  font-size: 13px;
  font-weight: 700;
  color: ${theme.colors.primary};
  background: ${theme.colors.primaryLight};
  padding: 5px 10px;
  border-radius: 10px;
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
