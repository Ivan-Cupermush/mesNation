import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FileSpreadsheet, Medal, Plus, ShoppingCart, Target, Trophy, UserCheck } from 'lucide-react';
import { useMe } from '../auth/AuthProvider';
import { isManager } from '../auth/roles';
import { displayName } from '../../lib/format';
import { useMedia } from '../../lib/useMedia';
import { ActionMenu, type MenuItem } from '../../ui/ActionMenu';
import { Button, IconButton } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { Segmented } from '../../ui/Field';
import { Page, PageBody, PageHeader } from '../../ui/Page';
import { PageLoader } from '../../ui/Spinner';
import { anchorFrom, type MenuAnchor } from '../../ui/menuAnchor';
import { useTasks } from '../tasks/queries';
import { useUsers } from '../users/queries';
import { TopProducts } from './Charts';
import { PERIODS, PERIOD_HINT } from './format';
import { useSalesSummary, useSubordinates, useTransactions } from './queries';
import { SaleDialog } from './SaleDialog';
import { FactTiles, SalesHistory, Section, TaskStats, TeamList } from './Sections';
import { TargetCard } from './TargetCard';
import { TargetDialog, useTargetActions } from './TargetDialog';
import type { SalesTarget } from './types';
import { usePeriod } from './usePeriod';
import s from './kpi.module.css';

/**
 * «Статистика» — как в приложении: личный план, цели KPI, выручка и сделки
 * за период, топ товаров, задачи, история продаж и команда руководителя.
 */
