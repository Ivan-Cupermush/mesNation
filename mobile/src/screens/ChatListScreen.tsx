import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Platform,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Image,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Search, Plus, Pin, PinOff, MessageCircle, UserRound, Users, Check, CheckCheck, X, Trash2, LogOut, MailOpen, BellOff, Bell } from 'lucide-react-native';
import { MUTE_OPTIONS, isMuted, setChatMute } from '../notifications/mute';
import { SERVER_URL } from '../config';
import { request } from '../services/http';
import { subscribe } from '../services/socket';
import { fuzzyMatch } from '../utils/fuzzySearch';
import ActionSheet, { SheetAction } from '../components/chat/ActionSheet';
import { C, hashColor, initials, messagePreview } from '../components/chat/chatUtils';

import { T, themed } from '../theme/runtime';
/**
 * Список чатов как в Telegram: закреплённые сверху, счётчики непрочитанных,
 * галочки прочтения своего последнего сообщения, «в сети» у собеседников,
 * фильтры (все / личные / группы / непрочитанные), поиск по чатам и
 * сотрудникам, долгое нажатие — закрепить, прочитать, удалить или выйти.
 */

const formatTime = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const diffDays = (now.getTime() - d.getTime()) / 86400000;
  if (diffDays < 6) return d.toLocaleDateString('ru-RU', { weekday: 'short' });
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: d.getFullYear() === now.getFullYear() ? undefined : '2-digit' });
};

type Filter = 'all' | 'private' | 'groups' | 'unread';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'private', label: 'Личные' },
  { key: 'groups', label: 'Группы' },
  { key: 'unread', label: 'Непрочитанные' },
];

