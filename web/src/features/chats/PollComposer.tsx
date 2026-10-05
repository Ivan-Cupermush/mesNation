import { useEffect, useRef, useState } from 'react';
import { Check, FileText, ImagePlus, Lightbulb, Paperclip, Play, X } from 'lucide-react';
import { api, upload } from '../../lib/http';
import { fileBadge, formatSize, plural } from '../../lib/format';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { Switch } from '../../ui/Field';
import { useFeedback } from '../../ui/feedback';
import { kindOf, MAX_FILE_BYTES } from './AttachDialog';
import s from './PollComposer.module.css';

const MAX_OPTIONS = 10;

interface Props {
  open: boolean;
  chatId: string;
  topicId: number | null;
  onClose: () => void;
}

interface Media {
  file: File;
  kind: 'photo' | 'video' | 'file';
  url: string | null;
}

/**
 * «Новый опрос» как в приложении: вопрос, до 10 вариантов (новое поле
 * появляется само), анонимность, несколько ответов, викторина с правильным
 * ответом и пояснением, фото/видео/файл над вопросом.
 */
export default function PollComposer({ open, chatId, topicId, onClose }: Props) {
  const { toast } = useFeedback();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [anonymous, setAnonymous] = useState(true);
  const [multiple, setMultiple] = useState(false);
  const [quiz, setQuiz] = useState(false);
  const [correct, setCorrect] = useState<number | null>(null);
  const [explanation, setExplanation] = useState('');
  const [media, setMedia] = useState<Media | null>(null);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const mediaInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuestion('');
    setOptions(['', '']);
    setAnonymous(true);
    setMultiple(false);
    setQuiz(false);
    setCorrect(null);
    setExplanation('');
    setMedia(null);
    setProgress(0);
  }, [open]);

  useEffect(() => () => void (media?.url && URL.revokeObjectURL(media.url)), [media]);

  const pick = (input: HTMLInputElement, asFile: boolean) => {
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) {
      toast.error('Файл больше 200 МБ');
      return;
    }
    const kind = asFile ? 'file' : kindOf(f);
    setMedia({ file: f, kind, url: kind === 'file' ? null : URL.createObjectURL(f) });
  };

  const setOption = (i: number, value: string) =>
    setOptions((prev) => {
      const next = [...prev];
      next[i] = value;
      // Заполнили последний вариант — появляется следующий пустой.
      if (i === next.length - 1 && value.trim() && next.length < MAX_OPTIONS) next.push('');
      return next;
    });

  const removeOption = (i: number) => {
    setOptions((prev) => {
      const next = prev.filter((_, k) => k !== i);
      while (next.length < 2) next.push('');
      return next;
    });
    setCorrect((c) => (c === null ? null : c === i ? null : c > i ? c - 1 : c));
  };

  const filled = options.map((o) => o.trim()).filter(Boolean);
  const left = MAX_OPTIONS - filled.length;
  const problem = !question.trim()
    ? 'Введите вопрос'
    : filled.length < 2
      ? 'Нужно хотя бы два варианта ответа'
      : quiz && (correct === null || !options[correct]?.trim())
        ? 'Отметьте правильный ответ — нажмите на кружок слева от варианта'
        : null;

  const submit = async () => {
    if (problem) {
      toast(problem);
      return;
    }
    let correctIndex: number | null = null;
    const cleaned: string[] = [];
    options.forEach((o, i) => {
      if (!o.trim()) return;
      if (quiz && i === correct) correctIndex = cleaned.length;
      cleaned.push(o.trim());
    });
    const body = {
      chat_id: Number(chatId),
      topic_id: topicId,
      question: question.trim(),
      options: cleaned,
      is_anonymous: anonymous,
      allows_multiple: multiple && !quiz,
      is_quiz: quiz,
      correct_option_index: correctIndex,
      explanation: quiz && explanation.trim() ? explanation.trim() : null,
    };
    setSending(true);
    try {
      if (media) {
        await upload('/api/polls/with-media', 'file', media.file, media.file.name, { payload: JSON.stringify(body), as_file: media.kind === 'file' ? 'true' : undefined }, setProgress).promise;
      } else {
        await api.post('/api/polls', body);
      }
      // Сам опрос придёт в ленту по сокету.
      onClose();
    } catch (e) {
      toast.error(e, 'Не удалось создать опрос');
    } finally {
      setSending(false);
    }
  };

  const badge = media ? fileBadge(media.file.name) : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      persistent={sending}
      title={quiz ? 'Новая викторина' : 'Новый опрос'}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={sending}>
            Отмена
          </Button>
          <Button onClick={submit} loading={sending} disabled={!!problem}>
            {sending && media ? `${Math.round(progress * 100)}%` : 'Создать'}
          </Button>
        </>
      }
    >
      <div className={s.body}>
        {media ? (
          <div className={s.media}>
            {media.kind === 'file' ? (
              <div className={s.mediaFile}>
                <span className={s.badge} style={{ background: badge!.color }}>
                  {badge!.ext || <FileText size={18} />}
                </span>
                <span className={s.mediaInfo}>
                  <span className={s.mediaName}>{media.file.name}</span>
                  <span className={s.mediaSize}>{formatSize(media.file.size)}</span>
                </span>
              </div>
            ) : (
              <div className={s.mediaPreview}>
                {media.kind === 'photo' ? <img src={media.url!} alt="" /> : <video src={media.url!} muted preload="metadata" />}
                {media.kind === 'video' && (
                  <span className={s.play}>
                    <Play size={20} fill="#fff" />
                  </span>
                )}
              </div>
            )}
            <button type="button" className={s.mediaRemove} onClick={() => setMedia(null)} aria-label="Убрать вложение">
              <X size={15} />
            </button>
          </div>
        ) : (
          <div className={s.mediaActions}>
            <button type="button" className={s.mediaAction} onClick={() => mediaInput.current?.click()}>
              <ImagePlus size={19} /> Фото или видео
            </button>
            <button type="button" className={s.mediaAction} onClick={() => fileInput.current?.click()}>
              <Paperclip size={19} /> Файл
            </button>
          </div>
        )}
        <input ref={mediaInput} type="file" accept="image/*,video/*" hidden onChange={(e) => pick(e.currentTarget, false)} />
        <input ref={fileInput} type="file" hidden onChange={(e) => pick(e.currentTarget, true)} />

        <div className={s.section}>Вопрос</div>
        <textarea
          className={s.question}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Задайте вопрос"
          maxLength={255}
          rows={2}
          autoFocus
        />

        <div className={s.section}>Варианты ответа</div>
        <div className={s.card}>
          {options.map((o, i) => {
            const isLastEmpty = i === options.length - 1 && !o.trim() && options.length > 2;
            return (
              <div key={i} className={s.optionRow}>
                {quiz && (
                  <button
                    type="button"
                    className={[s.radio, correct === i && s.radioOn].filter(Boolean).join(' ')}
                    onClick={() => setCorrect(i)}
                    aria-label="Правильный ответ"
                    title="Правильный ответ"
                  >
                    {correct === i && <Check size={13} strokeWidth={3} />}
                  </button>
                )}
                <input
                  ref={(el) => {
                    inputs.current[i] = el;
                  }}
                  className={s.optionInput}
                  value={o}
                  onChange={(e) => setOption(i, e.target.value)}
                  placeholder={i < 2 ? `Вариант ${i + 1}` : 'Добавить вариант'}
                  maxLength={100}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      inputs.current[i + 1]?.focus();
                    }
                  }}
                />
                {!isLastEmpty && options.length > 2 && (
                  <button type="button" className={s.optionRemove} onClick={() => removeOption(i)} aria-label="Удалить вариант">
                    <X size={17} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <div className={s.hint}>
          {left > 0 ? `Можно добавить ещё ${left} ${plural(left, ['вариант', 'варианта', 'вариантов'])}.` : 'Добавлено максимальное число вариантов.'}
          {quiz ? ' Нажмите на кружок, чтобы отметить правильный ответ.' : ''}
        </div>

        <div className={s.section}>Настройки</div>
        <div className={s.card}>
          <Setting title="Анонимное голосование" hint="Никто не увидит, кто как проголосовал" value={anonymous} onChange={setAnonymous} />
          <Setting
            title="Выбор нескольких ответов"
            hint={quiz ? 'Недоступно в викторине' : 'Можно отметить несколько вариантов'}
            value={multiple && !quiz}
            onChange={setMultiple}
            disabled={quiz}
          />
          <Setting
            title="Режим викторины"
            hint="Один правильный ответ, изменить ответ нельзя"
            value={quiz}
            onChange={(v) => {
              setQuiz(v);
              if (v) setMultiple(false);
              else setCorrect(null);
            }}
          />
        </div>

        {quiz && (
          <>
            <div className={s.section}>Пояснение</div>
            <div className={s.explain}>
              <Lightbulb size={18} />
              <input
                className={s.optionInput}
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
                placeholder="Покажется после ответа (необязательно)"
                maxLength={200}
              />
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function Setting({ title, hint, value, onChange, disabled }: { title: string; hint: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={[s.setting, disabled && s.settingDisabled].filter(Boolean).join(' ')}>
      <span className={s.settingText}>
        <b>{title}</b>
        <small>{hint}</small>
      </span>
      <Switch checked={value} onChange={onChange} label={title} disabled={disabled} />
    </label>
  );
}
