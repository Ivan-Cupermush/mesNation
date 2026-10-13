import React from 'react';
import { View, Text, TouchableOpacity, Pressable, FlatList } from 'react-native';
import Modal from '../ui/AppModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { T, themed } from '../../theme/runtime';
import { withAlpha } from '../../theme/palettes';
import { snippetAround } from '../../utils/fuzzySearch';
import HighlightText from '../ui/HighlightText';
import UserAvatar from '../ui/UserAvatar';
import { messagePreview } from './chatUtils';

/** Текст, в котором ищем, — тот же набор полей, что на сервере. */
export const searchableText = (m: any) => [m.text, m.file_name, m.note_share?.title, m.poll_question].filter(Boolean).join(' · ') || messagePreview(m);

const when = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', ...(d.getFullYear() !== today.getFullYear() ? { year: '2-digit' } : {}) });
};

/** Все найденные в чате сообщения списком (как «показать списком» в Telegram). */
export default function SearchResultsSheet({
  visible,
  query,
  items,
  currentUserId,
  nameOf,
  onClose,
  onPick,
}: {
  visible: boolean;
  query: string;
  items: any[];
  currentUserId: number;
  nameOf: (m: any) => string;
  onClose: () => void;
  onPick: (m: any, index: number) => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 6 }]}>
        <View style={styles.handle} />
        <View style={styles.head}>
          <Text style={styles.title}>
            Найдено: {items.length}
            {query ? <Text style={styles.q}> · «{query}»</Text> : null}
          </Text>
          <TouchableOpacity onPress={onClose} style={styles.close} accessibilityLabel="Закрыть">
            <X size={20} color={T.textSecondary} />
          </TouchableOpacity>
        </View>
        <FlatList
          data={items}
          keyExtractor={(m) => String(m.id)}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          renderItem={({ item, index }) => {
            const who = item.sender_id === currentUserId ? 'Вы' : nameOf(item);
            return (
              <TouchableOpacity style={styles.row} onPress={() => onPick(item, index)} activeOpacity={0.7}>
                <UserAvatar name={who === 'Вы' ? nameOf(item) : who} url={item.sender_avatar_url} size={40} />
                <View style={styles.body}>
                  <View style={styles.top}>
                    <Text style={styles.name} numberOfLines={1}>
                      {who}
                    </Text>
                    <Text style={styles.time}>{when(item.created_at)}</Text>
                  </View>
                  <HighlightText text={snippetAround(searchableText(item), query)} query={query} style={styles.text} hlStyle={styles.hl} numberOfLines={2} />
                </View>
              </TouchableOpacity>
            );
          }}
        />
      </View>
    </Modal>
  );
}

const styles = themed(() => ({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { maxHeight: '75%', backgroundColor: T.elevated, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  handle: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: withAlpha(T.textPrimary, 0.18), marginTop: 8 },
  head: { flexDirection: 'row', alignItems: 'center', paddingLeft: 18, paddingRight: 6, paddingVertical: 4 },
  title: { flex: 1, fontSize: 16, fontWeight: '700', color: T.textPrimary },
  q: { fontWeight: '500', color: T.textSecondary },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  body: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, fontSize: 15, fontWeight: '700', color: T.textPrimary },
  time: { fontSize: 12.5, color: T.textMuted },
  text: { fontSize: 14, lineHeight: 19, color: T.textSecondary, marginTop: 2 },
  hl: { color: T.textPrimary, fontWeight: '700', backgroundColor: withAlpha('#FFC93C', 0.4) },
  sep: { height: 1, marginLeft: 68, backgroundColor: T.border },
}));
