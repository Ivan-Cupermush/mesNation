import { Router, Response } from 'express';
import { z } from 'zod';
import pool from '../db/pool';
import { AuthRequest } from '../middleware/auth';
import { CURRENT_DEADLINE_SQL, OVERDUE_SQL } from '../services/taskDeadlines';
import { enrichTargets, reportStats, totalsOf, type SalesStats } from '../services/kpi/store';
import { getUserNode } from '../services/access';
import { monthEnd } from '../services/kpi/text';
import { splitFullName } from '../lib/names';

/**
 * Приветственная страница: приветствие, напутствие (каждый раз новое), продажи
 * за месяц (те же 4 квадратика, что в статистике), KPI, на которые стоит
 * обратить внимание, и задачи на сегодня и в работе. У директора продажи и KPI —
 * суммарно по всей компании.
 */
const router = Router();

/** Напутствия — по одному на каждый заход, подряд не повторяются. */
export const PHRASES = [
  'Каждый звонок приближает к плану — сделайте сегодня на один больше, чем вчера.',
  'Большие результаты складываются из маленьких ежедневных побед.',
  'Клиент запоминает не цену, а то, как с ним говорили.',
  'План — это не потолок, а точка опоры.',
  'Сегодня отличный день, чтобы открыть новую точку.',
  'Лучшее время для продажи — сейчас, второе лучшее — сразу после неё.',
  'Не бойтесь отказов: каждое «нет» приближает к «да».',
  'Сильная команда — это когда каждый делает чуть больше, чем от него ждут.',
  'Успех любит подготовку: загляните в KPI и выберите главное на сегодня.',
  'Постоянство важнее рывков: ровный темп приводит к плану.',
  'Хороший менеджер продаёт товар, отличный — решение для клиента.',
  'Запланируйте день — и день сработает на вас.',
  'Сделайте сегодня то, за что завтра скажете себе спасибо.',
  'Новый клиент — это новая история успеха. Начните её сегодня.',
  'Цифры в отчёте — это ваши усилия. Пусть сегодня они будут лучше вчерашних.',
  'Не откладывайте важный звонок — именно он может сделать месяц.',
  'Внимание к мелочам отличает профессионала.',
  'Энергия заразительна: начните день с хорошего настроения.',
  'Цель без плана — мечта, план без действий — бумага. Действуйте!',
  'Каждая выполненная задача — шаг к большой цели.',
  'Слушайте клиента внимательнее, чем говорите, — и продажи придут.',
  'Вчерашний рекорд — сегодняшняя норма.',
  'Маленький шаг каждый день — и к концу месяца план выполнен.',
  'Верьте в свой продукт — и клиенты поверят вам.',
  'Лучшие продажи начинаются с доверия.',
  'Улыбка слышна даже по телефону.',
  'Проверьте задачи на сегодня — закрытая задача освобождает голову для нового.',
  'Вы можете больше, чем думаете. Проверьте это сегодня.',
  'Ни один план не выполняется сам — но с вами он обязательно выполнится.',
  'Сфокусируйтесь на главном показателе — остальное подтянется.',
];

const homeQuery = z.object({
  /** Смещение часового пояса устройства, минуты (как Date#getTimezoneOffset). */
  tz_offset: z.coerce.number().int().min(-14 * 60).max(14 * 60).optional(),
  /** Номер прошлого напутствия — чтобы не повторилось. */
  prev: z.coerce.number().int().min(0).optional(),
});

/**
 * Продажи компании: сумма по сотрудникам. Средняя продажа в день — сумма
 * средних (у каждого свой последний отчёт), дата — самый свежий отчёт.
 */
export function sumStats(list: SalesStats[]): (SalesStats & { people: number }) | null {
  if (!list.length) return null;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const latest = list.reduce((a, b) => (b.asOf > a.asOf ? b : a));
  return {
    ...latest,
    revenue: r2(list.reduce((s, x) => s + x.revenue, 0)),
    akb: list.reduce((s, x) => s + x.akb, 0),
    perDay: r2(list.reduce((s, x) => s + x.perDay, 0)),
    quantity: r2(list.reduce((s, x) => s + x.quantity, 0)),
    reports: list.reduce((s, x) => s + x.reports, 0),
    uploadedAt: list.reduce((a, x) => (x.uploadedAt > a ? x.uploadedAt : a), latest.uploadedAt),
    people: list.length,
  };
}

function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Доброе утро';
  if (hour >= 12 && hour < 17) return 'Добрый день';
  if (hour >= 17 && hour < 23) return 'Добрый вечер';
  return 'Доброй ночи';
}

