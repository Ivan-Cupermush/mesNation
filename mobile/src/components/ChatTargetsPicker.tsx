import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, ActivityIndicator, ScrollView, Pressable, KeyboardAvoidingView } from 'react-native';
import Modal from './ui/AppModal';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Search, Send, Check, Users, Hash, ChevronRight } from 'lucide-react-native';
import { request } from '../services/http';
import { fuzzyMatch } from '../utils/fuzzySearch';
import { useContactNames } from '../services/contacts';
import { plural } from './chat/chatUtils';
import UserAvatar from './ui/UserAvatar';
import { T, themed } from '../theme/runtime';
import { withAlpha } from '../theme/palettes';
import { showError } from './ui/toast';

/**
 * Выбор нескольких чатов, как в Telegram при пересылке и «Поделиться»:
 * поиск, отметки на аватарах, тема в группе с темами, чипы выбранного,
 * подпись и кнопка отправки со счётчиком.
 */

export interface ChatTarget {
  chatId: number;
  topicId: number | null;
  name: string;
}

export const targetKey = (t: { chatId: number; topicId: number | null }) => `${t.chatId}:${t.topicId ?? 0}`;

interface Props {
  /** Что отправляем — над поиском. */
  header?: React.ReactNode;
  /** Чат, выбранный заранее (например, в системном окне «Поделиться»). */
  preselectChatId?: number;
  caption: string;
  onCaption: (s: string) => void;
  captionPlaceholder: string;
  /** Можно ли отправить с пустой подписью (есть файлы). */
  hasContent: boolean;
  progress: { done: number; total: number } | null;
  onSend: (targets: ChatTarget[]) => void;
}

