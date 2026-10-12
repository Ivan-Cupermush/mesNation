import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FileSpreadsheet, Medal, Plus, ShoppingCart, Sparkles, Target, Trophy, Upload, UserCheck } from 'lucide-react';
import { useMe } from '../auth/AuthProvider';
import { can, isManager } from '../auth/roles';
import { displayName } from '../../lib/format';
import { useMedia } from '../../lib/useMedia';
import { ActionMenu, type MenuItem } from '../../ui/ActionMenu';
import { Button, IconButton } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { Page, PageBody, PageHeader } from '../../ui/Page';
import { PageLoader } from '../../ui/Spinner';
import { anchorFrom, type MenuAnchor } from '../../ui/menuAnchor';
import { useTasks } from '../tasks/queries';
import { useUsers } from '../users/queries';
import { TopProducts } from './Charts';
import { useSalesSummary, useSubordinates, useTransactions } from './queries';
import { SaleDialog } from './SaleDialog';
import { isKpi, KpiMonthBlock, SalesSection, useKpiMonthView } from './KpiMonthBlock';
import { SalesHistory, Section, TaskStats, TeamList } from './Sections';
import { TargetCard } from './TargetCard';
import { TargetDialog, useTargetActions } from './TargetDialog';
import type { SalesTarget } from './types';
import s from './kpi.module.css';

/**
 * «Статистика»: наверху — продажи за текущий месяц по отчётам о продажах
 * (выручка, АКБ, средняя продажа в день, проданные штуки), ниже — KPI из файла
 * KPI и цели, назначенные руководителем, задачи, история продаж и команда.
 * Сотрудник видит текущий месяц; по месяцам переключается руководитель на
 * странице сотрудника (и директор).
 */
export default function StatsPage() {
  const me = useMe();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const wide = useMedia('(min-width: 1100px)');
  const manager = isManager(me);
  const canAssign = can(me, 'kpi_assign');
  const view = useKpiMonthView(me.id);
  const summary = useSalesSummary('month');
  const transactions = useTransactions('month');
  const team = useSubordinates('month', manager);
  const tasks = useTasks('mine');
  const users = useUsers(manager);
  const [addAnchor, setAddAnchor] = useState<MenuAnchor | null>(null);
  const [sale, setSale] = useState<{ preset: SalesTarget | null } | null>(null);
  const actions = useTargetActions({ viewerId: me.id, manage: me.is_director, onSale: (t) => setSale({ preset: t }) });
  const { setMode } = actions;

  // «Назначить KPI» из настроек открывает форму сразу.
  useEffect(() => {
    if (params.get('assign') && canAssign) {
      setMode({ kind: 'assign' });
      const next = new URLSearchParams(params);
      next.delete('assign');
      setParams(next, { replace: true });
    }
  }, [params, setParams, canAssign, setMode]);

  const data = summary.data;
  const targets = useMemo(() => data?.targets ?? [], [data]);
  // Показатели из файла KPI и цели по отчёту — в блоке KPI; здесь — цели, которые ведутся вручную.
  const goalsList = useMemo(() => targets.filter((t) => !isKpi(t)), [targets]);
  const hasKpi = goalsList.length < targets.length;
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

  // Сотрудник сам себе KPI не ставит: «Свой KPI» — только директору.
  const addItems: MenuItem[] = [
    ...(me.is_director ? [{ key: 'own', label: 'Добавить свой KPI', icon: <Target size={18} />, onSelect: () => setMode({ kind: 'own' }) }] : []),
    { key: 'sale', label: 'Записать продажу', icon: <ShoppingCart size={18} />, onSelect: () => setSale({ preset: null }) },
    ...(canAssign ? [{ key: 'assign', label: 'Назначить KPI сотруднику', icon: <UserCheck size={18} />, onSelect: () => setMode({ kind: 'assign' }) }] : []),
    ...(can(me, 'sales_reports')
      ? [{ key: 'report', label: 'Загрузить отчёт о продажах', icon: <Upload size={18} />, onSelect: () => navigate('/import?type=report') }]
      : []),
    ...(can(me, 'kpi_files') ? [{ key: 'kpi', label: 'Загрузить файл KPI', icon: <FileSpreadsheet size={18} />, onSelect: () => navigate('/import?type=kpi') }] : []),
    ...(can(me, 'sales_reports') ? [{ key: 'ep', label: 'Клиенты «Есть повод»', icon: <Sparkles size={18} />, onSelect: () => navigate('/stats/clients') }] : []),
    { key: 'import', label: 'Импорт из Excel', icon: <FileSpreadsheet size={18} />, onSelect: () => navigate('/import?type=sales') },
  ];

  const header = (
    <PageHeader
      title="Статистика"
      subtitle={displayName(me)}
      large
      actions={
        <IconButton label="Добавить продажу или KPI" tone="soft" size={42} onClick={(e) => setAddAnchor(anchorFrom(e.currentTarget))}>
          <Plus size={22} />
        </IconButton>
      }
    />
  );

  let body;
  if (summary.isLoading) body = <PageLoader />;
  else if (summary.error || !data) {
    body = <EmptyState title="Не удалось загрузить статистику" text="Проверьте подключение и попробуйте ещё раз." action={<Button onClick={() => summary.refetch()}>Повторить</Button>} />;
  } else {
    const plan = data.personalTarget && (
      <TargetCard target={data.personalTarget} title="Общий план на месяц" tone="accent" icon={<Trophy size={20} />} actions={actions.itemsFor(data.personalTarget)} />
    );
    const sales = <SalesSection view={view} />;
    const kpiBlock = <KpiMonthBlock view={view} self itemsFor={actions.itemsFor} />;
    const goals = (goalsList.length > 0 || !hasKpi) && (
      <Section title="Мои цели" count={goalsList.length || undefined}>
        {goalsList.length ? (
          <div className={s.targets}>
            {goalsList.map((t) => (
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
            <p>Целей пока нет. KPI и цели ставит руководитель — они появятся здесь.</p>
            {me.is_director && (
              <Button size="sm" variant="soft" icon={<Target size={16} />} onClick={() => setMode({ kind: 'own' })}>
                Добавить KPI
              </Button>
            )}
          </div>
        )}
      </Section>
    );
    const top = data.topProducts.length > 0 && (
      <Section title="Топ товаров за месяц">
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
          canAssign && (
            <Button size="sm" variant="ghost" icon={<UserCheck size={16} />} onClick={() => setMode({ kind: 'assign' })}>
              Назначить KPI
            </Button>
          )
        }
      >
        <TeamList team={team.data!} avatars={avatars} />
      </Section>
    );

    body = wide ? (
      <div className={s.col}>
        {sales}
        <div className={s.columns}>
          <div className={s.col}>
            {kpiBlock}
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
      </div>
    ) : (
      <div className={s.col}>
        {sales}
        {kpiBlock}
        {plan}
        {goals}
        {taskBlock}
        {top}
        {history}
        {teamBlock}
      </div>
    );
  }

  return (
    <Page>
      {header}
      <PageBody>{body}</PageBody>
      <ActionMenu open={!!addAnchor} anchor={addAnchor} items={addItems} title="Статистика" onClose={() => setAddAnchor(null)} />
      <TargetDialog mode={actions.mode} onClose={() => setMode(null)} suggestions={suggestions} />
      <SaleDialog open={!!sale} preset={sale?.preset} targets={targets} suggestions={suggestions} onClose={() => setSale(null)} />
    </Page>
  );
}
