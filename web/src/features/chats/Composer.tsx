import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { CalendarClock, Check, FileText, Image as ImageIcon, NotebookPen, Paperclip, SendHorizonal, BarChart3 } from 'lucide-react';
import { storage } from '../../lib/storage';
import { useMedia } from '../../lib/useMedia';
import { useTheme } from '../../theme/ThemeProvider';
import { ActionMenu, type MenuItem } from '../../ui/ActionMenu';
import { anchorFrom, type MenuAnchor } from '../../ui/menuAnchor';
import type { Message } from './types';
import s from './Composer.module.css';

export const MAX_TEXT = 4000;
const LONG_PRESS_MS = 400;
const TYPING_EVERY_MS = 3000;

export interface ComposerHandle {
  focus: () => void;
  clear: () => void;
}

interface Props {
  /** Ключ черновика: свой у каждого чата и темы. */
  draftKey: string;
  editing: Message | null;
  onSend: (text: string) => void;
  /** Сохранить правку. true — получилось (поле очищается). */
  onSaveEdit: (text: string) => Promise<boolean>;
  /** Esc: отменить ответ или правку. */
  onCancel: () => void;
  onSchedule: (text: string) => void;
  onFiles: (files: File[], kind: 'media' | 'file') => void;
  onPoll: () => void;
  onNote: () => void;
  /** Стрелка вверх в пустом поле — изменить своё последнее сообщение. */
  onEditLast: () => void;
  onTyping: () => void;
  onStopTyping: () => void;
}

const draftStorageKey = (key: string) => `offix.draft.${key}`;

/**
 * Поле ввода как в приложении: скрепка (фото/видео, файл, опрос, заметка),
 * растущее поле, кнопка отправки; правый клик или долгое нажатие на ней —
 * «Отправить позже». Черновик хранится для каждого чата отдельно.
 */
