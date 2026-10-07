import { memo, useRef, type MouseEvent, type ReactNode, type TouchEvent } from 'react';
import { AlertCircle, Check, CheckCheck, Clock, Download, FileText, Play } from 'lucide-react';
import { fileBadge, formatDuration, formatSize, formatTime, hashColor } from '../../lib/format';
import { Avatar } from '../../ui/Avatar';
import { albumLayout } from './albumLayout';
import { isUnlistened, isVisualMedia, linkify, messagePreview, rowMain, rowMessages, type Row } from './model';
import PollBubble from './PollBubble';
import NoteShareBubble from './NoteShareBubble';
import { UploadRing } from './UploadRing';
import VoiceBubble from './voice/VoiceBubble';
import VideoNoteBubble from './voice/VideoNoteBubble';
import type { Message, Reaction } from './types';
import type { MenuAnchor } from '../../ui/menuAnchor';
import s from './MessageBubble.module.css';

interface Props {
  row: Row;
  mine: boolean;
  firstInSeries: boolean;
  lastInSeries: boolean;
  isGroup: boolean;
  senderName: string;
  senderAvatar?: string | null;
  replied?: Message | null;
  repliedName?: string;
  peerLastReadId: number;
  meId: number;
  highlighted?: boolean;
  onMenu: (row: Row, anchor: MenuAnchor) => void;
  onOpenMedia: (msg: Message) => void;
  onOpenFile: (msg: Message) => void;
  onReplyClick: (msg: Message) => void;
  onRetry: (msg: Message) => void;
  onCancel: (msg: Message) => void;
  onSenderClick: (userId: number) => void;
  onNoteAccepted: (messageId: number, noteId: number) => void;
  onReact: (msg: Message, emoji: string) => void;
  onPlayVoice: (msg: Message) => void;
  onSeekVoice: (msg: Message, ratio: number) => void;
  onVideoNotePlayed: (msg: Message) => void;
  /** Режим выделения (как в Telegram): нажатие отмечает сообщение. */
  selecting?: boolean;
  selected?: boolean;
  onToggleSelect?: (row: Row) => void;
  /** Подсветить найденное в тексте. */
  searchQuery?: string;
}

const LONG_PRESS_MS = 450;
/** Двойной клик по сообщению — быстрая реакция, как в Telegram. */
const QUICK_REACTION = '👍';


