import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Play, Plus, X } from 'lucide-react';
import { fileBadge, formatSize, plural } from '../../lib/format';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { Switch } from '../../ui/Field';
import { useFeedback } from '../../ui/feedback';
import { MAX_TEXT } from './Composer';
import s from './AttachDialog.module.css';

export const MAX_FILE_BYTES = 200 * 1024 * 1024;
const MAX_ITEMS = 100;

export interface PickedItem {
  id: string;
  file: File;
  kind: 'photo' | 'video' | 'file';
  url: string | null;
  width: number | null;
  height: number | null;
}

export interface SendOptions {
  caption: string;
  group: boolean;
  asFile: boolean;
}

let seq = 0;

/** Фото/видео — по MIME; svg и прочее — файлом (как сервер в processUpload). */
export function kindOf(file: File): PickedItem['kind'] {
  if (/^image\/(jpeg|png|gif|webp|heic|heif|bmp|avif)$/i.test(file.type)) return 'photo';
  if (file.type.startsWith('video/')) return 'video';
  return 'file';
}

/** Размеры фото и видео — чтобы альбом сразу занял правильное место в ленте. */
function readSize(item: PickedItem): Promise<PickedItem> {
  if (!item.url) return Promise.resolve(item);
  return new Promise((resolve) => {
    const done = (w: number, h: number) => resolve({ ...item, width: w || null, height: h || null });
    if (item.kind === 'photo') {
      const img = new Image();
      img.onload = () => done(img.naturalWidth, img.naturalHeight);
      img.onerror = () => resolve(item);
      img.src = item.url!;
    } else {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => done(v.videoWidth, v.videoHeight);
      v.onerror = () => resolve(item);
      v.src = item.url!;
    }
  });
}

interface Props {
  /** Файлы, с которыми окно открывается (выбор, вставка, перетаскивание). null — закрыто. */
  initial: { files: File[]; kind: 'media' | 'file' } | null;
  onClose: () => void;
  onSend: (items: PickedItem[], opts: SendOptions) => void;
}

/**
 * Отправка вложений как в Telegram: превью, подпись, «Группировать»
 * (альбомом по 10) и «Без сжатия» (фото/видео — файлами). Можно убрать
 * лишнее и добавить ещё.
 */
