import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, PanResponder, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarClock, ClipboardCheck, MessageCircle } from 'lucide-react-native';
import { SERVER_URL } from '../config';
import { request } from '../services/http';
import { openChat, openTask } from '../navigation/ref';
import { Banner, onBanner } from '../notifications/state';
import { IMPORTANCE, TASK_KIND_TITLE, shortDeadline, taskActorLine } from '../notifications/model';
import { hashColor, initials } from './chat/chatUtils';
import { T, themed } from '../theme/runtime';
import { withAlpha } from '../theme/palettes';

/**
 * Баннер сверху, когда приложение открыто (как всплывающие уведомления
 * в Telegram). Сообщение — компактная карточка с аватаром; задача — крупнее,
 * с цветной полосой приоритета, сроком и кнопками. Свайп вверх — скрыть.
 */
export default function NotificationBanner() {
  const insets = useSafeAreaInsets();
  const [banner, setBanner] = useState<Banner | null>(null);
  const y = useRef(new Animated.Value(-200)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [busy, setBusy] = useState(false);

  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    Animated.timing(y, { toValue: -220, duration: 200, useNativeDriver: true }).start(() => setBanner(null));
  };

  useEffect(
    () =>
      onBanner((b) => {
        setBanner(b);
        setBusy(false);
        y.setValue(-220);
        Animated.spring(y, { toValue: 0, useNativeDriver: true, friction: 9, tension: 70 }).start();
        if (timer.current) clearTimeout(timer.current);
        // Задача важнее — висит дольше.
        timer.current = setTimeout(hide, b.kind === 'task' ? 8000 : 4500);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy < -6,
      onPanResponderMove: (_, g) => y.setValue(Math.min(0, g.dy)),
      onPanResponderRelease: (_, g) => (g.dy < -30 ? hide() : Animated.spring(y, { toValue: 0, useNativeDriver: true }).start()),
    }),
  ).current;

  if (!banner) return null;

  const open = () => {
    hide();
    if (banner.kind === 'message') {
      openChat({ chatId: banner.data.chatId, chatName: banner.data.chatName, topicId: banner.data.topicId });
    } else {
      openTask(banner.data.taskId);
    }
  };

  const takeTask = async () => {
    if (banner.kind !== 'task') return;
    setBusy(true);
    try {
      await request(`/api/tasks/${banner.data.taskId}/transition`, { method: 'POST', body: { to_status: 'in_progress' } });
      hide();
    } catch {
      open();
    }
  };

  return (
    <Animated.View
      {...pan.panHandlers}
      style={[styles.wrap, { top: insets.top + 6, transform: [{ translateY: y }] }]}
      pointerEvents="box-none"
    >
      {banner.kind === 'message' ? (
        <TouchableOpacity activeOpacity={0.9} onPress={open} style={styles.card} accessibilityRole="button">
          <Avatar name={banner.data.isGroup ? banner.data.chatName : banner.data.senderName} path={banner.data.isGroup ? banner.data.chatAvatar : banner.data.senderAvatar} />
          <View style={styles.body}>
            <View style={styles.titleRow}>
              <Text style={styles.title} numberOfLines={1}>
                {banner.data.topicName ? `${banner.data.chatName} › ${banner.data.topicName}` : banner.data.chatName}
              </Text>
              <MessageCircle size={13} color={T.textMuted} />
            </View>
            <Text style={styles.text} numberOfLines={2}>
              {banner.data.isGroup ? <Text style={styles.sender}>{banner.data.senderName}: </Text> : null}
              {banner.data.text}
            </Text>
          </View>
        </TouchableOpacity>
      ) : (
        <TaskCard banner={banner} onOpen={open} onTake={takeTask} busy={busy} />
      )}
    </Animated.View>
  );
}

function Avatar({ name, path }: { name: string; path?: string }) {
  if (path) return <Image source={{ uri: path.startsWith('http') ? path : `${SERVER_URL}${path}` }} style={styles.avatar} />;
  return (
    <View style={[styles.avatar, { backgroundColor: hashColor(name) }]}>
      <Text style={styles.avatarText}>{initials(name)}</Text>
    </View>
  );
}

