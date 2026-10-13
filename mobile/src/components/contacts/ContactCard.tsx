import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable, Alert, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { MessageCircle, UserRound, AtSign, Contact, QrCode } from 'lucide-react-native';
import { openQrProfile } from '../../navigation/ref';
import { T, themed } from '../../theme/runtime';
import { withAlpha } from '../../theme/palettes';
import { request } from '../../services/http';
import { contactName, useContactNames } from '../../services/contacts';
import UserAvatar from '../ui/UserAvatar';

/**
 * Контакт в чате, как в Telegram: карточка сотрудника в сообщении.
 * Нажатие открывает профиль «в чатах» — оттуда можно перейти в профиль
 * сотрудника или написать ему (откроется личный чат, даже пустой).
 */

export interface SharedContact {
  id: number;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  role_name?: string | null;
  is_active?: boolean;
}

const realName = (c: SharedContact) => c.display_name || c.username;

/** Сама карточка — в сообщении и в предпросмотре перед отправкой. */
export function ContactCard({ contact, mine, width = 244 }: { contact: SharedContact; mine: boolean; width?: number }) {
  useContactNames();
  const alias = contactName(contact.id);
  const fg = mine ? T.myMessageText : T.textPrimary;
  const sub = mine ? T.myMessageMuted : T.textSecondary;
  return (
    <View style={[styles.card, mine ? styles.cardMine : styles.cardOther, { width }]}>
      <View style={styles.row}>
        <UserAvatar name={realName(contact)} url={contact.avatar_url} size={46} />
        <View style={styles.body}>
          <Text style={[styles.name, { color: fg }]} numberOfLines={1}>
            {alias || realName(contact)}
          </Text>
          <Text style={[styles.sub, { color: sub }]} numberOfLines={1}>
            {contact.role_name || `@${contact.username}`}
          </Text>
        </View>
      </View>
      <View style={[styles.kindRow, { borderTopColor: mine ? withAlpha('#FFFFFF', 0.18) : withAlpha(T.textPrimary, 0.08) }]}>
        <Contact size={13} color={sub} />
        <Text style={[styles.kind, { color: sub }]}>Контакт сотрудника</Text>
      </View>
    </View>
  );
}

/** Карточка в ленте + профиль «в чатах» по нажатию. */
export default function ContactBubble({ contact, mine, currentUserId }: { contact: SharedContact; mine: boolean; currentUserId: number }) {
  const navigation = useNavigation<any>();
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity activeOpacity={0.85} onPress={() => setOpen(true)} accessibilityLabel={`Контакт ${realName(contact)}`}>
        <ContactCard contact={contact} mine={mine} />
      </TouchableOpacity>
      {open && <ContactSheet contact={contact} currentUserId={currentUserId} navigation={navigation} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Профиль контакта «в чатах»: написать или открыть профиль сотрудника. */
export function ContactSheet({
  contact,
  currentUserId,
  navigation,
  onClose,
}: {
  contact: SharedContact;
  currentUserId: number;
  navigation: any;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  useContactNames();
  const alias = contactName(contact.id);
  const isMe = contact.id === currentUserId;
  const inactive = contact.is_active === false;

  const write = async () => {
    setBusy(true);
    try {
      const chat = await request<any>('/api/chats', { method: 'POST', body: { type: 'private', user_ids: [contact.id] } });
      onClose();
      navigation.navigate('ChatTab', {
        screen: 'Chat',
        initial: false,
        params: { chatId: String(chat.id), chatName: alias || realName(contact) },
      });
    } catch (e: any) {
      Alert.alert('Не удалось открыть чат', e?.message || '');
    } finally {
      setBusy(false);
    }
  };

  const profile = () => {
    onClose();
    navigation.navigate('ChatTab', { screen: 'UserProfile', initial: false, params: { userId: contact.id } });
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.handle} />
        <View style={styles.hero}>
          <UserAvatar name={realName(contact)} url={contact.avatar_url} size={88} />
          <Text style={styles.heroName} numberOfLines={2}>
            {alias || realName(contact)}
          </Text>
          {alias ? <Text style={styles.heroReal}>{realName(contact)}</Text> : null}
          <View style={styles.heroMeta}>
            <AtSign size={13} color={T.textMuted} />
            <Text style={styles.heroMetaText}>{contact.username}</Text>
            {contact.role_name ? <Text style={styles.heroMetaText}> · {contact.role_name}</Text> : null}
          </View>
          {inactive ? <Text style={styles.inactive}>Больше не работает в компании</Text> : null}
        </View>
        <View style={styles.actions}>
          {!isMe && !inactive && (
            <TouchableOpacity style={[styles.action, styles.actionPrimary]} onPress={write} disabled={busy} activeOpacity={0.85}>
              {busy ? <ActivityIndicator color={T.onAccent} /> : <MessageCircle size={20} color={T.onAccent} />}
              <Text style={[styles.actionText, { color: T.onAccent }]}>Написать</Text>
            </TouchableOpacity>
          )}
          <View style={styles.actionRow}>
            <TouchableOpacity style={[styles.action, { flex: 1 }]} onPress={profile} activeOpacity={0.85}>
              <UserRound size={20} color={T.accent} />
              <Text style={styles.actionText}>Профиль сотрудника</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.action, styles.actionSquare]}
              onPress={() => {
                onClose();
                openQrProfile(contact.id);
              }}
              activeOpacity={0.85}
              accessibilityLabel="QR-код контакта"
            >
              <QrCode size={21} color={T.accent} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = themed(() => ({
  card: { borderRadius: 14, overflow: 'hidden', borderWidth: 1, marginTop: 2, marginBottom: 4 },
  cardOther: { backgroundColor: withAlpha(T.accent, 0.07), borderColor: withAlpha(T.accent, 0.16) },
  cardMine: { backgroundColor: withAlpha('#FFFFFF', 0.13), borderColor: withAlpha('#FFFFFF', 0.22) },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 11 },
  body: { flex: 1 },
  name: { fontSize: 15.5, fontWeight: '700' },
  sub: { fontSize: 13, marginTop: 2 },
  kindRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, paddingVertical: 7, borderTopWidth: 1 },
  kind: { fontSize: 12.5, fontWeight: '500' },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: T.elevated, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18 },
  handle: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: withAlpha(T.textPrimary, 0.18), marginTop: 8 },
  hero: { alignItems: 'center', paddingTop: 14, paddingBottom: 18 },
  heroName: { fontSize: 22, fontWeight: '800', color: T.textPrimary, marginTop: 12, textAlign: 'center' },
  heroReal: { fontSize: 14, color: T.textSecondary, marginTop: 2 },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 6 },
  heroMetaText: { fontSize: 13.5, color: T.textMuted },
  inactive: { marginTop: 8, fontSize: 13, fontWeight: '600', color: T.danger },
  actions: { gap: 10 },
  action: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 52, borderRadius: 16, backgroundColor: withAlpha(T.accent, 0.12) },
  actionPrimary: { backgroundColor: T.accent },
  actionRow: { flexDirection: 'row', gap: 10 },
  actionSquare: { width: 52 },
  actionText: { fontSize: 16, fontWeight: '700', color: T.accent },
}));
