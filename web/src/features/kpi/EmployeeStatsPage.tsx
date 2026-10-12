import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, Package, Trophy, UserCheck, UserRound } from 'lucide-react';
import { useMe } from '../auth/AuthProvider';
import { ApiError } from '../../lib/http';
import { displayName, formatDate } from '../../lib/format';
import { useMedia } from '../../lib/useMedia';
import { Avatar } from '../../ui/Avatar';
import { Button, IconButton } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { Page, PageBody, PageHeader } from '../../ui/Page';
import { PageLoader } from '../../ui/Spinner';
import { statusMeta } from '../tasks/status';
import { useEmployeeStats } from './queries';
import { isKpi, KpiMonthBlock, SalesSection, useKpiMonthView } from './KpiMonthBlock';
import { SalesHistory, Section, TaskStats } from './Sections';
import { TargetCard } from './TargetCard';
import { TargetDialog, useTargetActions } from './TargetDialog';
import s from './kpi.module.css';

/**
 * Статистика сотрудника для руководителя: продажи по отчётам (квадратики) и KPI
 * за выбранный месяц — месяцы переключаются, задачи и история продаж.
 * Руководитель может назначить KPI, изменить план и выполнение или удалить цель.
 */
export default function EmployeeStatsPage() {
  const { userId } = useParams();
  const id = Number(userId) || 0;
  const me = useMe();
  const navigate = useNavigate();
  const wide = useMedia('(min-width: 1100px)');
  const { data, isLoading, error, refetch } = useEmployeeStats(id, 'month');
  const self = id === me.id;
  const view = useKpiMonthView(id);
  // Назначать KPI — тем, кому это можно (руководитель, директор или кому включили функцию).
  const canAssign = !!view.query.data?.can?.assign;
  const actions = useTargetActions({ viewerId: me.id, manage: canAssign });
  const name = data ? displayName(data.user) : 'Сотрудник';
  const suggestions = useMemo(() => [...new Set((data?.kpis ?? []).map((k) => k.product_name || '').filter(Boolean))], [data]);

  if (isLoading) return <PageLoader />;
  if (error || !data) {
    const denied = error instanceof ApiError && (error.status === 403 || error.status === 404);
    return (
      <Page>
        <PageHeader title="Сотрудник" back={true} />
        <EmptyState
          title={denied ? 'Нет доступа' : 'Не удалось загрузить статистику'}
          text={denied ? 'Статистика доступна только по своим подчинённым.' : 'Проверьте подключение и попробуйте ещё раз.'}
          action={denied ? <Button onClick={() => navigate('/stats')}>К статистике</Button> : <Button onClick={() => refetch()}>Повторить</Button>}
        />
      </Page>
    );
  }

  const personal = data.kpis.find((k) => k.is_personal_monthly_target);
  const allKpis = data.kpis.filter((k) => !k.is_personal_monthly_target);
  // Показатели из файла KPI — в блоке KPI за месяц; здесь — назначенные вручную цели.
  const kpis = allKpis.filter((k) => !isKpi(k));
  const fromFile = kpis.length < allKpis.length;
  const activeTasks = data.tasks.filter((t) => t.status !== 'done').slice(0, 6);

  const sales = <SalesSection view={view} />;
  const kpiBlock = <KpiMonthBlock view={view} self={self} itemsFor={actions.itemsFor} onAssign={() => actions.setMode({ kind: 'assign', user: { id, name } })} />;
  const goals = (kpis.length > 0 || !!personal || !fromFile) && (
    <Section
      title={fromFile ? 'Другие цели' : 'KPI сотрудника'}
      count={kpis.length || undefined}
      action={
        canAssign && (
          <Button size="sm" variant="ghost" icon={<UserCheck size={16} />} onClick={() => actions.setMode({ kind: 'assign', user: { id, name } })}>
            Назначить
          </Button>
        )
      }
    >
      {personal && <TargetCard target={personal} title="Общий план на месяц" tone="accent" icon={<Trophy size={20} />} actions={actions.itemsFor(personal)} />}
      {kpis.length ? (
        <div className={s.targets}>
          {kpis.map((k) => (
            <TargetCard key={k.id} target={k} actions={actions.itemsFor(k)} />
          ))}
        </div>
      ) : (
        !personal && (
          <div className={s.emptyCard}>
            <Package size={28} />
            <p>{canAssign ? 'Нет действующих целей. Назначьте цель или загрузите файл KPI.' : 'Нет действующих целей.'}</p>
            {canAssign && (
              <Button size="sm" variant="soft" icon={<UserCheck size={16} />} onClick={() => actions.setMode({ kind: 'assign', user: { id, name } })}>
                Назначить KPI
              </Button>
            )}
          </div>
        )
      )}
    </Section>
  );
  const tasks = (
    <Section title="Задачи" count={data.taskStats.total || undefined}>
      <TaskStats done={data.taskStats.completed} inWork={data.taskStats.in_progress} overdue={data.taskStats.overdue} />
      {activeTasks.length > 0 && (
        <div className={s.listCard}>
          {activeTasks.map((t) => {
            const meta = statusMeta(t.status);
            return (
              <button key={t.id} type="button" className={s.taskRow} onClick={() => navigate(`/tasks/${t.id}`)}>
                <span className={s.taskDot} style={{ background: meta.color }} />
                <span className={s.txBody}>
                  <b>{t.title}</b>
                  <span className={t.is_overdue ? s.late : undefined}>
                    {meta.label}
                    {' · '}
                    {t.deadline ? `до ${formatDate(t.deadline)}` : 'без срока'}
                    {t.is_overdue ? ' · просрочена' : ''}
                  </span>
                </span>
                <ChevronRight size={18} className={s.chevron} />
              </button>
            );
          })}
        </div>
      )}
    </Section>
  );
  const history = data.transactions.length > 0 && (
    <Section title="История продаж за месяц" count={data.transactions.length}>
      <SalesHistory items={data.transactions} />
    </Section>
  );

  return (
    <Page>
      <PageHeader
        title={name}
        subtitle={data.user.role_name || 'Сотрудник'}
        back={true}
        actions={
          <IconButton label="Профиль сотрудника" onClick={() => navigate(`/users/${id}`)}>
            <UserRound size={20} />
          </IconButton>
        }
      />
      <PageBody>
        <div className={s.personCard}>
          <Avatar name={name} src={data.user.avatar_url} size={56} />
          <div>
            <b>{name}</b>
            <span>
              {data.user.role_name || 'Сотрудник'}
              {data.user.email ? ` · ${data.user.email}` : ''}
              {!data.user.is_active ? ' · деактивирован' : ''}
            </span>
          </div>
        </div>
        {wide ? (
          <div className={s.col}>
            {sales}
            <div className={s.columns}>
              <div className={s.col}>
                {kpiBlock}
                {goals}
              </div>
              <div className={s.col}>
                {tasks}
                {history}
              </div>
            </div>
          </div>
        ) : (
          <div className={s.col}>
            {sales}
            {kpiBlock}
            {goals}
            {tasks}
            {history}
          </div>
        )}
      </PageBody>
      <TargetDialog mode={actions.mode} onClose={() => actions.setMode(null)} suggestions={suggestions} />
    </Page>
  );
}
