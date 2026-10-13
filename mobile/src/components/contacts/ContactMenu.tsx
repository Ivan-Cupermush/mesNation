import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, TextInput, FlatList, ActivityIndicator, Alert, KeyboardAvoidingView, Pressable } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MessageCircle, Share2, UserPen, UserPlus, X, Check, Search, Users, QrCode } from 'lucide-react-native';
import { openQrProfile } from '../../navigation/ref';
import { T, themed } from '../../theme/runtime';
import { withAlpha } from '../../theme/palettes';
import { request } from '../../services/http';
import { contactRecord, saveContactName } from '../../services/contacts';
import { fuzzyMatch } from '../../utils/fuzzySearch';
import ActionSheet, { SheetAction } from '../chat/ActionSheet';
import ShareToChatModal from '../ShareToChatModal';
import UserAvatar from '../ui/UserAvatar';
import { ContactCard, SharedContact } from './ContactCard';

/**
 * Меню ⋯ в профиле сотрудника и в информации о личном чате — как в Telegram:
 * поделиться контактом, QR-код контакта, изменить контакт (своё имя,
 * видно только мне), добавить в группу.
 */
export default function ContactMenu({
  visible,
  onClose,
  user,
  onWrite,
  onDone,
}: {
  visible: boolean;
  onClose: () => void;
  user: SharedContact;
  /** Есть только в профиле сотрудника (в чате и так пишем). */
  onWrite?: () => void;
  /** Что-то поменялось (имя контакта) — экран может обновиться. */
  onDone?: (msg: string) => void;
}) {
  const [share, setShare] = useState(false);
  const [edit, setEdit] = useState(false);
  const [groups, setGroups] = useState(false);
  const name = user.display_name || user.username;

  const actions: SheetAction[] = [
    ...(onWrite
      ? [{ key: 'write', label: 'Написать', icon: <MessageCircle size={20} color={T.textPrimary} />, onPress: () => { onClose(); onWrite(); } }]
      : []),
    { key: 'share', label: 'Поделиться контактом', icon: <Share2 size={20} color={T.textPrimary} />, onPress: () => { onClose(); setShare(true); } },
    { key: 'qr', label: 'QR-код контакта', icon: <QrCode size={20} color={T.textPrimary} />, onPress: () => { onClose(); openQrProfile(user.id); } },
    { key: 'edit', label: 'Изменить контакт', icon: <UserPen size={20} color={T.textPrimary} />, onPress: () => { onClose(); setEdit(true); } },
    { key: 'group', label: 'Добавить в группу', icon: <UserPlus size={20} color={T.textPrimary} />, onPress: () => { onClose(); setGroups(true); } },
  ];

  const sendContact = async (chatId: number, comment: string) => {
    try {
      await request(`/api/chats/${chatId}/contact`, { method: 'POST', body: { user_id: user.id, comment: comment || undefined } });
      setShare(false);
      onDone?.('Контакт отправлен');
    } catch (e: any) {
      Alert.alert('Не удалось отправить', e?.message || '');
    }
  };

  return (
    <>
      <ActionSheet visible={visible} title={name} preview={user.role_name || `@${user.username}`} actions={actions} onClose={onClose} />
      <ShareToChatModal
        visible={share}
        title="Поделиться контактом"
        onClose={() => setShare(false)}
        onSend={sendContact}
        commentPlaceholder="Добавить подпись…"
        preview={
          <View style={styles.previewBubble}>
            <ContactCard contact={user} mine width={236} />
          </View>
        }
      />
      {edit && <EditContactModal user={user} onClose={() => setEdit(false)} onSaved={(msg) => onDone?.(msg)} />}
      {groups && <AddToGroupModal user={user} onClose={() => setGroups(false)} onAdded={(msg) => onDone?.(msg)} />}
    </>
  );
}

