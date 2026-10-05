import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  Switch,
  KeyboardAvoidingView,
  } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { launchImageLibrary } from 'react-native-image-picker';
import { ChevronLeft, Users, Search, Check, Layers, ArrowRight, Camera, X } from 'lucide-react-native';
import { SERVER_URL } from '../config';
import { request, upload } from '../services/http';
import { fuzzyMatch } from '../utils/fuzzySearch';
import { C, hashColor, initials, plural } from '../components/chat/chatUtils';

import { T, themed } from '../theme/runtime';
import { withAlpha } from '../theme/palettes';
/**
 * Новый чат как в Telegram:
 *  1. «Новое сообщение» — список сотрудников; нажатие сразу открывает
 *     личную переписку (или существующую).
 *  2. «Создать группу» / «Группа с темами» — выбор участников (чипы сверху),
 *     затем название, фото и переключатель тем; после создания группа
 *     сразу открывается.
 */

type Step = 'contacts' | 'members' | 'details';

function Avatar({ user, size = 46 }: { user: any; size?: number }) {
  const name = user.display_name || user.username || '?';
  return user.avatar_url ? (
    <Image source={{ uri: SERVER_URL + user.avatar_url }} style={{ width: size, height: size, borderRadius: size / 2 }} />
  ) : (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: hashColor(name), alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: T.onAccent, fontWeight: '700', fontSize: size * 0.36 }}>{initials(name)}</Text>
    </View>
  );
}

