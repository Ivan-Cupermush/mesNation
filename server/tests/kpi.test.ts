import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import pool from '../src/db/pool';
import { createApp } from '../src/app';
import { parseSalesReport } from '../src/services/kpi/salesReport';
import { kindOf, parseItem, parseKpiFile } from '../src/services/kpi/kpiFile';
import { computeFact, PATH_SEP, type ReportLine } from '../src/services/kpi/facts';
import { defaultRules, guessFactRule, payoutFor, ruleText } from '../src/services/kpi/rules';
import { datesIn, matchesItem, personScore, personWords, workDays } from '../src/services/kpi/text';
import { Actor, client, resetDatabase, seedCompany } from './helpers';
import { kpiFile, mayClients, salesReport } from './kpiFixtures';

// ===================== РАЗБОР ФАЙЛОВ (без базы) =====================

function linesOf(buffer: Buffer, manager: string): ReportLine[] {
  const out: ReportLine[] = [];
  for (const b of parseSalesReport(buffer).blocks) {
    if (b.manager !== manager) continue;
    out.push({ client_name: b.client, kind: 'total', group_path: '', name: b.client, quantity: b.quantity, revenue: b.revenue });
    for (const n of b.nodes) out.push({ client_name: b.client, kind: n.kind, group_path: n.path.join(PATH_SEP), name: n.name, quantity: n.quantity, revenue: n.revenue });
  }
  return out;
}

describe('KPI: отчёт о продажах из 1С', () => {
  const file = salesReport('01.05.2026 - 15.05.2026', mayClients());

  it('период, клиенты, менеджеры и суммы', () => {
    const r = parseSalesReport(file);
    expect(r.periodStart).toBe('2026-05-01');
    expect(r.periodEnd).toBe('2026-05-15');
    expect(r.month).toBe('2026-05-01');
    expect(r.total).toBe(79000);
    expect(r.fileTotal).toBe(79000);
    expect(r.warnings).toEqual([]);
    // У клиента два менеджера — два блока; пробел в конце имени из 1С убран.
    expect(r.blocks.filter((b) => b.client === 'ООО "Ромашка"').map((b) => [b.manager, b.revenue])).toEqual([
      ['Смирнова Анна', 28000],
      ['Иванов Пётр', 4000],
    ]);
  });

  it('группы товаров и товары: по уровням группировки и без них (старый .xls)', () => {
    const withLevels = parseSalesReport(file);
    const noLevels = parseSalesReport(salesReport('01.05.2026 - 15.05.2026', mayClients(), false));
    for (const r of [withLevels, noLevels]) {
      const nodes = r.blocks[0].nodes;
      expect(nodes[0]).toMatchObject({ kind: 'group', depth: 1, name: 'ПИВО', revenue: 25000 });
      const stout = nodes.find((n) => n.name.startsWith('Пиво Балтика Stout'))!;
      expect(stout).toMatchObject({ kind: 'item', depth: 5, path: ['ПИВО', 'Пиво разливное', 'Россия', 'Драфт Балтика'] });
      // «, » в конце (пустая характеристика) убирается.
      expect(stout.name).toBe('Пиво Балтика Stout тм. КЕГ 30л');
    }
    expect(noLevels.blocks.map((b) => b.nodes.map((n) => [n.kind, n.path.join('/'), n.name]))).toEqual(
      withLevels.blocks.map((b) => b.nodes.map((n) => [n.kind, n.path.join('/'), n.name])),
    );
  });

  it('понятные ошибки вместо 500', () => {
    expect(() => parseSalesReport(salesReport('май', mayClients()))).toThrow(/не найден период/);
    expect(() => parseSalesReport(salesReport('25.05.2026 - 05.06.2026', mayClients()))).toThrow(/несколько месяцев/);
    expect(() => parseSalesReport(Buffer.from('просто текст'))).toThrow();
  });

  it('рабочие дни: понедельник–суббота, воскресенье — выходной', () => {
    expect(workDays(2026, 5)).toBe(26);
    expect(workDays(2026, 5, 15)).toBe(13);
    expect(workDays(2026, 2)).toBe(24);
    // 1 марта 2026 — воскресенье.
    expect(workDays(2026, 3, 1)).toBe(0);
  });

  it('даты периода в разных записях', () => {
    expect(datesIn('Период: 1.6.26 - 30.06.2026')).toEqual(['2026-06-01', '2026-06-30']);
    expect(datesIn('Период: 3 марта 2026 г.')).toEqual(['2026-03-03']);
    expect(datesIn('Период: Май 2026')).toEqual(['2026-05-01', '2026-05-31']);
  });
});

