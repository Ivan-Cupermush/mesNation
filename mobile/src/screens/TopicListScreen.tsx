import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  Pressable,
  Image,
  ScrollView,
  KeyboardAvoidingView,
  } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { ChevronLeft, MessageSquare, Plus, Info, Check } from 'lucide-react-native';
import { SERVER_URL } from '../config';
import { request } from '../services/http';
import { subscribe } from '../services/socket';
import { TOPIC_ICONS, TOPIC_COLORS, hexToRgba } from '../theme/topicIcons';
import { C, hashColor, initials, messagePreview, plural } from '../components/chat/chatUtils';

import { T, themed } from '../theme/runtime';
import SafeBottom from '../components/ui/SafeBottom';
/**
 * Группа с темами (как форумы в Telegram): сверху группа, ниже «Общий»
 * чат и темы с последним сообщением. Тему может создать любой участник;
 * менять и удалять — её автор и админы (экран темы).
 */

type RouteP = RouteProp<{ params: { chatId: string; chatName: string } }, 'params'>;

const formatTime = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString()
    ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
};

export default function TopicListScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const route = useRoute<RouteP>();
  const chatId = route.params.chatId;
  const [chat, setChat] = useState<any>(null);
  const [topics, setTopics] = useState<any[]>([]);
  const [general, setGeneral] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [icon, setIcon] = useState('hash');
  const [color, setColor] = useState(TOPIC_COLORS[0]);
  const [creating, setCreating] = useState(false);

  const chatName = chat?.name || route.params.chatName || 'Группа';

  const load = useCallback(async () => {
    try {
      const [c, t, g] = await Promise.all([
        request<any>(`/api/chats/${chatId}`),
        request<any[]>(`/api/chats/${chatId}/topics`),
        request<any[]>(`/api/messages/${chatId}`, { query: { limit: 1 } }).catch(() => []),
      ]);
      setChat(c);
      setTopics(t);
      setGeneral(g[g.length - 1] || null);
      if (!c.is_supergroup) {
        // Темы выключили, пока экран был открыт — переходим в обычный чат.
        navigation.replace('Chat', { chatId, chatName: c.name });
      }
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message || 'Не удалось загрузить темы');
    } finally {
      setLoading(false);
    }
  }, [chatId, navigation]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    const same = (id: any) => String(id) === String(chatId);
    const unsubs = [
      subscribe('chat_activity', (e: any) => same(e.chat_id) && load()),
      subscribe('topic_created', (t: any) => same(t.chat_id) && load()),
      subscribe('topic_updated', (t: any) => same(t.chat_id) && load()),
      subscribe('topic_deleted', () => load()),
      subscribe('chat_updated', (c: any) => same(c.id) && load()),
    ];
    return () => unsubs.forEach((u) => u());
  }, [chatId, load]);

  const create = async () => {
    if (!title.trim()) return;
    setCreating(true);
    try {
      const t = await request<any>(`/api/chats/${chatId}/topics`, { method: 'POST', body: { title: title.trim(), icon, icon_color: color } });
      setCreateOpen(false);
      setTitle('');
      navigation.navigate('Chat', { chatId, chatName, topicId: t.id });
    } catch (e: any) {
      Alert.alert('Не удалось создать тему', e?.message || '');
    } finally {
      setCreating(false);
    }
  };

  const openTopic = (topicId: number | null) => navigation.navigate('Chat', { chatId, chatName, topicId });

  const rows = [{ id: null, title: 'Общий', last_message: general }, ...topics];
  const members = chat?.members?.length || 0;

  const renderRow = ({ item }: { item: any }) => {
    const Icon = item.id === null ? MessageSquare : TOPIC_ICONS[item.icon] || TOPIC_ICONS.hash;
    const col = item.id === null ? C.accent : item.icon_color || C.accent;
    const lm = item.last_message;
    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => openTopic(item.id)}
        onLongPress={() => item.id && navigation.navigate('TopicInfo', { chatId, topicId: item.id })}
        activeOpacity={0.6}
      >
        <View style={[styles.topicIcon, { backgroundColor: hexToRgba(col, 0.14) }]}>
          <Icon size={22} color={col} strokeWidth={2.2} style={{ opacity: item.icon_opacity ?? 1 }} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.rowTop}>
            <Text style={styles.topicTitle} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.time}>{formatTime(lm?.created_at)}</Text>
          </View>
          <Text style={styles.preview} numberOfLines={1}>
            {lm ? (
              <>
                {lm.sender_name || lm.sender_display_name ? <Text style={{ color: C.text }}>{(lm.sender_display_name || lm.sender_name).split(' ')[0]}: </Text> : null}
                {messagePreview(lm)}
              </>
            ) : item.id === null ? (
              'Сообщения без темы'
            ) : (
              'Пока нет сообщений'
            )}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn} accessibilityLabel="Назад">
          <ChevronLeft size={26} color={C.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerMain} onPress={() => navigation.navigate('ChatInfo', { chatId })} activeOpacity={0.7}>
          {chat?.avatar_url ? (
            <Image source={{ uri: SERVER_URL + chat.avatar_url }} style={styles.headerAvatar} />
          ) : (
            <View style={[styles.headerAvatar, { backgroundColor: hashColor(chatName) }]}>
              <Text style={styles.headerAvatarText}>{initials(chatName)}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {chatName}
            </Text>
            <Text style={styles.headerSub}>
              {topics.length} {plural(topics.length, ['тема', 'темы', 'тем'])} · {members} {plural(members, ['участник', 'участника', 'участников'])}
            </Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('ChatInfo', { chatId })} style={styles.iconBtn} accessibilityLabel="Информация о группе">
          <Info size={22} color={C.text} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={C.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(t) => String(t.id)}
          renderItem={renderRow}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          contentContainerStyle={{ paddingBottom: 100 }}
          ListFooterComponent={
            topics.length === 0 ? <Text style={styles.hint}>Тем пока нет. Создайте первую — например, «Отчёты» или «Вопросы».</Text> : null
          }
        />
      )}

      <TouchableOpacity onPress={() => setCreateOpen(true)} style={[styles.fab, { bottom: 24 + insets.bottom }]} activeOpacity={0.85} accessibilityLabel="Новая тема">
        <Plus size={26} color={T.onAccent} strokeWidth={2.5} />
      </TouchableOpacity>

      <Modal visible={createOpen} transparent animationType="slide" onRequestClose={() => setCreateOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setCreateOpen(false)} />
        <KeyboardAvoidingView behavior="padding" style={styles.sheetWrap} pointerEvents="box-none">
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Новая тема</Text>
            <View style={styles.titleRow}>
              <View style={[styles.topicIcon, { backgroundColor: hexToRgba(color, 0.14) }]}>
                {React.createElement(TOPIC_ICONS[icon] || TOPIC_ICONS.hash, { size: 22, color, strokeWidth: 2.2 })}
              </View>
              <TextInput
                style={styles.titleInput}
                value={title}
                onChangeText={setTitle}
                placeholder="Название темы"
                placeholderTextColor={T.textMuted}
                autoFocus
                maxLength={255}
              />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickRow}>
              {TOPIC_COLORS.map((c) => (
                <TouchableOpacity key={c} onPress={() => setColor(c)} style={[styles.colorDot, { backgroundColor: c }]}>
                  {color === c && <Check size={14} color={T.onAccent} strokeWidth={3} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickRow}>
              {Object.entries(TOPIC_ICONS).map(([key, I]) => (
                <TouchableOpacity key={key} onPress={() => setIcon(key)} style={[styles.iconPick, icon === key && { backgroundColor: hexToRgba(color, 0.16) }]}>
                  {React.createElement(I, { size: 20, color: icon === key ? color : C.textMuted })}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              onPress={create}
              disabled={creating || !title.trim()}
              style={[styles.createBtn, (!title.trim() || creating) && { backgroundColor: T.disabled }]}
            >
              {creating ? <ActivityIndicator color={T.onAccent} /> : <Text style={styles.createText}>Создать тему</Text>}
            </TouchableOpacity>
            <SafeBottom />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = themed(() => ({
  container: { flex: 1, backgroundColor: T.card },
  header: { flexDirection: 'row', alignItems: 'center', height: 58, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerAvatarText: { color: T.onAccent, fontWeight: '700', fontSize: 15 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: C.text },
  headerSub: { fontSize: 13, color: C.textMuted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  topicIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topicTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: C.text },
  time: { fontSize: 13, color: C.textMuted },
  preview: { fontSize: 15, color: C.textMuted, marginTop: 2 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginLeft: 72 },
  hint: { textAlign: 'center', color: C.textMuted, fontSize: 14, marginTop: 24, paddingHorizontal: 40, lineHeight: 20 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: C.accent,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: C.overlay },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: T.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 28, gap: 12 },
  handle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: T.surfaceActive },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: C.text },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titleInput: { flex: 1, fontSize: 17, color: C.text, borderBottomWidth: 2, borderBottomColor: C.accent, paddingVertical: 8 },
  pickRow: { gap: 10, paddingVertical: 2 },
  colorDot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  iconPick: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  createBtn: { height: 50, borderRadius: 14, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  createText: { color: T.onAccent, fontSize: 16, fontWeight: '700' },
}));