export default function ChatTargetsPicker({ header, preselectChatId, caption, onCaption, captionPlaceholder, hasContent, progress, onSend }: Props) {
  const insets = useSafeAreaInsets();
  const [chats, setChats] = useState<any[] | null>(null);
  const [query, setQuery] = useState('');
  const [targets, setTargets] = useState<ChatTarget[]>([]);
  const [topicChat, setTopicChat] = useState<any | null>(null);
  useContactNames();

  useEffect(() => {
    request<any[]>('/api/chats')
      .then((list) => {
        if (preselectChatId) {
          const picked = list.find((c) => c.id === preselectChatId);
          if (picked) {
            if (!picked.is_supergroup) setTargets([{ chatId: picked.id, topicId: null, name: picked.name }]);
            list = [picked, ...list.filter((c) => c.id !== picked.id)];
          }
        }
        setChats(list);
      })
      .catch((e) => {
        setChats([]);
        showError(e?.message || '', 'Не удалось загрузить чаты');
      });
  }, [preselectChatId]);

  const shown = useMemo(() => {
    const list = chats || [];
    if (!query.trim()) return list;
    return list
      .map((c) => ({ c, r: fuzzyMatch(c.name || '', query) }))
      .filter((x) => x.r.match)
      .sort((a, b) => a.r.rank - b.r.rank)
      .map((x) => x.c);
  }, [chats, query]);

  const toggle = (t: ChatTarget) =>
    setTargets((prev) => (prev.some((p) => targetKey(p) === targetKey(t)) ? prev.filter((p) => targetKey(p) !== targetKey(t)) : [...prev, t]));

  const onChat = (c: any) => {
    if (c.is_supergroup) setTopicChat(c);
    else toggle({ chatId: c.id, topicId: null, name: c.name });
  };

  const canSend = targets.length > 0 && (hasContent || !!caption.trim()) && !progress;

  return (
    <View style={{ flex: 1 }}>
      {header}
      <View style={styles.search}>
        <Search size={18} color={T.textMuted} />
        <TextInput style={styles.searchInput} value={query} onChangeText={setQuery} placeholder="Поиск чата или сотрудника" placeholderTextColor={T.textMuted} />
        {query ? (
          <TouchableOpacity onPress={() => setQuery('')} accessibilityLabel="Очистить">
            <X size={17} color={T.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {chats === null ? (
        <ActivityIndicator color={T.accent} style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(c) => String(c.id)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 12 }}
          ListEmptyComponent={<Text style={styles.empty}>Чаты не найдены</Text>}
          renderItem={({ item }) => {
            const chosen = targets.filter((t) => t.chatId === item.id);
            const on = chosen.length > 0;
            return (
              <TouchableOpacity style={styles.row} onPress={() => onChat(item)} activeOpacity={0.6}>
                <View>
                  <UserAvatar name={item.name} url={item.avatar_url} size={48} />
                  {on ? (
                    <View style={styles.avatarCheck}>
                      <Check size={12} color={T.onAccent} strokeWidth={3.2} />
                    </View>
                  ) : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {item.name || 'Чат'}
                  </Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {item.is_supergroup
                      ? on
                        ? `Темы: ${chosen.map((c) => c.name.split(' › ')[1] || 'Общий').join(', ')}`
                        : 'Группа с темами — выберите тему'
                      : item.type === 'private'
                        ? 'Личный чат'
                        : membersLabel(item)}
                  </Text>
                </View>
                {item.is_supergroup ? (
                  <ChevronRight size={20} color={T.textMuted} />
                ) : (
                  <View style={[styles.radio, on && styles.radioOn]}>{on ? <Check size={14} color={T.onAccent} strokeWidth={3} /> : null}</View>
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}

      <View style={[styles.footer, { paddingBottom: insets.bottom + 8 }]}>
        {targets.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
            {targets.map((t) => (
              <TouchableOpacity key={targetKey(t)} style={styles.chip} onPress={() => toggle(t)}>
                <Text style={styles.chipText} numberOfLines={1}>
                  {t.name}
                </Text>
                <X size={13} color={T.accent} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : null}
        <View style={styles.composer}>
          <TextInput
            style={styles.caption}
            value={caption}
            onChangeText={onCaption}
            placeholder={captionPlaceholder}
            placeholderTextColor={T.textMuted}
            multiline
            maxLength={4000}
          />
          <TouchableOpacity style={[styles.sendBtn, !canSend && styles.sendOff]} onPress={() => onSend(targets)} disabled={!canSend} accessibilityLabel="Отправить">
            {progress ? <ActivityIndicator color={T.onAccent} /> : <Send size={20} color={T.onAccent} />}
            {targets.length > 1 && !progress ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{targets.length}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>
        {progress ? (
          <View style={styles.progressTrack}>
            <View style={[styles.progressBar, { width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }]} />
          </View>
        ) : null}
      </View>

      {topicChat ? (
        <TopicPicker
          chat={topicChat}
          selected={targets.filter((t) => t.chatId === topicChat.id).map((t) => t.topicId)}
          onToggle={(topicId, title) => toggle({ chatId: topicChat.id, topicId, name: `${topicChat.name} › ${title}` })}
          onClose={() => setTopicChat(null)}
        />
      ) : null}
    </View>
  );
}

/** Полноэкранное окно «Переслать» с тем же выбором чатов. */
export function ChatTargetsModal({
  visible,
  title,
  subtitle,
  onClose,
  ...picker
}: Props & { visible: boolean; title: string; subtitle?: string; onClose: () => void }) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.modal} edges={['top']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.iconBtn} accessibilityLabel="Закрыть">
              <X size={24} color={T.textPrimary} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{title}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
          </View>
          {visible ? <ChatTargetsPicker {...picker} /> : null}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function membersLabel(chat: any) {
  const n = chat.members_count || (chat.members || []).length;
  return n ? `${n} ${plural(n, ['участник', 'участника', 'участников'])}` : 'Группа';
}

/** Тема группы с темами, куда отправить (как «Выберите тему» в Telegram). */
function TopicPicker({
  chat,
  selected,
  onToggle,
  onClose,
}: {
  chat: any;
  selected: (number | null)[];
  onToggle: (topicId: number | null, title: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [topics, setTopics] = useState<any[] | null>(null);
  useEffect(() => {
    request<any[]>(`/api/chats/${chat.id}/topics`)
      .then(setTopics)
      .catch(() => setTopics([]));
  }, [chat.id]);
  const rows = [{ id: null, title: 'Общий' }, ...(topics || [])];
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.handle} />
        <View style={styles.sheetHead}>
          <Users size={18} color={T.accent} />
          <Text style={styles.sheetTitle} numberOfLines={1}>
            {chat.name}
          </Text>
          <TouchableOpacity onPress={onClose} style={styles.doneBtn}>
            <Text style={styles.doneText}>Готово</Text>
          </TouchableOpacity>
        </View>
        {topics === null ? (
          <ActivityIndicator color={T.accent} style={{ margin: 24 }} />
        ) : (
          <ScrollView style={{ maxHeight: 420 }}>
            {rows.map((t: any) => {
              const on = selected.includes(t.id ?? null);
              return (
                <TouchableOpacity key={String(t.id)} style={styles.topicRow} onPress={() => onToggle(t.id ?? null, t.title)} activeOpacity={0.6}>
                  <View style={[styles.topicIcon, { backgroundColor: withAlpha(t.icon_color || T.accent, 0.16) }]}>
                    <Hash size={17} color={t.icon_color || T.accent} />
                  </View>
                  <Text style={styles.topicTitle} numberOfLines={1}>
                    {t.title}
                  </Text>
                  <View style={[styles.radio, on && styles.radioOn]}>{on ? <Check size={14} color={T.onAccent} strokeWidth={3} /> : null}</View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = themed(() => ({
  modal: { flex: 1, backgroundColor: T.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 6 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '800', color: T.textPrimary },
  subtitle: { fontSize: 13, color: T.textSecondary, marginTop: 1 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 14, paddingHorizontal: 12, borderRadius: 14, backgroundColor: T.inputBg },
  searchInput: { flex: 1, height: 42, fontSize: 15, color: T.textPrimary },
  empty: { textAlign: 'center', marginTop: 30, color: T.textMuted, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  rowName: { fontSize: 16, fontWeight: '700', color: T.textPrimary },
  rowSub: { fontSize: 13, color: T.textSecondary, marginTop: 2 },
  avatarCheck: { position: 'absolute', right: -2, bottom: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: T.accent, borderWidth: 2, borderColor: T.background, alignItems: 'center', justifyContent: 'center' },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: T.textMuted, alignItems: 'center', justifyContent: 'center' },
  radioOn: { backgroundColor: T.accent, borderColor: T.accent },
  footer: { borderTopWidth: 1, borderTopColor: T.border, backgroundColor: T.card, paddingTop: 8, paddingHorizontal: 10 },
  chips: { gap: 6, paddingBottom: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 220, paddingHorizontal: 10, height: 28, borderRadius: 14, backgroundColor: T.accentMuted },
  chipText: { fontSize: 13, fontWeight: '600', color: T.accent, flexShrink: 1 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  caption: { flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 22, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11, backgroundColor: T.inputBg, fontSize: 15.5, color: T.textPrimary },
  sendBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center' },
  sendOff: { opacity: 0.45 },
  badge: { position: 'absolute', right: -3, top: -3, minWidth: 19, height: 19, borderRadius: 10, paddingHorizontal: 4, backgroundColor: T.danger, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: T.card },
  badgeText: { fontSize: 10.5, fontWeight: '800', color: '#FFFFFF' },
  progressTrack: { height: 3, borderRadius: 2, backgroundColor: T.inputBg, marginTop: 8, overflow: 'hidden' },
  progressBar: { height: 3, backgroundColor: T.accent },
  backdrop: { ...({ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 } as const), backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: T.elevated, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 8 },
  handle: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: withAlpha(T.textPrimary, 0.18), marginTop: 8 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 10 },
  sheetTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: T.textPrimary },
  doneBtn: { paddingHorizontal: 12, height: 36, justifyContent: 'center' },
  doneText: { fontSize: 15.5, fontWeight: '700', color: T.accent },
  topicRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10 },
  topicIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  topicTitle: { flex: 1, fontSize: 16, fontWeight: '600', color: T.textPrimary },
}));
