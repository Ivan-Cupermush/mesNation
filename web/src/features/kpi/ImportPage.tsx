import { useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, FileCheck, FileSpreadsheet, ListChecks, Trash2, Upload, UserRound, Users, XCircle } from 'lucide-react';
import { useMe } from '../auth/AuthProvider';
import { isManager } from '../auth/roles';
import { api, upload, UploadCancelled } from '../../lib/http';
import { formatDate, formatSize, plural } from '../../lib/format';
import { Avatar } from '../../ui/Avatar';
import { Button, IconButton } from '../../ui/Button';
import { Page, PageBody, PageHeader } from '../../ui/Page';
import { Spinner } from '../../ui/Spinner';
import { useFeedback } from '../../ui/feedback';
import { monthKey, monthTitle, money, number, reportPeriod } from './format';
import { kpiTitle } from './KpiCard';
import { kpiKeys, useImportHistory, useKpiRefresh, useSalesReports, useSubordinates, useUnmatchedManagers } from './queries';
import type { ImportPreview, ImportResult, KpiFilePreview, KpiTarget, MappingField, ReportImportResult, ReportManagerResult } from './types';
import { TeamPicker } from './TeamPicker';
import s from './ImportPage.module.css';

type Mode = 'sales' | 'report' | 'plan' | 'kpi';