describe('KPI: файл сотрудника', () => {
  it('показатели, месяц, позиции, ставка «Есть повод» и опечатки', () => {
    const f = parseKpiFile(kpiFile({ name: 'Анна' }));
    expect(f.employeeName).toBe('Анна');
    expect(f.month).toBe('2026-05-01');
    expect(f.hasResults).toBe(true);
    const by = Object.fromEntries(f.metrics.map((m) => [m.kind, m]));
    // ГСМ в KPI не попадает.
    expect(f.metrics.map((m) => m.kind)).toEqual(['salary', 'akb', 'distra', 'baltika', 'oph', 'ep', 'no_ep']);
    expect(by.akb).toMatchObject({ plan: 4, fact: 5, bonus: 5000, payment: 5000, filePercent: 125 });
    expect(by.distra.items).toEqual([
      { name: 'Балтика Стаут кег', need: 1, fileCount: null, fileDone: true },
      { name: 'Крон Бланш', need: 1, fileCount: null, fileDone: false },
      { name: 'Балтика Хеллес', need: 1, fileCount: null, fileDone: true },
      { name: 'Балтика 0 any', need: 2, fileCount: 1, fileDone: false },
    ]);
    // Галочки и крестики: выполнено столько позиций, сколько галочек.
    expect(by.distra).toMatchObject({ plan: 4, fact: 2, percentOnly: false });
    // Первая строка «факт» у ЕП — это план; «%» — ставка 3,5%, а не выполнение.
    expect(by.ep).toMatchObject({ plan: 40000, fact: 30000, rate: 0.035, filePercent: null });
    expect(by.no_ep).toMatchObject({ plan: 200000, fact: 150000, filePercent: 75, payment: 0 });
    // Раньше 1,045 (104,5%) сохранялось как 1,045%.
    expect(by.baltika.filePercent).toBe(95);
    expect(by.salary).toMatchObject({ fixed: true, plan: 30000, payment: 30000 });
  });

  it('позиции без галочек: «да» — выполнение по проценту из таблицы, «нет» — не выполнено', () => {
    const yes = parseKpiFile(kpiFile({ name: 'Анна', yesNo: true })).metrics.find((m) => m.name === 'Дистра Хайнекен')!;
    expect(yes).toMatchObject({ kind: 'distra', percentOnly: true, plan: 100, fact: 80, filePercent: 80, payment: 2400 });
    expect(yes.items.map((i) => [i.name, i.fileDone])).toEqual([
      ['Охота Крепкое', null],
      ['Бочкарев светлое', null],
    ]);
    const empty = parseKpiFile(kpiFile({ name: 'Анна', yesNo: true, facts: false })).metrics.find((m) => m.name === 'Дистра Хайнекен')!;
    expect(empty).toMatchObject({ percentOnly: true, plan: 100, fact: null });
  });

  it('файл на начало месяца — только план, без итогов', () => {
    const f = parseKpiFile(kpiFile({ name: 'Анна', month: '01.06.2026', facts: false }));
    expect(f.month).toBe('2026-06-01');
    expect(f.hasResults).toBe(false);
    expect(f.metrics.find((m) => m.kind === 'baltika')).toMatchObject({ plan: 100000, fact: null, payment: null });
  });

  it('вид показателя по названию', () => {
    expect(kindOf('Продажи Есть Подод, руб', false)).toBe('ep');
    expect(kindOf('План продаж без ЕП, руб', false)).toBe('no_ep');
    expect(kindOf('АКБ (без учета ЕП)', false)).toBe('akb');
    expect(kindOf('План ОПХ, руб', false)).toBe('oph');
    expect(kindOf('План Сидр, руб', false)).toBe('other');
    expect(parseItem('Балтика 0 any - 5 ТТ (4) X')).toEqual({ name: 'Балтика 0 any', need: 5, fileCount: 4, fileDone: false });
  });
});

