import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Sparkles, PlayCircle, Eye, CheckCircle2, XCircle, Archive, AlertCircle, Check } from 'lucide-react-native';

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
  new: { label: 'Новая', color: '#64748B', soft: '#F1F5F9', icon: Sparkles, step: 0 },
  in_progress: { label: 'В работе', color: '#2563EB', soft: '#DBEAFE', icon: PlayCircle, step: 1 },
  on_review: { label: 'На проверке', color: '#D97706', soft: '#FEF3C7', icon: Eye, step: 2 },
  rejected: { label: 'На доработке', color: '#DC2626', soft: '#FEE2E2', icon: XCircle, step: 1 },
  done: { label: 'Принята', color: '#16A34A', soft: '#DCFCE7', icon: CheckCircle2, step: 3 },
  overdue: { label: 'Просрочена', color: '#B91C1C', soft: '#FEE2E2', icon: AlertCircle, step: 1 },
  archived: { label: 'В архиве', color: '#6B7280', soft: '#F3F4F6', icon: Archive, step: 3 },
};

export const statusMeta = (s?: string | null) => TASK_STATUS[s || 'new'] || TASK_STATUS.new;

const STEPS = ['Новая', 'В работе', 'Проверка', 'Принята'];

/** Компактная метка статуса для списков. */
export function StatusPill({ status, overdue }: { status: string; overdue?: boolean }) {
  const m = statusMeta(status);
  const late = overdue && status !== 'done' && status !== 'archived';
  const color = late ? '#B91C1C' : m.color;
  return (
    <View style={[styles.pill, { backgroundColor: late ? '#FEE2E2' : m.soft }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.pillText, { color }]} numberOfLines={1}>
        {late && status !== 'overdue' ? `${m.label} · срок вышел` : m.label}
      </Text>
    </View>
  );
}

/** Мини-прогресс из 4 сегментов (для карточек). */
export function StatusSegments({ status }: { status: string }) {
  const m = statusMeta(status);
  const filled = status === 'archived' ? 4 : m.step + 1;
  return (
    <View style={styles.segments}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={[styles.segment, { backgroundColor: i < filled ? m.color : '#E5E7EB' }]} />
      ))}
    </View>
  );
}

/**
 * Шкала этапов для карточки задачи: пройденные этапы — галочки,
 * текущий — крупная иконка статуса. «На доработке» и «Просрочена»
 * отображаются на этапе «В работе» красным.
 */
export function StatusTrack({ status }: { status: string }) {
  const m = statusMeta(status);
  const archived = status === 'archived';
  const current = m.step;
  const Icon = m.icon;
  return (
    <View style={styles.track}>
      {STEPS.map((label, i) => {
        const done = archived || i < current || (status === 'done' && i === 3);
        const active = !archived && i === current && status !== 'done';
        const color = active ? m.color : done ? '#16A34A' : '#CBD5E1';
        return (
          <React.Fragment key={label}>
            {i > 0 && <View style={[styles.line, { backgroundColor: i <= current || archived ? '#16A34A' : '#E2E8F0' }]} />}
            <View style={styles.stepWrap}>
              <View style={[styles.node, { borderColor: color, backgroundColor: done ? '#16A34A' : active ? m.soft : '#FFFFFF' }]}>
                {done ? <Check size={13} color="#FFFFFF" strokeWidth={3} /> : active ? <Icon size={14} color={m.color} strokeWidth={2.4} /> : null}
              </View>
              <Text style={[styles.stepLabel, { color: active ? m.color : done ? '#334155' : '#94A3B8' }, active && styles.stepLabelActive]} numberOfLines={1}>
                {active && (status === 'rejected' || status === 'overdue') ? m.label : label}
              </Text>
            </View>
          </React.Fragment>
        );
      })}
    </View>
  );
}

/** Подсказка «что дальше» с точки зрения текущего пользователя. */
export function nextStepHint(status: string, roles: { creator: boolean; assignee: boolean }): string {
  const self = roles.creator && roles.assignee;
  switch (status) {
    case 'new':
      return roles.assignee ? 'Возьмите задачу в работу, когда начнёте.' : 'Ждём, пока исполнитель возьмёт задачу в работу.';
    case 'in_progress':
      if (self) return 'Когда закончите — нажмите «Завершить».';
      return roles.assignee ? 'Когда закончите — отправьте на проверку.' : 'Исполнитель работает над задачей.';
    case 'on_review':
      return roles.creator ? 'Проверьте результат: примите задачу или верните с комментарием.' : 'Результат на проверке у создателя.';
    case 'rejected':
      return roles.assignee ? 'Задачу вернули — посмотрите причину в истории и доработайте.' : 'Задача на доработке у исполнителя.';
    case 'overdue':
      return roles.assignee ? 'Срок вышел. Завершите работу или договоритесь о новом сроке.' : 'Срок вышел. Можно перенести дедлайн в меню «⋯».';
    case 'done':
      return roles.creator ? 'Задача принята. Её можно архивировать или вернуть на доработку.' : 'Задача принята.';
    case 'archived':
      return 'Задача в архиве.';
    default:
      return '';
  }
}

const styles = StyleSheet.create({
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
  stepLabelActive: { fontWeight: '800' },
});