export default function StatsPage() {
  const me = useMe();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const wide = useMedia('(min-width: 1100px)');
  const manager = isManager(me);
  const [period, setPeriod] = usePeriod();
  const summary = useSalesSummary(period);
  const transactions = useTransactions(period);
  const team = useSubordinates(period, manager);
  const tasks = useTasks('mine');
  const users = useUsers(manager);
  const [addAnchor, setAddAnchor] = useState<MenuAnchor | null>(null);
  const [sale, setSale] = useState<{ preset: SalesTarget | null } | null>(null);
  const actions = useTargetActions({ viewerId: me.id, viewerIsManager: false, onSale: (t) => setSale({ preset: t }) });
  const { setMode } = actions;

  // «Назначить KPI» из настроек открывает форму сразу.
  useEffect(() => {
    if (params.get('assign') && manager) {
      setMode({ kind: 'assign' });
      const next = new URLSearchParams(params);
      next.delete('assign');
      setParams(next, { replace: true });
    }
  }, [params, setParams, manager, setMode]);

  const data = summary.data;
  const targets = useMemo(() => data?.targets ?? [], [data]);
  const suggestions = useMemo(
    () => [...new Set([...targets.map((t) => t.product_name || ''), ...(data?.topProducts ?? []).map((p) => p.product_name)].filter(Boolean))],
    [targets, data],
  );
  const taskStats = useMemo(() => {
    if (!tasks.data) return null;
    let done = 0;
    let inWork = 0;
    let overdue = 0;
    // Только задачи, где я исполнитель; архив не считаем — как в приложении.
    for (const t of tasks.data) {
      if (!t.is_assignee || t.status_new === 'archived') continue;
      if (t.status_new === 'done') done++;
      else if (t.is_overdue || t.status_new === 'overdue') overdue++;
      else inWork++;
    }
    return { done, inWork, overdue };
  }, [tasks.data]);
  const avatars = useMemo(() => new Map((users.data || []).map((u) => [u.id, u.avatar_url])), [users.data]);

  const addItems: MenuItem[] = [
    { key: 'own', label: 'Добавить свой KPI', icon: <Target size={18} />, onSelect: () => setMode({ kind: 'own' }) },
    { key: 'sale', label: 'Записать продажу', icon: <ShoppingCart size={18} />, onSelect: () => setSale({ preset: null }) },
    ...(manager ? [{ key: 'assign', label: 'Назначить KPI сотруднику', icon: <UserCheck size={18} />, onSelect: () => setMode({ kind: 'assign' }) }] : []),
    { key: 'import', label: 'Импорт из Excel', icon: <FileSpreadsheet size={18} />, onSelect: () => navigate('/import') },
  ];

  const header = (
    <PageHeader
      title="Статистика"
      subtitle={displayName(me)}
      large
      actions={
        <IconButton label="Добавить KPI или продажу" tone="soft" size={42} onClick={(e) => setAddAnchor(anchorFrom(e.currentTarget))}>
          <Plus size={22} />
        </IconButton>
      }
    >
      <div className={s.periodBar}>
        <Segmented options={PERIODS} value={period} onChange={setPeriod} />
      </div>
    </PageHeader>
  );

  let body;
  if (summary.isLoading) body = <PageLoader />;
  else if (summary.error || !data) {
    body = <EmptyState title="Не удалось загрузить статистику" text="Проверьте подключение и попробуйте ещё раз." action={<Button onClick={() => summary.refetch()}>Повторить</Button>} />;
  } else {
    const plan = data.personalTarget && (
      <TargetCard target={data.personalTarget} title="Общий план на месяц" tone="accent" icon={<Trophy size={20} />} actions={actions.itemsFor(data.personalTarget)} />
    );
    const goals = (
      <Section title="Мои цели" count={targets.length || undefined}>
        {targets.length ? (
          <div className={s.targets}>
            {targets.map((t) => (
              <TargetCard
                key={t.id}
                target={t}
                icon={<Medal size={20} />}
                note={t.created_by != null && t.created_by !== t.user_id ? 'Назначил руководитель' : undefined}
                actions={actions.itemsFor(t)}
              />
            ))}
          </div>
        ) : (
          <div className={s.emptyCard}>
            <p>Целей пока нет. Добавьте свой KPI — например, сколько договоров или на какую сумму продать за месяц.</p>
            <Button size="sm" variant="soft" icon={<Target size={16} />} onClick={() => setMode({ kind: 'own' })}>
              Добавить KPI
            </Button>
          </div>
        )}
      </Section>
    );
    const tiles = (
      <Section title={`Продажи ${PERIOD_HINT[period]}`}>
        <FactTiles fact={wide ? data.fact : { total_amount: data.fact.total_amount, total_transactions: data.fact.total_transactions }} />
      </Section>
    );
    const top = data.topProducts.length > 0 && (
      <Section title="Топ товаров">
        <div className={s.card}>
          <TopProducts products={data.topProducts} />
        </div>
      </Section>
    );
    const taskBlock = taskStats && (
      <Section title="Мои задачи">
        <TaskStats done={taskStats.done} inWork={taskStats.inWork} overdue={taskStats.overdue} onOpen={() => navigate('/tasks')} />
      </Section>
    );
    const history = (transactions.data?.length ?? 0) > 0 && (
      <Section
        title="История продаж"
        count={transactions.data!.length}
        action={
          <Button size="sm" variant="ghost" icon={<Plus size={16} />} onClick={() => setSale({ preset: null })}>
            Продажа
          </Button>
        }
      >
        <SalesHistory items={transactions.data!} />
      </Section>
    );
    const teamBlock = manager && (team.data?.length ?? 0) > 0 && (
      <Section
        title="Команда"
        count={team.data!.length}
        action={
          <Button size="sm" variant="ghost" icon={<UserCheck size={16} />} onClick={() => setMode({ kind: 'assign' })}>
            Назначить KPI
          </Button>
        }
      >
        <TeamList team={team.data!} avatars={avatars} />
      </Section>
    );

    body = wide ? (
      <div className={s.columns}>
        <div className={s.col}>
          {tiles}
          {plan}
          {goals}
          {top}
        </div>
        <div className={s.col}>
          {taskBlock}
          {teamBlock}
          {history}
        </div>
      </div>
    ) : (
      <div className={s.col}>
        {plan}
        {goals}
        {tiles}
        {top}
        {taskBlock}
        {history}
        {teamBlock}
      </div>
    );
  }

  return (
    <Page>
      {header}
      <PageBody>{body}</PageBody>
      <ActionMenu open={!!addAnchor} anchor={addAnchor} items={addItems} title="KPI" onClose={() => setAddAnchor(null)} />
      <TargetDialog mode={actions.mode} onClose={() => setMode(null)} suggestions={suggestions} />
      <SaleDialog open={!!sale} preset={sale?.preset} targets={targets} suggestions={suggestions} onClose={() => setSale(null)} />
    </Page>
  );
}
