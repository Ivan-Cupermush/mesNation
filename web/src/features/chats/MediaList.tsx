import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { BarChart3, Check, CheckSquare, ChevronLeft, Download, ExternalLink, FileText, Forward, Link2, MessageSquareText, Play, X } from 'lucide-react';
import { useMe } from '../auth/AuthProvider';
import { api, downloadFile, openFile } from '../../lib/http';
import { fileBadge, formatDate, formatDuration, formatSize, plural } from '../../lib/format';
import { Button, IconButton } from '../../ui/Button';
import { Segmented } from '../../ui/Field';
import { EmptyState } from '../../ui/EmptyState';
import { Spinner } from '../../ui/Spinner';
import { useFeedback } from '../../ui/feedback';
import { useChatDetail } from './queries';
import { linkify } from './model';
import MediaViewer, { type ViewerItem } from './MediaViewer';
import ChatPicker from './ChatPicker';
import type { Message } from './types';
import s from './MediaList.module.css';

type Kind = 'media' | 'files' | 'links' | 'polls';
const PAGE = 40;
const TABS: { key: Kind; label: string }[] = [
  { key: 'media', label: 'Медиа' },
  { key: 'files', label: 'Файлы' },
  { key: 'links', label: 'Ссылки' },
  { key: 'polls', label: 'Опросы' },
];

/**
 * Медиа, файлы, ссылки и опросы чата (или темы) — постранично, с переходом
 * к сообщению, скачиванием и пересылкой выбранного.
 */
