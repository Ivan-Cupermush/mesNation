import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ChevronLeft, ChevronRight, FileSpreadsheet, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useMe } from '../auth/AuthProvider';
import { isManager } from '../auth/roles';
import { api, uploadFile } from '../../lib/http';
import { formatSize, plural } from '../../lib/format';
import { Button, IconButton } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { Chips, SearchField, Segmented, TextArea } from '../../ui/Field';
import { Page, PageBody, PageHeader } from '../../ui/Page';
import { PageLoader } from '../../ui/Spinner';
import { useFeedback } from '../../ui/feedback';
import { monthKey, monthTitle, moneyShort, shiftMonth } from './format';
import { kpiKeys, useClientLists, useReportClients } from './queries';
import type { ClientLists } from './types';
import s from './kpi.module.css';
import c from './clients.module.css';

type Kind = 'ep' | 'akb_merge';

const ABOUT: Record<Kind, { title: string; text: string; add: string }> = {
  ep: {
    title: 'Есть повод',
    text:
      'Выручка этих клиентов идёт в показатель «Продажи Есть повод», а не в «План продаж без ЕП», и не считается в АКБ. ' +
      'Можно указать часть названия: «ИП Соколов Д.И.» — все его точки.',
    add: 'Добавить в «Есть повод»',
  },
  akb_merge: {
    title: 'Задвоенные',
    text: 'Клиенты, которые в 1С записаны несколько раз (разные юрлица одной точки). В АКБ все клиенты с таким названием считаются одной точкой.',
    add: 'Добавить в задвоенные',
  },
};

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Списки клиентов для KPI: сеть «Есть повод» и задвоенные клиенты. После любой
 * правки факт KPI команды пересчитывается по уже загруженным отчётам.
 */
