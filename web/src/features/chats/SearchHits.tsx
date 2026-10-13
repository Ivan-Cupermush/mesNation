import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../../lib/http';
import { matchRanges } from '../../lib/fuzzy';
import { messagePreview } from './model';
import type { Message } from './types';
import s from './SearchHits.module.css';

/** Текст, в котором ищем, — тот же набор полей, что на сервере. */
export const searchableText = (m: Partial<Message> & { poll_question?: string | null }) =>
  [m.text, m.file_name, m.note_share?.title, m.poll_question].filter(Boolean).join(' · ') || messagePreview(m);

/** Текст с подсвеченными совпадениями (части слов, ё = е, другая раскладка). */
export function HighlightedText({ text, query }: { text: string; query?: string | null }) {
  const ranges = query ? matchRanges(text, query) : [];
  if (!ranges.length) return <>{text}</>;
  const out: ReactNode[] = [];
  let pos = 0;
  for (const [a, b] of ranges) {
    if (a > pos) out.push(text.slice(pos, a));
    out.push(
      <mark key={a} className={s.mark}>
        {text.slice(a, b)}
      </mark>,
    );
    pos = b;
  }
  if (pos < text.length) out.push(text.slice(pos));
  return <>{out}</>;
}

export interface GlobalHit extends Message {
  chat_type: string;
  chat_name: string | null;
  chat_avatar_url: string | null;
  topic_title: string | null;
  is_supergroup?: boolean;
}

const PAGE = 30;

/** Сообщения во всех моих чатах — раздел «Сообщения» в поиске списка чатов. */
export function useGlobalMessageSearch(query: string) {
  const q = query.trim();
  const [hits, setHits] = useState<GlobalHit[]>([]);
  const [applied, setApplied] = useState('');
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(false);

  useEffect(() => {
    if (q.length < 2) {
      setHits([]);
      setApplied('');
      setMore(false);
      return;
    }
    let alive = true;
    setLoading(true);
    const t = setTimeout(() => {
      api
        .get<GlobalHit[]>('/api/search/messages', { q, limit: PAGE })
        .then((list) => {
          if (!alive) return;
          setHits(list);
          setApplied(q);
          setMore(list.length >= PAGE);
        })
        .catch(() => alive && setHits([]))
        .finally(() => alive && setLoading(false));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  const loadMore = () => {
    if (!more || loading || !hits.length) return;
    setLoading(true);
    api
      .get<GlobalHit[]>('/api/search/messages', { q: applied, limit: PAGE, before: hits[hits.length - 1].id })
      .then((list) => {
        setHits((prev) => [...prev, ...list]);
        setMore(list.length >= PAGE);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  };

  return { hits, query: applied, loading, more, loadMore };
}

export const hitTime = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() ? { year: '2-digit' } : {}) });
};