export default function MediaList() {
  const { chatId = '', topicId: topicParam } = useParams();
  const topicId = topicParam && Number(topicParam) > 0 ? Number(topicParam) : null;
  const base = topicParam !== undefined ? `/chats/${chatId}/topic/${topicParam}` : `/chats/${chatId}`;
  const me = useMe();
  const navigate = useNavigate();
  const { toast } = useFeedback();
  const [params, setParams] = useSearchParams();
  const kind = (TABS.some((t) => t.key === params.get('type')) ? params.get('type') : 'media') as Kind;
  const { data: chat } = useChatDetail(chatId);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [forwardIds, setForwardIds] = useState<number[] | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);

  const query = useInfiniteQuery({
    queryKey: ['chat-media', chatId, topicId ?? 0, kind],
    queryFn: ({ pageParam }) =>
      api.get<Message[]>(`/api/chats/${chatId}/messages`, { type: kind, limit: PAGE, before: pageParam ?? undefined, topic_id: topicId ?? undefined }),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => (last.length >= PAGE ? last[last.length - 1].id : undefined),
  });
  const items = useMemo(() => query.data?.pages.flat() || [], [query.data]);

  const senderLabel = (m: Message) =>
    m.sender_id === me.id ? 'Вы' : m.sender_display_name || m.sender_name || chat?.members.find((x) => x.id === m.sender_id)?.display_name || 'Участник';

  const toggle = (id: number) => setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const showInChat = (id: number) => navigate(`${base}?m=${id}`);
  const setKind = (k: Kind) => {
    setSelected([]);
    setParams({ type: k }, { replace: true });
  };

  const forward = async (toChatId: number, toTopicId: number | null, comment: string) => {
    const ids = forwardIds || [];
    for (let i = 0; i < ids.length; i++) {
      await api.post('/api/messages/forward', { messageId: ids[i], toChatId, topicId: toTopicId, comment: i === 0 && comment ? comment : undefined });
    }
    toast.success(ids.length > 1 ? 'Сообщения пересланы' : 'Сообщение переслано');
    setSelected([]);
    setSelecting(false);
  };

  const onItem = (m: Message, index: number) => {
    if (selecting) return toggle(m.id);
    if (kind === 'media') setViewer(index);
    else if (kind !== 'files') showInChat(m.id);
    else if (m.file_url) openFile(m.file_url).catch((e) => toast.error(e, 'Не удалось открыть файл'));
  };

  const check = (m: Message) =>
    selecting && (
      <span className={[s.check, selected.includes(m.id) && s.checkOn].filter(Boolean).join(' ')}>{selected.includes(m.id) && <Check size={13} strokeWidth={3} />}</span>
    );

  return (
    <div className={s.page}>
      <header className={s.header}>
        <IconButton label="Назад" onClick={() => navigate(base)}>
          <ChevronLeft size={26} />
        </IconButton>
        <div className={s.titles}>
          <div className={s.title}>{selecting ? `Выбрано: ${selected.length}` : 'Медиа и файлы'}</div>
          {!selecting && chat?.name && <div className={s.subtitle}>{chat.name}</div>}
        </div>
        {kind !== 'polls' &&
          (selecting ? (
            <IconButton
              label="Отменить выбор"
              onClick={() => {
                setSelecting(false);
                setSelected([]);
              }}
            >
              <X size={21} />
            </IconButton>
          ) : (
            items.length > 0 && (
              <IconButton label="Выбрать" onClick={() => setSelecting(true)}>
                <CheckSquare size={20} />
              </IconButton>
            )
          ))}
      </header>

      <div className={s.tabs}>
        <Segmented options={TABS} value={kind} onChange={setKind} />
      </div>

      <div className={s.scroll}>
        {query.isLoading ? (
          <div className={s.center}>
            <Spinner />
          </div>
        ) : query.error ? (
          <EmptyState compact title="Не удалось загрузить" action={<Button size="sm" onClick={() => query.refetch()}>Повторить</Button>} />
        ) : items.length === 0 ? (
          <EmptyState
            compact
            icon={kind === 'files' ? <FileText size={40} /> : kind === 'links' ? <Link2 size={40} /> : kind === 'polls' ? <BarChart3 size={40} /> : undefined}
            title={kind === 'media' ? 'Фото и видео пока нет' : kind === 'files' ? 'Файлов пока нет' : kind === 'links' ? 'Ссылок пока нет' : 'Опросов пока нет'}
          />
        ) : kind === 'media' ? (
          <div className={s.grid}>
            {items.map((m, i) => (
              <button key={m.id} type="button" className={s.cell} onClick={() => onItem(m, i)} onContextMenu={(e) => (e.preventDefault(), setSelecting(true), toggle(m.id))}>
                {m.thumb_url ? <img src={m.thumb_url} alt="" loading="lazy" /> : <span className={s.noThumb} />}
                {m.media_kind === 'video' && (
                  <span className={s.video}>
                    <Play size={12} fill="#fff" />
                    {m.media_duration ? formatDuration(m.media_duration) : ''}
                  </span>
                )}
                {check(m)}
              </button>
            ))}
          </div>
        ) : (
          <div className={s.list}>
            {items.map((m, i) => (
              <div key={m.id} className={s.item} role="button" tabIndex={0} onClick={() => onItem(m, i)} onKeyDown={(e) => e.key === 'Enter' && onItem(m, i)}>
                {check(m)}
                {kind === 'files' ? (
                  renderFile(m)
                ) : kind === 'links' ? (
                  renderLink(m)
                ) : (
                  <span className={s.itemBody}>
                    <span className={s.itemTitle}>📊 {m.poll_question || m.text || 'Опрос'}</span>
                    <span className={s.itemSub}>
                      {senderLabel(m)} · {formatDate(m.created_at, true)}
                    </span>
                  </span>
                )}
                {!selecting && (
                  <span className={s.itemActions}>
                    {kind === 'files' && m.file_url && (
                      <IconButton
                        label="Скачать"
                        size={34}
                        onClick={(e) => {
                          e.stopPropagation();
                          downloadFile(m.file_url!, m.file_name).catch((err) => toast.error(err));
                        }}
                      >
                        <Download size={17} />
                      </IconButton>
                    )}
                    {kind !== 'polls' && (
                      <IconButton
                        label="Показать в чате"
                        size={34}
                        onClick={(e) => {
                          e.stopPropagation();
                          showInChat(m.id);
                        }}
                      >
                        <MessageSquareText size={17} />
                      </IconButton>
                    )}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        {query.hasNextPage && (
          <div className={s.more}>
            <Button variant="secondary" size="sm" loading={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
              Показать ещё
            </Button>
          </div>
        )}
      </div>

      {selecting && selected.length > 0 && (
        <div className={s.selectionBar}>
          <span>
            {selected.length} {plural(selected.length, ['сообщение', 'сообщения', 'сообщений'])}
          </span>
          <Button icon={<Forward size={18} />} onClick={() => setForwardIds([...selected])}>
            Переслать
          </Button>
        </div>
      )}

      <ChatPicker open={!!forwardIds} title="Переслать" action="Переслать" onClose={() => setForwardIds(null)} onSend={forward} />
      {viewer !== null && kind === 'media' && (
        <MediaViewer
          items={items.map<ViewerItem>((m) => ({ ...m, sender_label: senderLabel(m) }))}
          index={viewer}
          onClose={() => setViewer(null)}
          onForward={(it) => {
            setViewer(null);
            setForwardIds([it.id]);
          }}
          onShowInChat={(it) => showInChat(it.id)}
        />
      )}
    </div>
  );

  function renderFile(m: Message) {
    const badge = fileBadge(m.file_name);
    return (
      <>
        <span className={s.badge} style={{ background: badge.color }}>
          {badge.ext || <FileText size={18} />}
        </span>
        <span className={s.itemBody}>
          <span className={s.itemTitle}>{m.file_name || 'Файл'}</span>
          <span className={s.itemSub}>
            {[formatSize(m.file_size), senderLabel(m), formatDate(m.created_at)].filter(Boolean).join(' · ')}
          </span>
        </span>
      </>
    );
  }

  function renderLink(m: Message) {
    const urls = linkify(m.text || '').filter((p): p is { url: string } => typeof p !== 'string');
    const first = urls[0]?.url || '';
    let host = first;
    try {
      host = new URL(first).hostname.replace(/^www\./, '');
    } catch {
      // оставим как есть
    }
    return (
      <>
        <span className={[s.badge, s.linkBadge].join(' ')}>{host.slice(0, 1).toUpperCase() || <Link2 size={18} />}</span>
        <span className={s.itemBody}>
          <span className={s.itemTitle}>{host}</span>
          {urls.map((u) => (
            <a key={u.url} className={s.link} href={u.url} target="_blank" rel="noopener noreferrer nofollow" onClick={(e) => e.stopPropagation()}>
              {u.url} <ExternalLink size={12} />
            </a>
          ))}
          <span className={s.itemSub}>
            {senderLabel(m)} · {formatDate(m.created_at)}
          </span>
        </span>
      </>
    );
  }
}
