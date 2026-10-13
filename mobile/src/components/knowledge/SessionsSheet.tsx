import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable, FlatList, ActivityIndicator, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MessageSquarePlus, MessagesSquare, Trash2 } from 'lucide-react-native';
import { api, ChatSession } from '../../services/api';
import { T, themed } from '../../theme/runtime';
import { withAlpha } from '../../theme/palettes';

/** История диалогов с ассистентом, как на сайте: открыть, удалить, начать новый. */
export default function SessionsSheet({
  currentId,
  onPick,
  onNew,
  onDeleted,
  onClose,
}: {
  currentId: number | null;
  onPick: (s: ChatSession) => void;
  onNew: () => void;
  onDeleted: (id: number) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [list, setList] = useState<ChatSession[] | null>(null);

  useEffect(() => {
    api
      .getChatSessions()
      .then((d) => setList(Array.isArray(d) ? d : []))
      .catch(() => setList([]));
  }, []);

  const remove = (s: ChatSession) =>
    Alert.alert('Удалить диалог?', `«${s.title || 'Диалог'}» и все ответы в нём будут удалены.`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteChatSession(s.id);
            setList((prev) => (prev || []).filter((x) => x.id !== s.id));
            onDeleted(s.id);
          } catch (e: any) {
            Alert.alert('Не удалось удалить', e?.message || '');
          }
        },
      },
    ]);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.handle} />
        <View style={styles.head}>
          <Text style={styles.title}>Диалоги</Text>
          <TouchableOpacity style={styles.newBtn} onPress={onNew} activeOpacity={0.85}>
            <MessageSquarePlus size={17} color={T.onAccent} />
            <Text style={styles.newText}>Новый</Text>
          </TouchableOpacity>
        </View>
        {list === null ? (
          <ActivityIndicator color={T.accent} style={{ margin: 24 }} />
        ) : (
          <FlatList
            data={list}
            style={{ maxHeight: 440 }}
            keyExtractor={(s) => String(s.id)}
            ListEmptyComponent={<Text style={styles.empty}>Диалогов пока нет — задайте первый вопрос</Text>}
            renderItem={({ item }) => {
              const on = item.id === currentId;
              return (
                <TouchableOpacity style={[styles.row, on && styles.rowOn]} onPress={() => onPick(item)} activeOpacity={0.6}>
                  <View style={styles.icon}>
                    <MessagesSquare size={18} color={T.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {item.title || 'Диалог'}
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {new Date(item.updated_at || item.created_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      {item.last_message ? ` · ${item.last_message}` : ''}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => remove(item)} style={styles.del} accessibilityLabel="Удалить диалог">
                    <Trash2 size={17} color={T.textMuted} />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = themed(() => ({
  backdrop: { ...({ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 } as const), backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: T.elevated, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 10 },
  handle: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: withAlpha(T.textPrimary, 0.18), marginTop: 8 },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 12 },
  title: { flex: 1, fontSize: 18, fontWeight: '800', color: T.textPrimary },
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 34, borderRadius: 17, backgroundColor: T.accent },
  newText: { fontSize: 14, fontWeight: '700', color: T.onAccent },
  empty: { textAlign: 'center', color: T.textMuted, padding: 24, fontSize: 14.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 8, paddingVertical: 10, borderRadius: 14 },
  rowOn: { backgroundColor: T.accentMuted },
  icon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(T.accent, 0.12) },
  rowTitle: { fontSize: 15.5, fontWeight: '700', color: T.textPrimary },
  rowSub: { fontSize: 12.5, color: T.textSecondary, marginTop: 2 },
  del: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
}));
