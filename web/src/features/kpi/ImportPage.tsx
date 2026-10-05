import { useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, FileCheck, FileSpreadsheet, ListChecks, Upload, UserRound, Users, XCircle } from 'lucide-react';
import { useMe } from '../auth/AuthProvider';
import { isManager } from '../auth/roles';
import { api, upload, UploadCancelled } from '../../lib/http';
import { formatDate, formatSize, plural } from '../../lib/format';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Page, PageBody, PageHeader } from '../../ui/Page';
import { Spinner } from '../../ui/Spinner';
import { useFeedback } from '../../ui/feedback';
import { money, number, toNum } from './format';
import { kpiKeys, useImportHistory, useKpiRefresh } from './queries';
import type { ImportPreview, ImportResult, MappingField, SalesTarget } from './types';
import { TeamPicker } from './TeamPicker';
import s from './ImportPage.module.css';

type Mode = 'sales' | 'report' | 'plan' | 'kpi';

const MODES: { key: Mode; title: string; text: string; icon: ReactNode; manager?: boolean }[] = [
  { key: 'sales', title: 'Мои продажи', text: 'Строки продаж: товар, количество, сумма, дата, клиент', icon: <FileSpreadsheet size={20} /> },
  { key: 'kpi', title: 'KPI сотрудника', text: 'План, факт, % выполнения, бонус и выплата по каждому показателю', icon: <UserRound size={20} />, manager: true },
  { key: 'report', title: 'Отчёт по менеджерам', text: 'Отчёт продаж с разделом «По менеджерам» — обновит факт KPI команды', icon: <Users size={20} />, manager: true },
  { key: 'plan', title: 'План KPI по листам', text: 'Каждый лист — сотрудник и его показатели план/факт', icon: <ListChecks size={20} />, manager: true },
];

const FIELDS: { key: MappingField; label: string; required?: boolean }[] = [
  { key: 'product_name', label: 'Товар', required: true },
  { key: 'quantity', label: 'Количество' },
  { key: 'amount', label: 'Сумма' },
  { key: 'transaction_date', label: 'Дата' },
  { key: 'client_name', label: 'Клиент' },
  { key: 'notes', label: 'Комментарий' },
];

const MAX_BYTES = 20 * 1024 * 1024;
const cell = (v: unknown) => {
  const str = v == null ? '' : String(v);
  return str.length > 40 ? `${str.slice(0, 39)}…` : str;
};

/**
 * Импорт из Excel — как в приложении (файл продаж → предпросмотр → импорт),
 * плюс то, что сервер умеет для руководителя: файл KPI сотрудника, отчёт
 * по менеджерам и план KPI по листам. На сайте можно поправить, какая
 * колонка что означает.
 */
export default function ImportPage() {
  const me = useMe();
  const manager = isManager(me);
  const [params, setParams] = useSearchParams();
  const requested = params.get('type') as Mode | null;
  const mode: Mode = requested && MODES.some((m) => m.key === requested && (!m.manager || manager)) ? requested : 'sales';
  const setMode = (m: Mode) => setParams(m === 'sales' ? {} : { type: m }, { replace: true });

  return (
    <Page>
      <PageHeader title="Импорт из Excel" subtitle="Загрузка KPI и отчётов продаж" back={true} />
      <PageBody narrow>
        {manager && (
          <div className={s.modes} role="tablist">
            {MODES.map((m) => (
              <button key={m.key} type="button" role="tab" aria-selected={mode === m.key} className={[s.mode, mode === m.key && s.modeActive].filter(Boolean).join(' ')} onClick={() => setMode(m.key)}>
                <span className={s.modeIcon}>{m.icon}</span>
                <b>{m.title}</b>
                <span>{m.text}</span>
              </button>
            ))}
          </div>
        )}
        {mode === 'sales' && <SalesImport key="sales" />}
        {mode === 'kpi' && <EmployeeKpiImport key="kpi" />}
        {mode === 'report' && <ManagerReportImport key="report" />}
        {mode === 'plan' && <KpiPlanImport key="plan" />}
      </PageBody>
    </Page>
  );
}

// ---------- Общие части ----------

