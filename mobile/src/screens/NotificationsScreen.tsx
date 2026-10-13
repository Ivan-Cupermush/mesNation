import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, SectionList, RefreshControl, ActivityIndicator, Alert, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bell, Check, ChevronLeft, ClipboardCheck, NotebookPen, RefreshCw, Trash2, X } from 'lucide-react-native';
import { api, AppNotification } from '../services/api';
import { onNotificationItem, setUnread } from '../notifications/inbox';
import { IMPORTANCE, NOTE_COLOR, shortDeadline } from '../notifications/model';
import { openNote, openTask } from '../navigation/ref';
import UserAvatar from '../components/ui/UserAvatar';
import { T, themed } from '../theme/runtime';
import { withAlpha } from '../theme/palettes';
import { showError } from '../components/ui/toast';

/**
 * Колокольчик: новые задачи и запросы заметок. Новые подсвечены, пока
 * экран открыт; сам факт открытия отмечает всё прочитанным.
 */

type Filter = 'all' | 'tasks' | 'notes';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'tasks', label: 'Задачи' },
  { key: 'notes', label: 'Заметки' },
];

const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

function dayTitle(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (dayKey(iso) === dayKey(today.toISOString())) return 'Сегодня';
  if (dayKey(iso) === dayKey(y.toISOString())) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) });
}

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'сейчас';
  if (min < 60) return `${min} мин`;
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export default function NotificationsScreen({ navigation }: any) {
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [more, setMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  /** Что было новым на момент открытия — подсвечиваем, хоть сервер уже и отметил прочитанным. */
  const fresh = useRef(new Set<number>());

  const load = useCallback(async () => {
    try {
      const list = await api.getNotifications();
      list.filter((n) => !n.read_at).forEach((n) => fresh.current.add(n.id));
      setItems(list);
      setMore(list.length >= 40);
      if (list.some((n) => !n.read_at)) {
        const r = await api.markNotificationsRead().catch(() => null);
        setUnread(r?.count ?? 0);
      } else {
        setUnread(0);
      }
    } catch (e: any) {
      setItems((prev) => prev ?? []);
      showError(e?.message || '', 'Не удалось загрузить уведомления');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Пришло новое, пока экран открыт, — сразу в список и прочитано.
  useEffect(
    () =>
      onNotificationItem((n) => {
        fresh.current.add(n.id);
        setItems((prev) => (prev ? [n, ...prev.filter((x) => x.id !== n.id)] : [n]));
        api.markNotificationsRead([n.id]).then((r) => setUnread(r.count)).catch(() => undefined);
      }),
    [],
  );

  // Вернулись с экрана запроса — статус мог поменяться.
  useEffect(() => navigation.addListener('focus', () => items && load()), [navigation, items, load]);

  const loadMore = async () => {
    if (!items?.length || !more || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await api.getNotifications(items[items.length - 1].id);
      setItems((prev) => [...(prev || []), ...next.filter((n) => !(prev || []).some((p) => p.id === n.id))]);
      setMore(next.length >= 40);
    } catch {
      // попробуем при следующей прокрутке
    } finally {
      setLoadingMore(false);
    }
  };

  const clearAll = () =>
    Alert.alert('Очистить уведомления?', 'Список станет пустым. Задачи и заметки останутся на месте.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Очистить',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.clearNotifications();
            setItems([]);
            setUnread(0);
          } catch (e: any) {
            Alert.alert('Не удалось очистить', e?.message || '');
          }
        },
      },
    ]);

  const sections = useMemo(() => {
    const list = (items || []).filter((n) => (filter === 'all' ? true : filter === 'tasks' ? n.kind === 'task' : n.kind !== 'task'));
    const out: { title: string; data: AppNotification[] }[] = [];
    for (const n of list) {
      const title = dayTitle(n.created_at);
      const last = out[out.length - 1];
      if (last && last.title === title) last.data.push(n);
      else out.push({ title, data: [n] });
    }
    return out;
  }, [items, filter]);

  const open = (n: AppNotification) => {
    if (n.kind === 'task' && n.data?.task_id) openTask(Number(n.data.task_id));
    else if (n.kind === 'note_request_approved' && n.data?.note_id) openNote(Number(n.data.note_id));
    else if (n.data?.request_id) navigation.navigate('NoteRequest', { requestId: Number(n.data.request_id) });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={T.statusBar} backgroundColor="transparent" translucent />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn} accessibilityLabel="Назад">
          <ChevronLeft size={26} color={T.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Уведомления</Text>
        <TouchableOpacity onPress={clearAll} style={styles.headerBtn} disabled={!items?.length} accessibilityLabel="Очистить всё">
          <Trash2 size={20} color={items?.length ? T.textSecondary : T.disabled} />
        </TouchableOpacity>
      </View>

      <View style={styles.filters}>
        {FILTERS.map((f) => (
          <TouchableOpacity key={f.key} onPress={() => setFilter(f.key)} style={[styles.chip, filter === f.key && styles.chipOn]} activeOpacity={0.8}>
            <Text style={[styles.chipText, filter === f.key && styles.chipTextOn]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {items === null ? (
        <ActivityIndicator color={T.accent} style={{ marginTop: 40 }} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(n) => String(n.id)}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={[styles.list, !sections.length && { flex: 1 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={T.accent} colors={[T.accent]} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          renderSectionHeader={({ section }) => <Text style={styles.section}>{section.title}</Text>}
          renderItem={({ item }) => <Item n={item} fresh={fresh.current.has(item.id)} onPress={() => open(item)} />}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={T.accent} style={{ marginVertical: 16 }} /> : null}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Bell size={34} color={T.accent} strokeWidth={1.8} />
              </View>
              <Text style={styles.emptyTitle}>Пока тихо</Text>
              <Text style={styles.emptyText}>
                {filter === 'notes'
                  ? 'Здесь появятся запросы текущей версии ваших заметок и ответы на ваши запросы.'
                  : filter === 'tasks'
                    ? 'Здесь появятся новые задачи и итоги проверки.'
                    : 'Здесь появятся новые задачи, запросы заметок и ответы на них.'}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

function Item({ n, fresh, onPress }: { n: AppNotification; fresh: boolean; onPress: () => void }) {
  const isTask = n.kind === 'task';
  const imp = IMPORTANCE[(n.data?.importance as 'red' | 'yellow' | 'green') || 'yellow'] || IMPORTANCE.yellow;
  const badge = isTask
    ? { color: imp.color, Icon: ClipboardCheck }
    : n.kind === 'note_request'
      ? { color: NOTE_COLOR, Icon: RefreshCw }
      : n.kind === 'note_request_approved'
        ? { color: T.success, Icon: Check }
        : { color: T.textMuted, Icon: X };
  const who = n.actor_name || 'Коллега';
  const deadline = isTask && n.data?.deadline ? shortDeadline(n.data.deadline) : '';

  let headline: React.ReactNode;
  if (isTask) headline = <Text style={styles.headline}>{n.title}</Text>;
  else if (n.kind === 'note_request')
    headline = (
      <Text style={styles.headline}>
        <Text style={styles.bold}>{who}</Text> просит текущую версию заметки
      </Text>
    );
  else if (n.kind === 'note_request_approved')
    headline = (
      <Text style={styles.headline}>
        <Text style={styles.bold}>{who}</Text> поделился(ась) текущей версией
      </Text>
    );
  else
    headline = (
      <Text style={styles.headline}>
        <Text style={styles.bold}>{who}</Text> не стал(а) делиться новой версией
      </Text>
    );

  return (
    <TouchableOpacity style={[styles.item, fresh && styles.itemFresh]} onPress={onPress} activeOpacity={0.75}>
      <View>
        <UserAvatar name={who} url={n.actor_avatar_url} size={46} />
        <View style={[styles.badge, { backgroundColor: badge.color }]}>
          <badge.Icon size={11} color="#FFFFFF" strokeWidth={3} />
        </View>
      </View>
      <View style={styles.itemBody}>
        <View style={styles.itemTop}>
          <View style={{ flex: 1 }}>{headline}</View>
          <Text style={styles.time}>{timeAgo(n.created_at)}</Text>
          {fresh && <View style={styles.dot} />}
        </View>

        {isTask ? (
          <>
            <Text style={styles.taskTitle} numberOfLines={2}>
              {n.body}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {[n.actor_name ? `от ${n.actor_name}` : '', deadline ? `срок ${deadline}` : ''].filter(Boolean).join(' · ')}
            </Text>
            {n.data?.comment ? (
              <Text style={styles.comment} numberOfLines={2}>
                «{n.data.comment}»
              </Text>
            ) : null}
          </>
        ) : (
          <View style={styles.noteChip}>
            <NotebookPen size={14} color={NOTE_COLOR} />
            <Text style={styles.noteChipText} numberOfLines={1}>
              {n.body || 'Без названия'}
            </Text>
          </View>
        )}

        {n.kind === 'note_request' && (
          <View style={styles.statusRow}>
            {n.request_status === 'pending' ? (
              <View style={[styles.statusBtn, { backgroundColor: NOTE_COLOR }]}>
                <Text style={styles.statusBtnText}>Посмотреть и ответить</Text>
              </View>
            ) : n.request_status === 'approved' ? (
              <View style={[styles.statusPill, { backgroundColor: withAlpha(T.success, 0.12) }]}>
                <Check size={13} color={T.success} strokeWidth={2.8} />
                <Text style={[styles.statusPillText, { color: T.success }]}>Вы поделились</Text>
              </View>
            ) : n.request_status === 'declined' ? (
              <View style={[styles.statusPill, { backgroundColor: T.inputBg }]}>
                <X size={13} color={T.textSecondary} strokeWidth={2.8} />
                <Text style={[styles.statusPillText, { color: T.textSecondary }]}>Вы отклонили</Text>
              </View>
            ) : null}
          </View>
        )}
        {n.kind === 'note_request_approved' && (
          <Text style={[styles.meta, { color: T.success }]}>Новая копия уже в ваших заметках — нажмите, чтобы открыть</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = themed(() => ({
  container: { flex: 1, backgroundColor: T.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingTop: 4, paddingBottom: 4 },
  headerBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: T.textPrimary },
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10 },
  chip: { height: 34, paddingHorizontal: 16, borderRadius: 17, backgroundColor: T.inputBg, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: T.accent },
  chipText: { fontSize: 14, fontWeight: '600', color: T.textSecondary },
  chipTextOn: { color: T.onAccent },
  list: { paddingHorizontal: 12, paddingBottom: 30 },
  section: { fontSize: 13, fontWeight: '700', color: T.textSecondary, marginTop: 14, marginBottom: 6, marginLeft: 8 },
  item: { flexDirection: 'row', gap: 12, padding: 12, borderRadius: 18, marginBottom: 4 },
  itemFresh: { backgroundColor: withAlpha(T.accent, 0.08) },
  badge: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 21,
    height: 21,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: T.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemBody: { flex: 1, gap: 5 },
  itemTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  headline: { fontSize: 14.5, lineHeight: 19.5, color: T.textPrimary },
  bold: { fontWeight: '700' },
  time: { fontSize: 12, color: T.textMuted, marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: T.accent, marginTop: 6 },
  taskTitle: { fontSize: 15.5, fontWeight: '700', color: T.textPrimary, lineHeight: 20 },
  meta: { fontSize: 12.5, color: T.textSecondary },
  comment: { fontSize: 13, color: T.textPrimary, fontStyle: 'italic' },
  noteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: withAlpha(NOTE_COLOR, 0.1),
  },
  noteChipText: { fontSize: 14, fontWeight: '600', color: T.textPrimary, flexShrink: 1 },
  statusRow: { flexDirection: 'row', marginTop: 2 },
  statusBtn: { height: 34, paddingHorizontal: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  statusBtnText: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '700' },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 28, paddingHorizontal: 10, borderRadius: 10 },
  statusPillText: { fontSize: 12.5, fontWeight: '700' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingBottom: 80 },
  emptyIcon: { width: 84, height: 84, borderRadius: 42, backgroundColor: withAlpha(T.accent, 0.1), alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  emptyTitle: { fontSize: 19, fontWeight: '800', color: T.textPrimary, marginBottom: 6 },
  emptyText: { fontSize: 14.5, lineHeight: 20, color: T.textSecondary, textAlign: 'center' },
}));
