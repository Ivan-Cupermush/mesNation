import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X, Search, Send, Users, User, Check } from 'lucide-react-native';
import { request } from '../services/http';
import { fuzzyMatch } from '../utils/fuzzySearch';

/** Выбор чата для отправки (заметки и т. п.) с необязательным комментарием. */

interface Props {
  visible: boolean;
  title: string;
  onClose: () => void;
  onSend: (chatId: number, comment: string) => Promise<void>;
}

export default function ShareToChatModal({ visible, title, onClose, onSend }: Props) {
  const [chats, setChats] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setQuery('');
    setSelected(null);
    setComment('');
    setError(null);
    setLoading(true);
    request<any[]>('/api/chats')
      .then(setChats)
      .catch((e) => setError(e?.message || 'Не удалось загрузить чаты'))
      .finally(() => setLoading(false));
  }, [visible]);

  const filtered = useMemo(() => {
    if (!query.trim()) return chats;
    return chats
      .map((c) => ({ c, r: fuzzyMatch(c.name || '', query) }))
      .filter((x) => x.r.match)
      .sort((a, b) => a.r.rank - b.r.rank)
      .map((x) => x.c);
  }, [chats, query]);

  const send = async () => {
    if (!selected) return;
    setSending(true);
    try {
      await onSend(selected, comment.trim());
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.iconBtn} accessibilityLabel="Закрыть">
              <X size={22} color="#141414" />
            </TouchableOpacity>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {title}
            </Text>
          </View>

          <View style={styles.searchBox}>
            <Search size={18} color="#9A9AA0" />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Поиск чата или сотрудника"
              placeholderTextColor="#9A9AA0"
            />
          </View>

          {loading ? (
            <ActivityIndicator style={{ marginTop: 32 }} color="#1F7A52" />
          ) : error ? (
            <Text style={styles.empty}>{error}</Text>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(c) => String(c.id)}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={styles.empty}>Чаты не найдены</Text>}
              renderItem={({ item }) => {
                const active = selected === item.id;
                const Icon = item.type === 'private' ? User : Users;
                return (
                  <TouchableOpacity style={[styles.row, active && styles.rowActive]} onPress={() => setSelected(item.id)}>
                    <View style={styles.avatar}>
                      <Icon size={18} color="#1F7A52" />
                    </View>
                    <Text style={styles.rowText} numberOfLines={1}>
                      {item.name || 'Чат'}
                    </Text>
                    {active && <Check size={20} color="#1F7A52" strokeWidth={2.6} />}
                  </TouchableOpacity>
                );
              }}
            />
          )}

          <View style={styles.footer}>
            <TextInput
              style={styles.commentInput}
              value={comment}
              onChangeText={setComment}
              placeholder="Комментарий (необязательно)"
              placeholderTextColor="#9A9AA0"
              multiline
              maxLength={4000}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!selected || sending) && styles.sendBtnDisabled]}
              disabled={!selected || sending}
              onPress={send}
              accessibilityLabel="Отправить"
            >
              {sending ? <ActivityIndicator color="#FFFFFF" /> : <Send size={20} color="#FFFFFF" />}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAF8' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: '#141414' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECECE8',
  },
  searchInput: { flex: 1, height: 44, fontSize: 15, color: '#141414' },
  empty: { textAlign: 'center', color: '#6F6F73', marginTop: 32 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  rowActive: { backgroundColor: '#E3F1EA' },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F1F7F4', alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, fontSize: 16, color: '#141414' },
  footer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#ECECE8',
    backgroundColor: '#FFFFFF',
  },
  commentInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#F4F4F2',
    fontSize: 15,
    color: '#141414',
  },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1F7A52', alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: '#C9CCD1' },
});
