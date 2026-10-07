import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable, TextInput, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search } from 'lucide-react-native';
import { T, themed } from '../../theme/runtime';
import { api } from '../../services/api';

/** Выбор сотрудника из своей команды (поддерево ролей руководителя). */
export default function TeamPickerModal({
  visible, title = 'Сотрудник', onClose, onPick,
}: { visible: boolean; title?: string; onClose: () => void; onPick: (u: { id: number; name: string }) => void }) {
  const insets = useSafeAreaInsets();
  const [team, setTeam] = useState<{ id: number; name: string; role: string }[] | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!visible || team) return;
    api.getSubordinates('month')
      .then((rows) => setTeam(rows.map((r: any) => ({ id: Number(r.user_id), name: r.display_name || r.username, role: r.role_name || 'Сотрудник' }))))
      .catch(() => setTeam([]));
  }, [visible, team]);

  const shown = (team ?? []).filter((u) => u.name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.handle} />
        <Text style={styles.title}>{title}</Text>
        <View style={styles.search}>
          <Search size={18} color={T.textSecondary} />
          <TextInput style={styles.input} placeholder="Поиск по имени" placeholderTextColor={T.textMuted} value={q} onChangeText={setQ} />
        </View>
        {!team ? (
          <ActivityIndicator color={T.accent} style={{ marginVertical: 24 }} />
        ) : (
          <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
            {shown.length === 0 && <Text style={styles.empty}>{team.length ? 'Никого не нашли' : 'В вашей команде нет сотрудников'}</Text>}
            {shown.map((u) => (
              <TouchableOpacity key={u.id} style={styles.row} onPress={() => onPick({ id: u.id, name: u.name })}>
                <View style={styles.avatar}><Text style={styles.avatarText}>{u.name.charAt(0)}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{u.name}</Text>
                  <Text style={styles.role}>{u.role}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = themed(() => ({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: T.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 8 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: T.border, marginBottom: 12 },
  title: { fontSize: 17, fontWeight: '700', color: T.textPrimary, marginBottom: 12 },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: T.inputBg, borderRadius: 14,
    paddingHorizontal: 12, height: 44, marginBottom: 8,
  },
  input: { flex: 1, fontSize: 14, color: T.textPrimary },
  empty: { textAlign: 'center', color: T.textSecondary, paddingVertical: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: T.border },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: T.accent, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: T.onAccent, fontWeight: '700', fontSize: 15 },
  name: { fontSize: 14, fontWeight: '700', color: T.textPrimary },
  role: { fontSize: 11, color: T.textSecondary, marginTop: 2 },
}));