describe('KPI: правила и факт', () => {
  const lines = linesOf(salesReport('01.05.2026 - 15.05.2026', mayClients()), 'Смирнова Анна');
  const noLists = { ep: [], akbMerge: [] };
  const lists = { ep: ['ИП Соколова Д.И.'], akbMerge: [] };
  const metrics = Object.fromEntries(parseKpiFile(kpiFile({ name: 'Анна' })).metrics.map((m) => [m.kind, m]));
  const fact = (kind: string, l = noLists) => computeFact(defaultRules(metrics[kind]).fact, lines, l);

  it('выручка с ЕП и без: по списку клиентов «Есть повод»', () => {
    expect(fact('no_ep')!.value).toBe(72000);
    expect(fact('ep')!.value).toBe(0);
    expect(fact('no_ep', lists)!.value).toBe(47000);
    expect(fact('ep', lists)!.value).toBe(25000);
  });

  it('Балтика и ОПХ — по группам товаров, без двойного счёта вложенных групп', () => {
    expect(fact('baltika')!.value).toBe(51000);
    expect(fact('oph')!.value).toBe(18000);
    // Точная группа из отчёта вместо слова.
    const draft = computeFact({ type: 'revenue', groups: ['ПИВО › Пиво разливное › Россия › Драфт Балтика'], clients: 'all' }, lines, noLists);
    expect(draft!.value).toBe(32000);
  });

  it('АКБ: точки с продажами, задвоенные — одна точка, ЕП не считаются', () => {
    // 6 клиентов, две точки Егоровой — одна (из названия показателя).
    expect(fact('akb')!.value).toBe(5);
    expect(fact('akb', lists)!).toMatchObject({ value: 3, details: { excludedEp: 2 } });
  });

  it('Дистрибуция: позиции по названиям товаров (Стаут = Stout, Крон = Krone, «0» ≠ «0,5»)', () => {
    const r = fact('distra')!;
    expect(r.value).toBe(3);
    expect(r.details.items).toEqual([
      { name: 'Балтика Стаут кег', need: 1, count: 1, done: true },
      { name: 'Крон Бланш', need: 1, count: 1, done: true },
      { name: 'Балтика Хеллес', need: 1, count: 2, done: true },
      { name: 'Балтика 0 any', need: 2, count: 1, done: false },
    ]);
    expect(matchesItem('Балтика 0 any', 'Пиво Балтика №7 Экспортное 0,5 ст.б.*20')).toBe(false);
    expect(matchesItem('Балтика Стаут кег', 'посуда Балтика Стаут 0,5')).toBe(false);
  });

  it('выплаты: пороги, коэффициент, сверх плана, ставка, позиции', () => {
    const r = defaultRules(metrics.baltika).payout;
    expect(r).toEqual({ type: 'threshold', steps: [{ from: 90, k: 1 }, { from: 80, k: 0.5 }], over: 'proportional' });
    expect(payoutFor(r, { plan: 100000, fact: 79999, bonus: 12000 })).toBe(0);
    expect(payoutFor(r, { plan: 100000, fact: 85000, bonus: 12000 })).toBe(6000);
    expect(payoutFor(r, { plan: 100000, fact: 90000, bonus: 12000 })).toBe(12000);
    expect(payoutFor(r, { plan: 100000, fact: 103250, bonus: 12000 })).toBe(12390);
    expect(ruleText(r, 12000)).toBe('от 90% — 12 000 ₽, 80–90% — 6 000 ₽ (× 0,5), сверх плана — пропорционально');
    const ep = defaultRules(metrics.ep).payout;
    expect(ep).toEqual({ type: 'rate', rate: 0.035, min: 20000 });
    expect(payoutFor(ep, { plan: 40000, fact: 19999, bonus: 1400 })).toBe(0);
    expect(payoutFor(ep, { plan: 40000, fact: 30000, bonus: 1400 })).toBe(1050);
    expect(payoutFor(defaultRules(metrics.akb).payout, { plan: 4, fact: 5, bonus: 5000 })).toBe(5000);
    expect(payoutFor({ type: 'items' }, { plan: 4, fact: 3, bonus: 5000, done: 3, total: 4 })).toBe(3750);
  });

  it('новые категории KPI — по словам в названиях групп товаров', () => {
    const groups = ['ПИВО', 'СИДР, МЕДОВУХА', 'Сидр Фасовка', 'Драфт Heineken', 'Фасовка МПК'];
    expect(guessFactRule('План Сидр, руб (порог 90%)', groups)).toEqual({ type: 'revenue', groups: ['сидр'], clients: 'all', measure: 'revenue' });
    expect(guessFactRule('Новые ТТ МПК', groups)).toMatchObject({ type: 'clients', groups: ['мпк'] });
    expect(guessFactRule('План звонков', groups)).toBeNull();
  });

  it('имена: порядок слов, ё, латиница', () => {
    expect(personScore(personWords('Мишина Анастасия'), personWords('Анастасия Мишина'))).toBe(2);
    expect(personScore(personWords('Иванов Пётр'), personWords('Петр Иванов'))).toBe(2);
    expect(personScore(personWords('Иванов Пётр'), personWords('ivanov'))).toBe(1);
    expect(personScore(personWords('Иванов Пётр'), personWords('Петров Иван'))).toBe(0);
  });
});

// ===================== ЗАГРУЗКА ЧЕРЕЗ API =====================

let app: Express;
let c: Awaited<ReturnType<typeof seedCompany>>;
const as = (a?: Actor) => client(app, a);

beforeAll(async () => {
  await resetDatabase();
  app = createApp({ webDistDir: null });
  c = await seedCompany(app);
  await pool.query(`UPDATE users SET display_name = 'Анна Смирнова' WHERE id = $1`, [c.mgr1.id]);
  await pool.query(`UPDATE users SET display_name = 'Петр Иванов' WHERE id = $1`, [c.mgr2.id]);
});