function MessageBubble(props: Props) {
  const { row, mine, firstInSeries, lastInSeries, isGroup, senderName, replied, repliedName, peerLastReadId, meId } = props;
  const msgs = rowMessages(row);
  const main = rowMain(row);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isPoll = !!main.poll;
  const isNote = !!main.note_share;
  const isVoice = !isPoll && main.media_kind === 'voice' && !main.deleted_for_all;
  const isVideoNote = !isPoll && main.media_kind === 'video_note' && !main.deleted_for_all;
  const isDocGroup = row.type === 'album' && msgs.every((m) => m.media_kind === 'file');
  const isVisual = !isPoll && !isDocGroup && !isVoice && !isVideoNote && (row.type === 'album' || isVisualMedia(main));
  const isFile = !isPoll && !isVisual && !isVoice && !isVideoNote && !!main.file_url;
  const unlistened = (isVoice || isVideoNote) && isUnlistened(main, meId);
  const reactions = main.reactions?.length ? main.reactions : null;
  const selecting = !!props.selecting;
  const pollMediaVisual = isPoll && !!main.file_url && (main.media_kind === 'photo' || main.media_kind === 'video');
  const pollMediaFile = isPoll && !!main.file_url && !pollMediaVisual;
  const caption = main.text && !isNote && !isPoll ? main.text : '';
  const showSideAvatar = isGroup && !mine;
  const showName = firstInSeries && isGroup && !mine;
  const mediaOnly = isVisual && !caption && !main.reply_to_message_id && !main.forwarded_from_user_id && !showName;

  // Меню: правый клик на компьютере, долгое нажатие на телефоне.
  const openMenu = (e: MouseEvent) => {
    if (main.pending) return;
    e.preventDefault();
    if (selecting) return props.onToggleSelect?.(row);
    props.onMenu(row, { x: e.clientX, y: e.clientY });
  };
  const onTouchStart = (e: TouchEvent) => {
    if (main.pending || selecting) return;
    const t = e.touches[0];
    pressTimer.current = setTimeout(() => props.onMenu(row, { x: t.clientX, y: t.clientY }), LONG_PRESS_MS);
  };
  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };

  const meta = (onMedia = false) => (
    <span className={[s.meta, onMedia && s.metaOnMedia].filter(Boolean).join(' ')}>
      {main.edited_at && <span>изм.</span>}
      <span>{formatTime(main.created_at)}</span>
      {mine && <Ticks msg={main} peerLastReadId={peerLastReadId} />}
    </span>
  );

  const reactionsRow = reactions && (
    <Reactions list={reactions} meId={meId} mine={mine} onMedia={false} onReact={(emoji) => props.onReact(main, emoji)} disabled={selecting} />
  );

  const quickReact = (e: MouseEvent) => {
    if (selecting || main.pending || main.id < 0 || (e.target as HTMLElement).closest('a,button,input,svg,video')) return;
    window.getSelection()?.removeAllRanges();
    props.onReact(main, QUICK_REACTION);
  };

  const rowClass = [
    s.row,
    mine ? s.rowMine : s.rowOther,
    !lastInSeries && s.rowTight,
    props.highlighted && s.highlight,
    selecting && s.rowSelecting,
    props.selected && s.rowSelected,
  ]
    .filter(Boolean)
    .join(' ');

  const selectBox = selecting && (
    <span className={[s.selectBox, props.selected && s.selectBoxOn].filter(Boolean).join(' ')} aria-hidden>
      {props.selected && <Check size={14} strokeWidth={3} />}
    </span>
  );

  const rowHandlers = selecting
    ? {
        onClickCapture: (e: MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          if (!main.pending) props.onToggleSelect?.(row);
        },
        onContextMenu: (e: MouseEvent) => e.preventDefault(),
        role: 'checkbox' as const,
        'aria-checked': !!props.selected,
      }
    : {};

  const header = (inMedia: boolean) => (
    <>
      {showName && (
        <button type="button" className={[s.sender, inMedia && s.padInMedia].filter(Boolean).join(' ')} style={{ color: hashColor(senderName) }} onClick={() => props.onSenderClick(main.sender_id)}>
          {senderName}
        </button>
      )}
      {main.forwarded_from_user_id && (
        <div className={[s.forwarded, inMedia && s.padInMedia].filter(Boolean).join(' ')}>Переслано от {main.forwarded_from_name || 'участника'}</div>
      )}
      {main.reply_to_message_id && (
        <button type="button" className={[s.quote, inMedia && s.quoteInMedia].filter(Boolean).join(' ')} onClick={() => props.onReplyClick(main)}>
          <span className={s.quoteName}>{replied ? repliedName : main.external_reply_chat_id ? 'Сообщение из другого чата' : 'Сообщение'}</span>
          <span className={s.quoteText}>
            {replied ? messagePreview(replied) : main.external_reply_chat_id ? 'Нажмите, чтобы открыть' : 'Исходное сообщение удалено'}
          </span>
        </button>
      )}
    </>
  );

  const sideAvatar = showSideAvatar && (
    <div className={s.avatarSlot}>
      {lastInSeries && (
        <button type="button" className={s.avatarBtn} onClick={() => props.onSenderClick(main.sender_id)} aria-label={`Профиль: ${senderName}`}>
          <Avatar name={senderName} src={props.senderAvatar} size={34} />
        </button>
      )}
    </div>
  );

  // Кружочек — без пузыря, как в Telegram: подпись, ответ и реакции — рядом.
  if (isVideoNote) {
    const hasHeader = showName || !!main.forwarded_from_user_id || !!main.reply_to_message_id;
    return (
      <div className={rowClass} data-mid={main.id} {...rowHandlers}>
        {selectBox}
        {sideAvatar}
        <div
          className={[s.noteCol, mine ? s.noteColMine : ''].join(' ')}
          onContextMenu={openMenu}
          onTouchStart={onTouchStart}
          onTouchEnd={cancelPress}
          onTouchMove={cancelPress}
          onDoubleClick={quickReact}
          onClick={main.pending === 'failed' ? () => props.onRetry(main) : undefined}
        >
          {hasHeader && <div className={[s.noteHeader, mine ? s.out : s.in].join(' ')}>{header(false)}</div>}
          <VideoNoteBubble msg={main} unlistened={unlistened} meta={meta(true)} onPlayed={props.onVideoNotePlayed} onCancel={props.onCancel} />
          {reactions && <Reactions list={reactions} meId={meId} mine={mine} onMedia onReact={(emoji) => props.onReact(main, emoji)} disabled={selecting} />}
          {main.pending === 'failed' && <div className={[s.failed, s.noteFailed].join(' ')}>Не отправлено · нажмите, чтобы повторить</div>}
        </div>
      </div>
    );
  }

  const bubbleClass = [
    mediaOnly ? s.mediaOnly : s.bubble,
    !mediaOnly && (mine ? s.out : s.in),
    !mediaOnly && lastInSeries && (mine ? s.tailOut : s.tailIn),
    !mediaOnly && !firstInSeries && (mine ? s.joinTopOut : s.joinTopIn),
    !mediaOnly && !lastInSeries && (mine ? s.joinBottomOut : s.joinBottomIn),
    isVisual && !mediaOnly && s.withMedia,
    isPoll && s.poll,
    main.pending === 'failed' && s.failedBubble,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rowClass} data-mid={msgs.map((m) => m.id).join(' ')} {...rowHandlers}>
      {selectBox}
      {sideAvatar}
      <div
        className={bubbleClass}
        onContextMenu={openMenu}
        onTouchStart={onTouchStart}
        onTouchEnd={cancelPress}
        onTouchMove={cancelPress}
        onDoubleClick={quickReact}
        onMouseDown={(e) => e.detail > 1 && !selecting && e.preventDefault()}
        onClick={main.pending === 'failed' ? () => props.onRetry(main) : undefined}
      >
        {header(isVisual)}

        {isVisual && (
          <MediaAlbum items={msgs} rounded={mediaOnly} onOpen={props.onOpenMedia} onCancel={props.onCancel} overlay={!caption && !reactions ? meta(true) : null} />
        )}

        {isFile && msgs.map((f) => <FileRow key={f.client_id || f.id} msg={f} onOpen={props.onOpenFile} onCancel={props.onCancel} />)}

        {isVoice && <VoiceBubble msg={main} mine={mine} unlistened={unlistened} onPlay={props.onPlayVoice} onSeek={props.onSeekVoice} onCancel={props.onCancel} />}

        {pollMediaVisual && (
          <div className={s.pollMedia}>
            <MediaAlbum items={[main]} rounded onOpen={props.onOpenMedia} maxHeight={260} />
          </div>
        )}
        {pollMediaFile && <FileRow msg={main} onOpen={props.onOpenFile} />}
        {isPoll && main.poll && <PollBubble poll={main.poll} myVotes={main.my_votes || []} mine={mine} />}
        {isNote && main.note_share && (
          <NoteShareBubble share={main.note_share} meId={meId} mine={mine} onAccepted={(noteId) => props.onNoteAccepted(main.id, noteId)} />
        )}

        {caption && (
          <div className={[s.text, isVisual && s.captionInMedia].filter(Boolean).join(' ')}>
            <Linkified text={caption} query={props.searchQuery} />
            {/* Невидимая копия времени и галочек: резервирует место в конце строки, текст под них не заходит. */}
            <span className={s.metaSpacer} aria-hidden>
              {meta()}
            </span>
          </div>
        )}
        {reactionsRow && <div className={[s.reactionsWrap, isVisual && s.reactionsInMedia, mediaOnly && s.reactionsUnderMedia].filter(Boolean).join(' ')}>{reactionsRow}</div>}
        {!(isVisual && !caption && !reactions) && (
          <span className={[s.metaAbs, isVisual && s.metaAbsMedia].filter(Boolean).join(' ')}>{meta(mediaOnly)}</span>
        )}
        {main.pending === 'failed' && <div className={s.failed}>Не отправлено · нажмите, чтобы повторить</div>}
      </div>
    </div>
  );
}

