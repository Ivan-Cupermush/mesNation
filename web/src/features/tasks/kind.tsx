import { ChevronRight, HandHeart, ListTodo } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import type { Task, TaskKind } from './types';
import s from './kind.module.css';

/**
 * Запрос — дружеская разновидность задачи: свой цвет (фиолетовый, не пересекается
 * с важностью и статусами), значок с сердечком и тёплые подписи.
 */
export const isRequest = (t: Pick<Task, 'kind'> | null | undefined) => t?.kind === 'request';

export const KIND_META: Record<TaskKind, { label: string; one: string; color: string; soft: string }> = {
  task: { label: 'Задача', one: 'задачу', color: 'var(--c-accent)', soft: 'var(--c-accent-muted)' },
  request: { label: 'Запрос', one: 'запрос', color: 'var(--c-violet)', soft: 'var(--c-violet-soft)' },
};

export function KindIcon({ kind, size = 16 }: { kind: TaskKind; size?: number }) {
  return kind === 'request' ? <HandHeart size={size} strokeWidth={2.2} /> : <ListTodo size={size} strokeWidth={2.2} />;
}

/** Метка «Запрос» на карточке и в заголовке. */
export function RequestBadge({ large }: { large?: boolean }) {
  return (
    <span className={[s.badge, large && s.large].filter(Boolean).join(' ')}>
      <HandHeart size={large ? 15 : 13} strokeWidth={2.3} />
      Запрос
    </span>
  );
}

const CHOICES: { kind: TaskKind; title: string; text: string; points: string[] }[] = [
  {
    kind: 'request',
    title: 'Запрос',
    text: 'Попросите коллегу помочь — по-дружески, без важности и проверки.',
    points: ['коллегам своего уровня', 'себе и подчинённым'],
  },
  {
    kind: 'task',
    title: 'Задача',
    text: 'Поручение с важностью, наблюдателями и проверкой результата.',
    points: ['себе', 'подчинённым'],
  },
];

/** «+» на экране задач: что создать — запрос или задачу. */
export function KindChooser({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (kind: TaskKind) => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Что создадим?" size="sm">
      <div className={s.choices}>
        {CHOICES.map((c) => (
          <button key={c.kind} type="button" className={[s.choice, c.kind === 'request' ? s.choiceRequest : s.choiceTask].join(' ')} onClick={() => onPick(c.kind)}>
            <span className={s.choiceIcon}>
              <KindIcon kind={c.kind} size={24} />
            </span>
            <span className={s.choiceBody}>
              <b>{c.title}</b>
              <span>{c.text}</span>
              <small>Кому: {c.points.join(', ')}</small>
            </span>
            <ChevronRight size={18} className={s.choiceArrow} />
          </button>
        ))}
      </div>
    </Modal>
  );
}