afterAll(async () => {
  await pool.end();
});

const upload = (a: Actor, url: string, file: Buffer, name: string, fields: Record<string, string> = {}) => {
  let r = as(a).upload(url, 'file', file, name);
  for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
  return r;
};

async function month(a: Actor, userId: number, m = '2026-05') {
  const r = await as(a).get(`/api/kpi/month?user=${userId}&month=${m}`);
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  const by = Object.fromEntries(r.body.targets.map((t: any) => [t.kpi_kind, t]));
  return { ...r.body, by };
}

/** Текущий месяц (ГГГГ-ММ) — свой KPI сотрудник видит только за него. */
const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

describe('KPI: файл KPI и ежедневные отчёты', () => {
  let stout = 0;
  let bochk = 0;

  it('файл KPI: предпросмотр подсказывает сотрудника и месяц, загрузка — за месяц из файла', async () => {
    const preview = await upload(c.sales, '/api/kpi/import', kpiFile({ name: 'Анна' }), 'kpi.xlsx', { dryRun: '1' });
    expect(preview.status, JSON.stringify(preview.body)).toBe(200);
    expect(preview.body).toMatchObject({ dryRun: true, employeeName: 'Анна', month: '2026-05', suggestedUser: { id: c.mgr1.id } });
    expect(preview.body.metrics.find((m: any) => m.kind === 'ep').rule).toContain('3,5% от продаж');

    // Цель, созданная вручную в том же месяце, при загрузке файла не пропадает.
    const manual = await as(c.sales).post('/api/kpi/sales/targets/assign', {
      user_id: c.mgr1.id, product_name: 'Договоры', metric_type: 'contracts', target_value: 3, period_start: '2026-05-03', period_end: '2026-05-31',
    });
    expect(manual.status).toBe(201);

    const r = await upload(c.sales, '/api/kpi/import', kpiFile({ name: 'Анна', yesNo: true }), 'kpi.xlsx', { userId: String(c.mgr1.id) });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toMatchObject({ imported: 8, month: '2026-05' });
    const m = await month(c.sales, c.mgr1.id);
    expect(m.targets).toHaveLength(9);
    expect(m.targets.some((t: any) => /гсм/i.test(t.product_name))).toBe(false);
    // Факт, процент и «к выплате» — из файла KPI.
    expect(m.by.baltika).toMatchObject({ source: 'kpi_file', target_value: '100000.00', current_value: '95000.00' });
    expect(m.by.baltika.calc).toMatchObject({ source: 'file', percent: 95, now: 12000, condition: 'порог 90%, При выполнении 80-90% кэф 0,5' });
    expect(m.coverage).toBeNull();
    expect(m.stats).toBeNull();
    expect(m.totals).toMatchObject({ fixed: 30000, file: 55950 });
    const distra = m.targets.filter((t: any) => t.kpi_kind === 'distra');
    expect(distra[0].calc).toMatchObject({ percent: 50, now: 2500 });
    expect(distra[0].calc.items.map((i: any) => i.done)).toEqual([true, false, true, false]);
    // «Да» без галочек — процент выполнения из файла.
    expect(distra[1]).toMatchObject({ product_name: 'Дистра Хайнекен', unit: '%' });
    expect(distra[1].calc).toMatchObject({ percent: 80, now: 2400, items: null, hint: 'Позиции: Охота Крепкое, Бочкарев светлое' });
    expect(m).toMatchObject({ canEdit: true, canSwitchMonth: true, can: { reports: true, kpiFile: true, assign: true } });

    // Чужому сотруднику и без прав — нельзя; себе — тоже нельзя.
    expect((await upload(c.acc, '/api/kpi/import', kpiFile({ name: 'Анна' }), 'kpi.xlsx', { userId: String(c.mgr1.id) })).status).toBe(403);
    expect((await upload(c.mgr1, '/api/kpi/import', kpiFile({ name: 'Анна' }), 'kpi.xlsx', { dryRun: '1' })).status).toBe(403);
    expect((await upload(c.sales, '/api/kpi/import', kpiFile({ name: 'Анна' }), 'kpi.xlsx', { userId: String(c.sales.id) })).status).toBe(403);
  });

  it('сотрудник видит свой KPI только за текущий месяц и сам KPI не ставит', async () => {
    const own = await as(c.mgr1).get('/api/kpi/month?month=2026-05');
    expect(own.status).toBe(200);
    expect(own.body).toMatchObject({ month: thisMonth(), canSwitchMonth: false, months: [], canEdit: false, can: { reports: false, kpiFile: false, assign: false } });

    const body = { product_name: 'Свой план', metric_type: 'quantity', target_value: 10 };
    expect((await as(c.mgr1).post('/api/kpi/sales/targets', body)).status).toBe(403);
    expect((await as(c.mgr1).post('/api/kpi/sales/targets/assign', { ...body, user_id: c.mgr1.id })).status).toBe(403);
    expect((await as(c.sales).post('/api/kpi/sales/targets/assign', { ...body, user_id: c.sales.id })).status).toBe(403);
    // Директор себе может.
    expect((await as(c.dir).post('/api/kpi/sales/targets', body)).status).toBe(201);

    // План KPI из файла сотрудник не меняет и выполнение вручную не ставит.
    const m = await month(c.sales, c.mgr1.id);
    expect((await as(c.mgr1).patch(`/api/kpi/sales/targets/${m.by.baltika.id}`, { current_value: 100000 })).status).toBe(403);
    expect((await as(c.mgr1).patch(`/api/kpi/sales/targets/${m.by.baltika.id}`, { target_value: 1 })).status).toBe(403);
    expect((await as(c.mgr1).delete(`/api/kpi/sales/targets/${m.by.baltika.id}`)).status).toBe(403);
    // Цель, назначенную вручную без отчёта, сотрудник отмечает сам.
    const contracts = m.targets.find((t: any) => t.product_name === 'Договоры');
    const done = await as(c.mgr1).patch(`/api/kpi/sales/targets/${contracts.id}`, { current_value: 1 });
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect(done.body.current_value).toBe('1.00');
  });

  it('отчёт о продажах заполняет квадратики и ручные цели, KPI из файла не меняет', async () => {
    // Цели по отчёту: штуки товара и точки, купившие товар.
    const a = await as(c.sales).post('/api/kpi/sales/targets/assign', {
      user_id: c.mgr1.id, product_name: 'Балтика Stout', metric_type: 'quantity', target_value: 4, period_start: '2026-05-01', period_end: '2026-05-31', from_report: true,
    });
    expect(a.status, JSON.stringify(a.body)).toBe(201);
    expect(a.body.fact_rule).toEqual({ type: 'products', query: 'Балтика Stout', measure: 'quantity' });
    stout = a.body.id;
    const b = await as(c.sales).post('/api/kpi/sales/targets/assign', {
      user_id: c.mgr1.id, product_name: 'Точки Бочкарев', metric_type: 'contracts', target_value: 3, period_start: '2026-05-01', period_end: '2026-05-31',
      fact_rule: { type: 'products', query: 'Бочкарев', measure: 'clients' },
    });
    expect(b.status, JSON.stringify(b.body)).toBe(201);
    bochk = b.body.id;

    const r = await upload(c.sales, '/api/kpi/sales/import-report', salesReport('01.05.2026 - 15.05.2026', mayClients()), 'Отчёт 1-15.xlsx');
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const res = Object.fromEntries(r.body.results.map((x: any) => [x.manager, x]));
    expect(res['Смирнова Анна']).toMatchObject({ status: 'ok', userId: c.mgr1.id, total: 72000, ep: 0, noEp: 72000, updated: true, targetsUpdated: 2 });
    expect(res['Иванов Пётр']).toMatchObject({ status: 'ok', userId: c.mgr2.id, total: 4000 });
    expect(res['Неизвестный Менеджер']).toMatchObject({ status: 'unmatched', userId: null });
    expect(r.body.epListEmpty).toBe(true);
    expect(r.body.report).toMatchObject({ period_start: '2026-05-01', period_end: '2026-05-15', month: '2026-05-01', total_revenue: 79000 });

    const m = await month(c.sales, c.mgr1.id);
    // Квадратики: выручка, АКБ, средняя продажа в день, штуки.
    // Среднее — по рабочим дням (пн–сб): с 1 по 15 мая 2026 — 13 дней (3 и 10 мая — воскресенья).
    expect(m.stats).toMatchObject({ revenue: 72000, akb: 6, perDay: 5538.46, quantity: 108, asOf: '2026-05-15', elapsed: 15, days: 31, workElapsed: 13, workDays: 26, reports: 1 });
    expect(m.coverage).toMatchObject({ asOf: '2026-05-15', elapsed: 15, days: 31, reports: 1 });
    // KPI из файла отчёт не трогает.
    expect(Number(m.by.no_ep.current_value)).toBe(150000);
    expect(Number(m.by.baltika.current_value)).toBe(95000);
    expect(Number(m.by.akb.current_value)).toBe(5);
    // Ручные цели — по отчёту.
    const st = m.targets.find((t: any) => t.id === stout);
    expect(st).toMatchObject({ current_value: '2.00' });
    expect(st.calc).toMatchObject({ source: 'report', tracked: true, percent: 50, asOf: '2026-05-15' });
    expect(m.targets.find((t: any) => t.id === bochk).current_value).toBe('2.00');
    // Цель без отчёта — как отметил сотрудник.
    expect(m.targets.find((t: any) => t.product_name === 'Договоры').current_value).toBe('1.00');
    // Выплаты — из файла, ГСМ не считается.
    expect(m.totals).toMatchObject({ fixed: 30000, now: 55950 });

    // В команде руководителя — выручка по отчёту за текущий месяц (за май отчёта нет).
    const team = await as(c.sales).get('/api/kpi/sales/subordinates');
    expect(team.status).toBe(200);
    expect(team.body.find((u: any) => u.user_id === c.mgr1.id)).toHaveProperty('sales', null);
  });

  it('список «Есть повод» убирает ЕП из АКБ в квадратиках', async () => {
    expect((await as(c.mgr1).post('/api/kpi/client-lists', { kind: 'ep', names: ['ИП Соколова Д.И.'] })).status).toBe(403);
    const add = await as(c.sales).post('/api/kpi/client-lists', { kind: 'ep', names: ['ИП Соколова Д.И.', ' ип  соколова д.и. '] });
    expect(add.status, JSON.stringify(add.body)).toBe(200);
    expect(add.body.added).toBe(1);
    const m = await month(c.sales, c.mgr1.id);
    expect(m.stats).toMatchObject({ revenue: 72000, akb: 4 });
    // KPI из файла — как в файле.
    expect(Number(m.by.ep.current_value)).toBe(30000);
    expect(m.by.ep.calc).toMatchObject({ now: 1050, rule: '3,5% от продаж, если продано от 20 000 ₽' });

    const clients = await as(c.sales).get('/api/kpi/report-clients?month=2026-05');
    const sokol = clients.body.find((x: any) => x.name === 'ИП Соколова Д.И. Ленина 1');
    expect(sokol).toMatchObject({ ep: 'ИП Соколова Д.И.', ep_hint: true });
    expect(clients.body.find((x: any) => x.name === 'ООО "Ромашка"')).toMatchObject({ ep: null, ep_hint: false });
  });

  it('нарастающий отчёт заменяет прежний, частичное пересечение отклоняется', async () => {
    const next = await upload(c.sales, '/api/kpi/sales/import-report', salesReport('01.05.2026 - 16.05.2026', mayClients(1.1)), 'Отчёт 1-16.xlsx');
    expect(next.status, JSON.stringify(next.body)).toBe(200);
    expect(next.body.replaced).toBe(1);
    const m = await month(c.sales, c.mgr1.id);
    expect(m.stats).toMatchObject({ revenue: 79200, perDay: 5657.14, asOf: '2026-05-16', workElapsed: 14, reports: 1 });
    expect(m.coverage).toMatchObject({ asOf: '2026-05-16', reports: 1 });

    const day = await upload(c.sales, '/api/kpi/sales/import-report', salesReport('10.05.2026 - 10.05.2026', mayClients()), 'день.xlsx');
    expect(day.status).toBe(409);
    expect(day.body.error).toContain('10.05');
    expect(day.body.error).toContain('01.05–16.05');
  });

  it('отчёты за отдельные дни складываются', async () => {
    const kpi = await upload(c.sales, '/api/kpi/import', kpiFile({ name: 'Анна', month: '01.06.2026', facts: false }), 'kpi-june.xlsx', { userId: String(c.mgr1.id) });
    expect(kpi.status).toBe(200);
    for (const d of ['01', '02']) {
      const r = await upload(c.sales, '/api/kpi/sales/import-report', salesReport(`${d}.06.2026 - ${d}.06.2026`, mayClients(0.5)), `${d}.xlsx`);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body.replaced).toBe(0);
    }
    const m = await month(c.sales, c.mgr1.id, '2026-06');
    expect(m.stats).toMatchObject({ revenue: 72000, perDay: 36000, quantity: 216, elapsed: 2, workElapsed: 2, reports: 2 });
    expect(m.coverage).toMatchObject({ asOf: '2026-06-02', elapsed: 2, reports: 2 });
    // В файле на начало месяца итогов нет — факта KPI тоже нет.
    expect(m.totals.file).toBeNull();
    expect(Number(m.by.no_ep.current_value)).toBe(0);
  });

  it('менеджер из 1С, которого не нашли, сопоставляется вручную', async () => {
    const before = await as(c.sales).get('/api/kpi/reports/unmatched');
    expect(before.body.map((x: any) => x.name)).toContain('Неизвестный Менеджер');
    expect((await as(c.sales).post('/api/kpi/reports/aliases', { name: 'Неизвестный Менеджер', userId: c.bk.id })).status).toBe(403);
    const r = await as(c.sales).post('/api/kpi/reports/aliases', { name: 'Неизвестный Менеджер', userId: c.mgr2.id });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.months).toBe(2);
    const after = await as(c.sales).get('/api/kpi/reports/unmatched');
    expect(after.body.map((x: any) => x.name)).not.toContain('Неизвестный Менеджер');
    // Следующие отчёты находят его сами.
    const next = await upload(c.sales, '/api/kpi/sales/import-report', salesReport('01.06.2026 - 03.06.2026', mayClients()), '1-3.xlsx');
    expect(next.body.results.find((x: any) => x.manager === 'Неизвестный Менеджер')).toMatchObject({ status: 'ok', userId: c.mgr2.id });
    expect(next.body.replaced).toBe(2);
  });

  it('права: отчёт загружает руководитель, чужие сотрудники пропускаются', async () => {
    expect((await upload(c.mgr1, '/api/kpi/sales/import-report', salesReport('01.07.2026 - 01.07.2026', mayClients()), 'x.xlsx')).status).toBe(403);
    const r = await upload(c.acc, '/api/kpi/sales/import-report', salesReport('01.07.2026 - 01.07.2026', mayClients()), 'x.xlsx');
    expect(r.status).toBe(200);
    expect(r.body.results.find((x: any) => x.manager === 'Смирнова Анна')).toMatchObject({ status: 'forbidden', updated: false });
    // Сохранять нечего — пустой отчёт в истории не появляется.
    expect(r.body.report).toBeNull();
    expect((await as(c.mgr2).get(`/api/kpi/month?user=${c.mgr1.id}&month=2026-05`)).status).toBe(403);
    expect((await as(c.mgr1).get('/api/kpi/reports')).status).toBe(403);
  });

  it('функции включаются сотруднику: оператору — загрузка отчётов, менеджеру — файлы KPI', async () => {
    // Руководитель видит функции подчинённого, сам себе не меняет.
    const list = await as(c.sales).get(`/api/users/${c.mgr2.id}/permissions`);
    expect(list.status).toBe(200);
    expect(list.body.can_edit).toBe(true);
    expect(list.body.items.find((p: any) => p.key === 'sales_reports')).toMatchObject({ default: false, override: null, enabled: false, grantable: true });
    expect((await as(c.mgr1).put(`/api/users/${c.mgr1.id}/permissions`, { permissions: { sales_reports: true } })).status).toBe(403);
    expect((await as(c.acc).put(`/api/users/${c.mgr1.id}/permissions`, { permissions: { sales_reports: true } })).status).toBe(403);
    expect((await as(c.sales).put(`/api/users/${c.mgr2.id}/permissions`, { permissions: { nope: true } })).status).toBe(400);

    // Директор включает загрузку отчётов бухгалтеру (bk) — на всю компанию.
    const on = await as(c.dir).put(`/api/users/${c.bk.id}/permissions`, { permissions: { sales_reports: true } });
    expect(on.status, JSON.stringify(on.body)).toBe(200);
    expect(on.body.items.find((p: any) => p.key === 'sales_reports')).toMatchObject({ override: true, enabled: true });
    const me = await as(c.bk).get('/api/auth/me');
    expect(me.body.permissions).toMatchObject({ sales_reports: true, kpi_files: false, kpi_assign: false });
    const rep = await upload(c.bk, '/api/kpi/sales/import-report', salesReport('01.08.2026 - 01.08.2026', mayClients()), 'aug.xlsx');
    expect(rep.status, JSON.stringify(rep.body)).toBe(200);
    expect(rep.body.results.find((x: any) => x.manager === 'Смирнова Анна')).toMatchObject({ status: 'ok' });

    // Руководитель продаж включает менеджеру файлы KPI — для своего отдела, но не себе.
    expect((await as(c.sales).put(`/api/users/${c.mgr2.id}/permissions`, { permissions: { kpi_files: true } })).status).toBe(200);
    expect((await upload(c.mgr2, '/api/kpi/import', kpiFile({ name: 'Анна', month: '01.07.2026' }), 'k.xlsx', { userId: String(c.mgr1.id) })).status).toBe(200);
    expect((await upload(c.mgr2, '/api/kpi/import', kpiFile({ name: 'Анна', month: '01.07.2026' }), 'k.xlsx', { userId: String(c.mgr2.id) })).status).toBe(403);
    expect((await upload(c.mgr2, '/api/kpi/import', kpiFile({ name: 'Анна', month: '01.07.2026' }), 'k.xlsx', { userId: String(c.bk.id) })).status).toBe(403);
    // Кому можно загрузить файл KPI: менеджеру — отдел руководителя (кроме себя), бухгалтеру — никому.
    const people = (await as(c.mgr2).get('/api/kpi/people?for=kpi_files')).body.map((u: any) => u.user_id);
    expect(people).toEqual(expect.arrayContaining([c.mgr1.id]));
    expect(people).not.toContain(c.mgr2.id);
    expect(people).not.toContain(c.bk.id);
    expect((await as(c.bk).get('/api/kpi/people?for=kpi_files')).body).toEqual([]);
    expect((await as(c.bk).get('/api/kpi/people?for=nope')).status).toBe(400);
    // Функцию, которой нет у самого руководителя, включить нельзя.
    await as(c.dir).put(`/api/users/${c.sales.id}/permissions`, { permissions: { knowledge_manage: false } });
    expect((await as(c.sales).put(`/api/users/${c.mgr2.id}/permissions`, { permissions: { knowledge_manage: true } })).status).toBe(403);
    expect((await as(c.sales).post('/api/knowledge/documents')).status).toBe(403);

    // Отключить руководителю его функцию по должности.
    await as(c.dir).put(`/api/users/${c.sales.id}/permissions`, { permissions: { kpi_assign: false } });
    expect(
      (await as(c.sales).post('/api/kpi/sales/targets/assign', { user_id: c.mgr1.id, product_name: 'X', metric_type: 'quantity', target_value: 1 })).status,
    ).toBe(403);
    // Вернуть «по должности».
    const back = await as(c.dir).put(`/api/users/${c.sales.id}/permissions`, { permissions: { kpi_assign: null, knowledge_manage: null } });
    expect(back.body.items.every((p: any) => p.override === null && p.enabled)).toBe(true);

    // Функции при создании сотрудника.
    const created = await as(c.dir).post('/api/role-tree/users', {
      username: 'oper', email: 'oper@test.ru', password: 'secret-pass', role_node_id: c.nodes.bkNode, permissions: { sales_reports: true },
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const perms = await as(c.dir).get(`/api/users/${created.body.id}/permissions`);
    expect(perms.body.items.find((p: any) => p.key === 'sales_reports')).toMatchObject({ enabled: true, override: true });
    // Чужие функции видят только руководители.
    expect((await as(c.mgr1).get(`/api/users/${created.body.id}/permissions`)).status).toBe(403);
    expect((await as(c.mgr1).get(`/api/users/${created.body.id}`)).body.permissions).toBeUndefined();
  });

  it('правило выплаты можно поправить; повторная загрузка файла его сохраняет', async () => {
    const m = await month(c.sales, c.mgr1.id);
    const id = m.by.no_ep.id;
    const bad = await as(c.sales).patch(`/api/kpi/sales/targets/${id}`, { payout_rule: { type: 'threshold', steps: [] } });
    expect(bad.status).toBe(400);
    // Сотрудник не меняет правила плана, назначенного руководителем.
    expect((await as(c.mgr1).patch(`/api/kpi/sales/targets/${id}`, { payout_rule: { type: 'none' } })).status).toBe(403);
    const rule = { type: 'threshold', steps: [{ from: 90, k: 1 }, { from: 70, k: 0.7 }], over: 'cap' };
    const r = await as(c.sales).patch(`/api/kpi/sales/targets/${id}`, { payout_rule: rule });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.calc.rule).toBe('от 90% — 30 000 ₽, 70–90% — 21 000 ₽ (× 0,7)');

    await upload(c.sales, '/api/kpi/import', kpiFile({ name: 'Анна' }), 'kpi.xlsx', { userId: String(c.mgr1.id), month: '2026-05' });
    const again = await month(c.sales, c.mgr1.id);
    expect(again.by.no_ep.payout_rule).toEqual(rule);
    expect(again.by.no_ep.rules_custom).toBe(true);
    // Факт после повторной загрузки — из файла KPI.
    expect(Number(again.by.no_ep.current_value)).toBe(150000);
    expect(again.targets.filter((t: any) => t.product_name === 'Договоры')).toHaveLength(1);
    expect(again.targets.find((t: any) => t.id === stout).current_value).toBe('2.00');
  });

  it('удалённый отчёт: квадратики и цели по отчёту обнуляются, KPI из файла остаётся', async () => {
    const list = await as(c.sales).get('/api/kpi/reports?month=2026-05');
    expect(list.status).toBe(200);
    for (const rep of list.body) expect((await as(c.sales).delete(`/api/kpi/reports/${rep.id}`)).status).toBe(200);
    const m = await month(c.sales, c.mgr1.id);
    expect(m.coverage).toBeNull();
    expect(m.stats).toBeNull();
    expect(m.targets.find((t: any) => t.id === stout).current_value).toBe('0.00');
    expect(Number(m.by.no_ep.current_value)).toBe(150000);
    expect(Number(m.by.baltika.current_value)).toBe(95000);
  });
});
