import { Fragment, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, BookOpen, Bot, ChevronDown, ChevronUp, Copy, FileText, History, Send, SquarePen, ThumbsDown, ThumbsUp } from 'lucide-react';
import { api } from '../../lib/http';
import { formatTime } from '../../lib/format';
import { useMedia } from '../../lib/useMedia';
import { useTheme } from '../../theme/ThemeProvider';
import { IconButton } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { PageLoader } from '../../ui/Spinner';
import { useFeedback } from '../../ui/feedback';
import { kbKeys, useKbHealth, useKbMessages, useKbSessions } from './queries';
import { SessionList } from './SessionList';
import type { ChatResponse, KbMessage } from './types';
import s from './knowledge.module.css';

const MAX_TEXT = 4000;
/** Ответ нейросети на сервере может идти минуту-две. */
const ANSWER_TIMEOUT_MS = 240_000;
const SUGGESTIONS = ['Сколько дней отпуска?', 'Как оформить отпуск?', 'Когда платят отпускные?'];

/** **жирный** из ответа нейросети — без HTML, только текст и <b>. */
function rich(text: string): ReactNode[] {
  return text.split(/(\*\*[^*\n]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? <b key={i}>{part.slice(2, -2)}</b> : <Fragment key={i}>{part}</Fragment>,
  );
}

/**
 * Диалог с AI-ассистентом — как в приложении: вопрос, ответ по документам
 * компании, источники, оценка ответа. sessionId = 0 — новый диалог.
 */
export function KbChat({ sessionId, wide }: { sessionId: number; wide: boolean }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast, prompt } = useFeedback();
  const { sendByEnter } = useTheme();
  const touch = useMedia('(pointer: coarse)');
  const health = useKbHealth();
  const sessions = useKbSessions();
  const messages = useKbMessages(sessionId);
  const [text, setText] = useState('');
  const [pending, setPending] = useState<KbMessage | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [open, setOpen] = useState<Set<number>>(() => new Set());
  const feed = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const session = sessions.data?.find((x) => x.id === sessionId);
  const list: KbMessage[] = [...(sessionId ? messages.data ?? [] : []), ...(pending ? [pending] : [])];
  const sending = !!pending;
  const notReady = health.data && !health.data.ready;

  // Новое сообщение или «печатает» — прокручиваем вниз.
  useLayoutEffect(() => {
    const el = feed.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [list.length, sending]);

  // Поле растёт вместе с текстом (до 8 строк).
  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  const send = async (raw = text) => {
    const message = raw.trim();
    if (!message || sending) return;
    if (message.length > MAX_TEXT) {
      toast.error(`Вопрос длиннее ${MAX_TEXT} символов`);
      return;
    }
    setText('');
    setPending({ id: -Date.now(), session_id: sessionId, role: 'user', content: message, created_at: new Date().toISOString(), pending: true });
    try {
      const r = await api.post<ChatResponse>('/api/knowledge/chat', { session_id: sessionId || undefined, message }, { timeoutMs: ANSWER_TIMEOUT_MS });
      qc.setQueryData(kbKeys.messages(r.session_id), (old: KbMessage[] | undefined) => [...(old ?? []), r.user_message, r.assistant_message]);
      qc.invalidateQueries({ queryKey: kbKeys.sessions });
      if (!sessionId && alive.current) navigate(`/knowledge/${r.session_id}`, { replace: true });
    } catch (e) {
      // Вопрос не теряется: возвращаем его в поле, чтобы отправить ещё раз.
      if (alive.current) setText((cur) => cur || message);
      toast.error(e, 'Не удалось получить ответ');
    } finally {
      if (alive.current) {
        setPending(null);
        input.current?.focus();
      }
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    if (e.ctrlKey || e.metaKey || (sendByEnter && !touch && !e.shiftKey && !e.altKey)) {
      e.preventDefault();
      send();
    }
  };

  const rate = async (m: KbMessage, feedback: 'positive' | 'negative') => {
    let comment: string | null = null;
    if (feedback === 'negative') {
      comment = await prompt({
        title: 'Что не так с ответом?',
        label: 'Комментарий (необязательно)',
        placeholder: 'Например: устаревшие данные, ответ не по вопросу',
        confirmText: 'Отправить',
        multiline: true,
        maxLength: 1000,
      });
      if (comment === null) return;
    }
    try {
      await api.post(`/api/knowledge/messages/${m.id}/feedback`, { feedback, comment: comment || undefined });
      qc.setQueryData(kbKeys.messages(m.session_id), (old: KbMessage[] | undefined) => old?.map((x) => (x.id === m.id ? { ...x, feedback } : x)));
      toast.success('Спасибо за оценку');
    } catch (e) {
      toast.error(e, 'Не удалось сохранить оценку');
    }
  };

  const copy = async (m: KbMessage) => {
    try {
      await navigator.clipboard.writeText(m.content);
      toast.success('Ответ скопирован');
    } catch {
      toast.error('Не удалось скопировать');
    }
  };

  const toggle = (id: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (sessionId && messages.isLoading) return <PageLoader />;
  if (sessionId && messages.error) {
    return (
      <div className={s.chat}>
        <div className={s.missing}>
          <p>Диалог не найден — возможно, его удалили.</p>
          <button type="button" className={s.link} onClick={() => navigate('/knowledge/new', { replace: true })}>
            Начать новый диалог
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={s.chat}>
      <header className={s.chatHeader}>
        <span className={s.botAvatar}>
          <Bot size={20} />
        </span>
        <div className={s.chatTitles}>
          <b>{session?.title || (sessionId ? 'Диалог' : 'Новый диалог')}</b>
          <span className={notReady ? s.offline : undefined}>{notReady ? 'ассистент недоступен' : 'AI-ассистент компании'}</span>
        </div>
        {!wide && (
          <>
            <IconButton label="История диалогов" onClick={() => setHistoryOpen(true)}>
              <History size={20} />
            </IconButton>
            <IconButton label="Документы базы знаний" onClick={() => navigate('/knowledge/documents')}>
              <FileText size={20} />
            </IconButton>
          </>
        )}
        {(!wide || sessionId > 0) && (
          <IconButton label="Новый диалог" onClick={() => navigate('/knowledge/new')} disabled={!sessionId}>
            <SquarePen size={20} />
          </IconButton>
        )}
      </header>

      {notReady && (
        <div className={s.banner}>
          <AlertTriangle size={16} />
          {!health.data!.ollama
            ? 'Нейросеть на сервере сейчас недоступна — ассистент не сможет ответить. Сообщите администратору.'
            : 'Поиск по документам на сервере не настроен — ответы будут без опоры на базу знаний.'}
        </div>
      )}

      <div ref={feed} className={s.feed}>
        {list.length === 0 ? (
          <div className={s.empty}>
            <span className={s.emptyIcon}>
              <Bot size={40} />
            </span>
            <h2>Привет! Я AI-ассистент компании</h2>
            <p>Задайте вопрос — я найду ответ в базе знаний.</p>
            <div className={s.suggestions}>
              {SUGGESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => {
                    setText(q);
                    input.current?.focus();
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className={s.messages}>
            {list.map((m) => {
              const mine = m.role === 'user';
              const sources = m.source_chunks ?? [];
              const expanded = open.has(m.id);
              return (
                <div key={m.id} className={[s.row, mine && s.rowMine].filter(Boolean).join(' ')}>
                  {!mine && (
                    <span className={s.botAvatar}>
                      <Bot size={18} />
                    </span>
                  )}
                  <div className={[s.bubble, mine ? s.bubbleMine : s.bubbleBot, m.pending && s.pendingBubble].filter(Boolean).join(' ')}>
                    <div className={s.text}>{mine ? m.content : rich(m.content)}</div>
                    <span className={s.time}>{m.pending ? 'отправляется…' : formatTime(m.created_at)}</span>
                    {!mine && (
                      <div className={s.tools}>
                        {sources.length > 0 && (
                          <button type="button" className={s.sourcesToggle} onClick={() => toggle(m.id)} aria-expanded={expanded}>
                            <BookOpen size={14} />
                            Источники ({sources.length})
                            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        )}
                        <span className={s.spacer} />
                        <IconButton label="Скопировать ответ" size={30} onClick={() => copy(m)}>
                          <Copy size={14} />
                        </IconButton>
                        {m.feedback ? (
                          <span className={s.rated} data-kind={m.feedback}>
                            {m.feedback === 'positive' ? <ThumbsUp size={13} /> : <ThumbsDown size={13} />}
                            {m.feedback === 'positive' ? 'Полезно' : 'Бесполезно'}
                          </span>
                        ) : (
                          <>
                            <IconButton label="Полезный ответ" size={30} onClick={() => rate(m, 'positive')}>
                              <ThumbsUp size={14} />
                            </IconButton>
                            <IconButton label="Бесполезный ответ" size={30} onClick={() => rate(m, 'negative')}>
                              <ThumbsDown size={14} />
                            </IconButton>
                          </>
                        )}
                      </div>
                    )}
                    {!mine && expanded && (
                      <ol className={s.sources}>
                        {sources.map((src) => (
                          <li key={src.chunk_id}>
                            <b>
                              <FileText size={13} />
                              {src.document_name}
                              {src.similarity && <span className={s.similarity}>{Math.round(Number(src.similarity) * 100)}%</span>}
                            </b>
                            <p>{src.content.length >= 300 ? `${src.content}…` : src.content}</p>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                </div>
              );
            })}
            {sending && (
              <div className={s.row}>
                <span className={s.botAvatar}>
                  <Bot size={18} />
                </span>
                <div className={[s.bubble, s.bubbleBot, s.typing].join(' ')} aria-label="Ассистент печатает">
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <form
        className={s.composer}
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          ref={input}
          className={s.input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Задайте вопрос…"
          rows={1}
          maxLength={MAX_TEXT}
          enterKeyHint={sendByEnter && !touch ? 'send' : 'enter'}
          aria-label="Вопрос ассистенту"
          autoFocus={!touch}
        />
        {text.length > MAX_TEXT - 300 && <span className={s.counter}>{MAX_TEXT - text.length}</span>}
        <IconButton type="submit" label="Отправить" tone="accent" size={44} disabled={!text.trim() || sending}>
          <Send size={19} />
        </IconButton>
      </form>

      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title="Диалоги" size="sm" flush>
        <SessionList activeId={sessionId} onPicked={() => setHistoryOpen(false)} />
      </Modal>
    </div>
  );
}
