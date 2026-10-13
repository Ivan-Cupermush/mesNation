import React from 'react';
import { View, Text } from 'react-native';
import { Sparkles, PlayCircle, Eye, CheckCircle2, XCircle, Archive, AlertCircle, Check } from 'lucide-react-native';

import { T, themed } from '../../theme/runtime';
/**
 * Единый словарь статусов задачи для всех экранов: подпись, цвет,
 * иконка и этап (для шкалы «Новая → В работе → На проверке → Принята»).
 * Цвета смысловые: синий — идёт работа, жёлтый — ждёт проверки,
 * зелёный — готово, красный — проблема (отклонена/просрочена).
 */

export interface StatusMeta {
  label: string;
  color: string;
  soft: string;
  icon: any;
  step: number; // 0..3
}

export const TASK_STATUS: Record<string, StatusMeta> = {
  new: { label: 'Новая', color: T.textSecondary, soft: T.inputBg, icon: Sparkles, step: 0 },
  in_progress: { label: 'В работе', color: T.info, soft: T.infoSoft, icon: PlayCircle, step: 1 },
  on_review: { label: 'На проверке', color: T.warning, soft: T.warningSoft, icon: Eye, step: 2 },
  rejected: { label: 'На доработке', color: T.danger, soft: T.dangerSoft, icon: XCircle, step: 1 },
  done: { label: 'Принята', color: T.success, soft: T.successSoft, icon: CheckCircle2, step: 3 },
  overdue: { label: 'Просрочена', color: T.danger, soft: T.dangerSoft, icon: AlertCircle, step: 1 },
  archived: { label: 'В архиве', color: T.textSecondary, soft: T.inputBg, icon: Archive, step: 3 }
};

/** У просьбы нет проверки: «Принята» → «Выполнена», этапов три. */
export const statusMeta = (s?: string | null, kind?: string | null): StatusMeta => {
  const base = TASK_STATUS[s || 'new'] || TASK_STATUS.new;
  return kind === 'request' && s === 'done' ? { ...base, label: 'Выполнена', step: 2 } : base;
};

const STEPS = ['Новая', 'В работе', 'Проверка', 'Принята'];
const REQUEST_STEPS = ['Новая', 'В работе', 'Готово'];

/** Компактная метка статуса для списков. */
export function StatusPill({ status, overdue, kind }: { status: string; overdue?: boolean; kind?: string | null }) {
  const m = statusMeta(status, kind);
  const late = overdue && status !== 'done' && status !== 'archived';
  const color = late ? T.danger : m.color;
  return (
    <View style={[styles.pill, { backgroundColor: late ? T.dangerSoft : m.soft }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.pillText, { color }]} numberOfLines={1}>
        {late && status !== 'overdue' ? `${m.label} · срок вышел` : m.label}
      </Text>
    </View>
  );
}

/** Мини-прогресс из 4 сегментов (для карточек). */
export function StatusSegments({ status, kind }: { status: string; kind?: string | null }) {
  const m = statusMeta(status, kind);
  const total = kind === 'request' ? 3 : 4;
  const filled = status === 'archived' ? total : m.step + 1;
  return (
    <View style={styles.segments}>
      {Array.from({ length: total }, (_, i) => i).map((i) => (
        <View key={i} style={[styles.segment, { backgroundColor: i < filled ? m.color : T.textMuted }]} />
      ))}
    </View>
  );
}

/**
 * Шкала этапов для карточки задачи: пройденные этапы — галочки,
 * текущий — крупная иконка статуса. «На доработке» и «Просрочена»
 * отображаются на этапе «В работе» красным.
 */