/** «Изменить контакт»: имя и фамилия, которые видите только вы. */
function EditContactModal({ user, onClose, onSaved }: { user: SharedContact; onClose: () => void; onSaved: (msg: string) => void }) {
  const insets = useSafeAreaInsets();
  const rec = contactRecord(user.id);
  const real = user.display_name || user.username;
  const [first, setFirst] = useState(rec?.first_name ?? real.split(' ')[0] ?? '');
  const [last, setLast] = useState(rec?.last_name ?? real.split(' ').slice(1).join(' '));
  const [busy, setBusy] = useState(false);

  const save = async (f: string, l: string) => {
    setBusy(true);
    try {
      await saveContactName(user.id, f.trim(), l.trim());
      onClose();
      onSaved(f.trim() || l.trim() ? 'Имя контакта сохранено' : 'Показывается настоящее имя');
    } catch (e: any) {
      Alert.alert('Не удалось сохранить', e?.message || '');
    } finally {
      setBusy(false);
    }
  };

  const preview = `${first} ${last}`.trim() || real;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior="padding" style={styles.kav} pointerEvents="box-none">
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.handle} />
          <View style={styles.sheetHead}>
            <TouchableOpacity onPress={onClose} style={styles.iconBtn} accessibilityLabel="Отмена">
              <X size={22} color={T.textSecondary} />
            </TouchableOpacity>
            <Text style={styles.sheetTitle}>Изменить контакт</Text>
            <TouchableOpacity onPress={() => save(first, last)} style={styles.iconBtn} disabled={busy} accessibilityLabel="Сохранить">
              {busy ? <ActivityIndicator color={T.accent} /> : <Check size={24} color={T.accent} strokeWidth={2.6} />}
            </TouchableOpacity>
          </View>
          <View style={styles.editHero}>
            <UserAvatar name={real} url={user.avatar_url} size={72} />
            <Text style={styles.editPreview} numberOfLines={1}>
              {preview}
            </Text>
            <Text style={styles.editReal}>в профиле: {real}</Text>
          </View>
          <View style={styles.fields}>
            <TextInput style={styles.field} value={first} onChangeText={setFirst} placeholder="Имя" placeholderTextColor={T.textMuted} maxLength={100} autoFocus />
            <View style={styles.fieldDivider} />
            <TextInput style={styles.field} value={last} onChangeText={setLast} placeholder="Фамилия" placeholderTextColor={T.textMuted} maxLength={100} />
          </View>
          <Text style={styles.hint}>Это имя видите только вы — в списке чатов, в чате и в подписях сообщений. Настоящие данные сотрудника остаются в его профиле.</Text>
          {rec ? (
            <TouchableOpacity onPress={() => save('', '')} style={styles.resetBtn} disabled={busy}>
              <Text style={styles.resetText}>Вернуть настоящее имя</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

interface GroupRow {
  id: number;
  name: string;
  avatar_url: string | null;
  is_supergroup: boolean;
  members_count: number;
  is_member: boolean;
  can_add: boolean;
}

/** «Добавить в группу»: мои группы, куда можно пригласить сотрудника. */
function AddToGroupModal({ user, onClose, onAdded }: { user: SharedContact; onClose: () => void; onAdded: (msg: string) => void }) {
  const [list, setList] = useState<GroupRow[] | null>(null);
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const name = user.display_name || user.username;

  useEffect(() => {
    request<GroupRow[]>(`/api/contacts/${user.id}/groups`)
      .then(setList)
      .catch((e) => {
        setList([]);
        Alert.alert('Не удалось загрузить группы', e?.message || '');
      });
  }, [user.id]);

  const shown = useMemo(() => (list || []).filter((g) => !q.trim() || fuzzyMatch(g.name || '', q).match), [list, q]);

  const add = (g: GroupRow) =>
    Alert.alert('Добавить в группу?', `${name} появится в «${g.name}» и увидит новые сообщения.`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Добавить',
        onPress: async () => {
          setBusyId(g.id);
          try {
            await request(`/api/chats/${g.id}/members`, { method: 'POST', body: { user_ids: [user.id] } });
            setList((prev) => (prev || []).map((x) => (x.id === g.id ? { ...x, is_member: true, members_count: x.members_count + 1 } : x)));
            onAdded(`${name} добавлен(а) в «${g.name}»`);
          } catch (e: any) {
            Alert.alert('Не удалось добавить', e?.message || '');
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.full}>
        <View style={styles.fullHead}>
          <TouchableOpacity onPress={onClose} style={styles.iconBtn} accessibilityLabel="Закрыть">
            <X size={22} color={T.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.fullTitle}>Добавить в группу</Text>
            <Text style={styles.fullSub} numberOfLines={1}>
              {name}
            </Text>
          </View>
        </View>
        <View style={styles.search}>
          <Search size={18} color={T.textMuted} />
          <TextInput style={styles.searchInput} value={q} onChangeText={setQ} placeholder="Поиск группы" placeholderTextColor={T.textMuted} />
        </View>
        {list === null ? (
          <ActivityIndicator color={T.accent} style={{ marginTop: 30 }} />
        ) : (
          <FlatList
            data={shown}
            keyExtractor={(g) => String(g.id)}
            contentContainerStyle={{ paddingVertical: 6 }}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Users size={40} color={T.textMuted} strokeWidth={1.5} />
                <Text style={styles.emptyText}>{list.length ? 'Ничего не найдено' : 'У вас пока нет групп'}</Text>
              </View>
            }
            renderItem={({ item }) => {
              const disabled = item.is_member || !item.can_add;
              return (
                <TouchableOpacity style={[styles.groupRow, disabled && { opacity: 0.55 }]} onPress={() => add(item)} disabled={disabled || busyId !== null} activeOpacity={0.6}>
                  <UserAvatar name={item.name} url={item.avatar_url} size={46} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.groupName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.groupSub}>
                      {item.is_member ? 'уже в группе' : !item.can_add ? 'нет прав приглашать' : `${item.members_count} участн.`}
                    </Text>
                  </View>
                  {busyId === item.id ? (
                    <ActivityIndicator color={T.accent} />
                  ) : item.is_member ? (
                    <Check size={20} color={T.accent} strokeWidth={2.6} />
                  ) : item.can_add ? (
                    <UserPlus size={20} color={T.accent} />
                  ) : null}
                </TouchableOpacity>
              );
            }}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = themed(() => ({
  previewBubble: { padding: 5, borderRadius: 18, borderBottomRightRadius: 6, backgroundColor: T.myMessageBubble },
  backdrop: { ...({ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 } as const), backgroundColor: 'rgba(0,0,0,0.4)' },
  kav: { flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: T.elevated, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16 },
  handle: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: withAlpha(T.textPrimary, 0.18), marginTop: 8 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  sheetTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: T.textPrimary },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  editHero: { alignItems: 'center', paddingVertical: 14 },
  editPreview: { marginTop: 10, fontSize: 19, fontWeight: '800', color: T.textPrimary },
  editReal: { marginTop: 2, fontSize: 13, color: T.textMuted },
  fields: { borderRadius: 14, backgroundColor: T.card, borderWidth: 1, borderColor: T.border },
  field: { height: 50, paddingHorizontal: 14, fontSize: 16, color: T.textPrimary },
  fieldDivider: { height: 1, backgroundColor: T.border, marginLeft: 14 },
  hint: { fontSize: 12.5, lineHeight: 17, color: T.textMuted, marginTop: 10, paddingHorizontal: 4 },
  resetBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  resetText: { fontSize: 15, fontWeight: '700', color: T.danger },
  full: { flex: 1, backgroundColor: T.background },
  fullHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingVertical: 6 },
  fullTitle: { fontSize: 17, fontWeight: '700', color: T.textPrimary },
  fullSub: { fontSize: 13, color: T.textSecondary },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, paddingHorizontal: 12, borderRadius: 12, backgroundColor: T.card },
  searchInput: { flex: 1, height: 44, fontSize: 15, color: T.textPrimary },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  groupName: { fontSize: 16, fontWeight: '700', color: T.textPrimary },
  groupSub: { fontSize: 13, color: T.textSecondary, marginTop: 2 },
  empty: { alignItems: 'center', paddingTop: 40, gap: 10 },
  emptyText: { fontSize: 15, color: T.textSecondary },
}));
