import { memo, useRef, type MouseEvent, type ReactNode, type TouchEvent } from 'react';
import { AlertCircle, Check, CheckCheck, Clock, Download, FileText, Play, X } from 'lucide-react';
import { fileBadge, formatDuration, formatSize, formatTime, hashColor } from '../../lib/format';
import { Avatar } from '../../ui/Avatar';
import { albumLayout } from './albumLayout';
import { isVisualMedia, linkify, messagePreview, rowMain, rowMessages, type Row } from './model';
import PollBubble from './PollBubble';
import NoteShareBubble from './NoteShareBubble';
import type { Message } from './types';
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
}

const LONG_PRESS_MS = 450;

function MessageBubble(props: Props) {
  const { row, mine, firstInSeries, lastInSeries, isGroup, senderName, replied, repliedName, peerLastReadId, meId } = props;
  const msgs = rowMessages(row);
  const main = rowMain(row);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isPoll = !!main.poll;
  const isNote = !!main.note_share;
  const isDocGroup = row.type === 'album' && msgs.every((m) => m.media_kind === 'file');
  const isVisual = !isPoll && !isDocGroup && (row.type === 'album' || isVisualMedia(main));
  const isFile = !isPoll && !isVisual && !!main.file_url;
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
    props.onMenu(row, { x: e.clientX, y: e.clientY });
  };
  const onTouchStart = (e: TouchEvent) => {
    if (main.pending) return;
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
    <div
      className={[s.row, mine ? s.rowMine : s.rowOther, !lastInSeries && s.rowTight, props.highlighted && s.highlight].filter(Boolean).join(' ')}
      data-mid={msgs.map((m) => m.id).join(' ')}
    >
      {showSideAvatar && (
        <div className={s.avatarSlot}>
          {lastInSeries && (
            <button type="button" className={s.avatarBtn} onClick={() => props.onSenderClick(main.sender_id)} aria-label={`Профиль: ${senderName}`}>
              <Avatar name={senderName} src={props.senderAvatar} size={34} />
            </button>
          )}
        </div>
      )}
      <div
        className={bubbleClass}
        onContextMenu={openMenu}
        onTouchStart={onTouchStart}
        onTouchEnd={cancelPress}
        onTouchMove={cancelPress}
        onClick={main.pending === 'failed' ? () => props.onRetry(main) : undefined}
      >
        {showName && (
          <button type="button" className={[s.sender, isVisual && s.padInMedia].filter(Boolean).join(' ')} style={{ color: hashColor(senderName) }} onClick={() => props.onSenderClick(main.sender_id)}>
            {senderName}
          </button>
        )}
        {main.forwarded_from_user_id && (
          <div className={[s.forwarded, isVisual && s.padInMedia].filter(Boolean).join(' ')}>Переслано от {main.forwarded_from_name || 'участника'}</div>
        )}
        {main.reply_to_message_id && (
          <button type="button" className={[s.quote, isVisual && s.quoteInMedia].filter(Boolean).join(' ')} onClick={() => props.onReplyClick(main)}>
            <span className={s.quoteName}>{replied ? repliedName : main.external_reply_chat_id ? 'Сообщение из другого чата' : 'Сообщение'}</span>
            <span className={s.quoteText}>
              {replied ? messagePreview(replied) : main.external_reply_chat_id ? 'Нажмите, чтобы открыть' : 'Исходное сообщение удалено'}
            </span>
          </button>
        )}

        {isVisual && (
          <MediaAlbum items={msgs} rounded={mediaOnly} onOpen={props.onOpenMedia} onCancel={props.onCancel} overlay={!caption ? meta(true) : null} />
        )}

        {isFile && msgs.map((f) => <FileRow key={f.client_id || f.id} msg={f} onOpen={props.onOpenFile} onCancel={props.onCancel} />)}

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
            <Linkified text={caption} />
            {/* Невидимая копия времени и галочек: резервирует место в конце строки, текст под них не заходит. */}
            <span className={s.metaSpacer} aria-hidden>
              {meta()}
            </span>
          </div>
        )}
        {!(isVisual && !caption) && <span className={[s.metaAbs, isVisual && s.metaAbsMedia].filter(Boolean).join(' ')}>{meta()}</span>}
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

function Linkified({ text }: { text: string }) {
  return (
    <>
      {linkify(text).map((p, i) =>
        typeof p === 'string' ? (
          p
        ) : (
          <a key={i} href={p.url} target="_blank" rel="noopener noreferrer nofollow" onClick={(e) => e.stopPropagation()}>
            {p.url}
          </a>
        ),
      )}
    </>
  );
}

/** Кольцо загрузки с крестиком отмены. */
export function UploadRing({ progress, onCancel, size = 46 }: { progress?: number; onCancel?: () => void; size?: number }) {
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  const p = Math.max(0.03, Math.min(1, progress || 0));
  return (
    <button
      type="button"
      className={s.ring}
      style={{ width: size, height: size }}
      onClick={(e) => {
        e.stopPropagation();
        onCancel?.();
      }}
      aria-label="Отменить отправку"
      disabled={!onCancel}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth={3} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#fff"
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.2s' }}
        />
      </svg>
      {onCancel && <X size={size * 0.38} className={s.ringX} />}
    </button>
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
