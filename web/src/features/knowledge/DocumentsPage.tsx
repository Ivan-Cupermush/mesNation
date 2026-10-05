import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Clock, FileText, Loader2, RotateCcw, Tag, Trash2, Upload, X } from 'lucide-react';
import { useMe } from '../auth/AuthProvider';
import { isManager } from '../auth/roles';
import { api, upload } from '../../lib/http';
import { formatDate, formatSize, plural } from '../../lib/format';
import { Button, IconButton } from '../../ui/Button';
import { Chips, TextArea, TextField } from '../../ui/Field';
import { EmptyState } from '../../ui/EmptyState';
import { Modal } from '../../ui/Modal';
import { Page, PageBody, PageHeader } from '../../ui/Page';
import { Spinner } from '../../ui/Spinner';
import { useFeedback } from '../../ui/feedback';
import { kbKeys, useKbDocuments, useKbStats } from './queries';
import type { DocStatus, KbDocument } from './types';
import s from './knowledge.module.css';

const ACCEPT = '.pdf,.docx,.doc,.txt,.md';
const MAX_BYTES = 20 * 1024 * 1024;

const STATUS: Record<DocStatus, { label: string; icon: ReactNode }> = {
  pending: { label: 'В очереди', icon: <Clock size={14} /> },
  processing: { label: 'Обрабатывается', icon: <Loader2 size={14} className={s.spin} /> },
  completed: { label: 'Готов', icon: <CheckCircle2 size={14} /> },
  failed: { label: 'Ошибка', icon: <AlertCircle size={14} /> },
};

type Filter = 'all' | 'completed' | 'progress' | 'failed';

/**
 * Документы базы знаний: из них ассистент берёт ответы. Видят все,
 * загружают и удаляют директор и руководители (как на сервере).
 */