export default function CreateChatScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>(route?.params?.mode === 'group' ? 'members' : 'contacts');
  const [users, setUsers] = useState<any[]>([]);
  const [meId, setMeId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<number[]>([]);
  const [name, setName] = useState('');
  const [withTopics, setWithTopics] = useState(false);
  const [photo, setPhoto] = useState<{ uri: string; type?: string; fileName?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([request<any>('/api/auth/me'), request<any[]>('/api/users')])
      .then(([me, list]) => {
        setMeId(me.id);
        setUsers(list);
      })
      .catch((e) => Alert.alert('Ошибка', e?.message || 'Не удалось загрузить сотрудников'))
      .finally(() => setLoading(false));
  }, []);

  const others = useMemo(
    () =>
      users
        .filter((u) => u.id !== meId)
        .sort((a, b) => (a.display_name || a.username).localeCompare(b.display_name || b.username, 'ru')),
    [users, meId],
  );
  const filtered = useMemo(() => {
    if (!search.trim()) return others;
    return others
      .map((u) => ({ u, r: fuzzyMatch(`${u.display_name || ''} ${u.username || ''} ${u.role_name || ''}`, search) }))
      .filter((x) => x.r.match)
      .sort((a, b) => a.r.rank - b.r.rank)
      .map((x) => x.u);
  }, [others, search]);
  const selectedUsers = selected.map((id) => users.find((u) => u.id === id)).filter(Boolean);

  const openPrivate = async (user: any) => {
    if (busy) return;
    setBusy(true);
    try {
      const chat = await request<any>('/api/chats', { method: 'POST', body: { type: 'private', user_ids: [user.id] } });
      navigation.replace('Chat', { chatId: String(chat.id), chatName: chat.name });
    } catch (e: any) {
      Alert.alert('Не удалось открыть чат', e?.message || '');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: number) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const pickPhoto = async () => {
    const res = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1, quality: 0.9 });
    const a = res.assets?.[0];
    if (a?.uri) setPhoto({ uri: a.uri, type: a.type, fileName: a.fileName });
  };

  const createGroup = async () => {
    if (!name.trim()) {
      Alert.alert('Название', 'Введите название группы');
      return;
    }
    setBusy(true);
    try {
      const chat = await request<any>('/api/chats', {
        method: 'POST',
        body: { type: 'group', name: name.trim(), user_ids: selected, is_supergroup: withTopics },
      });
      if (photo) {
        await upload(`/api/chats/${chat.id}/avatar`, 'avatar', { uri: photo.uri, name: photo.fileName || 'avatar.jpg', type: photo.type || 'image/jpeg' }).catch(
          () => Alert.alert('Фото не загружено', 'Группа создана, фото можно поставить в её настройках.'),
        );
      }
      navigation.replace(withTopics ? 'TopicList' : 'Chat', { chatId: String(chat.id), chatName: chat.name });
    } catch (e: any) {
      Alert.alert('Не удалось создать группу', e?.message || '');
    } finally {
      setBusy(false);
    }
  };

  const back = () => {
    if (step === 'details') setStep('members');
    else if (step === 'members' && route?.params?.mode !== 'group') {
      setStep('contacts');
      setSelected([]);
    } else navigation.goBack();
  };

  const title = step === 'contacts' ? 'Новое сообщение' : step === 'members' ? (withTopics ? 'Группа с темами' : 'Новая группа') : 'Название и фото';
  const subtitle = step === 'members' ? (selected.length ? `${selected.length} ${plural(selected.length, ['участник', 'участника', 'участников'])}` : 'Выберите участников') : '';

  const renderUser = ({ item }: { item: any }) => {
    const isSel = selected.includes(item.id);
    return (
      <TouchableOpacity
        style={styles.userRow}
        activeOpacity={0.6}
        onPress={() => (step === 'contacts' ? openPrivate(item) : toggle(item.id))}
        disabled={busy}
      >
        <View>
          <Avatar user={item} />
          {step === 'members' && isSel && (
            <View style={styles.selBadge}>
              <Check size={12} color={T.onAccent} strokeWidth={3.5} />
            </View>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.userName} numberOfLines={1}>
            {item.display_name || item.username}
          </Text>
          <Text style={styles.userSub} numberOfLines={1}>
            {item.role_name || `@${item.username}`}
          </Text>
        </View>
        {step === 'members' && (
          <View style={[styles.checkbox, isSel && styles.checkboxOn]}>{isSel && <Check size={14} color={T.onAccent} strokeWidth={3} />}</View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={back} style={styles.iconBtn} accessibilityLabel="Назад">
          <ChevronLeft size={26} color={C.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{title}</Text>
          {subtitle ? <Text style={styles.headerSub}>{subtitle}</Text> : null}
        </View>
      </View>

      {step === 'details' ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
          <ScrollView contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
            <View style={styles.detailsTop}>
              <TouchableOpacity onPress={pickPhoto} style={styles.photoBtn} activeOpacity={0.8} accessibilityLabel="Фото группы">
                {photo ? <Image source={{ uri: photo.uri }} style={styles.photo} /> : <Camera size={28} color={T.onAccent} />}
              </TouchableOpacity>
              <TextInput
                style={styles.nameInput}
                value={name}
                onChangeText={setName}
                placeholder="Название группы"
                placeholderTextColor={T.textMuted}
                maxLength={255}
                autoFocus
              />
            </View>
            <View style={styles.card}>
              <View style={styles.settingRow}>
                <Layers size={20} color={C.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingTitle}>Темы</Text>
                  <Text style={styles.settingHint}>Разделить переписку на темы (супергруппа). Можно включить и позже.</Text>
                </View>
                <Switch value={withTopics} onValueChange={setWithTopics} trackColor={{ false: T.surfaceActive, true: C.accent }} thumbColor={T.onAccent} />
              </View>
            </View>
            <Text style={styles.sectionLabel}>
              {selected.length + 1} {plural(selected.length + 1, ['участник', 'участника', 'участников'])} (включая вас)
            </Text>
            <View style={styles.card}>
              {selectedUsers.map((u: any) => (
                <View key={u.id} style={styles.userRow}>
                  <Avatar user={u} size={40} />
                  <Text style={[styles.userName, { flex: 1 }]} numberOfLines={1}>
                    {u.display_name || u.username}
                  </Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        <>
          {step === 'members' && selectedUsers.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={{ flexGrow: 0 }}>
              {selectedUsers.map((u: any) => (
                <TouchableOpacity key={u.id} style={styles.chip} onPress={() => toggle(u.id)} activeOpacity={0.7}>
                  <Avatar user={u} size={26} />
                  <Text style={styles.chipText} numberOfLines={1}>
                    {(u.display_name || u.username).split(' ')[0]}
                  </Text>
                  <X size={14} color={C.textMuted} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          <View style={styles.searchBar}>
            <Search size={18} color={C.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Поиск сотрудников"
              placeholderTextColor={T.textMuted}
            />
          </View>

          {loading ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={C.accent} />
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(u) => String(u.id)}
              renderItem={renderUser}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 110 }}
              extraData={selected}
              ListHeaderComponent={
                step === 'contacts' && !search.trim() ? (
                  <View style={styles.actionsBlock}>
                    <TouchableOpacity style={styles.actionRow} onPress={() => { setWithTopics(false); setStep('members'); }} activeOpacity={0.6}>
                      <View style={styles.actionIcon}>
                        <Users size={22} color={C.accent} />
                      </View>
                      <Text style={styles.actionText}>Создать группу</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionRow} onPress={() => { setWithTopics(true); setStep('members'); }} activeOpacity={0.6}>
                      <View style={styles.actionIcon}>
                        <Layers size={22} color={C.accent} />
                      </View>
                      <View>
                        <Text style={styles.actionText}>Создать группу с темами</Text>
                        <Text style={styles.userSub}>Отдельные ветки обсуждений внутри группы</Text>
                      </View>
                    </TouchableOpacity>
                    <Text style={styles.sectionLabel}>СОТРУДНИКИ</Text>
                  </View>
                ) : null
              }
              ListEmptyComponent={<Text style={styles.empty}>{search.trim() ? 'Никого не нашли' : 'Других сотрудников пока нет'}</Text>}
            />
          )}
        </>
      )}

      {step !== 'contacts' && (
        <TouchableOpacity
          style={[styles.fab, { bottom: 24 + insets.bottom }, (step === 'members' ? !selected.length : !name.trim() || busy) && styles.fabDisabled]}
          onPress={() => (step === 'members' ? selected.length && setStep('details') : createGroup())}
          disabled={step === 'members' ? !selected.length : busy}
          accessibilityLabel={step === 'members' ? 'Далее' : 'Создать группу'}
        >
          {busy ? <ActivityIndicator color={T.onAccent} /> : step === 'members' ? <ArrowRight size={26} color={T.onAccent} /> : <Check size={26} color={T.onAccent} strokeWidth={3} />}
        </TouchableOpacity>
      )}
      {busy && step === 'contacts' && (
        <View style={styles.busyOverlay}>
          <ActivityIndicator color={C.accent} size="large" />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = themed(() => ({
  container: { flex: 1, backgroundColor: T.card },
  header: { flexDirection: 'row', alignItems: 'center', height: 58, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: C.text },
  headerSub: { fontSize: 13, color: C.textMuted },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: 12,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 12,
    backgroundColor: T.inputBg,
  },
  searchInput: { flex: 1, fontSize: 16, color: C.text, paddingVertical: 0 },
  chips: { paddingHorizontal: 12, paddingTop: 10, gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 3, paddingRight: 10, height: 32, borderRadius: 16, backgroundColor: C.accentSoft },
  chipText: { fontSize: 14, color: C.text, maxWidth: 110 },
  actionsBlock: { paddingTop: 2 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 10 },
  actionIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 16, color: C.accent, fontWeight: '600' },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: C.textMuted, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 8 },
  userName: { fontSize: 16, fontWeight: '600', color: C.text },
  userSub: { fontSize: 13, color: C.textMuted, marginTop: 1 },
  selBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: C.accent,
    borderWidth: 2,
    borderColor: T.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: T.border, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: C.accent, borderColor: C.accent },
  empty: { textAlign: 'center', color: C.textMuted, marginTop: 40 },
  detailsTop: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  photoBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  photo: { width: 72, height: 72 },
  nameInput: { flex: 1, fontSize: 18, color: C.text, borderBottomWidth: 2, borderBottomColor: C.accent, paddingVertical: 8 },
  card: { marginHorizontal: 12, borderRadius: 14, backgroundColor: T.inputBg, overflow: 'hidden' },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  settingTitle: { fontSize: 16, color: C.text, fontWeight: '600' },
  settingHint: { fontSize: 13, color: C.textMuted, marginTop: 2 },
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
  fabDisabled: { backgroundColor: T.disabled },
  busyOverlay: { ...StyleSheet.absoluteFill, backgroundColor: withAlpha(T.background, 0.7), alignItems: 'center', justifyContent: 'center' },
}));