export default memo(MessageBubble);

function Ticks({ msg, peerLastReadId }: { msg: Message; peerLastReadId: number }) {
  if (msg.pending === 'sending') return <Clock size={12} className={s.tick} />;
  if (msg.pending === 'failed') return <AlertCircle size={13} className={s.tickFailed} />;
  return msg.id <= peerLastReadId ? <CheckCheck size={15} className={s.tickRead} /> : <Check size={14} className={s.tick} />;
}

function Linkified({ text, query }: { text: string; query?: string }) {
  return (
    <>
      {linkify(text).map((p, i) =>
        typeof p === 'string' ? (
          <Highlighted key={i} text={p} query={query} />
        ) : (
          <a key={i} href={p.url} target="_blank" rel="noopener noreferrer nofollow" onClick={(e) => e.stopPropagation()}>
            {p.url}
          </a>
        ),
      )}
    </>
  );
}

/** Найденное при поиске по чату — подсвечено. */
function Highlighted({ text, query }: { text: string; query?: string }) {
  const q = query?.trim().toLowerCase();
  if (!q) return <>{text}</>;
  const out: ReactNode[] = [];
  const lower = text.toLowerCase();
  let from = 0;
  let at = lower.indexOf(q);
  while (at !== -1) {
    if (at > from) out.push(text.slice(from, at));
    out.push(
      <mark key={at} className={s.mark}>
        {text.slice(at, at + q.length)}
      </mark>,
    );
    from = at + q.length;
    at = lower.indexOf(q, from);
  }
  if (from < text.length) out.push(text.slice(from));
  return <>{out}</>;
}