export default function ChatListScreen({ navigation }: any) {
  const [chats, setChats] = useState<any[]>([]);
  const [meId, setMeId] = useState<number | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [online, setOnline] = useState<Set<number>>(new Set());
  const [users, setUsers] = useState<any[]>([]);
  const [menuChat, setMenuChat] = useState<any>(null);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadChats = useCallback(async () => {
    try {
      const [me, list] = await Promise.all([request<any>('/api/auth/me'), request<any[]>('/api/chats')]);
      setMeId(me.id);
      setCompanyName(me.company_name || null);
      setChats(list);
      setError(null);
      const peers = list.filter((c) => c.type === 'private' && c.peer).map((c) => c.peer.id);
      if (peers.length) {
        request<any[]>('/api/users/presence', { query: { ids: peers.join(',') } })
          .then((r) => setOnline(new Set(r.filter((p) => p.online).map((p) => p.user_id))))
          .catch(() => undefined);
      }
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить чаты');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const scheduleReload = useCallback(() => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(loadChats, 300);
  }, [loadChats]);

  useFocusEffect(
    useCallback(() => {
      loadChats();
    }, [loadChats]),
  );

  // Новые сообщения, новые чаты и прочтения обновляют список сразу.
  useEffect(() => {
    const unsubs = [
      subscribe('chat_activity', scheduleReload),
      subscribe('chat_created', scheduleReload),
      subscribe('removed_from_chat', scheduleReload),
      subscribe('chat_deleted', scheduleReload),
      subscribe('presence', (p: any) =>
        setOnline((prev) => {
          const next = new Set(prev);
          if (p.online) next.add(p.user_id);
          else next.delete(p.user_id);
          return next;
        }),
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [scheduleReload]);

  // Сотрудники для поиска «написать новому человеку».
  useEffect(() => {
    if (query.trim() && !users.length) request<any[]>('/api/users').then(setUsers).catch(() => undefined);
  }, [query, users.length]);

  const visible = useMemo(() => {
    let list = chats;
    if (filter === 'private') list = list.filter((c) => c.type === 'private');
    if (filter === 'groups') list = list.filter((c) => c.type === 'group');
    if (filter === 'unread') list = list.filter((c) => c.unread_count > 0);
    if (query.trim()) {
      list = list
        .map((c) => ({ c, r: fuzzyMatch(c.name || '', query) }))
        .filter((x) => x.r.match)
        .sort((a, b) => a.r.rank - b.r.rank)
        .map((x) => x.c);
    }
    return list;
  }, [chats, filter, query]);

  const peopleResults = useMemo(() => {
    if (!query.trim()) return [];
    const withChat = new Set(chats.filter((c) => c.type === 'private' && c.peer).map((c) => c.peer.id));
    return users
      .filter((u) => u.id !== meId && !withChat.has(u.id))
      .map((u) => ({ u, r: fuzzyMatch(`${u.display_name || ''} ${u.username || ''} ${u.role_name || ''}`, query) }))
      .filter((x) => x.r.match)
      .sort((a, b) => a.r.rank - b.r.rank)
      .slice(0, 8)
      .map((x) => x.u);
  }, [users, query, chats, meId]);

  const unreadTotal = chats.reduce((n, c) => n + (c.unread_count > 0 ? 1 : 0), 0);

  const openChat = (item: any) => {
    if (item.is_supergroup) navigation.navigate('TopicList', { chatId: String(item.id), chatName: item.name });
    else navigation.navigate('Chat', { chatId: String(item.id), chatName: item.name });
  };

  const startPrivate = async (user: any) => {
    try {
      const chat = await request<any>('/api/chats', { method: 'POST', body: { type: 'private', user_ids: [user.id] } });
      setQuery('');
      navigation.navigate('Chat', { chatId: String(chat.id), chatName: chat.name });
    } catch (e: any) {
      Alert.alert('Не удалось открыть чат', e?.message || '');
    }
  };

  // ===== Действия над чатом =====
  const togglePin = async (chat: any) => {
    try {
      await request(`/api/chats/${chat.id}/membership`, { method: 'PATCH', body: { pinned: !chat.pinned_at } });
      loadChats();
    } catch (e: any) {
      Alert.alert('Не удалось', e?.message || '');
    }
  };

  const [muteChat, setMuteChat] = useState<any>(null);

  const applyMute = async (chat: any, ms: number | null | 0) => {
    try {
      await setChatMute(chat.id, ms);
      loadChats();
    } catch (e: any) {
      Alert.alert('Не удалось', e?.message || '');
    }
  };

  const markRead = async (chat: any) => {
    if (!chat.last_message) return;
    try {
      await request(`/api/chats/${chat.id}/read`, { method: 'POST', body: { message_id: chat.last_message.id } });
      loadChats();
    } catch {
      // не критично
    }
  };

  const removeChat = (chat: any) => {
    const isCreator = chat.created_by === meId;
    if (chat.type === 'private') {
      Alert.alert('Удалить чат?', `Переписка с ${chat.name} исчезнет из вашего списка. У собеседника она останется; если он напишет — чат вернётся.`, [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Удалить', style: 'destructive', onPress: () => request(`/api/chats/${chat.id}`, { method: 'DELETE' }).then(loadChats) },
      ]);
      return;
    }
    Alert.alert(
      isCreator ? 'Удалить или покинуть группу?' : 'Покинуть группу?',
      isCreator
        ? 'Удаление закроет группу для всех участников. Если просто выйти — владельцем станет администратор или самый давний участник.'
        : `Вы перестанете получать сообщения «${chat.name}».`,
      [
        { text: 'Отмена', style: 'cancel' },
        ...(isCreator
          ? [{ text: 'Удалить для всех', style: 'destructive' as const, onPress: () => request(`/api/chats/${chat.id}`, { method: 'DELETE' }).then(loadChats) }]
          : []),
        { text: 'Покинуть', style: 'destructive' as const, onPress: () => request(`/api/chats/${chat.id}`, { method: 'DELETE', query: { leave: 'true' } }).then(loadChats) },
      ],
    );
  };

  const menuActions = (chat: any): SheetAction[] => [
    {
      key: 'pin',
      label: chat.pinned_at ? 'Открепить' : 'Закрепить',
      icon: chat.pinned_at ? <PinOff size={20} color={C.text} /> : <Pin size={20} color={C.text} />,
      onPress: () => togglePin(chat),
    },
    ...(chat.unread_count > 0
      ? [{ key: 'read', label: 'Отметить прочитанным', icon: <MailOpen size={20} color={C.text} />, onPress: () => markRead(chat) }]
      : []),
    isMuted(chat.muted_until)
      ? { key: 'unmute', label: 'Включить уведомления', icon: <Bell size={20} color={C.text} />, onPress: () => applyMute(chat, 0) }
      : { key: 'mute', label: 'Без звука…', icon: <BellOff size={20} color={C.text} />, onPress: () => setMuteChat(chat) },
    {
      key: 'remove',
      label: chat.type === 'private' ? 'Удалить чат' : chat.created_by === meId ? 'Удалить или покинуть' : 'Покинуть группу',
      danger: true,
      icon: chat.type === 'private' ? <Trash2 size={20} color={C.danger} /> : <LogOut size={20} color={C.danger} />,
      onPress: () => removeChat(chat),
    },
  ];

  // ===== Отрисовка =====
  const lastLine = (item: any) => {
    const lm = item.last_message;
    if (!lm) return { prefix: '', text: item.type === 'group' ? 'Группа создана' : 'Нет сообщений' };
    if (lm.content_type === 'service') return { prefix: '', text: lm.text };
    const preview = messagePreview({ ...lm, poll: lm.poll_question ? { question: lm.poll_question } : undefined });
    const prefix = lm.sender_id === meId ? 'Вы: ' : item.type === 'group' && lm.sender_name ? `${lm.sender_name.split(' ')[0]}: ` : '';
    return { prefix, text: preview };
  };

  const renderChat = ({ item }: any) => {
    const { prefix, text } = lastLine(item);
    const lm = item.last_message;
    const mineLast = lm && lm.sender_id === meId && lm.content_type !== 'service';
    const read = mineLast && lm.id <= (item.peer_last_read_id || 0);
    const peerOnline = item.type === 'private' && item.peer && online.has(item.peer.id);
    return (
      <TouchableOpacity style={styles.row} activeOpacity={0.6} onPress={() => openChat(item)} onLongPress={() => setMenuChat(item)} delayLongPress={300}>
        <View>
          <View style={[styles.avatar, { backgroundColor: hashColor(item.name || '?') }]}>
            {item.avatar_url ? (
              <Image source={{ uri: SERVER_URL + item.avatar_url }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarText}>{initials(item.name)}</Text>
            )}
          </View>
          {peerOnline && <View style={styles.onlineDot} />}
        </View>

        <View style={styles.rowBody}>
          <View style={styles.rowTop}>
            {item.type === 'group' && <Users size={15} color={C.textMuted} strokeWidth={2.2} />}
            <Text style={styles.name} numberOfLines={1}>
              {item.name || 'Чат'}
            </Text>
            {isMuted(item.muted_until) && <BellOff size={14} color={C.textMuted} strokeWidth={2.2} />}
            {mineLast && (read ? <CheckCheck size={16} color={C.accent} /> : <Check size={15} color={C.accent} />)}
            <Text style={[styles.time, item.unread_count > 0 && { color: C.accent }]}>{formatTime(lm?.created_at || item.created_at)}</Text>
          </View>
          <View style={styles.rowBottom}>
            <Text style={styles.preview} numberOfLines={2}>
              {prefix ? <Text style={styles.previewPrefix}>{prefix}</Text> : null}
              {text}
            </Text>
            {item.unread_count > 0 ? (
              <View style={[styles.badge, isMuted(item.muted_until) && { backgroundColor: T.disabled }]}>
                <Text style={styles.badgeText}>{item.unread_count > 99 ? '99+' : item.unread_count}</Text>
              </View>
            ) : item.pinned_at ? (
              <Pin size={15} color={T.textMuted} style={{ transform: [{ rotate: '45deg' }] }} />
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const header = (
    <>
      {query.trim() && peopleResults.length > 0 && (
        <View>
          <Text style={styles.sectionLabel}>СОТРУДНИКИ</Text>
          {peopleResults.map((u) => (
            <TouchableOpacity key={u.id} style={styles.row} onPress={() => startPrivate(u)} activeOpacity={0.6}>
              <View style={[styles.avatar, { backgroundColor: hashColor(u.display_name || u.username) }]}>
                {u.avatar_url ? (
                  <Image source={{ uri: SERVER_URL + u.avatar_url }} style={styles.avatarImg} />
                ) : (
                  <Text style={styles.avatarText}>{initials(u.display_name || u.username)}</Text>
                )}
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.name} numberOfLines={1}>
                  {u.display_name || u.username}
                </Text>
                <Text style={styles.preview} numberOfLines={1}>
                  {u.role_name || `@${u.username}`} · написать
                </Text>
              </View>
            </TouchableOpacity>
          ))}
          {visible.length > 0 && <Text style={styles.sectionLabel}>ЧАТЫ</Text>}
        </View>
      )}
    </>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>ЧАТЫ</Text>
          {companyName ? (
            <Text style={styles.companyName} numberOfLines={1}>
              {companyName}
            </Text>
          ) : null}
        </View>
        <TouchableOpacity style={styles.profileBtn} onPress={() => navigation.navigate('Profile')} activeOpacity={0.7} accessibilityLabel="Профиль">
          <UserRound size={20} color={C.accent} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchBar}>
        <Search size={18} color={C.textMuted} strokeWidth={2} />
        <TextInput
          style={styles.searchInput}
          placeholder="Поиск чатов и сотрудников"
          placeholderTextColor={T.textMuted}
          value={query}
          onChangeText={setQuery}
        />
        {query ? (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Очистить">
            <X size={18} color={C.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} style={styles.filtersWrap}>
        {FILTERS.map((f) => (
          <TouchableOpacity key={f.key} onPress={() => setFilter(f.key)} style={[styles.chip, filter === f.key && styles.chipActive]} activeOpacity={0.8}>
            <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>
              {f.label}
              {f.key === 'unread' && unreadTotal ? ` ${unreadTotal}` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading && chats.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderChat}
          ListHeaderComponent={header}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={{ paddingBottom: 100 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadChats();
              }}
              tintColor={C.accent}
              colors={[C.accent]}
            />
          }
          ListEmptyComponent={
            peopleResults.length ? null : (
              <View style={styles.empty}>
                <MessageCircle size={44} color={T.textMuted} strokeWidth={1.5} />
                <Text style={styles.emptyTitle}>
                  {error ? 'Нет связи' : query.trim() ? 'Ничего не найдено' : filter === 'unread' ? 'Всё прочитано' : 'Пока нет чатов'}
                </Text>
                <Text style={styles.emptySubtitle}>
                  {error || (query.trim() ? 'Попробуйте другой запрос' : filter !== 'all' ? 'В этом разделе пусто' : 'Нажмите «+», чтобы написать коллеге или создать группу')}
                </Text>
              </View>
            )
          }
        />
      )}

      <TouchableOpacity onPress={() => navigation.navigate('CreateChat')} activeOpacity={0.85} style={styles.fab} accessibilityLabel="Новый чат">
        <Plus size={26} color={T.onAccent} strokeWidth={2.5} />
      </TouchableOpacity>

      <ActionSheet
        visible={!!menuChat}
        title={menuChat?.name}
        actions={menuChat ? menuActions(menuChat) : []}
        onClose={() => setMenuChat(null)}
      />
      <ActionSheet
        visible={!!muteChat}
        title={muteChat ? `Уведомления: ${muteChat.name}` : undefined}
        actions={MUTE_OPTIONS.map((o) => ({
          key: o.key,
          label: o.label,
          icon: <BellOff size={20} color={C.text} />,
          onPress: () => muteChat && applyMute(muteChat, o.ms),
        }))}
        onClose={() => setMuteChat(null)}
      />
    </SafeAreaView>
  );
}

const styles = themed(() => ({
  container: { flex: 1, backgroundColor: T.card },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 10 },
  title: {
    fontFamily: Platform.OS === 'ios' ? 'Bebas Neue' : 'sans-serif-condensed',
    fontSize: 36,
    fontWeight: '900',
    color: C.text,
    letterSpacing: -0.5,
    lineHeight: 40,
  },
  companyName: { fontSize: 14, color: C.textMuted, fontWeight: '600', marginTop: 1 },
  profileBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 12,
    backgroundColor: T.inputBg,
  },
  searchInput: { flex: 1, fontSize: 16, color: C.text, paddingVertical: 0 },
  filtersWrap: { flexGrow: 0 },
  filters: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  chip: { paddingHorizontal: 14, height: 32, borderRadius: 16, backgroundColor: T.inputBg, justifyContent: 'center' },
  chipActive: { backgroundColor: C.accent },
  chipText: { fontSize: 14, color: C.textMuted, fontWeight: '600' },
  chipTextActive: { color: T.onAccent },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: C.textMuted, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 4, backgroundColor: T.background },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, gap: 12 },
  avatar: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg: { width: 54, height: 54, borderRadius: 27 },
  avatarText: { color: T.onAccent, fontSize: 19, fontWeight: '700' },
  onlineDot: {
    position: 'absolute',
    right: 1,
    bottom: 1,
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: T.success,
    borderWidth: 2.5,
    borderColor: T.card,
  },
  rowBody: { flex: 1, minHeight: 54, justifyContent: 'center' },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { flex: 1, fontSize: 16, fontWeight: '700', color: C.text },
  time: { fontSize: 13, color: C.textMuted, marginLeft: 4 },
  rowBottom: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  preview: { flex: 1, fontSize: 15, color: C.textMuted, lineHeight: 20 },
  previewPrefix: { color: C.text },
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: T.onAccent, fontSize: 12, fontWeight: '800' },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginLeft: 80 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingTop: 70, paddingHorizontal: 40, gap: 6 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: C.text, marginTop: 8 },
  emptySubtitle: { fontSize: 14, color: C.textMuted, textAlign: 'center', lineHeight: 20 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.accent,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
}));
