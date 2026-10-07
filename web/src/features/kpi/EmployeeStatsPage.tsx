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
import { Segmented } from '../../ui/Field';
import { Page, PageBody, PageHeader } from '../../ui/Page';
import { PageLoader } from '../../ui/Spinner';
import { statusMeta } from '../tasks/status';
import { PERIODS, PERIOD_HINT } from './format';
import { useEmployeeStats } from './queries';
import { isKpi, KpiMonthBlock } from './KpiMonthBlock';
import { FactTiles, SalesHistory, Section, TaskStats } from './Sections';
import { TargetCard } from './TargetCard';
import { TargetDialog, useTargetActions } from './TargetDialog';
import { usePeriod } from './usePeriod';
import s from './kpi.module.css';

/**
 * Статистика сотрудника для руководителя — как в приложении: KPI с прогрессом,
 * выручка и сделки за период, задачи и история продаж. Руководитель может
 * назначить KPI, изменить план и выполнение или удалить цель.
 */
export default function EmployeeStatsPage() {
  const { userId } = useParams();
  const id = Number(userId) || 0;
  const me = useMe();
  const navigate = useNavigate();
  const wide = useMedia('(min-width: 1100px)');
  const [period, setPeriod] = usePeriod();
  const { data, isLoading, error, refetch } = useEmployeeStats(id, period);
  const self = id === me.id;
  const actions = useTargetActions({ viewerId: me.id, viewerIsManager: !self });
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

  const kpiBlock = <KpiMonthBlock userId={id} self={self} itemsFor={actions.itemsFor} />;
  const goals = (kpis.length > 0 || !!personal || !fromFile) && (
    <Section
      title={fromFile ? 'Другие цели' : 'KPI сотрудника'}
      count={kpis.length || undefined}
      action={
        !self && (
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
            <p>Нет действующих KPI. Назначьте цель или загрузите файл KPI в разделе «Импорт из Excel».</p>
            {!self && (
              <Button size="sm" variant="soft" icon={<UserCheck size={16} />} onClick={() => actions.setMode({ kind: 'assign', user: { id, name } })}>
                Назначить KPI
              </Button>
            )}
          </div>
        )
      )}
    </Section>
  );
  const tiles = (
    <Section title={`Продажи ${PERIOD_HINT[period]}`}>
      <FactTiles fact={wide ? data.summary : { total_amount: data.summary.total_amount, total_transactions: data.summary.total_transactions }} />
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
    <Section title="История продаж" count={data.transactions.length}>
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
      >
        <div className={s.periodBar}>
          <Segmented options={PERIODS} value={period} onChange={setPeriod} />
        </div>
      </PageHeader>
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
          <div className={s.columns}>
            <div className={s.col}>
              {kpiBlock}
              {tiles}
              {goals}
            </div>
            <div className={s.col}>
              {tasks}
              {history}
            </div>
          </div>
        ) : (
          <div className={s.col}>
            {kpiBlock}
            {goals}
            {tiles}
            {tasks}
            {history}
          </div>
        )}
      </PageBody>
      <TargetDialog mode={actions.mode} onClose={() => actions.setMode(null)} suggestions={suggestions} />
    </Page>
  );
}
