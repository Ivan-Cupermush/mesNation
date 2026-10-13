import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, BellRing, Check, CopyPlus, EyeOff, Hourglass, NotebookPen, Paperclip, RefreshCw, Send, Trash2, X } from 'lucide-react';
import { api } from '../../lib/http';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Page, PageBody, PageHeader } from '../../ui/Page';
import { Spinner } from '../../ui/Spinner';
import { useFeedback } from '../../ui/feedback';
import { NOTE_COLOR, UNREAD_KEY, type NoteVersionRequest } from './api';
import s from './inbox.module.css';

const when = (iso?: string | null) =>
  iso ? `${new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}, ${new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : '';
const ago = (iso: string) => {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'только что';
  if (min < 60) return `${min} мин назад`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h} ч назад` : when(iso);
};
const firstName = (name?: string | null) => (name || 'Коллега').split(' ')[0];

/**
 * «Поделиться новой версией?» — автор видит, кто просит, что у коллеги
 * сейчас и что он получит, и подтверждает одной кнопкой. Запросивший
 * на этом же адресе видит, ждёт ли он ещё ответа.
 */
export default function NoteRequestPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast, confirm } = useFeedback();
  const [busy, setBusy] = useState<'approve' | 'decline' | null>(null);
  const [justDone, setJustDone] = useState(false);
  const key = ['notifications', 'request', Number(id)];
  const { data: r, error, isLoading } = useQuery({ queryKey: key, queryFn: () => api.get<NoteVersionRequest>(`/api/notes/requests/${id}`) });

  const settle = (next: NoteVersionRequest) => {
    qc.setQueryData(key, next);
    setJustDone(true);
    qc.invalidateQueries({ queryKey: ['notifications', 'list'] });
    qc.invalidateQueries({ queryKey: UNREAD_KEY });
  };

  const approve = async () => {
    if (!r) return;
    setBusy('approve');
    try {
      settle(await api.post<NoteVersionRequest>(`/api/notes/requests/${r.id}/approve`, {}));
    } catch (e) {
      toast.error(e, 'Не удалось поделиться');
    } finally {
      setBusy(null);
    }
  };

  const decline = async () => {
    if (!r) return;
    const ok = await confirm({
      title: 'Отклонить запрос?',
      text: `${firstName(r.requester.name)} получит уведомление, что вы не стали делиться новой версией.`,
      confirmText: 'Отклонить',
      danger: true,
    });
    if (!ok) return;
    setBusy('decline');
    try {
      settle(await api.post<NoteVersionRequest>(`/api/notes/requests/${r.id}/decline`, {}));
    } catch (e) {
      toast.error(e, 'Не удалось отклонить');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Page>
      <PageHeader title={<span className={s.kicker}>Запрос заметки</span>} back="/notifications" />
      <PageBody narrow>
        {isLoading ? (
          <div className={s.center}>
            <Spinner />
          </div>
        ) : error || !r ? (
          <div className={s.center}>Запрос не найден — возможно, его уже удалили.</div>
        ) : r.status !== 'pending' || !r.is_owner ? (
          <Outcome r={r} justDone={justDone} onClose={() => navigate('/notifications')} onOpenNote={(nid) => navigate(`/notes/${nid}`)} />
        ) : (
          <div className={s.request}>
            <div className={s.hero}>
              <span className={s.heroAvatar}>
                <Avatar name={r.requester.name} src={r.requester.avatar_url} size={80} />
                <span className={s.heroBadge}>
                  <RefreshCw size={15} strokeWidth={2.8} />
                </span>
              </span>
              <h2 className={s.question}>Поделиться новой версией?</h2>
              <p className={s.heroSub}>
                <b>{r.requester.name}</b> просит текущую версию вашей заметки · {ago(r.created_at)}
              </p>
            </div>

            <div className={[s.rcard, s.rcardNow].join(' ')}>
              <div className={s.rlabel}>Сейчас у коллеги</div>
              <div className={s.rtitleRow}>
                <NotebookPen size={16} />
                <span className={s.rtitle}>{r.shared.title || 'Без названия'}</span>
              </div>
              <div className={s.rmeta}>копия от {when(r.shared.created_at)}</div>
            </div>
            <div className={s.arrow}>
              <ArrowDown size={16} strokeWidth={2.8} />
            </div>
            {!r.note ? (
              <div className={[s.rcard, s.rcardGone].join(' ')}>
                <div className={s.rtitleRow}>
                  <Trash2 size={16} />
                  <span className={s.rtitle}>Заметка удалена</span>
                </div>
                <div className={s.rmeta}>Делиться больше нечем — запрос можно только отклонить.</div>
              </div>
            ) : (
              <div className={[s.rcard, s.rcardNext].join(' ')}>
                <div className={s.rhead}>
                  <span className={s.rlabel} style={{ color: NOTE_COLOR, margin: 0 }}>
                    Получит
                  </span>
                  <span className={[s.tag, r.note.changed_since_share && s.tagOn].filter(Boolean).join(' ')}>
                    {r.note.changed_since_share ? 'Есть изменения' : 'Без изменений'}
                  </span>
                </div>
                <div className={s.rtitleRow}>
                  <NotebookPen size={17} color={NOTE_COLOR} />
                  <span className={s.rtitle}>{r.note.title || 'Без названия'}</span>
                </div>
                {r.note.preview ? <div className={s.paper}>{r.note.preview}</div> : <div className={s.rmeta}>Текста нет</div>}
                <div className={s.rmeta}>
                  {r.note.files_count ? (
                    <>
                      <Paperclip size={12} /> {r.note.files_count} влож. ·{' '}
                    </>
                  ) : null}
                  изменена {when(r.note.updated_at)}
                </div>
              </div>
            )}

            {r.note && (
              <div className={s.facts}>
                <Fact icon={<CopyPlus size={18} />} title="Придёт отдельной копией" text="У коллеги появится новая заметка. Если такое название у него уже есть — добавится номер, как в Проводнике: «… (2)». Прошлая копия не изменится." />
                <Fact icon={<EyeOff size={18} />} title="Без доступа к оригиналу" text="Вы делитесь только снимком на этот момент — следующие правки останутся у вас." />
                <Fact icon={<BellRing size={18} />} title={`${firstName(r.requester.name)} узнает сразу`} text="Придёт уведомление, копия откроется в один клик." />
              </div>
            )}

            <div className={s.requestActions}>
              {r.note && (
                <Button size="lg" block icon={<Send size={18} />} loading={busy === 'approve'} disabled={!!busy} onClick={approve}>
                  Поделиться текущей версией
                </Button>
              )}
              <Button size="lg" block variant="ghost" className={s.declineBtn} loading={busy === 'decline'} disabled={!!busy} onClick={decline}>
                Отклонить
              </Button>
            </div>
          </div>
        )}
      </PageBody>
    </Page>
  );
}

