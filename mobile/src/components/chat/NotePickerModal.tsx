import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  FlatList,
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Search, NotebookPen, Star, Paperclip, SendHorizonal, Info } from 'lucide-react-native';
import { request } from '../../services/http';
import { fuzzyMatch } from '../../utils/fuzzySearch';
import { C } from './chatUtils';
import { NoteCard } from '../NoteShareBubble';

import { T, themed } from '../../theme/runtime';
import { withAlpha } from '../../theme/palettes';
/**
 * Выбор своей заметки для отправки в чат (вкладка «Заметка» во вложениях).
 * Как с файлом в Telegram: выбрали — видно, как заметка будет выглядеть
 * в чате, можно дописать подпись и только потом отправить.
 */
export default function NotePickerModal({
  visible,
  onClose,
  onPick
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (noteId: number, caption: string) => void;
}) {
  const [notes, setNotes] = useState<any[] | null>(null);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<any | null>(null);

  useEffect(() => {
    if (!visible) return;
    setQuery('');
    setNotes(null);
    setPicked(null);
    request<any[]>('/api/notes').then(setNotes).catch(() => setNotes([]));
  }, [visible]);

  const filtered = useMemo(() => {
    if (!notes) return [];
    if (!query.trim()) return notes;
    return notes.filter((n) => fuzzyMatch(`${n.title} ${n.content}`, query).match);
  }, [notes, query]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => (picked ? setPicked(null) : onClose())}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.iconBtn} accessibilityLabel="Закрыть">
            <X size={22} color={C.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Отправить заметку</Text>
        </View>
        <View style={styles.search}>
          <Search size={18} color={T.textMuted} />
          <TextInput style={styles.searchInput} value={query} onChangeText={setQuery} placeholder="Поиск по заметкам" placeholderTextColor={T.textMuted} />
        </View>
        {notes === null ? (
          <ActivityIndicator color={C.accent} style={{ marginTop: 30 }} />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(n) => String(n.id)}
            contentContainerStyle={{ padding: 16, gap: 10 }}
            ListEmptyComponent={<Text style={styles.empty}>{notes.length ? 'Ничего не найдено' : 'У вас пока нет заметок'}</Text>}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.card} onPress={() => setPicked(item)} activeOpacity={0.75}>
                <View style={styles.cardIcon}>
                  <NotebookPen size={18} color={C.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {item.title || 'Без названия'}
                  </Text>
                  {item.content ? (
                    <Text style={styles.cardText} numberOfLines={2}>
                      {item.content}
                    </Text>
                  ) : null}
                  <View style={styles.cardMeta}>
                    <Text style={styles.cardDate}>{new Date(item.note_date + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</Text>
                    {item.is_favorite && <Star size={12} color={T.warning} fill={T.warning} />}
                    {item.files_count ? (
                      <>
                        <Paperclip size={12} color={C.textMuted} />
                        <Text style={styles.cardDate}>{item.files_count}</Text>
                      </>
                    ) : null}
                  </View>
                </View>
              </TouchableOpacity>
            )}
          />
        )}
      </SafeAreaView>
      {picked && <SendSheet note={picked} onCancel={() => setPicked(null)} onSend={(caption) => onPick(picked.id, caption)} />}
    </Modal>
  );
}

/** Шторка «Отправить заметку»: как увидят в чате + подпись. */
function SendSheet({ note, onCancel, onSend }: { note: any; onCancel: () => void; onSend: (caption: string) => void }) {
  const insets = useSafeAreaInsets();
  const [caption, setCaption] = useState('');
  const [me, setMe] = useState<{ name: string; avatar: string | null } | null>(null);
  useEffect(() => {
    request<any>('/api/auth/me')
      .then((u) => setMe({ name: u?.display_name || u?.username || '', avatar: u?.avatar_url || null }))
      .catch(() => undefined);
  }, []);
  const slide = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(slide, { toValue: 1, useNativeDriver: true, friction: 9, tension: 80 }).start();
  }, [slide]);

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={styles.backdrop} onPress={onCancel} accessibilityLabel="Отмена" />
      <KeyboardAvoidingView behavior="padding" style={styles.sheetWrap} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: insets.bottom + 10 },
            { opacity: slide, transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [80, 0] }) }] },
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>Отправить заметку</Text>
            <TouchableOpacity onPress={onCancel} style={styles.iconBtn} accessibilityLabel="Выбрать другую">
              <X size={20} color={T.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Так заметка будет выглядеть в чате */}
          <View style={styles.previewBubbleRow}>
            <View style={styles.previewBubble}>
              <NoteCard
                title={note.title}
                preview={String(note.content || '').slice(0, 400)}
                filesCount={note.files_count || 0}
                ownerName={me?.name}
                ownerAvatar={me?.avatar}
                ownerLine="Копия на момент отправки"
                mine
                width={248}
              />
              {caption.trim() ? (
                <Text style={styles.previewCaption} numberOfLines={4}>
                  {caption.trim()}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.hint}>
            <Info size={14} color={T.textMuted} />
            <Text style={styles.hintText}>
              Уйдёт копия на этот момент. Ваши дальнейшие правки получатели не увидят, но смогут запросить текущую версию.
            </Text>
          </View>

          <View style={styles.composer}>
            <TextInput
              style={styles.captionInput}
              value={caption}
              onChangeText={setCaption}
              placeholder="Добавить подпись…"
              placeholderTextColor={T.textMuted}
              multiline
              maxLength={4000}
              autoFocus
            />
            <TouchableOpacity style={styles.sendBtn} onPress={() => onSend(caption.trim())} accessibilityLabel="Отправить заметку">
              <SendHorizonal size={20} color={T.onAccent} />
            </TouchableOpacity>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = themed(() => ({
  container: { flex: 1, backgroundColor: T.inputBg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, height: 54, backgroundColor: T.card },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: C.text },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: 16,
    marginBottom: 0,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: T.card,
  },
  searchInput: { flex: 1, height: 44, fontSize: 15, color: C.text },
  empty: { textAlign: 'center', color: C.textMuted, marginTop: 30 },
  card: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: 14, backgroundColor: T.card },
  cardIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: C.text },
  cardText: { fontSize: 14, color: C.textMuted, marginTop: 2 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  cardDate: { fontSize: 12, color: C.textMuted },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: T.elevated,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 14,
  },
  handle: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: withAlpha(T.textPrimary, 0.18), marginTop: 8 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', paddingLeft: 6, marginTop: 2 },
  sheetTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: T.textPrimary },
  previewBubbleRow: {
    alignItems: 'flex-end',
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 18,
    backgroundColor: T.chatBg,
  },
  previewBubble: {
    maxWidth: 280,
    padding: 5,
    borderRadius: 18,
    borderBottomRightRadius: 6,
    backgroundColor: T.myMessageBubble,
  },
  previewCaption: { color: T.myMessageText, fontSize: 15.5, lineHeight: 20, paddingHorizontal: 6, paddingTop: 2, paddingBottom: 4 },
  hint: { flexDirection: 'row', gap: 8, paddingHorizontal: 6, paddingVertical: 12 },
  hintText: { flex: 1, fontSize: 12.5, lineHeight: 17, color: T.textMuted },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 5,
    borderRadius: 26,
    backgroundColor: T.inputBg,
  },
  captionInput: { flex: 1, minHeight: 42, maxHeight: 110, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, color: C.text },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
}));