function TaskCard({ banner, onOpen, onTake, busy }: { banner: Extract<Banner, { kind: 'task' }>; onOpen: () => void; onTake: () => void; busy: boolean }) {
  const t = banner.data;
  const imp = IMPORTANCE[t.importance];
  const deadline = shortDeadline(t.deadline);
  const actor = taskActorLine(t);
  const canTake = t.kind === 'assigned' || t.kind === 'rejected' || t.kind === 'returned';
  return (
    <TouchableOpacity activeOpacity={0.92} onPress={onOpen} style={[styles.card, styles.taskCard]} accessibilityRole="button">
      <View style={[styles.stripe, { backgroundColor: imp.color }]} />
      <View style={styles.taskInner}>
        <View style={styles.taskHead}>
          <View style={[styles.taskIcon, { backgroundColor: withAlpha(imp.color, 0.15) }]}>
            <ClipboardCheck size={18} color={imp.color} strokeWidth={2.2} />
          </View>
          <Text style={[styles.taskKind, { color: imp.color }]} numberOfLines={1}>
            {TASK_KIND_TITLE[t.kind].toUpperCase()}
          </Text>
          <View style={[styles.impChip, { backgroundColor: withAlpha(imp.color, 0.12) }]}>
            <Text style={[styles.impChipText, { color: imp.color }]}>{imp.label.split(' ')[0]}</Text>
          </View>
        </View>
        <Text style={styles.taskTitle} numberOfLines={2}>
          {t.title}
        </Text>
        {(deadline || actor) && (
          <View style={styles.taskMeta}>
            {deadline ? (
              <>
                <CalendarClock size={13} color={T.textSecondary} />
                <Text style={styles.taskMetaText}>{deadline}</Text>
              </>
            ) : null}
            {actor ? (
              <Text style={styles.taskMetaText} numberOfLines={1}>
                {deadline ? ' · ' : ''}
                {actor}
              </Text>
            ) : null}
          </View>
        )}
        {t.comment ? (
          <Text style={styles.taskComment} numberOfLines={2}>
            «{t.comment}»
          </Text>
        ) : null}
        <View style={styles.taskActions}>
          {canTake && (
            <TouchableOpacity style={[styles.taskBtn, { backgroundColor: imp.color }]} onPress={onTake} disabled={busy} activeOpacity={0.85}>
              <Text style={styles.taskBtnText}>{busy ? 'Берём…' : 'Взять в работу'}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.taskBtn, styles.taskBtnGhost]} onPress={onOpen} activeOpacity={0.85}>
            <Text style={[styles.taskBtnText, { color: T.textPrimary }]}>Открыть</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = themed(() => ({
  wrap: { position: 'absolute', left: 8, right: 8, zIndex: 1000, elevation: 1000 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 18,
    backgroundColor: T.card,
    borderWidth: 1,
    borderColor: T.border,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 14,
  },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  body: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { flex: 1, fontSize: 15, fontWeight: '700', color: T.textPrimary },
  text: { fontSize: 14, color: T.textSecondary, marginTop: 2, lineHeight: 19 },
  sender: { color: T.accent, fontWeight: '600' },
  // Задача
  taskCard: { padding: 0, overflow: 'hidden', alignItems: 'stretch', gap: 0 },
  stripe: { width: 5 },
  taskInner: { flex: 1, padding: 14, paddingLeft: 12 },
  taskHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  taskIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  taskKind: { flex: 1, fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  impChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  impChipText: { fontSize: 11, fontWeight: '700' },
  taskTitle: { fontSize: 17, fontWeight: '800', color: T.textPrimary, marginTop: 8, lineHeight: 22 },
  taskMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
  taskMetaText: { fontSize: 12, color: T.textSecondary, fontWeight: '600', flexShrink: 1 },
  taskComment: { fontSize: 13, color: T.textPrimary, marginTop: 6, fontStyle: 'italic' },
  taskActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  taskBtn: { flex: 1, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  taskBtnGhost: { backgroundColor: T.inputBg },
  taskBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
}));
