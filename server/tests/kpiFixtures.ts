import * as XLSX from 'xlsx';

/**
 * Синтетические файлы в формате заказчика (настоящие отчёты в репозиторий не кладём):
 * отчёт 1С «Валовая прибыль» (клиент → «По менеджерам» → менеджер → группы → товары)
 * и файл KPI сотрудника (план/факт/%/бонус/к выплате).
 */

export interface Sale {
  /** Группы сверху вниз: ['ПИВО', 'Пиво разливное', 'Драфт Балтика']. */
  path: string[];
  name: string;
  qty: number;
  rev: number;
  article?: string;
}

export interface ClientSales {
  client: string;
  managers: { name: string; sales: Sale[] }[];
}

const sum = (sales: Sale[], k: 'qty' | 'rev') => Math.round(sales.reduce((s, x) => s + x[k], 0) * 100) / 100;

/** Отчёт о продажах. levels=false — как старый .xls без уровней группировки. */
export function salesReport(period: string, clients: ClientSales[], levels = true): Buffer {
  const rows: unknown[][] = [];
  const meta: XLSX.RowInfo[] = [];
  const push = (row: unknown[], level?: number) => {
    rows.push(row);
    meta.push(level ? { level } : {});
  };
  push(['В отчет выведены результаты предварительного закрытия месяца.']);
  push([]);
  push(['Валовая прибыль предприятия ']);
  push([]);
  push(['Параметры:', '', `Период: ${period}`]);
  push([]);
  push(['Клиент', '', '', '', '', '', 'Количество', 'Выручка']);
  push(['Менеджер']);
  push(['Артикул', '', '', 'Номенклатура, Характеристика']);
  let qty = 0;
  let rev = 0;
  for (const c of clients) {
    const all = c.managers.flatMap((m) => m.sales);
    push([c.client, '', '', '', '', '', sum(all, 'qty'), sum(all, 'rev')]);
    push(['По менеджерам'], 1);
    for (const m of c.managers) {
      push([`${m.name} `, '', '', '', '', '', sum(m.sales, 'qty'), sum(m.sales, 'rev')], 1);
      // Группы в порядке первого появления, с суммами вложенных товаров.
      const emit = (prefix: string[], sales: Sale[]) => {
        const depth = prefix.length;
        const here = sales.filter((s) => s.path.length === depth);
        const groups = [...new Set(sales.filter((s) => s.path.length > depth).map((s) => s.path[depth]))];
        for (const g of groups) {
          const inner = sales.filter((s) => s.path.length > depth && s.path[depth] === g);
          push(['', '', '', g, '', '', sum(inner, 'qty'), sum(inner, 'rev')], depth + 1);
          emit([...prefix, g], inner);
        }
        for (const s of here) push([s.article ?? '                         ', '', '', `${s.name}, `, '', '', s.qty, s.rev], depth + 1);
      };
      emit([], m.sales);
    }
    qty += sum(all, 'qty');
    rev += sum(all, 'rev');
  }
  push(['Итого', '', '', '', '', '', qty, Math.round(rev * 100) / 100]);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  if (levels) ws['!rows'] = meta;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Лист_1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/** Файл KPI сотрудника в виде, как его ведёт заказчик (с опечаткой «Есть Подод»). */
export function kpiFile(opts: { name: string; month?: Date | number | string; facts?: boolean } = { name: 'Анна' }): Buffer {
  const f = opts.facts !== false;
  const v = (n: number | string) => (f ? n : '');
  const rows: unknown[][] = [
    [opts.name, '', '', ''],
    [opts.month ?? 46143, '', '', `Факт ${opts.name}`],
    ['Оклад ', '', 30000, v(30000)],
    ['ГСМ', '', 8000, v(8000)],
    ['АКБ  (Порог 100%), ТТ (без учета ЕП и задвоенных: Егорова, Морозов и пр)', 'план, ТТ', 4, 4],
    ['', 'факт', 4, v(5)],
    ['', '% выполнения', 1, v(1.25)],
    ['', 'бонус', 5000, v(5000)],
    ['', 'к выплате', 5000, v(5000)],
    ['Дистра Балтика:', 'план, ТТ', 'да', 'да'],
    ['Балтика Стаут кег - 1 ТТ V', 'факт', 'да', v('да')],
    ['Крон Бланш - 1 ТТ X', '% выполнения', 1, v(1)],
    ['Балтика Хеллес - 1 ТТ V', 'бонус', 5000, v(5000)],
    ['Балтика 0 any - 2 ТТ (1) X', 'к выплате', 5000, v(2500)],
    ['План Балтика, руб (порог 90%, При выполнении 80-90% кэф 0,5)', 'план, ТТ', 100000, 100000],
    ['', 'факт', 100000, v(95000)],
    ['', '% выполнения', 1, v(0.95)],
    ['', 'бонус', 12000, v(12000)],
    ['', 'к выплате', 12000, v(12000)],
    ['План ОПХ, руб (порог 90%, При выполнении 80-90% кэф 0,5)', 'план, ТТ', 50000, 50000],
    ['', 'факт', 50000, v(42000)],
    ['', '% выполнения', 1, v(0.84)],
    ['', 'бонус', 6000, v(6000)],
    ['', 'к выплате', 6000, v(3000)],
    ['', '', 66000, v(64000)],
    [],
    ['Продажи Есть Подод, руб (Порог 20 000 руб)', 'факт', 40000, 40000],
    ['', 'факт', 40000, v(30000)],
    ['', ' % ', 0.035, 0.035],
    ['', 'бонус', 1400, v(1050)],
    ['', 'к выплате', 1400, v(1050)],
    ['План продаж без ЕП, руб (Порог 90%, При выполнении 80-90% кэф 0,5)', 'факт', 200000, 200000],
    ['', 'факт', 200000, v(150000)],
    ['', 'выполнение %', 1, v(0.75)],
    ['', 'бонус', 30000, v(30000)],
    ['', 'к выплате', 30000, v(0)],
    ['', 'Итого', 110000, v(100000)],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Лист1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

const BALTIKA_DRAFT = ['ПИВО', 'Пиво разливное', 'Россия', 'Драфт Балтика'];
const BALTIKA_PACK = ['ПИВО', 'Пиво фасованное', 'Россия', 'Фасовка Балтика'];
const HEINEKEN = ['ПИВО', 'Пиво фасованное', 'Россия', 'Фасовка Heineken'];
const CRAFT = ['ПИВО КРАФТОВОЕ', 'Крафт Фасовка', 'Фасовка JAWS'];
const CIDER = ['СИДР, МЕДОВУХА', 'Сидр Фасовка'];

/**
 * Продажи за май. Анна Смирнова (в 1С — «Смирнова Анна»): пять клиентов,
 * два из них — точки сети «Есть повод» (ИП Соколова), один задвоен (Егорова).
 * Пётр Иванов (в 1С — «Иванов Пётр») и менеджер, которого нет в Offix.
 */
export function mayClients(scale = 1): ClientSales[] {
  const s = (n: number) => Math.round(n * scale * 100) / 100;
  return [
    {
      client: 'ООО "Ромашка"',
      managers: [
        {
          name: 'Смирнова Анна',
          sales: [
            { path: BALTIKA_DRAFT, name: 'Пиво Балтика Stout тм. КЕГ 30л', qty: 2, rev: s(20000), article: 'ЦБ-00000724' },
            { path: BALTIKA_PACK, name: 'Пиво Балтика №0  Б/А 0,5 ст.б.*20', qty: 10, rev: s(5000), article: '00001111' },
            { path: CRAFT, name: 'Пиво Jaws Вайцен 0,5 ст.б.*20', qty: 5, rev: s(3000) },
          ],
        },
        { name: 'Иванов Пётр', sales: [{ path: CIDER, name: 'Сидр "Дальняя дача" №1 0,5 ст.б.*8', qty: 8, rev: s(4000) }] },
      ],
    },
    {
      client: 'ИП Соколова Д.И. Ленина 1',
      managers: [
        {
          name: 'Смирнова Анна',
          sales: [
            { path: BALTIKA_DRAFT, name: 'МЕТАЛ КЕГ (ЕстьПовод) Пивной напиток Blanche biere КЕГ 30л', qty: 2, rev: s(7000), article: 'ЦБ-1' },
            { path: HEINEKEN, name: 'Пиво Бочкарев светлое 0,45 ж.б.*24', qty: 24, rev: s(9000), article: '00002222' },
          ],
        },
      ],
    },
    {
      client: 'ИП Соколова Д.И. Мира 2',
      managers: [{ name: 'Смирнова Анна', sales: [{ path: HEINEKEN, name: 'Пиво Бочкарев светлое 0,45 ж.б.*24', qty: 24, rev: s(9000) }] }],
    },
    {
      client: 'ИП Егорова А.А. магазин',
      managers: [{ name: 'Смирнова Анна', sales: [{ path: BALTIKA_PACK, name: 'Пиво Балтика Хеллес 0,45 ст.б.*20', qty: 20, rev: s(6000) }] }],
    },
    {
      client: 'ИП Егорова А.А. склад',
      managers: [{ name: 'Смирнова Анна', sales: [{ path: BALTIKA_DRAFT, name: 'Пиво Балтика Helles КЕГ 30л', qty: 1, rev: s(5000) }] }],
    },
    {
      client: 'ООО "Василёк"',
      managers: [
        { name: 'Смирнова Анна', sales: [{ path: BALTIKA_PACK, name: 'Пив нап Krone Blanche Biere 0,45 ст.б.*20', qty: 20, rev: s(8000) }] },
        { name: 'Неизвестный Менеджер', sales: [{ path: CIDER, name: 'Сидр "Дальняя дача" №2 0,5 ст.б.*8', qty: 8, rev: s(3000) }] },
      ],
    },
  ];
}