export default function ClientListsPage() {
  const me = useMe();
  const qc = useQueryClient();
  const { toast, confirm } = useFeedback();
  const [kind, setKind] = useState<Kind>('ep');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [month, setMonth] = useState(monthKey());
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'hint' | 'listed'>('all');
  const fileInput = useRef<HTMLInputElement>(null);
  const lists = useClientLists();
  const clients = useReportClients(month, q.trim());

  const apply = (next: ClientLists) => {
    qc.setQueryData(kpiKeys.lists, next);
    qc.invalidateQueries({ queryKey: kpiKeys.all });
  };

  const add = async (names: string[]) => {
    if (!names.length) return;
    setBusy(true);
    try {
      const r = await api.post<{ added: number; targets: number; lists: ClientLists }>('/api/kpi/client-lists', { kind, names });
      apply(r.lists);
      setText('');
      toast.success(r.added ? `Добавлено: ${r.added}. KPI пересчитан.` : 'Эти клиенты уже в списке');
    } catch (e) {
      toast.error(e, 'Не удалось добавить');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number, pattern: string) => {
    const ok = await confirm({ title: `Убрать «${pattern}» из списка?`, text: 'KPI команды пересчитаются по загруженным отчётам.', confirmText: 'Убрать', danger: true });
    if (!ok) return;
    try {
      const r = await api.delete<{ lists: ClientLists }>(`/api/kpi/client-lists/${id}`);
      apply(r.lists);
    } catch (e) {
      toast.error(e, 'Не удалось убрать');
    }
  };

  const importFile = async (file?: File | null) => {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error(`Файл больше ${formatSize(MAX_BYTES)}`);
      return;
    }
    setBusy(true);
    try {
      const r = await uploadFile<{ found: number; added: number; lists: ClientLists }>('/api/kpi/client-lists/import', 'file', file, { kind });
      apply(r.lists);
      toast.success(`В файле ${r.found} ${plural(r.found, ['название', 'названия', 'названий'])}, добавлено ${r.added}. KPI пересчитан.`);
    } catch (e) {
      toast.error(e, 'Не удалось загрузить список');
    } finally {
      setBusy(false);
    }
  };

  const entries = lists.data?.[kind] ?? [];
  const shown = useMemo(() => {
    const all = clients.data ?? [];
    const listed = (r: (typeof all)[number]) => (kind === 'ep' ? r.ep : r.merge);
    if (filter === 'hint') return all.filter((r) => r.ep_hint && !listed(r));
    if (filter === 'listed') return all.filter(listed);
    return all;
  }, [clients.data, filter, kind]);
  const hints = (clients.data ?? []).filter((r) => r.ep_hint && !r.ep).length;

  if (!isManager(me)) {
    return (
      <Page>
        <PageHeader title="Клиенты для KPI" back={true} />
        <EmptyState title="Нет доступа" text="Списки клиентов ведут руководители." />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader title="Клиенты для KPI" subtitle="«Есть повод» и задвоенные клиенты" back={true} />
      <PageBody narrow>
        <div className={c.stack}>
          <Segmented
            options={[
              { key: 'ep', label: `Есть повод${lists.data ? ` · ${lists.data.ep.length}` : ''}` },
              { key: 'akb_merge', label: `Задвоенные${lists.data ? ` · ${lists.data.akb_merge.length}` : ''}` },
            ]}
            value={kind}
            onChange={(k) => {
              setKind(k);
              setFilter('all');
            }}
          />
          <p className={s.muted}>{ABOUT[kind].text}</p>

          <div className={s.card}>
            <TextArea
              label="Названия клиентов — по одному на строку"
              placeholder={kind === 'ep' ? 'ИП Соколов Д.И.\nИП Воронцова В.Ю.' : 'Егорова\nМорозов'}
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxRows={8}
            />
            <div className={c.row}>
              <Button icon={<Plus size={16} />} loading={busy} disabled={!text.trim()} onClick={() => add(text.split('\n').map((x) => x.trim()).filter(Boolean))}>
                Добавить
              </Button>
              <Button variant="soft" icon={<FileSpreadsheet size={16} />} disabled={busy} onClick={() => fileInput.current?.click()}>
                Из файла Excel
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept=".xlsx,.xls,.csv,.txt,.ods"
                hidden
                onChange={(e) => {
                  importFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </div>
          </div>

          <section className={s.section}>
            <div className={s.sectionHead}>
              <h2>
                В списке
                <span className={s.count}>{entries.length}</span>
              </h2>
            </div>
            {lists.isLoading ? (
              <PageLoader />
            ) : entries.length ? (
              <div className={s.listCard}>
                {entries.map((e) => (
                  <div key={e.id} className={c.entry}>
                    <span>{e.pattern}</span>
                    <IconButton label={`Убрать «${e.pattern}»`} size={34} onClick={() => remove(e.id, e.pattern)}>
                      <Trash2 size={16} />
                    </IconButton>
                  </div>
                ))}
              </div>
            ) : (
              <p className={s.muted}>Список пуст.{kind === 'ep' ? ' Пока он пуст, вся выручка считается в «без ЕП».' : ''}</p>
            )}
          </section>

          <section className={s.section}>
            <div className={s.sectionHead}>
              <h2>Клиенты из отчётов</h2>
              <div className={c.month}>
                <IconButton label="Предыдущий месяц" size={32} onClick={() => setMonth(shiftMonth(month, -1))}>
                  <ChevronLeft size={18} />
                </IconButton>
                <span>{monthTitle(month)}</span>
                <IconButton label="Следующий месяц" size={32} onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= monthKey()}>
                  <ChevronRight size={18} />
                </IconButton>
              </div>
            </div>
            <SearchField value={q} onChange={setQ} placeholder="Найти клиента" />
            <Chips
              options={[
                { key: 'all', label: 'Все' },
                ...(kind === 'ep' ? [{ key: 'hint' as const, label: `Похожи на «Есть повод»${hints ? ` · ${hints}` : ''}` }] : []),
                { key: 'listed', label: 'Уже в списке' },
              ]}
              value={filter}
              onChange={setFilter}
            />
            {clients.isLoading ? (
              <PageLoader />
            ) : shown.length ? (
              <div className={s.listCard}>
                {shown.slice(0, 300).map((r) => {
                  const listed = kind === 'ep' ? r.ep : r.merge;
                  return (
                    <div key={r.name} className={c.client}>
                      <div>
                        <b>{r.name}</b>
                        <span>
                          {r.revenue != null ? moneyShort(r.revenue) : '—'} · {r.managers.join(', ')}
                          {r.ep_hint && (
                            <em className={c.hint}>
                              <Sparkles size={12} /> покупал товары «ЕстьПовод»
                            </em>
                          )}
                        </span>
                      </div>
                      {listed ? (
                        <span className={c.listed} title={`В списке как «${listed}»`}>
                          <Check size={15} /> в списке
                        </span>
                      ) : (
                        <Button size="sm" variant="soft" disabled={busy} onClick={() => add([r.name])}>
                          В список
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className={s.muted}>{q ? 'Никого не нашли.' : `За ${monthTitle(month)} отчётов о продажах нет.`}</p>
            )}
          </section>
        </div>
      </PageBody>
    </Page>
  );
}