export function StatusTrack({ status, kind }: { status: string; kind?: string | null }) {
  const m = statusMeta(status, kind);
  const archived = status === 'archived';
  const current = m.step;
  const Icon = m.icon;
  const steps = kind === 'request' ? REQUEST_STEPS : STEPS;
  return (
    <View style={styles.track}>
      {steps.map((label, i) => {
        const done = archived || i < current || (status === 'done' && i === steps.length - 1);
        const active = !archived && i === current && status !== 'done';
        const color = active ? m.color : done ? T.success : T.textMuted;
        return (
          <React.Fragment key={label}>
            {i > 0 && <View style={[styles.line, { backgroundColor: i <= current || archived ? T.success : T.surfaceActive }]} />}
            <View style={styles.stepWrap}>
              <View style={[styles.node, { borderColor: color, backgroundColor: done ? T.success : active ? m.soft : T.card }]}>
                {done ? <Check size={13} color={T.onAccent} strokeWidth={3} /> : active ? <Icon size={14} color={m.color} strokeWidth={2.4} /> : null}
              </View>
              <Text style={[styles.stepLabel, { color: active ? m.color : done ? T.textPrimary : T.textMuted }, active && styles.stepLabelActive]} numberOfLines={1}>
                {active && (status === 'rejected' || status === 'overdue') ? m.label : label}
              </Text>
            </View>
          </React.Fragment>
        );
      })}
    </View>
  );
}

/** Что дальше по просьбе — тепло и по-человечески (как на сайте). */
function requestHint(status: string, roles: { creator: boolean; assignee: boolean }, thanked?: boolean): string {
  switch (status) {
    case 'new':
      return roles.assignee ? 'Вас попросили помочь. Возьмите в работу или сразу отметьте «Готово».' : 'Просьба отправлена — ждём, когда коллега возьмётся.';
    case 'in_progress':
      return roles.assignee ? 'Когда сделаете — нажмите «Готово». Проверки не будет.' : 'Коллега уже занимается вашей просьбой.';
    case 'overdue':
      return roles.assignee ? 'Срок вышел. Если всё сделано — отметьте «Готово».' : 'Срок вышел. Можно перенести его в меню «⋯» или напомнить в комментариях.';
    case 'done':
      if (roles.creator) return thanked ? 'Просьба выполнена — вы уже сказали спасибо.' : 'Просьба выполнена! Скажите коллеге спасибо — это приятно.';
      return thanked ? 'Готово — вас поблагодарили. Так держать!' : 'Готово! Спасибо, что помогли коллеге.';
    case 'archived':
      return 'Просьба в архиве.';
    default:
      return '';
  }
}

/** Подсказка «что дальше» с точки зрения текущего пользователя. */
export function nextStepHint(
  status: string,
  roles: { creator: boolean; assignee: boolean; watcher?: boolean },
  kind?: string | null,
  thanked?: boolean,
): string {
  if (kind === 'request') return requestHint(status, roles, thanked);
  const self = roles.creator && roles.assignee;
  // Проверяют наблюдатели; у создателя всегда права наблюдателя.
  const reviewer = roles.creator || !!roles.watcher;
  switch (status) {
    case 'new':
      return roles.assignee ? 'Возьмите задачу в работу, когда начнёте.' : 'Ждём, пока исполнитель возьмёт задачу в работу.';
    case 'in_progress':
      if (self) return 'Когда закончите — нажмите «Завершить».';
      return roles.assignee ? 'Когда закончите — отправьте на проверку.' : 'Исполнитель работает над задачей.';
    case 'on_review':
      return reviewer ? 'Проверьте результат: примите задачу или верните с комментарием.' : 'Результат на проверке у наблюдателей.';
    case 'rejected':
      return roles.assignee ? 'Задачу вернули — посмотрите причину в истории и доработайте.' : 'Задача на доработке у исполнителя.';
    case 'overdue':
      return roles.assignee ? 'Срок вышел. Завершите работу или договоритесь о новом сроке.' : 'Срок вышел. Можно перенести дедлайн в меню «⋯» вверху.';
    case 'done':
      if (roles.creator) return 'Задача принята. Её можно архивировать или вернуть на доработку.';
      return reviewer ? 'Задача принята. При необходимости её можно вернуть на доработку.' : 'Задача принята.';
    case 'archived':
      return 'Задача в архиве.';
    default:
      return '';
  }
}

const styles = themed(() => ({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 26, borderRadius: 13, maxWidth: 190 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  pillText: { fontSize: 12, fontWeight: '700' },
  segments: { flexDirection: 'row', gap: 3 },
  segment: { width: 12, height: 4, borderRadius: 2 },
  track: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 4 },
  stepWrap: { alignItems: 'center', width: 64 },
  node: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  line: { flex: 1, height: 2, marginTop: 12, borderRadius: 1 },
  stepLabel: { fontSize: 11, marginTop: 5, fontWeight: '600' },
  stepLabelActive: { fontWeight: '800' }
}));
