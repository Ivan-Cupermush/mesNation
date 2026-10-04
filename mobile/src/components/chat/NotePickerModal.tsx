import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X, Search, NotebookPen, Star, Paperclip } from 'lucide-react-native';
import { request } from '../../services/http';
import { fuzzyMatch } from '../../utils/fuzzySearch';
import { C } from './chatUtils';

/** Выбор своей заметки для отправки в чат (вкладка «Заметка» во вложениях). */
export default function NotePickerModal({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (noteId: number) => void;
}) {
  const [notes, setNotes] = useState<any[] | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!visible) return;
    setQuery('');
    setNotes(null);
    request<any[]>('/api/notes').then(setNotes).catch(() => setNotes([]));
  }, [visible]);

  const filtered = useMemo(() => {
    if (!notes) return [];
    if (!query.trim()) return notes;
    return notes.filter((n) => fuzzyMatch(`${n.title} ${n.content}`, query).match);
  }, [notes, query]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.iconBtn} accessibilityLabel="Закрыть">
            <X size={22} color={C.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Отправить заметку</Text>
        </View>
        <View style={styles.search}>
          <Search size={18} color="#9A9AA0" />
          <TextInput style={styles.searchInput} value={query} onChangeText={setQuery} placeholder="Поиск по заметкам" placeholderTextColor="#9A9AA0" />
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
              <TouchableOpacity style={styles.card} onPress={() => onPick(item.id)} activeOpacity={0.75}>
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
                    {item.is_favorite && <Star size={12} color="#F59E0B" fill="#F59E0B" />}
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
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F3F1' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, height: 54, backgroundColor: '#FFFFFF' },
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
    backgroundColor: '#FFFFFF',
  },
  searchInput: { flex: 1, height: 44, fontSize: 15, color: C.text },
  empty: { textAlign: 'center', color: C.textMuted, marginTop: 30 },
  card: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: 14, backgroundColor: '#FFFFFF' },
  cardIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: C.text },
  cardText: { fontSize: 14, color: C.textMuted, marginTop: 2 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  cardDate: { fontSize: 12, color: C.textMuted },
});
