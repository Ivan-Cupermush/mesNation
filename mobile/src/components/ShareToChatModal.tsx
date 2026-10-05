import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X, Search, Send, Users, User, Check } from 'lucide-react-native';
import { request } from '../services/http';
import { fuzzyMatch } from '../utils/fuzzySearch';

import { T, themed } from '../theme/runtime';
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
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.iconBtn} accessibilityLabel="Закрыть">
              <X size={22} color={T.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {title}
            </Text>
          </View>

          <View style={styles.searchBox}>
            <Search size={18} color={T.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Поиск чата или сотрудника"
              placeholderTextColor={T.textMuted}
            />
          </View>

          {loading ? (
            <ActivityIndicator style={{ marginTop: 32 }} color={T.accent} />
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
                      <Icon size={18} color={T.accent} />
                    </View>
                    <Text style={styles.rowText} numberOfLines={1}>
                      {item.name || 'Чат'}
                    </Text>
                    {active && <Check size={20} color={T.accent} strokeWidth={2.6} />}
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
              placeholderTextColor={T.textMuted}
              multiline
              maxLength={4000}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!selected || sending) && styles.sendBtnDisabled]}
              disabled={!selected || sending}
              onPress={send}
              accessibilityLabel="Отправить"
            >
              {sending ? <ActivityIndicator color={T.onAccent} /> : <Send size={20} color={T.onAccent} />}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = themed(() => ({
  container: { flex: 1, backgroundColor: T.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: T.textPrimary },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: T.card,
    borderWidth: 1,
    borderColor: T.border,
  },
  searchInput: { flex: 1, height: 44, fontSize: 15, color: T.textPrimary },
  empty: { textAlign: 'center', color: T.textSecondary, marginTop: 32 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  rowActive: { backgroundColor: T.accentMuted },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: T.accentMuted, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, fontSize: 16, color: T.textPrimary },
  footer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: T.border,
    backgroundColor: T.card,
  },
  commentInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: T.inputBg,
    fontSize: 15,
    color: T.textPrimary,
  },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: T.disabled }
}));
