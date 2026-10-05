import { useCallback, useEffect, useRef, useState, type TouchEvent } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Download, Forward, MessageSquareText, X } from 'lucide-react';
import { downloadFile, signedFileUrl } from '../../lib/http';
import { formatDate } from '../../lib/format';
import { Spinner } from '../../ui/Spinner';
import { useFeedback } from '../../ui/feedback';
import type { Message } from './types';
import s from './MediaViewer.module.css';

export interface ViewerItem extends Message {
  sender_label: string;
}

interface Props {
  items: ViewerItem[];
  index: number;
  onClose: () => void;
  onForward?: (item: ViewerItem) => void;
  onShowInChat?: (item: ViewerItem) => void;
}

/**
 * Полноэкранный просмотр фото и видео чата, как в приложении: листание
 * (стрелки, ← →, свайп), увеличение двойным кликом, свайп вниз — закрыть,
 * скачать, переслать, перейти к сообщению.
 */
export default function MediaViewer({ items, index: initialIndex, onClose, onForward, onShowInChat }: Props) {
  const { toast } = useFeedback();
  const [index, setIndex] = useState(initialIndex);
  const [urls, setUrls] = useState<Record<number, string>>({});
  const [failed, setFailed] = useState<Record<number, boolean>>({});
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const item = items[index];

  const go = useCallback(
    (delta: number) => {
      setZoom(null);
      setIndex((i) => Math.min(items.length - 1, Math.max(0, i + delta)));
    },
    [items.length],
  );

  // Защищённые файлы открываются по временной подписанной ссылке; соседние — заранее.
  useEffect(() => {
    for (const i of [index, index + 1, index - 1]) {
      const it = items[i];
      if (!it?.file_url || urls[it.id] || failed[it.id]) continue;
      signedFileUrl(it.file_url)
        .then((u) => setUrls((p) => ({ ...p, [it.id]: u })))
        .catch(() => setFailed((p) => ({ ...p, [it.id]: true })));
    }
  }, [index, items, urls, failed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    };
    document.addEventListener('keydown', onKey, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prevOverflow;
    };
  }, [go, onClose]);

  if (!item) return null;

  const onTouchStart = (e: TouchEvent) => {
    if (zoom || e.touches.length > 1) return;
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchMove = (e: TouchEvent) => {
    if (!touchStart.current) return;
    setDrag({ dx: e.touches[0].clientX - touchStart.current.x, dy: e.touches[0].clientY - touchStart.current.y });
  };
  const onTouchEnd = () => {
    const d = drag;
    touchStart.current = null;
    setDrag(null);
    if (!d) return;
    if (Math.abs(d.dy) > 120 && Math.abs(d.dy) > Math.abs(d.dx)) onClose();
    else if (d.dx < -60) go(1);
    else if (d.dx > 60) go(-1);
  };

  const url = urls[item.id];
  const isVideo = item.media_kind === 'video';
  const vertical = drag && Math.abs(drag.dy) > Math.abs(drag.dx);
  const shift = drag ? (vertical ? `translateY(${drag.dy}px)` : `translateX(${drag.dx}px)`) : '';

  const download = () => {
    if (item.file_url) downloadFile(item.file_url, item.file_name).catch((e) => toast.error(e, 'Не удалось скачать'));
  };

  return createPortal(
    <div className={s.viewer} role="dialog" aria-modal="true" aria-label="Просмотр" style={vertical ? { background: `rgba(0,0,0,${Math.max(0.3, 0.95 - Math.abs(drag!.dy) / 500)})` } : undefined}>
      <header className={s.top}>
        <div className={s.who}>
          <div className={s.name}>{item.sender_label}</div>
          <div className={s.date}>
            {formatDate(item.created_at, true)}
            {items.length > 1 && ` · ${index + 1} из ${items.length}`}
          </div>
        </div>
        {onShowInChat && (
          <button type="button" className={s.btn} onClick={() => onShowInChat(item)} title="Показать в чате" aria-label="Показать в чате">
            <MessageSquareText size={21} />
          </button>
        )}
        {onForward && (
          <button type="button" className={s.btn} onClick={() => onForward(item)} title="Переслать" aria-label="Переслать">
            <Forward size={21} />
          </button>
        )}
        <button type="button" className={s.btn} onClick={download} title="Скачать" aria-label="Скачать">
          <Download size={21} />
        </button>
        <button type="button" className={s.btn} onClick={onClose} title="Закрыть (Esc)" aria-label="Закрыть">
          <X size={23} />
        </button>
      </header>

      <div
        className={s.stage}
        onClick={(e) => e.target === e.currentTarget && onClose()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {failed[item.id] ? (
          <div className={s.error}>Не удалось загрузить файл</div>
        ) : isVideo ? (
          url ? (
            <video key={item.id} className={s.media} src={url} controls autoPlay playsInline poster={item.thumb_url || undefined} style={{ transform: shift }} />
          ) : (
            <Spinner size={36} inherit />
          )
        ) : (
          <>
            {!url && item.thumb_url && <img className={[s.media, s.blur].join(' ')} src={item.thumb_url} alt="" />}
            {url && (
              <img
                key={item.id}
                className={[s.media, zoom && s.zoomed].filter(Boolean).join(' ')}
                src={url}
                alt={item.file_name || ''}
                draggable={false}
                style={{ transform: zoom ? 'scale(2.2)' : shift, transformOrigin: zoom ? `${zoom.x}% ${zoom.y}%` : undefined }}
                onDoubleClick={(e) => {
                  if (zoom) setZoom(null);
                  else {
                    const r = e.currentTarget.getBoundingClientRect();
                    setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
                  }
                }}
                onClick={() => zoom && setZoom(null)}
              />
            )}
            {!url && <Spinner size={36} inherit />}
          </>
        )}
        {index > 0 && (
          <button type="button" className={[s.nav, s.prev].join(' ')} onClick={() => go(-1)} aria-label="Предыдущее">
            <ChevronLeft size={30} />
          </button>
        )}
        {index < items.length - 1 && (
          <button type="button" className={[s.nav, s.next].join(' ')} onClick={() => go(1)} aria-label="Следующее">
            <ChevronRight size={30} />
          </button>
        )}
      </div>

      {item.text && <div className={s.caption}>{item.text}</div>}
    </div>,
    document.body,
  );
}