/** Реакции под сообщением: своя — закрашена; нажатие — поставить или снять. */
function Reactions({
  list,
  meId,
  mine,
  onMedia,
  disabled,
  onReact,
}: {
  list: Reaction[];
  meId: number;
  mine: boolean;
  onMedia: boolean;
  disabled?: boolean;
  onReact: (emoji: string) => void;
}) {
  return (
    <div className={[s.reactions, onMedia && s.reactionsOnMedia].filter(Boolean).join(' ')}>
      {list.map((r) => {
        const my = r.user_ids.includes(meId);
        return (
          <button
            key={r.emoji}
            type="button"
            className={[s.reaction, mine ? s.reactionOut : s.reactionIn, my && s.reactionMy].filter(Boolean).join(' ')}
            onClick={(e) => {
              e.stopPropagation();
              if (!disabled) onReact(r.emoji);
            }}
            title={my ? 'Убрать реакцию' : 'Поставить такую же'}
          >
            <span className={s.reactionEmoji}>{r.emoji}</span>
            <span className={s.reactionCount}>{r.count}</span>
          </button>
        );
      })}
    </div>
  );
}

function FileRow({ msg, onOpen, onCancel }: { msg: Message; onOpen: (m: Message) => void; onCancel?: (m: Message) => void }) {
  const badge = fileBadge(msg.file_name);
  const sending = msg.pending === 'sending';
  return (
    <button
      type="button"
      className={s.file}
      onClick={(e) => {
        e.stopPropagation();
        if (!msg.pending) onOpen(msg);
      }}
    >
      <span className={s.fileIcon} style={{ background: badge.color }}>
        {sending ? (
          <UploadRing progress={msg.progress} onCancel={onCancel ? () => onCancel(msg) : undefined} />
        ) : msg.pending === 'failed' ? (
          <AlertCircle size={22} />
        ) : badge.ext ? (
          <span className={s.fileExt}>{badge.ext}</span>
        ) : (
          <FileText size={20} />
        )}
      </span>
      <span className={s.fileInfo}>
        <span className={s.fileName}>{msg.file_name || 'Файл'}</span>
        <span className={s.fileMeta}>
          {!sending && <Download size={12} />}
          {sending ? `${Math.round((msg.progress || 0) * 100)}% · ${formatSize(msg.file_size) || 'отправка'}` : formatSize(msg.file_size) || 'Скачать'}
        </span>
      </span>
    </button>
  );
}

/** Фото и видео: одиночное — в своих пропорциях, несколько — мозаикой (как альбомы Telegram). */
function MediaAlbum({
  items,
  rounded,
  onOpen,
  onCancel,
  overlay,
  maxHeight = 380,
}: {
  items: Message[];
  rounded?: boolean;
  onOpen: (m: Message) => void;
  onCancel?: (m: Message) => void;
  overlay?: ReactNode;
  maxHeight?: number;
}) {
  const maxWidth = Math.min(380, typeof window !== 'undefined' ? window.innerWidth * 0.72 : 380);
  const ratios = items.map((m) => (m.media_width && m.media_height ? m.media_width / m.media_height : m.media_kind === 'video' ? 16 / 9 : 1));
  const { cells, width, height } = albumLayout(ratios, maxWidth, maxHeight);
  return (
    <div className={[s.album, rounded && s.albumRounded].filter(Boolean).join(' ')} style={{ width, height }}>
      {items.map((m, i) => {
        const cell = cells[i];
        const src = m.localUrl || m.thumb_url;
        return (
          <button
            key={m.client_id || m.id}
            type="button"
            className={s.cell}
            style={{ left: cell.x, top: cell.y, width: cell.w, height: cell.h }}
            onClick={(e) => {
              e.stopPropagation();
              if (!m.pending) onOpen(m);
            }}
            aria-label={m.media_kind === 'video' ? 'Открыть видео' : 'Открыть фото'}
          >
            {src ? <img src={src} alt="" loading="lazy" draggable={false} /> : <span className={s.placeholder} />}
            {m.media_kind === 'video' && !m.pending && (
              <>
                <span className={s.play}>
                  <Play size={22} fill="#fff" />
                </span>
                {m.media_duration ? <span className={s.duration}>{formatDuration(m.media_duration)}</span> : null}
              </>
            )}
            {m.pending === 'sending' && (
              <span className={s.cellOverlay}>
                <UploadRing progress={m.progress} onCancel={onCancel ? () => onCancel(m) : undefined} />
              </span>
            )}
            {m.pending === 'failed' && (
              <span className={s.cellOverlay}>
                <AlertCircle size={28} />
              </span>
            )}
          </button>
        );
      })}
      {overlay && <span className={s.albumMeta}>{overlay}</span>}
    </div>
  );
}

/** Служебное сообщение по центру ленты и разделитель дня. */
export function ServiceLine({ text, strong }: { text: string; strong?: boolean }) {
  return (
    <div className={s.service}>
      <span className={strong ? s.serviceStrong : undefined}>{text}</span>
    </div>
  );
}