function Fact({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className={s.fact}>
      <span className={s.factIcon}>{icon}</span>
      <span>
        <span className={s.factTitle}>{title}</span>
        <span className={s.factText}>{text}</span>
      </span>
    </div>
  );
}

function Outcome({ r, justDone, onClose, onOpenNote }: { r: NoteVersionRequest; justDone: boolean; onClose: () => void; onOpenNote: (id: number) => void }) {
  const owner = r.is_owner;
  const other = owner ? r.requester : r.owner;
  const name = firstName(other.name);
  const title = r.note?.title || r.shared.title || 'Без названия';
  let tone = NOTE_COLOR;
  let Icon = Hourglass;
  let head = 'Ждём ответа';
  let text = `${name} получил(а) ваш запрос текущей версии «${title}». Как только подтвердит — новая копия появится в ваших заметках.`;
  if (r.status === 'approved') {
    tone = 'var(--c-success)';
    Icon = Check;
    head = owner ? 'Готово' : `${name} поделился(ась)`;
    text = owner ? `${name} получил(а) новую копию заметки «${title}». Ваш оригинал остался у вас.` : `Новая копия заметки «${title}» уже в ваших заметках.`;
  } else if (r.status === 'declined') {
    tone = 'var(--c-text-muted)';
    Icon = X;
    head = owner ? 'Запрос отклонён' : `${name} отклонил(а) запрос`;
    text = owner ? `${name} узнает, что вы не стали делиться новой версией.` : 'Можно попросить ещё раз позже — из заметки в чате.';
  }
  return (
    <div className={s.outcome}>
      <span className={[s.outcomeIcon, justDone && s.pop].filter(Boolean).join(' ')} style={{ ['--tone' as string]: tone }}>
        <span className={s.outcomeInner}>
          <Icon size={34} strokeWidth={2.6} />
        </span>
      </span>
      <span className={s.outcomeWho}>
        <Avatar name={other.name} src={other.avatar_url} size={22} />
        {other.name}
      </span>
      <h2 className={s.outcomeHead}>{head}</h2>
      <p className={s.outcomeText}>{text}</p>
      {r.resolved_at && <p className={s.outcomeWhen}>{when(r.resolved_at)}</p>}
      <div className={s.requestActions}>
        {!owner && r.status === 'approved' && r.result_note_id ? (
          <Button size="lg" block icon={<NotebookPen size={18} />} onClick={() => onOpenNote(r.result_note_id!)}>
            Открыть заметку
          </Button>
        ) : null}
        <Button size="lg" block variant="secondary" onClick={onClose}>
          {justDone ? 'Готово' : 'К уведомлениям'}
        </Button>
      </div>
    </div>
  );
}