export function pickPhrase(prev?: number, random = Math.random): number {
  if (PHRASES.length < 2) return 0;
  let i = Math.floor(random() * PHRASES.length);
  if (i === prev) i = (i + 1) % PHRASES.length;
  return i;
}

/** GET /api/home?tz_offset=&prev= — данные стартовой страницы. */
router.get('/', async (req: AuthRequest, res: Response) => {
  const me = req.userId!;
  const q = homeQuery.parse(req.query);
  // Местное время пользователя: приветствие и «сегодня» для задач.
  const offset = q.tz_offset ?? new Date().getTimezoneOffset();
  const local = new Date(Date.now() - offset * 60_000);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const month = `${y}-${String(m + 1).padStart(2, '0')}-01`;
  // Конец сегодняшнего дня по времени пользователя, в UTC.
  const dayEnd = new Date(Date.UTC(y, m, local.getUTCDate() + 1) + offset * 60_000);

  // Директор видит продажи и KPI всей компании, остальные — свои.
  const company = (await getUserNode(me)).isRoot;
  const people: number[] = company
    ? (await pool.query('SELECT id FROM users WHERE is_active ORDER BY id')).rows.map((r) => r.id)
    : [me];

  const [user, targets, tasks] = await Promise.all([
    pool.query("SELECT id, COALESCE(NULLIF(display_name, ''), username) AS name, first_name FROM users WHERE id = $1", [me]),
    pool.query(
      `SELECT st.*, COALESCE(NULLIF(u.display_name, ''), u.username) AS user_name
       FROM sales_targets st JOIN users u ON u.id = st.user_id
       WHERE st.user_id = ANY($1::int[]) AND NOT st.is_personal_monthly_target
         AND st.period_start >= $2::date AND st.period_start <= $3::date
         AND st.kpi_kind IS DISTINCT FROM 'fuel'
       ORDER BY (st.source = 'kpi_file') DESC, st.sort_order, st.created_at`,
      [people, month, monthEnd(month)],
    ),
    // Мои задачи (я исполнитель): срок сегодня или уже прошёл, и всё, что в работе.
    pool.query(
      `SELECT t.id, t.kind, t.title, t.status_new AS status, t.importance,
              ${CURRENT_DEADLINE_SQL} AS deadline, ${OVERDUE_SQL} AS is_overdue
       FROM tasks t
       WHERE EXISTS (SELECT 1 FROM task_assignees a WHERE a.task_id = t.id AND a.user_id = $1)
         AND t.status_new IN ('new', 'in_progress', 'rejected', 'overdue')
         AND (t.status_new IN ('in_progress', 'rejected') OR ${CURRENT_DEADLINE_SQL} < $2::timestamptz)
       ORDER BY ${CURRENT_DEADLINE_SQL} ASC NULLS LAST, CASE t.importance WHEN 'red' THEN 1 WHEN 'yellow' THEN 2 ELSE 3 END, t.created_at DESC
       LIMIT 30`,
      [me, dayEnd.toISOString()],
    ),
  ]);

  const enriched = await enrichTargets(targets.rows);
  const byUser = await reportStats(people, month);
  const stats = company ? sumStats([...byUser.values()]) : (byUser.get(me) ?? null);
  // На что обратить внимание: показатели, план по которым ещё не выполнен, — с наименьшим процентом.
  const focus = enriched
    .filter((t) => t.payout_rule.type !== 'fixed' && Number(t.target_value) > 0 && t.calc.percent < 100)
    .sort((a, b) => a.calc.percent - b.calc.percent)
    .slice(0, company ? 5 : 3);
  const phrase = pickPhrase(q.prev);
  const todayEnd = dayEnd.getTime();

  res.json({
    greeting: greetingFor(local.getUTCHours()),
    name: user.rows[0]?.name ?? '',
    // Как обратиться: имя, а не первое слово («Тимуров Тимур» — это фамилия).
    first_name: user.rows[0]?.first_name || splitFullName(user.rows[0]?.name).first || user.rows[0]?.name || '',
    phrase: { id: phrase, text: PHRASES[phrase] },
    month: month.slice(0, 7),
    // company — суммарно по всем сотрудникам (у директора).
    scope: company ? 'company' : 'me',
    stats,
    kpi: {
      people: new Set(enriched.map((t) => t.user_id)).size,
      count: enriched.length,
      totals: enriched.length ? totalsOf(enriched) : null,
      focus,
    },
    tasks: tasks.rows.map((t) => ({
      ...t,
      due_today: !!t.deadline && new Date(t.deadline).getTime() < todayEnd && !t.is_overdue,
    })),
  });
});

export default router;