/** Поле выбора файла: кнопка и перетаскивание, с прогрессом загрузки. */
function DropZone({ accept, busy, progress, onFile, hint }: { accept: string; busy: boolean; progress?: number; onFile: (f: File) => void; hint: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const { toast } = useFeedback();
  const take = (f?: File | null) => {
    if (!f || busy) return;
    if (f.size > MAX_BYTES) {
      toast.error(`Файл больше ${formatSize(MAX_BYTES)}`);
      return;
    }
    onFile(f);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    take(e.dataTransfer.files?.[0]);
  };
  return (
    <div
      className={[s.drop, over && s.dropOver].filter(Boolean).join(' ')}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <span className={s.dropIcon}>{busy ? <Spinner size={28} /> : <FileSpreadsheet size={34} />}</span>
      {busy ? (
        <>
          <b>Загружаем и читаем файл…</b>
          {progress != null && (
            <div className={s.progress}>
              <span style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          )}
        </>
      ) : (
        <>
          <b>Перетащите файл сюда</b>
          <span className={s.muted}>{hint}</span>
          <Button icon={<Upload size={16} />} onClick={() => input.current?.click()}>
            Выбрать файл
          </Button>
        </>
      )}
      <input
        ref={input}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          take(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}

/** Загрузка с прогрессом; отмена при уходе со страницы не нужна — файлы небольшие. */
function useUpload<T>() {
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | undefined>();
  const run = async (path: string, file: File, fields: Record<string, string | number> = {}, failText = 'Не удалось прочитать файл'): Promise<T | null> => {
    setBusy(true);
    setProgress(0);
    try {
      return await upload<T>(path, 'file', file, file.name, fields, setProgress).promise;
    } catch (e) {
      if (!(e instanceof UploadCancelled)) toast.error(e, failText);
      return null;
    } finally {
      setBusy(false);
      setProgress(undefined);
    }
  };
  return { busy, progress, run };
}

function Done({ title, text, children, onAgain }: { title: string; text?: string; children?: ReactNode; onAgain: () => void }) {
  const navigate = useNavigate();
  return (
    <div className={s.card}>
      <div className={s.doneHead}>
        <span className={s.doneIcon}>
          <CheckCircle2 size={30} />
        </span>
        <div>
          <b>{title}</b>
          {text && <span>{text}</span>}
        </div>
      </div>
      {children}
      <div className={s.actions}>
        <Button variant="secondary" onClick={onAgain}>
          Загрузить ещё
        </Button>
        <Button onClick={() => navigate('/stats')}>К статистике</Button>
      </div>
    </div>
  );
}

// ---------- Мои продажи ----------

function SalesImport() {
  const { toast } = useFeedback();
  const refresh = useKpiRefresh();
  const qc = useQueryClient();
  const history = useImportHistory();
  const { busy, progress, run } = useUpload<ImportPreview>();
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<Record<MappingField, string | null> | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const pick = async (file: File) => {
    const p = await run('/api/kpi/sales/import/preview', file);
    if (!p) return;
    setPreview(p);
    setMapping({ ...p.suggestedMapping });
    qc.invalidateQueries({ queryKey: kpiKeys.imports });
  };

  const reset = () => {
    setPreview(null);
    setMapping(null);
    setResult(null);
  };

  const confirm = async () => {
    if (!preview || !mapping?.product_name) return;
    setSaving(true);
    try {
      const r = await api.post<ImportResult>('/api/kpi/sales/import/confirm', { importId: preview.importId, mapping });
      setResult(r);
      refresh();
    } catch (e) {
      toast.error(e, 'Не удалось сохранить данные');
    } finally {
      setSaving(false);
    }
  };

  // Сколько строк из предпросмотра будут пропущены при выбранной колонке товара.
  const missing = useMemo(() => {
    if (!preview || !mapping?.product_name) return 0;
    return preview.preview.filter((row) => !String(row[mapping.product_name!] ?? '').trim()).length;
  }, [preview, mapping]);
  const mappedBy = useMemo(() => {
    const m = new Map<string, string>();
    if (mapping) for (const f of FIELDS) if (mapping[f.key]) m.set(mapping[f.key]!, f.label);
    return m;
  }, [mapping]);

  if (result) {
    return (
      <Done title="Импорт завершён" text={`Продажи из «${preview?.fileName}» добавлены в статистику`} onAgain={reset}>
        <div className={s.results}>
          <div>
            <CheckCircle2 size={18} />
            <b>{number(result.imported)}</b>
            <span>добавлено</span>
          </div>
          <div>
            <XCircle size={18} />
            <b>{number(result.skipped)}</b>
            <span>пропущено</span>
          </div>
          <div>
            <FileSpreadsheet size={18} />
            <b>{money(result.totalAmount)}</b>
            <span>сумма</span>
          </div>
        </div>
        {result.errors.length > 0 && <Warnings title="Пропущенные строки" lines={result.errors} />}
      </Done>
    );
  }

  if (preview && mapping) {
    const sameAmount = mapping.amount === preview.suggestedMapping.amount;
    return (
      <>
        <div className={s.card}>
          <div className={s.fileRow}>
            <span className={s.fileIcon}>
              <FileCheck size={20} />
            </span>
            <b title={preview.fileName}>{preview.fileName}</b>
            <Button size="sm" variant="ghost" onClick={reset}>
              Другой файл
            </Button>
          </div>
          <div className={s.stats}>
            <div>
              <span>Строк</span>
              <b>{number(preview.totalRows)}</b>
            </div>
            <div>
              <span>Сумма</span>
              <b className={s.accent}>{sameAmount ? money(preview.totalAmount) : '—'}</b>
            </div>
            <div>
              <span>Колонок</span>
              <b>{preview.headers.length}</b>
            </div>
          </div>
        </div>

        <section className={s.section}>
          <h2>Что в каких колонках</h2>
          <p className={s.muted}>Мы угадали колонки по заголовкам — проверьте и при необходимости поправьте.</p>
          <div className={s.mapping}>
            {FIELDS.map((f) => (
              <label key={f.key} className={s.mapField}>
                <span>
                  {f.label}
                  {f.required && <i> *</i>}
                </span>
                <select
                  className={s.select}
                  value={mapping[f.key] ?? ''}
                  onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value || null })}
                  aria-invalid={f.required && !mapping[f.key] ? true : undefined}
                >
                  <option value="">{f.required ? 'Выберите колонку' : 'Не загружать'}</option>
                  {preview.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </section>

        <section className={s.section}>
          <h2>
            Предпросмотр <span className={s.muted}>{Math.min(preview.preview.length, 5)} из {number(preview.totalRows)}</span>
          </h2>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  {preview.headers.map((h) => (
                    <th key={h} className={mappedBy.has(h) ? s.mapped : undefined}>
                      {mappedBy.has(h) && <span className={s.tag}>{mappedBy.get(h)}</span>}
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.preview.map((row, i) => (
                  <tr key={i}>
                    {preview.headers.map((h) => (
                      <td key={h} className={mappedBy.has(h) ? s.mapped : undefined}>
                        {cell(row[h])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {!mapping.product_name ? (
          <Warnings title="Укажите колонку с товаром" lines={['Без названия товара строки не загрузятся.']} />
        ) : missing > 0 ? (
          <Warnings title="Есть строки без товара" lines={[`В предпросмотре: ${missing} из ${preview.preview.length}. Такие строки будут пропущены.`]} />
        ) : sameAmount && preview.validation.errors.length > 0 ? (
          <Warnings title="Найдены ошибки" lines={[...preview.validation.errors.slice(0, 3), 'Эти строки будут пропущены при импорте.']} />
        ) : null}

        <Button block size="lg" loading={saving} disabled={!mapping.product_name} icon={<CheckCircle2 size={18} />} onClick={confirm}>
          Импортировать {number(preview.totalRows)} {plural(preview.totalRows, ['строку', 'строки', 'строк'])}
        </Button>
      </>
    );
  }

  return (
    <>
      <DropZone accept=".xlsx,.xls,.csv,.ods" busy={busy} progress={progress} onFile={pick} hint="Таблица с продажами: .xlsx, .xls или .csv, до 20 МБ" />
      {(history.data?.length ?? 0) > 0 && (
        <section className={s.section}>
          <h2>Загруженные файлы</h2>
          <div className={s.list}>
            {history.data!.map((h) => (
              <div key={h.id} className={s.historyRow}>
                <span className={s.fileIcon} data-status={h.status}>
                  <FileSpreadsheet size={18} />
                </span>
                <div className={s.historyBody}>
                  <b title={h.file_name}>{h.file_name}</b>
                  <span>
                    {formatDate(h.created_at, true)}
                    {' · '}
                    {h.status === 'completed'
                      ? `добавлено ${number(h.imported_rows)}${h.skipped_rows ? `, пропущено ${number(h.skipped_rows)}` : ''}`
                      : h.status === 'pending'
                        ? 'не завершён'
                        : 'ошибка'}
                  </span>
                </div>
                {h.status === 'completed' && <b className={s.accent}>{money(h.total_amount)}</b>}
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function Warnings({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className={s.warning}>
      <b>
        <AlertTriangle size={17} />
        {title}
      </b>
      <ul>
        {lines.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
    </div>
  );
}

// ---------- KPI сотрудника (файл план/факт/бонус) ----------

interface EmployeeKpiResult {
  success: boolean;
  imported: number;
  employeeName: string;
  kpis: SalesTarget[];
}

function EmployeeKpiImport() {
  const { confirm } = useFeedback();
  const refresh = useKpiRefresh();
  const { busy, progress, run } = useUpload<EmployeeKpiResult>();
  const [person, setPerson] = useState<{ id: number; name: string } | null>(null);
  const [picking, setPicking] = useState(false);
  const [result, setResult] = useState<EmployeeKpiResult | null>(null);

  const pick = async (file: File) => {
    if (!person) return;
    const ok = await confirm({
      title: `Загрузить KPI для ${person.name}?`,
      text: 'KPI сотрудника за текущий месяц будут заменены показателями из файла.',
      confirmText: 'Загрузить',
    });
    if (!ok) return;
    const r = await run('/api/kpi/import', file, { userId: person.id }, 'Не удалось загрузить KPI');
    if (r) {
      setResult(r);
      refresh();
    }
  };

  if (result) {
    const mismatch = result.employeeName && person && !person.name.toLowerCase().includes(result.employeeName.toLowerCase().split(' ')[0]);
    return (
      <Done title={`Загружено ${result.imported} ${plural(result.imported, ['показатель', 'показателя', 'показателей'])}`} text={person ? `KPI: ${person.name}` : undefined} onAgain={() => setResult(null)}>
        {mismatch && <Warnings title="Проверьте сотрудника" lines={[`В файле указан «${result.employeeName}», а загружено для «${person!.name}».`]} />}
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Показатель</th>
                <th>План</th>
                <th>Факт</th>
                <th>%</th>
                <th>Бонус</th>
                <th>К выплате</th>
              </tr>
            </thead>
            <tbody>
              {result.kpis.map((k) => (
                <tr key={k.id}>
                  <td>{k.product_name}</td>
                  <td>{number(k.target_value)}</td>
                  <td>{number(k.current_value)}</td>
                  <td>{number(k.target_percent)}</td>
                  <td>{toNum(k.bonus_amount) ? money(k.bonus_amount) : '—'}</td>
                  <td>{toNum(k.payment_amount) ? money(k.payment_amount) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Done>
    );
  }

  return (
    <>
      <div className={s.card}>
        <span className={s.label}>Сотрудник</span>
        <button type="button" className={s.person} onClick={() => setPicking(true)} disabled={busy}>
          {person ? (
            <>
              <Avatar name={person.name} size={34} />
              <b>{person.name}</b>
            </>
          ) : (
            <span className={s.muted}>Выберите сотрудника из своей команды</span>
          )}
        </button>
      </div>
      {person ? (
        <DropZone accept=".xlsx,.xls,.ods" busy={busy} progress={progress} onFile={pick} hint="Файл KPI: строки «план», «факт», «% выполнения», «бонус», «к выплате»" />
      ) : (
        <p className={s.muted}>Сначала выберите сотрудника — показатели из файла станут его KPI на текущий месяц.</p>
      )}
      <TeamPicker
        open={picking}
        onClose={() => setPicking(false)}
        onPick={(p) => {
          setPerson(p);
          setPicking(false);
        }}
      />
    </>
  );
}

// ---------- Отчёт по менеджерам ----------

interface ReportRow {
  manager: string;
  user?: string;
  total: number;
  ep: number;
  noEp: number;
  updated: boolean;
  targetsUpdated?: number;
  error?: string;
}

function ManagerReportImport() {
  const refresh = useKpiRefresh();
  const { busy, progress, run } = useUpload<{ success: boolean; results: ReportRow[] }>();
  const [rows, setRows] = useState<ReportRow[] | null>(null);

  const pick = async (file: File) => {
    const r = await run('/api/kpi/sales/import-report', file, {}, 'Не удалось обработать отчёт');
    if (r) {
      setRows(r.results);
      refresh();
    }
  };

  if (rows) {
    const ok = rows.filter((r) => r.updated).length;
    return (
      <Done
        title={rows.length ? `Обновлено: ${ok} из ${rows.length}` : 'Менеджеры не найдены'}
        text={rows.length ? 'Факт KPI «без ЕП» и «есть повод» обновлён по отчёту' : 'В отчёте нет раздела «По менеджерам»'}
        onAgain={() => setRows(null)}
      >
        {rows.length > 0 && (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Менеджер</th>
                  <th>Всего</th>
                  <th>Есть повод</th>
                  <th>Без ЕП</th>
                  <th>Результат</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.manager}>
                    <td>
                      {r.manager}
                      {r.user && r.user !== r.manager && <span className={s.sub}>{r.user}</span>}
                    </td>
                    <td>{money(r.total)}</td>
                    <td>{money(r.ep)}</td>
                    <td>{money(r.noEp)}</td>
                    <td className={r.error || !r.updated ? s.bad : s.good}>{r.error || (r.updated ? `обновлено целей: ${r.targetsUpdated}` : 'нет подходящих целей')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Done>
    );
  }

  return (
    <>
      <DropZone accept=".xlsx,.xls,.ods" busy={busy} progress={progress} onFile={pick} hint="Отчёт продаж с разделом «По менеджерам» и строкой «Период: дд.мм.гггг - дд.мм.гггг»" />
      <p className={s.muted}>
        Для каждого менеджера из отчёта найдём сотрудника по имени и обновим выполнение его целей с «без ЕП» и «есть повод» в названии. Обновляются только ваши подчинённые.
      </p>
    </>
  );
}

// ---------- План KPI по листам ----------

interface PlanRow {
  employee: string;
  user?: string;
  created?: number;
  updated?: number;
  kpis?: number;
  error?: string;
}

function KpiPlanImport() {
  const refresh = useKpiRefresh();
  const { busy, progress, run } = useUpload<{ success: boolean; results: PlanRow[] }>();
  const [rows, setRows] = useState<PlanRow[] | null>(null);

  const pick = async (file: File) => {
    const r = await run('/api/kpi/sales/import-kpi-plan', file, {}, 'Не удалось обработать план');
    if (r) {
      setRows(r.results);
      refresh();
    }
  };

  if (rows) {
    const ok = rows.filter((r) => !r.error).length;
    return (
      <Done title={rows.length ? `Загружено: ${ok} из ${rows.length}` : 'Листы с сотрудниками не найдены'} onAgain={() => setRows(null)}>
        {rows.length > 0 && (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Сотрудник</th>
                  <th>Результат</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.employee}-${i}`}>
                    <td>
                      {r.employee}
                      {r.user && r.user !== r.employee && <span className={s.sub}>{r.user}</span>}
                    </td>
                    <td className={r.error ? s.bad : s.good}>{r.error || `новых целей: ${r.created ?? 0}, обновлено: ${r.updated ?? 0}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Done>
    );
  }

  return (
    <>
      <DropZone accept=".xlsx,.xls,.ods" busy={busy} progress={progress} onFile={pick} hint="Каждый лист: имя сотрудника, затем показатели со строками «план» и «факт»" />
      <p className={s.muted}>Цели с таким же названием обновятся, новые — добавятся на 30 дней. Загружать можно только для своих подчинённых.</p>
    </>
  );
}
