import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, Pressable } from 'react-native';
import Modal from '../ui/AppModal';
import { ChevronRight, HandHeart, ListTodo } from 'lucide-react-native';
import { T, themed } from '../../theme/runtime';
import { withAlpha } from '../../theme/palettes';
import SafeBottom from '../ui/SafeBottom';
import { firstNameOf } from '../../utils/names';
import type { Task } from '../../services/api';

/**
 * Запрос — дружеская разновидность задачи (как на сайте): фиолетовый цвет (не
 * пересекается с важностью и статусами), значок с сердечком, тёплые подписи.
 */
export type TaskKind = 'task' | 'request';
export const isRequest = (t?: { kind?: string | null } | null) => t?.kind === 'request';

/** Метка «Запрос» на карточке и в заголовке. */
export function RequestBadge({ large }: { large?: boolean }) {
  return (
    <View style={[styles.badge, large && styles.badgeLarge]}>
      <HandHeart size={large ? 15 : 13} color={T.violet} strokeWidth={2.3} />
      <Text style={[styles.badgeText, large && styles.badgeTextLarge]}>Запрос</Text>
    </View>
  );
}

/** Кто просит и кого: «Просит Иван», «Вы попросили: Анна», «Иван просит: Анна». */
export function requestLine(task: Task): string {
  const from = task.creator_name ? firstNameOf(task.creator_name) : 'Коллега';
  const to = (task.assignees || []).map((a) => firstNameOf(a));
  const toText = to.length > 2 ? `${to.slice(0, 2).join(', ')} и ещё ${to.length - 2}` : to.join(', ');
  if (task.is_creator && task.is_assignee && to.length === 1) return 'Напоминание себе';
  if (task.is_creator) return toText ? `Вы попросили: ${toText}` : 'Вы попросили';
  if (task.is_assignee) return `Просит ${from}`;
  return toText ? `${from} просит: ${toText}` : `Просит ${from}`;
}

const CHOICES: { kind: TaskKind; title: string; text: string; who: string }[] = [
  {
    kind: 'request',
    title: 'Запрос',
    text: 'Попросите коллегу помочь — по-дружески, без важности и проверки.',
    who: 'Кому: коллегам своего уровня, себе и подчинённым',
  },
  {
    kind: 'task',
    title: 'Задача',
    text: 'Поручение с важностью, наблюдателями и проверкой результата.',
    who: 'Кому: себе и подчинённым',
  },
];

/** «+» на экране задач: что создать — запрос или задачу (шторка снизу). */
export function KindChooserSheet({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (kind: TaskKind) => void }) {
  const slide = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) {
      slide.setValue(0);
      Animated.spring(slide, { toValue: 1, useNativeDriver: true, friction: 9, tension: 70 }).start();
    }
  }, [visible, slide]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Animated.View
          style={[styles.sheet, { transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [320, 0] }) }] }]}
          onStartShouldSetResponder={() => true}
        >
          <View style={styles.handle} />
          <Text style={styles.title}>Что создадим?</Text>
          {CHOICES.map((c) => {
            const req = c.kind === 'request';
            const tone = req ? T.violet : T.accent;
            return (
              <TouchableOpacity
                key={c.kind}
                activeOpacity={0.8}
                onPress={() => onPick(c.kind)}
                style={[styles.choice, { borderColor: withAlpha(tone, 0.25), backgroundColor: withAlpha(tone, 0.07) }]}
                accessibilityLabel={c.title}
              >
                <View style={[styles.choiceIcon, { backgroundColor: req ? T.violetSoft : T.accentMuted }]}>
                  {req ? <HandHeart size={24} color={tone} strokeWidth={2.2} /> : <ListTodo size={24} color={tone} strokeWidth={2.2} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.choiceTitle}>{c.title}</Text>
                  <Text style={styles.choiceText}>{c.text}</Text>
                  <Text style={[styles.choiceWho, { color: tone }]}>{c.who}</Text>
                </View>
                <ChevronRight size={18} color={T.textMuted} />
              </TouchableOpacity>
            );
          })}
          <SafeBottom />
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = themed(() => ({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 24, paddingHorizontal: 9, borderRadius: 12, backgroundColor: T.violetSoft, alignSelf: 'flex-start' },
  badgeLarge: { height: 28, paddingHorizontal: 11, borderRadius: 14 },
  badgeText: { fontSize: 12, fontWeight: '800', color: T.violet },
  badgeTextLarge: { fontSize: 13 },
  overlay: { flex: 1, backgroundColor: T.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: T.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 18, paddingBottom: 12, gap: 12 },
  handle: { width: 40, height: 4, backgroundColor: T.surfaceActive, borderRadius: 2, alignSelf: 'center', marginBottom: 4 },
  title: { fontSize: 20, fontWeight: '800', color: T.textPrimary, marginBottom: 2, marginLeft: 2 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 20, borderWidth: 1.5 },
  choiceIcon: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  choiceTitle: { fontSize: 17, fontWeight: '800', color: T.textPrimary },
  choiceText: { fontSize: 13.5, lineHeight: 19, color: T.textSecondary, marginTop: 2 },
  choiceWho: { fontSize: 12, fontWeight: '700', marginTop: 4 },
}));
