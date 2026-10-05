import { useEffect, useState } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { api } from '../../lib/http';
import { withAlpha } from '../../theme/palettes';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { TextField } from '../../ui/Field';
import { useFeedback } from '../../ui/feedback';
import { TOPIC_COLORS, TOPIC_ICONS, TOPIC_OPACITIES, TopicIcon } from './topicIcons';
import type { Topic } from './types';
import s from './TopicEditor.module.css';

interface Props {
  open: boolean;
  chatId: string;
  /** null — новая тема. */
  topic: Topic | null;
  onClose: () => void;
  onSaved: (topic: Topic) => void;
}

const DEFAULT = { icon: 'hash', color: TOPIC_COLORS[0], opacity: 1 };

/** Создание и редактирование темы: название, иконка, цвет, прозрачность (как в приложении). */
export default function TopicEditor({ open, chatId, topic, onClose, onSaved }: Props) {
  const { toast } = useFeedback();
  const [title, setTitle] = useState('');
  const [icon, setIcon] = useState(DEFAULT.icon);
  const [color, setColor] = useState(DEFAULT.color);
  const [opacity, setOpacity] = useState(DEFAULT.opacity);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(topic?.title || '');
    setIcon(topic?.icon || DEFAULT.icon);
    setColor(topic?.icon_color || DEFAULT.color);
    setOpacity(topic?.icon_opacity ?? DEFAULT.opacity);
  }, [open, topic]);

  const save = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const body = { title: title.trim(), icon, icon_color: color, icon_opacity: opacity };
      const saved = topic ? await api.patch<Topic>(`/api/topics/${topic.id}`, body) : await api.post<Topic>(`/api/chats/${chatId}/topics`, body);
      onSaved(saved);
      onClose();
    } catch (e) {
      toast.error(e, topic ? 'Не удалось сохранить тему' : 'Не удалось создать тему');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      persistent={saving}
      title={topic ? 'Изменить тему' : 'Новая тема'}
      size="md"
      footer={
        <>
          <IconReset
            onClick={() => {
              setIcon(DEFAULT.icon);
              setColor(DEFAULT.color);
              setOpacity(DEFAULT.opacity);
            }}
          />
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Отмена
          </Button>
          <Button onClick={save} loading={saving} disabled={!title.trim()}>
            {topic ? 'Сохранить' : 'Создать тему'}
          </Button>
        </>
      }
    >
      <div className={s.titleRow}>
        <TopicIcon topic={{ icon, icon_color: color, icon_opacity: opacity }} size={48} />
        <TextField
          className={s.titleField}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Название темы"
          maxLength={255}
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
      </div>

      <div className={s.label}>Цвет</div>
      <div className={s.colors}>
        {TOPIC_COLORS.map((c) => (
          <button key={c} type="button" className={s.color} style={{ background: c }} onClick={() => setColor(c)} aria-label={`Цвет ${c}`}>
            {color === c && <Check size={15} strokeWidth={3} />}
          </button>
        ))}
      </div>

      <div className={s.label}>Иконка</div>
      <div className={s.icons}>
        {Object.entries(TOPIC_ICONS).map(([key, Icon]) => (
          <button
            key={key}
            type="button"
            className={s.icon}
            style={icon === key ? { background: withAlpha(color, 0.14), borderColor: color, color } : undefined}
            onClick={() => setIcon(key)}
            aria-label={key}
          >
            <Icon size={20} />
          </button>
        ))}
      </div>

      <div className={s.label}>Прозрачность иконки</div>
      <div className={s.opacities}>
        {TOPIC_OPACITIES.map((o) => (
          <button key={o.value} type="button" className={[s.chip, opacity === o.value && s.chipOn].filter(Boolean).join(' ')} onClick={() => setOpacity(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </Modal>
  );
}

function IconReset({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className={s.reset} onClick={onClick} title="Как по умолчанию" aria-label="Как по умолчанию">
      <RotateCcw size={17} />
    </button>
  );
}