export default function DocumentsPage() {
  const me = useMe();
  const admin = isManager(me);
  const qc = useQueryClient();
  const { confirm, toast } = useFeedback();
  const { data, isLoading, error, refetch } = useKbDocuments();
  const stats = useKbStats(admin);
  const [filter, setFilter] = useState<Filter>('all');
  const [tag, setTag] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const docs = useMemo(() => {
    let list = data ?? [];
    if (filter === 'completed') list = list.filter((d) => d.status === 'completed');
    if (filter === 'progress') list = list.filter((d) => d.status === 'pending' || d.status === 'processing');
    if (filter === 'failed') list = list.filter((d) => d.status === 'failed');
    if (tag) list = list.filter((d) => d.tags?.includes(tag));
    return list;
  }, [data, filter, tag]);
  const failed = data?.filter((d) => d.status === 'failed').length ?? 0;
  const inProgress = data?.filter((d) => d.status === 'pending' || d.status === 'processing').length ?? 0;

  const remove = async (d: KbDocument) => {
    if (!(await confirm({ title: `Удалить «${d.original_name}»?`, text: 'Ассистент перестанет опираться на этот документ.', confirmText: 'Удалить', danger: true }))) return;
    try {
      await api.delete(`/api/knowledge/documents/${d.id}`);
      qc.setQueryData(kbKeys.documents, (old: KbDocument[] | undefined) => old?.filter((x) => x.id !== d.id));
      qc.invalidateQueries({ queryKey: kbKeys.stats });
      toast.success('Документ удалён');
    } catch (e) {
      toast.error(e, 'Не удалось удалить документ');
    }
  };

  const reprocess = async (d: KbDocument) => {
    try {
      const fresh = await api.post<KbDocument>(`/api/knowledge/documents/${d.id}/reprocess`);
      qc.setQueryData(kbKeys.documents, (old: KbDocument[] | undefined) => old?.map((x) => (x.id === d.id ? { ...x, ...fresh } : x)));
      toast.success('Документ поставлен в очередь на обработку');
    } catch (e) {
      toast.error(e, 'Не удалось запустить обработку');
    }
  };

  const total = data?.length ?? 0;
  const st = stats.data;
  return (
    <Page>
      <PageHeader
        title="Документы базы знаний"
        subtitle={
          st
            ? `${total} ${plural(total, ['документ', 'документа', 'документов'])} · ${st.total_chunks} ${plural(st.total_chunks, ['фрагмент', 'фрагмента', 'фрагментов'])} · ${st.messages_by_role.user ?? 0} ${plural(st.messages_by_role.user ?? 0, ['вопрос', 'вопроса', 'вопросов'])}`
            : data
              ? `${total} ${plural(total, ['документ', 'документа', 'документов'])}`
              : undefined
        }
        back="/knowledge"
        actions={
          admin ? (
            <Button size="sm" icon={<Upload size={16} />} onClick={() => setUploadOpen(true)}>
              Загрузить
            </Button>
          ) : undefined
        }
      >
        {total > 0 && (
          <div className={s.docFilters}>
            <Chips
              value={filter}
              onChange={setFilter}
              options={[
                { key: 'all', label: 'Все' },
                { key: 'completed', label: 'Готовы' },
                { key: 'progress', label: `В обработке${inProgress ? ` ${inProgress}` : ''}` },
                { key: 'failed', label: `Ошибки${failed ? ` ${failed}` : ''}` },
              ]}
            />
            {tag && (
              <button type="button" className={s.tagFilter} onClick={() => setTag(null)}>
                <Tag size={13} />
                {tag}
                <X size={13} />
              </button>
            )}
          </div>
        )}
      </PageHeader>
      <PageBody narrow>
        {isLoading ? (
          <div className={s.center}>
            <Spinner />
          </div>
        ) : error ? (
          <EmptyState title="Не удалось загрузить документы" action={<Button onClick={() => refetch()}>Повторить</Button>} />
        ) : total === 0 ? (
          <EmptyState
            icon={<FileText size={40} />}
            title="Документов пока нет"
            text={admin ? 'Загрузите регламенты, инструкции и ответы на частые вопросы — ассистент будет отвечать по ним.' : 'Руководители загрузят сюда документы компании, и ассистент будет отвечать по ним.'}
            action={
              admin ? (
                <Button icon={<Upload size={16} />} onClick={() => setUploadOpen(true)}>
                  Загрузить документ
                </Button>
              ) : undefined
            }
          />
        ) : docs.length === 0 ? (
          <EmptyState compact title="Ничего не найдено" />
        ) : (
          <ul className={s.docs}>
            {docs.map((d) => {
              const meta = STATUS[d.status] ?? STATUS.pending;
              return (
                <li key={d.id} className={s.doc}>
                  <span className={s.docIcon}>
                    <FileText size={20} />
                  </span>
                  <div className={s.docBody}>
                    <b title={d.original_name}>{d.original_name}</b>
                    <span className={s.docMeta}>
                      {formatSize(d.file_size)} · {formatDate(d.created_at)}
                      {d.uploaded_by_name ? ` · ${d.uploaded_by_name}` : ''}
                    </span>
                    {d.description && <p className={s.docDesc}>{d.description}</p>}
                    <div className={s.docTags}>
                      <span className={s.status} data-status={d.status}>
                        {meta.icon}
                        {meta.label}
                        {d.status === 'completed' && d.chunks_count ? ` · ${d.chunks_count} ${plural(d.chunks_count, ['фрагмент', 'фрагмента', 'фрагментов'])}` : ''}
                      </span>
                      {(d.tags ?? []).map((t) => (
                        <button key={t} type="button" className={s.tag} onClick={() => setTag(t)}>
                          #{t}
                        </button>
                      ))}
                    </div>
                    {d.status === 'failed' && d.error_message && <p className={s.docError}>{d.error_message}</p>}
                    {admin && d.status === 'failed' && (
                      <Button size="sm" variant="soft" icon={<RotateCcw size={15} />} className={s.retryDoc} onClick={() => reprocess(d)}>
                        Обработать снова
                      </Button>
                    )}
                  </div>
                  {admin && (
                    <IconButton label="Удалить документ" size={36} onClick={() => remove(d)}>
                      <Trash2 size={17} />
                    </IconButton>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </PageBody>
      {admin && <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />}
    </Page>
  );
}

/** Загрузка документа: файл, теги, описание. Обработка идёт на сервере в фоне. */
function UploadDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useFeedback();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [tags, setTags] = useState('');
  const [description, setDescription] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');

  const reset = () => {
    setFile(null);
    setTags('');
    setDescription('');
    setProgress(null);
    setError('');
  };
  const close = () => {
    if (progress != null) return;
    reset();
    onClose();
  };

  const pick = (f?: File | null) => {
    if (!f) return;
    const ext = f.name.split('.').pop()?.toLowerCase() || '';
    if (!ACCEPT.split(',').includes(`.${ext}`)) {
      setError('Поддерживаются PDF, Word (.docx, .doc), .txt и .md');
      return;
    }
    if (f.size > MAX_BYTES) {
      setError(`Файл больше ${formatSize(MAX_BYTES)}`);
      return;
    }
    setError('');
    setFile(f);
  };

  const submit = async () => {
    if (!file) {
      setError('Выберите файл');
      return;
    }
    const list = [...new Set(tags.split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean))];
    if (list.length > 20 || list.some((t) => t.length > 50)) {
      setError('Не больше 20 тегов, каждый до 50 символов');
      return;
    }
    setProgress(0);
    try {
      await upload('/api/knowledge/documents', 'file', file, file.name, { tags: JSON.stringify(list), description: description.trim() || undefined }, setProgress).promise;
      qc.invalidateQueries({ queryKey: kbKeys.documents });
      qc.invalidateQueries({ queryKey: kbKeys.stats });
      toast.success('Документ загружен — обработка займёт немного времени');
      setProgress(null);
      reset();
      onClose();
    } catch (e) {
      setProgress(null);
      toast.error(e, 'Не удалось загрузить документ');
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Новый документ"
      size="md"
      persistent={progress != null}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={progress != null}>
            Отмена
          </Button>
          <Button onClick={submit} loading={progress != null} disabled={!file}>
            Загрузить
          </Button>
        </>
      }
    >
      <div className={s.uploadForm}>
        <button
          type="button"
          className={[s.filePick, error && s.filePickError].filter(Boolean).join(' ')}
          onClick={() => input.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            pick(e.dataTransfer.files?.[0]);
          }}
          disabled={progress != null}
        >
          <FileText size={24} />
          {file ? (
            <span>
              <b>{file.name}</b>
              <small>{formatSize(file.size)}</small>
            </span>
          ) : (
            <span>
              <b>Выберите или перетащите файл</b>
              <small>PDF, Word, .txt или .md — до 20 МБ</small>
            </span>
          )}
        </button>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          hidden
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        {error && <span className={s.formError}>{error}</span>}
        {progress != null && (
          <div className={s.progress}>
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        )}
        <TextField label="Теги" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="отпуск, кадры" hint="Через запятую — по ним удобно искать документы" maxLength={600} />
        <TextArea label="Описание" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Необязательно: о чём документ" maxLength={2000} maxRows={5} />
      </div>
    </Modal>
  );
}