const MODES: { key: Mode; title: string; text: string; icon: ReactNode; manager?: boolean }[] = [
  { key: 'report', title: 'Отчёт о продажах', text: 'Ежедневный отчёт из 1С «По менеджерам» — обновит KPI всей команды', icon: <Users size={20} />, manager: true },
  { key: 'kpi', title: 'Файл KPI сотрудника', text: 'План, бонусы и правила выплат на месяц (или итоги месяца)', icon: <UserRound size={20} />, manager: true },
  { key: 'sales', title: 'Мои продажи', text: 'Строки продаж: товар, количество, сумма, дата, клиент', icon: <FileSpreadsheet size={20} /> },
  { key: 'plan', title: 'KPI по листам', text: 'Файл, где каждый лист — KPI отдельного сотрудника', icon: <ListChecks size={20} />, manager: true },
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
  // Руководителю по умолчанию — ежедневный отчёт о продажах.
  const mode: Mode = requested && MODES.some((m) => m.key === requested && (!m.manager || manager)) ? requested : manager ? 'report' : 'sales';
  const setMode = (m: Mode) => setParams({ type: m }, { replace: true });

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

const FILE_ACCEPT = '.xlsx,.xls,.xlsm,.ods';

function EmployeeKpiImport() {
  const { toast } = useFeedback();
  const navigate = useNavigate();
  const refresh = useKpiRefresh();
  const [params] = useSearchParams();
  const preset = Number(params.get('user')) || 0;
  const { busy, progress, run } = useUpload<KpiFilePreview>();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<KpiFilePreview | null>(null);
  const [person, setPerson] = useState<{ id: number; name: string } | null>(null);
  const [month, setMonth] = useState('');
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ imported: number; replaced: number; month: string; kpis: KpiTarget[]; person: { id: number; name: string } } | null>(null);
  // Ссылка «Файл KPI» из карточки сотрудника — имя берём из списка команды.
  const team = useSubordinates('month', preset > 0).data;

  const pick = async (f: File) => {
    const r = await run('/api/kpi/import', f, { dryRun: 1 }, 'Не удалось прочитать файл KPI');
    if (!r) return;
    setFile(f);
    setPreview(r);
    setMonth(r.month);
    const fromLink = preset ? team?.find((m) => m.user_id === preset) : null;
    setPerson(
      preset
        ? { id: preset, name: fromLink ? fromLink.display_name || fromLink.username : r.suggestedUser?.id === preset ? r.suggestedUser.name : 'Сотрудник' }
        : r.suggestedUser,
    );
  };

  const save = async () => {
    if (!file || !person || !preview) return;
    setSaving(true);
    try {
      const r = await upload<{ imported: number; replaced: number; month: string; kpis: KpiTarget[] }>('/api/kpi/import', 'file', file, file.name, { userId: person.id, month }).promise;
      setResult({ ...r, person });
      refresh();
    } catch (e) {
      toast.error(e, 'Не удалось загрузить KPI');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setResult(null);
    setPreview(null);
    setFile(null);
  };

  if (result) {
    const total = result.kpis.reduce((sum, k) => sum + (k.calc.now ?? 0), 0);
    return (
      <Done
        title={`KPI на ${monthTitle(result.month)} загружен`}
        text={`${result.person.name}: ${result.imported} ${plural(result.imported, ['показатель', 'показателя', 'показателей'])}${result.replaced ? ` (заменено прежних: ${result.replaced})` : ''}`}
        onAgain={reset}
      >
        <div className={s.tableWrap}>
          <table className={[s.table, s.wrap].join(' ')}>
            <thead>
              <tr>
                <th>Показатель</th>
                <th>План</th>
                <th>Факт</th>
                <th>Заработано</th>
              </tr>
            </thead>
            <tbody>
              {result.kpis.map((k) => (
                <tr key={k.id}>
                  <td>
                    {kpiTitle(k)}
                    <span className={s.sub}>{k.calc.tracked ? 'факт по отчётам о продажах' : k.calc.rule || 'без выплаты'}</span>
                  </td>
                  <td>{number(k.target_value)}</td>
                  <td>{number(k.current_value)}</td>
                  <td>{k.calc.now != null ? money(k.calc.now) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={s.muted}>Сейчас к выплате: {money(total)}. Факт будет обновляться после каждой загрузки отчёта о продажах.</p>
        <Button variant="soft" onClick={() => navigate(`/stats/employee/${result.person.id}?month=${result.month}`)}>
          Открыть KPI сотрудника
        </Button>
      </Done>
    );
  }

  if (preview) {
    return (
      <>
        <div className={s.card}>
          <span className={s.label}>Сотрудник</span>
          <button type="button" className={s.person} onClick={() => setPicking(true)} disabled={saving}>
            {person ? (
              <>
                <Avatar name={person.name} size={34} />
                <b>{person.name}</b>
              </>
            ) : (
              <span className={s.muted}>Выберите сотрудника из своей команды</span>
            )}
          </button>
          {preview.employeeName && (
            <p className={s.muted}>
              В файле: «{preview.employeeName}»{preview.suggestedUser ? '' : ' — сотрудник с таким именем не найден, выберите вручную'}.
            </p>
          )}
          <label className={s.label} htmlFor="kpi-month">
            Месяц
          </label>
          <input id="kpi-month" type="month" className={s.select} value={month} onChange={(e) => setMonth(e.target.value)} />
          <p className={s.muted}>
            {preview.monthFromFile ? `Месяц из файла: ${monthTitle(preview.monthFromFile)}.` : 'В файле нет даты — проверьте месяц.'}{' '}
            {preview.hasResults ? 'В файле есть итоги месяца (к выплате).' : 'В файле только план — итогов нет.'} Показатели из файла KPI за этот месяц
            будут заменены, цели, созданные вручную, останутся.
          </p>
        </div>
        {preview.warnings.length > 0 && <Warnings title="Проверьте файл" lines={preview.warnings} />}
        <div className={s.tableWrap}>
          <table className={[s.table, s.wrap].join(' ')}>
            <thead>
              <tr>
                <th>Показатель</th>
                <th>План</th>
                <th>Бонус</th>
                <th>Как считается</th>
              </tr>
            </thead>
            <tbody>
              {preview.metrics.map((m, i) => (
                <tr key={i}>
                  <td>
                    {kpiTitle({ product_name: m.name, kpi_kind: m.kind })}
                    {m.items.length > 0 && <span className={s.sub}>{m.items.map((it) => `${it.name} — ${it.need} ТТ`).join('; ')}</span>}
                  </td>
                  <td>{number(m.plan)}</td>
                  <td>{m.bonus ? money(m.bonus) : '—'}</td>
                  <td>
                    {FACT_TEXT[m.factRule.type]}
                    <span className={s.sub}>{m.rule}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={s.actions}>
          <Button variant="secondary" onClick={reset} disabled={saving}>
            Другой файл
          </Button>
          <Button icon={<Upload size={16} />} loading={saving} disabled={!person || !month} onClick={save}>
            Загрузить KPI
          </Button>
        </div>
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

  return (
    <>
      <DropZone accept={FILE_ACCEPT} busy={busy} progress={progress} onFile={pick} hint="Файл KPI: показатели со строками «план», «факт», «бонус», «к выплате»" />
      <p className={s.muted}>
        Сначала покажем, что нашли в файле: сотрудника, месяц и показатели — с правилами выплат из их названий («порог 90%, при 80–90% кэф 0,5»).
        Правило любого показателя потом можно поправить в карточке KPI.
      </p>
    </>
  );
}

const FACT_TEXT: Record<string, string> = {
  revenue: 'по отчёту: продажи',
  clients: 'по отчёту: точки',
  items: 'по отчёту: позиции',
  manual: 'вручную / из файла',
};

// ---------- Ежедневный отчёт о продажах ----------

function ManagerReportImport() {
  const { toast, confirm } = useFeedback();
  const navigate = useNavigate();
  const refresh = useKpiRefresh();
  const { busy, progress, run } = useUpload<ReportImportResult>();
  const [result, setResult] = useState<ReportImportResult | null>(null);
  const [mapping, setMapping] = useState<string | null>(null);
  const reports = useSalesReports('', !result);
  const unmatched = useUnmatchedManagers(!result);

  const pick = async (file: File) => {
    const r = await run('/api/kpi/sales/import-report', file, {}, 'Не удалось обработать отчёт');
    if (r) {
      setResult(r);
      refresh();
    }
  };

  const assign = async (name: string, user: { id: number; name: string }) => {
    try {
      const r = await api.post<{ months: number; targets: number }>('/api/kpi/reports/aliases', { name, userId: user.id });
      toast.success(`«${name}» — это ${user.name}. Пересчитано показателей: ${r.targets}`);
      setResult((prev) =>
        prev && {
          ...prev,
          results: prev.results.map((x): ReportManagerResult => (x.manager === name ? { ...x, user: user.name, userId: user.id, status: 'ok', error: undefined, updated: r.targets > 0, targetsUpdated: r.targets } : x)),
        },
      );
      refresh();
    } catch (e) {
      toast.error(e, 'Не удалось сопоставить');
    }
  };

  const removeReport = async (id: number, label: string) => {
    const ok = await confirm({ title: `Удалить отчёт за ${label}?`, text: 'Факт KPI пересчитается без него.', confirmText: 'Удалить', danger: true });
    if (!ok) return;
    try {
      await api.delete(`/api/kpi/reports/${id}`);
      refresh();
      toast.success('Отчёт удалён');
    } catch (e) {
      toast.error(e, 'Не удалось удалить отчёт');
    }
  };

  const picker = (
    <TeamPicker
      open={!!mapping}
      title={mapping ? `Кто в 1С «${mapping}»?` : ''}
      onClose={() => setMapping(null)}
      onPick={(u) => {
        const name = mapping!;
        setMapping(null);
        assign(name, u);
      }}
    />
  );

  if (result) {
    const rows = result.results;
    const ok = rows.filter((r) => r.status === 'ok').length;
    const rep = result.report;
    return (
      <Done
        title={rep ? `Отчёт за ${reportPeriod(rep.period_start, rep.period_end)} загружен` : 'Нечего загружать'}
        text={
          rep
            ? `Выручка ${money(rep.total_revenue)} · менеджеров найдено: ${ok} из ${rows.length}${result.replaced ? ` · заменён прежний отчёт за этот период` : ''}`
            : 'В отчёте нет ваших сотрудников'
        }
        onAgain={() => setResult(null)}
      >
        {result.epListEmpty && (
          <Warnings
            title="Список «Есть повод» пуст"
            lines={['Пока он пуст, вся выручка считается в «без ЕП», а «Есть повод» — ноль. Добавьте клиентов сети на странице «Клиенты для KPI».']}
          />
        )}
        {result.warnings.length > 0 && <Warnings title="Проверьте отчёт" lines={result.warnings} />}
        <div className={s.tableWrap}>
          <table className={[s.table, s.wrap].join(' ')}>
            <thead>
              <tr>
                <th>Менеджер в 1С</th>
                <th>Выручка</th>
                <th>Есть повод</th>
                <th>KPI</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.manager}>
                  <td>
                    {r.manager}
                    {r.user && <span className={s.sub}>{r.user}</span>}
                  </td>
                  <td>{money(r.total)}</td>
                  <td>{r.ep ? money(r.ep) : '—'}</td>
                  <td className={r.status === 'ok' ? s.good : s.bad}>
                    <div className={s.cellAction}>
                      {r.status === 'ok' ? (r.updated ? `обновлено показателей: ${r.targetsUpdated}` : 'нет KPI за этот месяц') : r.error}
                      {(r.status === 'unmatched' || r.status === 'ambiguous') && (
                        <Button size="sm" variant="soft" onClick={() => setMapping(r.manager)}>
                          Выбрать сотрудника
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rep && (
          <Button variant="soft" icon={<Users size={16} />} onClick={() => navigate('/stats/clients')}>
            Клиенты «Есть повод»
          </Button>
        )}
        {picker}
      </Done>
    );
  }

  return (
    <>
      <DropZone
        accept={FILE_ACCEPT}
        busy={busy}
        progress={progress}
        onFile={pick}
        hint="Отчёт 1С «Валовая прибыль» с разделом «По менеджерам» — за день или с начала месяца"
      />
      <p className={s.muted}>
        Подходят оба варианта: отчёт с 1-го числа по сегодня (каждый новый заменяет прежний) или отчёт за один день (дни складываются). Факт всех KPI
        команды — продажи с «Есть повод» и без, Балтика, ОПХ, АКБ, дистрибуция — пересчитается сразу.
      </p>
      {(unmatched.data?.length ?? 0) > 0 && (
        <section className={s.section}>
          <h2>Не найдены среди сотрудников</h2>
          <div className={s.list}>
            {unmatched.data!.map((u) => (
              <div key={u.manager_key} className={s.historyRow}>
                <span className={s.fileIcon} data-status="pending">
                  <UserRound size={18} />
                </span>
                <div className={s.historyBody}>
                  <b>{u.name}</b>
                  <span>
                    {u.revenue != null ? money(u.revenue) : '—'} · последний отчёт по {reportPeriod(u.last_date, u.last_date)}
                  </span>
                </div>
                <Button size="sm" variant="soft" onClick={() => setMapping(u.name)}>
                  Выбрать
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}
      {(reports.data?.length ?? 0) > 0 && (
        <section className={s.section}>
          <h2>Загруженные отчёты</h2>
          <div className={s.list}>
            {reports.data!.slice(0, 31).map((r) => {
              const label = reportPeriod(r.period_start, r.period_end);
              return (
                <div key={r.id} className={s.historyRow}>
                  <span className={s.fileIcon}>
                    <FileSpreadsheet size={18} />
                  </span>
                  <div className={s.historyBody}>
                    <b title={r.file_name}>
                      {label} · {monthTitle(r.month)}
                    </b>
                    <span>
                      {formatDate(r.created_at, true)}
                      {r.uploaded_by_name ? ` · ${r.uploaded_by_name}` : ''}
                      {r.unmatched ? ` · не найдено менеджеров: ${r.unmatched}` : ''}
                    </span>
                  </div>
                  <b className={s.accent}>{money(r.total_revenue)}</b>
                  <IconButton label={`Удалить отчёт за ${label}`} size={34} onClick={() => removeReport(r.id, label)}>
                    <Trash2 size={16} />
                  </IconButton>
                </div>
              );
            })}
          </div>
        </section>
      )}
      {picker}
    </>
  );
}

// ---------- KPI по листам ----------

interface PlanRow {
  employee: string;
  sheet?: string;
  user?: string;
  month?: string;
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
    const r = await run('/api/kpi/sales/import-kpi-plan', file, {}, 'Не удалось обработать файл');
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
                  <th>Лист</th>
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
                    <td className={r.error ? s.bad : s.good}>
                      {r.error || `${r.month ? `${monthTitle(r.month)}: ` : ''}показателей ${r.created ?? 0}${r.updated ? `, заменено ${r.updated}` : ''}`}
                    </td>
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
      <DropZone accept={FILE_ACCEPT} busy={busy} progress={progress} onFile={pick} hint="Каждый лист — файл KPI сотрудника: имя, месяц и показатели" />
      <p className={s.muted}>
        Сотрудник — по имени на листе (только из вашей команды), месяц — из даты в файле, иначе текущий ({monthTitle(monthKey())}). Показатели из файла
        KPI за месяц заменяются, цели, созданные вручную, остаются.
      </p>
    </>
  );
}
