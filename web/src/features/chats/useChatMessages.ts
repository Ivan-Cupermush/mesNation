import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api, upload, UploadCancelled } from '../../lib/http';
import { joinChat, makeClientId, onConnectionChange, sendMessageViaSocket, subscribe } from '../../lib/socket';
import type { Message, Poll } from './types';

const PAGE = 60;
let localSeq = 0;

/**
 * Лента одного чата (или темы): загрузка, подгрузка истории, отправка
 * с подтверждением сервера и повтором, файлы с прогрессом и отменой,
 * обновления в реальном времени. Логика — как в приложении (ChatScreen).
 */
export function useChatMessages(chatId: string, topicId: number | null, meId: number) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const uploads = useRef(new Map<string, () => void>());
  const cancelled = useRef(new Set<string>());
  const messagesRef = useRef<Message[]>([]);
  const olderBusy = useRef(false);
  messagesRef.current = messages;

  const withPoll = useCallback(async (m: Message): Promise<Message> => {
    if (!m.poll_id || m.poll) return m;
    try {
      const pd = await api.get<{ poll: Poll; my_votes: number[] }>(`/api/polls/${m.poll_id}/results`);
      return { ...m, poll: pd.poll, my_votes: pd.my_votes };
    } catch {
      return m;
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await api.get<Message[]>(`/api/messages/${chatId}`, { topic_id: topicId ?? undefined, limit: PAGE });
      const enriched = await Promise.all(data.filter((m) => !m.deleted_for_all).map(withPoll));
      setHasOlder(data.length >= PAGE);
      setMessages((prev) => {
        // Неотправленные локальные сообщения не теряем при перезагрузке истории.
        const pending = prev.filter((m) => m.pending);
        return [...enriched, ...pending.filter((p) => !enriched.some((e) => e.client_id && e.client_id === p.client_id))];
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить сообщения');
    } finally {
      setLoading(false);
    }
  }, [chatId, topicId, withPoll]);

  const loadOlder = useCallback(async () => {
    if (olderBusy.current || !hasOlder || loading) return;
    const oldest = messagesRef.current.find((m) => m.id > 0);
    if (!oldest) return;
    olderBusy.current = true;
    setLoadingOlder(true);
    try {
      const data = await api.get<Message[]>(`/api/messages/${chatId}`, { topic_id: topicId ?? undefined, limit: PAGE, before: oldest.id });
      const enriched = await Promise.all(data.filter((m) => !m.deleted_for_all).map(withPoll));
      setHasOlder(data.length >= PAGE);
      setMessages((prev) => [...enriched.filter((e) => !prev.some((p) => p.id === e.id)), ...prev]);
    } catch {
      // попробуем при следующей прокрутке
    } finally {
      olderBusy.current = false;
      setLoadingOlder(false);
    }
  }, [chatId, topicId, hasOlder, loading, withPoll]);

  /**
   * Догрузить историю, пока не найдётся сообщение id (переход к ответу,
   * закрепу, ссылке из уведомления). false — такого сообщения нет.
   */
  const loadUntil = useCallback(
    async (targetId: number, maxPages = 20): Promise<boolean> => {
      if (messagesRef.current.some((m) => m.id === targetId)) return true;
      const first = messagesRef.current.find((m) => m.id > 0)?.id;
      if (!first || first < targetId) return false;
      let oldest: number = first;
      const collected: Message[] = [];
      let more = true;
      let found = false;
      olderBusy.current = true;
      setLoadingOlder(true);
      try {
        for (let i = 0; i < maxPages && more && !found; i++) {
          const data: Message[] = await api.get<Message[]>(`/api/messages/${chatId}`, { topic_id: topicId ?? undefined, limit: PAGE, before: oldest });
          more = data.length >= PAGE;
          if (!data.length) break;
          collected.unshift(...data.filter((m) => !m.deleted_for_all));
          oldest = data[0].id;
          found = data.some((m) => m.id === targetId) || oldest < targetId;
        }
      } catch {
        // покажем то, что успели загрузить
      } finally {
        olderBusy.current = false;
        setLoadingOlder(false);
      }
      if (collected.length) {
        const enriched = await Promise.all(collected.map(withPoll));
        setHasOlder(more);
        setMessages((prev) => [...enriched.filter((e) => !prev.some((p) => p.id === e.id)), ...prev]);
      }
      return collected.some((m) => m.id === targetId);
    },
    [chatId, topicId, withPoll],
  );

  useEffect(() => {
    setMessages([]);
    setLoading(true);
    setHasOlder(true);
    load();
  }, [load]);

  // Связь вернулась — подтягиваем всё, что пришло, пока её не было.
  useEffect(() => {
    let wasDown = false;
    return onConnectionChange((connected) => {
      if (!connected) wasDown = true;
      else if (wasDown) {
        wasDown = false;
        load();
      }
    });
  }, [load]);

  // ===== Реальное время =====
  useEffect(() => {
    const leave = joinChat(chatId);
    const belongsHere = (m: Message) => String(m.chat_id) === String(chatId) && (m.topic_id ?? null) === topicId;
    const offs = [
      subscribe<Message>('new_message', async (msg) => {
        if (!belongsHere(msg)) return;
        const full = await withPoll(msg);
        setMessages((prev) => {
          if (full.client_id && prev.some((m) => m.client_id === full.client_id)) {
            return prev.map((m) => (m.client_id === full.client_id ? { ...full, localUrl: m.localUrl } : m));
          }
          if (prev.some((m) => m.id === full.id)) return prev;
          return [...prev, full];
        });
      }),
      subscribe<Message>('message_edited', (msg) => {
        if (!belongsHere(msg)) return;
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, ...msg, poll: m.poll, my_votes: m.my_votes } : m)));
      }),
      subscribe<{ id: number }>('message_deleted', ({ id }) => setMessages((prev) => prev.filter((m) => m.id !== id))),
      subscribe<{ id: number; pinned: boolean }>('message_pinned', ({ id }) => setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, pinned: true } : m)))),
      subscribe<{ id: number }>('message_unpinned', ({ id }) => setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, pinned: false } : m)))),
      subscribe<{ poll_id: number }>('poll_updated', async ({ poll_id }) => {
        if (!messagesRef.current.some((m) => m.poll_id === poll_id)) return;
        try {
          const pd = await api.get<{ poll: Poll; my_votes: number[] }>(`/api/polls/${poll_id}/results`);
          setMessages((prev) => prev.map((m) => (m.poll_id === poll_id ? { ...m, poll: pd.poll, my_votes: pd.my_votes } : m)));
        } catch {
          // опрос мог стать недоступен
        }
      }),
    ];
    return () => {
      offs.forEach((off) => off());
      leave();
    };
  }, [chatId, topicId, withPoll]);

  // ===== Отправка =====
  const baseLocal = useCallback(
    (): Message => ({
      id: -++localSeq,
      chat_id: String(chatId),
      sender_id: meId,
      text: null,
      file_url: null,
      file_name: null,
      thumb_url: null,
      reply_to_message_id: null,
      topic_id: topicId,
      external_reply_chat_id: null,
      edited_at: null,
      pinned: false,
      deleted_for_all: false,
      content_type: 'text',
      poll_id: null,
      client_id: makeClientId(),
      created_at: new Date().toISOString(),
      forwarded_from_user_id: null,
      forwarded_from_message_id: null,
      forwarded_from_name: null,
      media_group_id: null,
      media_kind: null,
      media_width: null,
      media_height: null,
      media_duration: null,
      file_size: null,
      mime_type: null,
      note_share_id: null,
      note_share: null,
      poll_question: null,
      sender_display_name: null,
      sender_name: null,
      sender_avatar_url: null,
      pending: 'sending',
    }),
    [chatId, topicId, meId],
  );

  const patchLocal = (clientId: string, patch: Partial<Message>) =>
    setMessages((prev) => prev.map((m) => (m.client_id === clientId && m.pending ? { ...m, ...patch } : m)));

  const deliver = useCallback(
    async (local: Message) => {
      const clientId = local.client_id!;
      if (cancelled.current.has(clientId)) return;
      patchLocal(clientId, { pending: 'sending', progress: 0 });
      try {
        let saved: Message;
        if (local.localFile) {
          const task = upload<Message>(
            '/api/upload',
            'file',
            local.localFile,
            local.localFile.name,
            {
              chatId,
              topicId: topicId ?? undefined,
              client_id: clientId,
              caption: local.text || undefined,
              reply_to_message_id: local.reply_to_message_id ?? undefined,
              media_group_id: local.media_group_id ?? undefined,
              as_file: local.asFile ? 'true' : undefined,
            },
            (p) => patchLocal(clientId, { progress: p }),
          );
          uploads.current.set(clientId, task.abort);
          try {
            saved = await task.promise;
          } finally {
            uploads.current.delete(clientId);
          }
        } else {
          const input = { chatId, text: local.text || '', reply_to_message_id: local.reply_to_message_id, topic_id: topicId, client_id: clientId };
          // Сокет — быстрее; если он сейчас не подключён, то же самое по HTTP.
          saved = await sendMessageViaSocket<Message>(input).catch((e: Error) => {
            if (e.message !== 'offline') throw e;
            return api.post<Message>(`/api/chats/${chatId}/messages`, input);
          });
        }
        setMessages((prev) => {
          const exists = prev.some((m) => m.id === saved.id && !m.pending);
          const mapped = prev.map((m) => (m.client_id === clientId ? { ...saved, localUrl: m.localUrl } : m));
          return exists ? mapped.filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i) : mapped;
        });
      } catch (e) {
        if (e instanceof UploadCancelled) return;
        patchLocal(clientId, { pending: 'failed' });
        throw e instanceof ApiError || e instanceof Error ? e : new Error('Не удалось отправить');
      }
    },
    [chatId, topicId],
  );

  const sendText = useCallback(
    (text: string, replyToId: number | null) => {
      const local: Message = { ...baseLocal(), text, reply_to_message_id: replyToId };
      setMessages((prev) => [...prev, local]);
      return deliver(local);
    },
    [baseLocal, deliver],
  );

  /** Файлы по очереди (порядок в альбоме = порядок выбора). */
  const sendFiles = useCallback(
    async (files: { file: File; kind: 'photo' | 'video' | 'file'; width?: number | null; height?: number | null }[], opts: { caption: string; group: boolean; asFile: boolean; replyToId: number | null }) => {
      const locals: Message[] = [];
      let groupId: string | null = null;
      files.forEach(({ file, kind, width, height }, i) => {
        if (opts.group && files.length > 1 && i % 10 === 0) groupId = `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
        const isMedia = !opts.asFile && kind !== 'file';
        // Подпись: у фото — на первом, у документов — на последнем (как в Telegram).
        const captionHere = isMedia ? i === 0 : i === files.length - 1;
        locals.push({
          ...baseLocal(),
          client_id: makeClientId(),
          text: captionHere ? opts.caption || null : null,
          reply_to_message_id: i === 0 ? opts.replyToId : null,
          media_kind: isMedia ? kind : 'file',
          media_group_id: opts.group && files.length > 1 ? groupId : null,
          media_width: width ?? null,
          media_height: height ?? null,
          file_url: isMedia ? null : 'local',
          file_name: file.name,
          file_size: file.size,
          localUrl: isMedia ? URL.createObjectURL(file) : null,
          localFile: file,
          asFile: !isMedia,
        });
      });
      setMessages((prev) => [...prev, ...locals]);
      const errors: unknown[] = [];
      for (const l of locals) {
        try {
          await deliver(l);
        } catch (e) {
          errors.push(e);
        }
      }
      if (errors.length) throw errors[0];
    },
    [baseLocal, deliver],
  );

  const retry = useCallback((m: Message) => deliver(m), [deliver]);

  const discard = useCallback((m: Message) => {
    if (m.client_id) {
      cancelled.current.add(m.client_id);
      uploads.current.get(m.client_id)?.();
      uploads.current.delete(m.client_id);
    }
    if (m.localUrl) URL.revokeObjectURL(m.localUrl);
    setMessages((prev) => prev.filter((x) => x.client_id !== m.client_id));
  }, []);

  const update = useCallback((id: number, patch: Partial<Message>) => setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m))), []);
  const remove = useCallback((ids: number[]) => setMessages((prev) => prev.filter((m) => !ids.includes(m.id))), []);

  return { messages, loading, loadingOlder, hasOlder, error, reload: load, loadOlder, loadUntil, sendText, sendFiles, retry, discard, update, remove };
}