export const Composer = forwardRef<ComposerHandle, Props>(function Composer(props, ref) {
  const { draftKey, editing } = props;
  const { sendByEnter } = useTheme();
  const touch = useMedia('(pointer: coarse)');
  const [text, setText] = useState(() => storage.get(draftStorageKey(draftKey)) || '');
  const [attachAnchor, setAttachAnchor] = useState<MenuAnchor | null>(null);
  const [sendAnchor, setSendAnchor] = useState<MenuAnchor | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mediaInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTyping = useRef(0);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const savedDraft = useRef<string | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  const focus = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const persistDraft = useCallback(
    (value: string) => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
      draftTimer.current = setTimeout(() => {
        if (value.trim()) storage.set(draftStorageKey(draftKey), value);
        else storage.remove(draftStorageKey(draftKey));
      }, 400);
    },
    [draftKey],
  );

  const clear = useCallback(() => {
    setText('');
    if (draftTimer.current) clearTimeout(draftTimer.current);
    storage.remove(draftStorageKey(draftKey));
  }, [draftKey]);

  useImperativeHandle(ref, () => ({ focus, clear }), [focus, clear]);

  // Другой чат — свой черновик.
  useEffect(() => {
    setText(storage.get(draftStorageKey(draftKey)) || '');
    savedDraft.current = null;
    return () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
    };
  }, [draftKey]);

  // Правка: в поле текст сообщения, черновик откладываем и потом возвращаем.
  const editingId = editing?.id ?? null;
  useEffect(() => {
    if (editingId !== null) {
      if (savedDraft.current === null) savedDraft.current = inputRef.current?.value ?? '';
      setText(propsRef.current.editing?.text || '');
      setTimeout(focus, 0);
    } else if (savedDraft.current !== null) {
      setText(savedDraft.current);
      savedDraft.current = null;
    }
  }, [editingId, focus]);

  // Высота поля по содержимому.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, Math.round(window.innerHeight * 0.4))}px`;
  }, [text]);

  const onChange = (value: string) => {
    setText(value);
    if (editing) return; // правка сообщения — не черновик
    persistDraft(value);
    const now = Date.now();
    if (value.trim() && now - lastTyping.current > TYPING_EVERY_MS) {
      lastTyping.current = now;
      props.onTyping();
    } else if (!value.trim() && lastTyping.current) {
      lastTyping.current = 0;
      props.onStopTyping();
    }
  };

  const submit = async () => {
    const t = text.trim();
    if (editing) {
      // У фото и файлов подпись можно убрать, у текста — нет.
      if (!t && !editing.file_url) return;
      if (await props.onSaveEdit(t)) setText(savedDraft.current ?? '');
      return;
    }
    if (!t) return;
    lastTyping.current = 0;
    props.onStopTyping();
    props.onSend(t);
    clear();
    focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') {
      const force = e.ctrlKey || e.metaKey;
      const byEnter = sendByEnter && !touch && !e.shiftKey && !e.altKey;
      if (force || byEnter) {
        e.preventDefault();
        submit();
      }
      return;
    }
    if (e.key === 'Escape' && (editing || text === '')) {
      e.preventDefault();
      props.onCancel();
      return;
    }
    if (e.key === 'ArrowUp' && !text && !editing) {
      e.preventDefault();
      props.onEditLast();
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData.files || []);
    if (!files.length || editing) return;
    // Из Excel/Word вместе с текстом приходит картинка-снимок — тогда вставляем текст.
    if (e.clipboardData.getData('text/plain').trim()) return;
    e.preventDefault();
    props.onFiles(files, files.every((f) => /^(image|video)\//.test(f.type)) ? 'media' : 'file');
  };

  const pickFiles = (input: HTMLInputElement | null, kind: 'media' | 'file') => {
    const files = Array.from(input?.files || []);
    if (input) input.value = '';
    if (files.length) props.onFiles(files, kind);
  };

  const canSend = !!text.trim() || (!!editing && !!editing.file_url);

  const attachItems: MenuItem[] = [
    { key: 'media', label: 'Фото или видео', icon: <ImageIcon size={19} />, onSelect: () => mediaInput.current?.click() },
    { key: 'file', label: 'Файл', icon: <FileText size={19} />, onSelect: () => fileInput.current?.click() },
    { key: 'poll', label: 'Опрос', icon: <BarChart3 size={19} />, onSelect: props.onPoll },
    { key: 'note', label: 'Заметка', icon: <NotebookPen size={19} />, onSelect: props.onNote },
  ];

  const sendItems: MenuItem[] = [
    { key: 'schedule', label: 'Отправить позже', icon: <CalendarClock size={19} />, onSelect: () => props.onSchedule(text.trim()) },
  ];

  const openSendMenu = (anchor: MenuAnchor) => {
    if (!editing && text.trim()) setSendAnchor(anchor);
  };

  const left = MAX_TEXT - text.length;

  return (
    <div className={s.bar}>
      <button
        type="button"
        className={s.iconBtn}
        aria-label="Прикрепить"
        title="Прикрепить"
        disabled={!!editing}
        onClick={(e) => setAttachAnchor(anchorFrom(e.currentTarget))}
      >
        <Paperclip size={23} />
      </button>
      <input ref={mediaInput} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => pickFiles(e.currentTarget, 'media')} />
      <input ref={fileInput} type="file" multiple hidden onChange={(e) => pickFiles(e.currentTarget, 'file')} />

      <div className={s.inputWrap}>
        <textarea
          ref={inputRef}
          className={s.input}
          value={text}
          rows={1}
          maxLength={MAX_TEXT}
          placeholder={editing?.file_url ? 'Подпись' : 'Сообщение'}
          enterKeyHint={sendByEnter && !touch ? 'send' : 'enter'}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={() => {
            if (lastTyping.current) {
              lastTyping.current = 0;
              props.onStopTyping();
            }
          }}
          aria-label="Сообщение"
        />
        {left < 300 && <span className={[s.counter, left < 50 && s.counterWarn].filter(Boolean).join(' ')}>{left}</span>}
      </div>

      <button
        type="button"
        className={[s.send, canSend && s.sendActive].filter(Boolean).join(' ')}
        aria-label={editing ? 'Сохранить' : 'Отправить'}
        title={editing ? 'Сохранить' : 'Отправить (правый клик — отправить позже)'}
        disabled={!canSend}
        onClick={() => {
          if (longPressed.current) {
            longPressed.current = false;
            return;
          }
          submit();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          openSendMenu({ x: e.clientX, y: e.clientY });
        }}
        onTouchStart={(e) => {
          const t = e.touches[0];
          longPressed.current = false;
          pressTimer.current = setTimeout(() => {
            longPressed.current = true;
            openSendMenu({ x: t.clientX, y: t.clientY });
          }, LONG_PRESS_MS);
        }}
        onTouchEnd={() => pressTimer.current && clearTimeout(pressTimer.current)}
        onTouchMove={() => pressTimer.current && clearTimeout(pressTimer.current)}
        // Кнопка не забирает фокус у поля: клавиатура на телефоне не прячется.
        onMouseDown={(e) => e.preventDefault()}
      >
        {editing ? <Check size={21} strokeWidth={2.6} /> : <SendHorizonal size={20} strokeWidth={2.3} />}
      </button>

      <ActionMenu open={!!attachAnchor} anchor={attachAnchor} items={attachItems} title="Прикрепить" onClose={() => setAttachAnchor(null)} />
      <ActionMenu open={!!sendAnchor} anchor={sendAnchor} items={sendItems} onClose={() => setSendAnchor(null)} />
    </div>
  );
});