export default function AttachDialog({ initial, onClose, onSend }: Props) {
  const { toast } = useFeedback();
  const [items, setItems] = useState<PickedItem[]>([]);
  const [caption, setCaption] = useState('');
  const [group, setGroup] = useState(true);
  const [asFile, setAsFile] = useState(false);
  const addInput = useRef<HTMLInputElement>(null);
  const urls = useRef<string[]>([]);

  const add = (files: File[], forceFile: boolean) => {
    const tooBig = files.filter((f) => f.size > MAX_FILE_BYTES);
    if (tooBig.length) toast.error(`Больше 200 МБ: ${tooBig.map((f) => f.name).join(', ')}`);
    const ok = files.filter((f) => f.size <= MAX_FILE_BYTES && f.size > 0);
    const fresh = ok.map<PickedItem>((file) => {
      const kind = forceFile ? 'file' : kindOf(file);
      const url = kind === 'file' ? null : URL.createObjectURL(file);
      if (url) urls.current.push(url);
      return { id: `p${++seq}`, file, kind, url, width: null, height: null };
    });
    setItems((prev) => {
      const next = [...prev, ...fresh].slice(0, MAX_ITEMS);
      if (prev.length + fresh.length > MAX_ITEMS) toast.error(`За раз можно отправить не больше ${MAX_ITEMS} файлов`);
      return next;
    });
    fresh.forEach((it) => readSize(it).then((sized) => setItems((prev) => prev.map((p) => (p.id === sized.id ? sized : p)))));
  };

  useEffect(() => {
    if (!initial) {
      // Окно закрыто: превью больше не нужны (у ленты свои ссылки на файлы).
      // С задержкой — пока дочитываются размеры фото и видео.
      const stale = urls.current;
      urls.current = [];
      if (stale.length) setTimeout(() => stale.forEach((u) => URL.revokeObjectURL(u)), 5000);
      return;
    }
    setCaption('');
    setGroup(true);
    setAsFile(false);
    setItems([]);
    add(initial.files, initial.kind === 'file');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  // Превью освобождаем, когда окно закрыто и файлы ушли в ленту (там свои ссылки).
  useEffect(
    () => () => {
      urls.current.forEach((u) => URL.revokeObjectURL(u));
      urls.current = [];
    },
    [],
  );

  const media = items.filter((i) => i.kind !== 'file');
  const docs = items.filter((i) => i.kind === 'file');
  const allMedia = items.length > 0 && docs.length === 0;
  const showAsFiles = asFile || !allMedia;

  const title = useMemo(() => {
    const n = items.length;
    if (!n) return 'Отправка';
    if (allMedia && !asFile) {
      const photos = media.filter((m) => m.kind === 'photo').length;
      if (photos === n) return `Отправить ${n} ${plural(n, ['фото', 'фото', 'фото'])}`;
      if (photos === 0) return `Отправить ${n} ${plural(n, ['видео', 'видео', 'видео'])}`;
      return `Отправить ${n} ${plural(n, ['медиафайл', 'медиафайла', 'медиафайлов'])}`;
    }
    return `Отправить ${n} ${plural(n, ['файл', 'файла', 'файлов'])}`;
  }, [items.length, allMedia, asFile, media]);

  const submit = () => {
    if (!items.length) return;
    onSend(items, { caption: caption.trim(), group: group && items.length > 1, asFile: showAsFiles });
    onClose();
  };

  return (
    <Modal
      open={!!initial}
      onClose={onClose}
      title={title}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={submit} disabled={!items.length}>
            Отправить
          </Button>
        </>
      }
    >
      <div
        className={s.body}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          add(Array.from(e.dataTransfer.files), false);
        }}
      >
        {!showAsFiles ? (
          <div className={s.grid}>
            {items.map((it) => (
              <div key={it.id} className={s.thumb}>
                {it.kind === 'photo' ? <img src={it.url!} alt="" /> : <video src={it.url!} muted preload="metadata" />}
                {it.kind === 'video' && (
                  <span className={s.play}>
                    <Play size={18} fill="#fff" />
                  </span>
                )}
                <button type="button" className={s.remove} onClick={() => setItems((p) => p.filter((x) => x.id !== it.id))} aria-label="Убрать">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className={s.list}>
            {items.map((it) => {
              const badge = fileBadge(it.file.name);
              return (
                <div key={it.id} className={s.fileRow}>
                  {it.url && it.kind === 'photo' ? (
                    <img className={s.fileThumb} src={it.url} alt="" />
                  ) : (
                    <span className={s.fileIcon} style={{ background: badge.color }}>
                      {badge.ext || <FileText size={18} />}
                    </span>
                  )}
                  <span className={s.fileInfo}>
                    <span className={s.fileName}>{it.file.name}</span>
                    <span className={s.fileSize}>{formatSize(it.file.size)}</span>
                  </span>
                  <button type="button" className={s.removeRow} onClick={() => setItems((p) => p.filter((x) => x.id !== it.id))} aria-label="Убрать">
                    <X size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <button type="button" className={s.addMore} onClick={() => addInput.current?.click()}>
          <Plus size={18} /> Добавить
        </button>
        <input
          ref={addInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            add(Array.from(e.currentTarget.files || []), false);
            e.currentTarget.value = '';
          }}
        />

        <textarea
          className={s.caption}
          value={caption}
          maxLength={MAX_TEXT}
          rows={2}
          placeholder="Подпись"
          onChange={(e) => setCaption(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
        />

        {items.length > 1 && (
          <label className={s.option}>
            <span>
              <b>Группировать</b>
              <small>{showAsFiles ? 'Файлы одной группой' : 'Альбомом по 10, как в Telegram'}</small>
            </span>
            <Switch checked={group} onChange={setGroup} label="Группировать" />
          </label>
        )}
        {allMedia && (
          <label className={s.option}>
            <span>
              <b>Без сжатия</b>
              <small>Отправить как файлы — в исходном качестве</small>
            </span>
            <Switch checked={asFile} onChange={setAsFile} label="Без сжатия" />
          </label>
        )}
      </div>
    </Modal>
  );
}
