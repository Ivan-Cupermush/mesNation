import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  Switch,
  Image,
  Pressable, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRoute, RouteProp } from '@react-navigation/native';
import { launchImageLibrary } from 'react-native-image-picker';
import {
  ChevronLeft,
  Camera,
  Pencil,
  Check,
  Shield,
  FileText,
  Image as ImageIcon,
  Trash2,
  UserPlus,
  Crown,
  ChevronRight,
  Hash,
  LogOut,
  Layers,
  MessageCircle,
  UserRound,
  Link2,
  BarChart3,
  UserMinus,
  ShieldOff,
  Wallpaper as WallpaperIcon,
  Bell,
  BellOff,
} from 'lucide-react-native';
import { SERVER_URL } from '../config';
import { request, upload } from '../services/http';
import { subscribe } from '../services/socket';
import ActionSheet, { SheetAction } from '../components/chat/ActionSheet';
import { MUTE_OPTIONS, isMuted, muteLabel, setChatMute } from '../notifications/mute';
import { C, hashColor, initials, lastSeenLabel, plural } from '../components/chat/chatUtils';

import { T, themed } from '../theme/runtime';
import SafeBottom from '../components/ui/SafeBottom';
import WallpaperPicker from '../components/chat/WallpaperPicker';
import { WallpaperView } from '../components/chat/ChatWallpaper';
import { setChatWallpaper, useChatWallpaper } from '../theme/wallpapers';
/**
 * Информация о чате (как в Telegram).
 * Группа: фото и название (если есть право), темы, медиа, участники с ролями;
 * у каждого участника меню: профиль, назначить/изменить админа, исключить —
 * по правам из my_rights. Внизу «Покинуть» и (для владельца) «Удалить группу».
 * Личный чат: профиль собеседника, общие медиа, «Удалить чат».
 */

type RouteP = RouteProp<{ params: { chatId: string } }, 'params'>;

const PERMS = [
  { key: 'change_info', label: 'Изменение названия, фото и тем' },
  { key: 'delete_messages', label: 'Удаление чужих сообщений' },
  { key: 'ban_users', label: 'Исключение участников' },
  { key: 'add_users', label: 'Добавление участников' },
  { key: 'pin_messages', label: 'Закрепление сообщений' },
  { key: 'add_admins', label: 'Назначение администраторов' },
];
const DEFAULT_PERMS = ['change_info', 'delete_messages', 'ban_users', 'add_users', 'pin_messages'];

function Avatar({ name, url, size }: { name: string; url?: string | null; size: number }) {
  return url ? (
    <Image source={{ uri: SERVER_URL + url }} style={{ width: size, height: size, borderRadius: size / 2 }} />
  ) : (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: hashColor(name), alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: T.onAccent, fontWeight: '700', fontSize: size * 0.36 }}>{initials(name)}</Text>
    </View>
  );
}

export default function ChatInfoScreen({ navigation }: any) {
  const route = useRoute<RouteP>();
  const chatId = route.params.chatId;

  const [chat, setChat] = useState<any>(null);
  const [muteOpen, setMuteOpen] = useState(false);

  const changeMute = async (ms: number | null | 0) => {
    try {
      const until = await setChatMute(chatId, ms);
      setChat((c: any) => (c ? { ...c, muted_until: until } : c));
    } catch (e: any) {
      Alert.alert('Не удалось', e?.message || '');
    }
  };
  const [admins, setAdmins] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [meId, setMeId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState<Record<number, { online: boolean; last_seen_at?: string }>>({});

  const [renameOpen, setRenameOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [memberMenu, setMemberMenu] = useState<any>(null);
  const [adminEditor, setAdminEditor] = useState<{ user: any; perms: string[]; existing: boolean } | null>(null);
  const [topicsDialog, setTopicsDialog] = useState<{ topics: any[]; keep: number | null; merge: boolean } | null>(null);
  const [wallpaperOpen, setWallpaperOpen] = useState(false);
  const { wallpaper, custom: customWallpaper } = useChatWallpaper(chatId);

  const load = useCallback(async () => {
    try {
      const [me, c, s] = await Promise.all([
        request<any>('/api/auth/me'),
        request<any>(`/api/chats/${chatId}`),
        request<any>(`/api/chats/${chatId}/stats`).catch(() => null),
      ]);
      setMeId(me.id);
      setChat(c);
      setStats(s);
      if (c.type === 'group') setAdmins(await request<any[]>(`/api/chats/${chatId}/admins`).catch(() => []));
      const ids = (c.members || []).map((m: any) => m.id);
      if (ids.length) {
        const pres = await request<any[]>('/api/users/presence', { query: { ids: ids.join(',') } }).catch(() => []);
        setOnline(Object.fromEntries(pres.map((p) => [p.user_id, p])));
      }
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message || 'Не удалось загрузить информацию');
    } finally {
      setLoading(false);
    }
  }, [chatId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    const same = (id: any) => String(id) === String(chatId);
    const unsubs = [
      subscribe('members_changed', (e: any) => same(e.chatId) && load()),
      subscribe('chat_updated', (c: any) => same(c.id) && load()),
      subscribe('presence', (p: any) => setOnline((prev) => (prev[p.user_id] ? { ...prev, [p.user_id]: p } : prev))),
    ];
    return () => unsubs.forEach((u) => u());
  }, [chatId, load]);

  if (loading || !chat) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>{loading ? <ActivityIndicator size="large" color={C.accent} /> : <Text style={styles.muted}>Чат не найден</Text>}</View>
      </SafeAreaView>
    );
  }

  const rights = chat.my_rights || {};
  const isGroup = chat.type === 'group';
  const members: any[] = chat.members || [];
  const name = chat.name || 'Чат';
  const onlineCount = members.filter((m) => online[m.id]?.online).length;
  const peer = chat.peer;

  // ===== Действия =====
  const rename = async () => {
    if (!newName.trim()) return;
    try {
      await request(`/api/chats/${chatId}`, { method: 'PATCH', body: { name: newName.trim() } });
      setRenameOpen(false);
      load();
    } catch (e: any) {
      Alert.alert('Не удалось переименовать', e?.message || '');
    }
  };

  const changeAvatar = async () => {
    const res = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1, quality: 0.9 });
    const a = res.assets?.[0];
    if (!a?.uri) return;
    setUploadingAvatar(true);
    try {
      await upload(`/api/chats/${chatId}/avatar`, 'avatar', { uri: a.uri, name: a.fileName || 'avatar.jpg', type: a.type || 'image/jpeg' });
      load();
    } catch (e: any) {
      Alert.alert('Не удалось загрузить фото', e?.message || '');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const toggleTopics = async (value: boolean) => {
    if (value) {
      Alert.alert('Включить темы?', 'Переписка разделится на темы. Текущие сообщения останутся в «Общем» чате, ничего не удалится.', [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Включить',
          onPress: async () => {
            try {
              await request(`/api/chats/${chatId}`, { method: 'PATCH', body: { is_supergroup: true } });
              navigation.reset({ index: 1, routes: [{ name: 'ChatList' }, { name: 'TopicList', params: { chatId, chatName: name } }] });
            } catch (e: any) {
              Alert.alert('Ошибка', e?.message || '');
            }
          },
        },
      ]);
    } else {
      const topics = await request<any[]>(`/api/chats/${chatId}/topics`).catch(() => []);
      setTopicsDialog({ topics, keep: null, merge: true });
    }
  };

  const disableTopics = async () => {
    if (!topicsDialog) return;
    const { keep, merge } = topicsDialog;
    setTopicsDialog(null);
    try {
      await request(`/api/chats/${chatId}`, { method: 'PATCH', body: { is_supergroup: false, keep_topic_id: keep, merge } });
      navigation.reset({ index: 1, routes: [{ name: 'ChatList' }, { name: 'Chat', params: { chatId, chatName: name } }] });
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message || '');
    }
  };

  const removeMember = (m: any) =>
    Alert.alert('Исключить участника?', `${m.display_name || m.username} больше не увидит новые сообщения группы.`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Исключить',
        style: 'destructive',
        onPress: () => request(`/api/chats/${chatId}/members/${m.id}`, { method: 'DELETE' }).then(load).catch((e) => Alert.alert('Ошибка', e?.message || '')),
      },
    ]);

  const saveAdmin = async () => {
    if (!adminEditor) return;
    const { user, perms, existing } = adminEditor;
    try {
      if (existing) await request(`/api/chats/${chatId}/admins/${user.id}`, { method: 'PATCH', body: { permissions: perms } });
      else await request(`/api/chats/${chatId}/admins`, { method: 'POST', body: { user_id: user.id, permissions: perms } });
      setAdminEditor(null);
      load();
    } catch (e: any) {
      Alert.alert('Не удалось сохранить', e?.message || '');
    }
  };

  const dismissAdmin = (m: any) =>
    Alert.alert('Снять администратора?', `${m.display_name || m.username} останется участником без особых прав.`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Снять',
        style: 'destructive',
        onPress: () => request(`/api/chats/${chatId}/admins/${m.id}`, { method: 'DELETE' }).then(load).catch((e) => Alert.alert('Ошибка', e?.message || '')),
      },
    ]);

  const leave = () =>
    Alert.alert(
      'Покинуть группу?',
      rights.is_creator ? 'Вы владелец: права перейдут администратору или самому давнему участнику.' : `Вы перестанете получать сообщения «${name}».`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Покинуть',
          style: 'destructive',
          onPress: () =>
            request(`/api/chats/${chatId}`, { method: 'DELETE', query: { leave: 'true' } })
              .then(() => navigation.popToTop())
              .catch((e) => Alert.alert('Ошибка', e?.message || '')),
        },
      ],
    );

  const deleteChat = () =>
    Alert.alert(
      isGroup ? 'Удалить группу для всех?' : 'Удалить чат?',
      isGroup
        ? 'Группа исчезнет у всех участников. Переписка сохранится в архиве компании.'
        : 'Чат исчезнет из вашего списка. У собеседника он останется; если он напишет, чат вернётся.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () =>
            request(`/api/chats/${chatId}`, { method: 'DELETE' })
              .then(() => navigation.popToTop())
              .catch((e) => Alert.alert('Ошибка', e?.message || '')),
        },
      ],
    );

  const memberActions = (m: any): SheetAction[] => {
    const list: SheetAction[] = [
      {
        key: 'profile',
        label: 'Профиль',
        icon: <UserRound size={20} color={C.text} />,
        onPress: () => navigation.navigate('UserProfile', { userId: m.id }),
      },
      {
        key: 'write',
        label: 'Написать лично',
        icon: <MessageCircle size={20} color={C.text} />,
        onPress: async () => {
          try {
            const c = await request<any>('/api/chats', { method: 'POST', body: { type: 'private', user_ids: [m.id] } });
            navigation.push('Chat', { chatId: String(c.id), chatName: c.name });
          } catch (e: any) {
            Alert.alert('Ошибка', e?.message || '');
          }
        },
      },
    ];
    if (m.role === 'creator' || m.id === meId) return list;
    const admin = admins.find((a) => a.id === m.id);
    if (rights.can_add_admins) {
      list.push({
        key: 'admin',
        label: admin ? 'Изменить права администратора' : 'Назначить администратором',
        icon: <Shield size={20} color={C.text} />,
        onPress: () => setAdminEditor({ user: m, perms: admin?.permissions || DEFAULT_PERMS, existing: !!admin }),
      });
      if (admin) list.push({ key: 'unadmin', label: 'Снять администратора', icon: <ShieldOff size={20} color={C.text} />, onPress: () => dismissAdmin(m) });
    }
    if (rights.can_ban_users && (!admin || rights.is_creator)) {
      list.push({ key: 'kick', label: 'Исключить из группы', danger: true, icon: <UserMinus size={20} color={C.danger} />, onPress: () => removeMember(m) });
    }
    return list;
  };

  const mediaRows = [
    { key: 'images', label: 'Фото и видео', icon: <ImageIcon size={20} color={T.violet} />, bg: T.violetSoft, count: stats?.media },
    { key: 'files', label: 'Файлы', icon: <FileText size={20} color={C.accent} />, bg: C.accentSoft, count: stats?.files },
    { key: 'links', label: 'Ссылки', icon: <Link2 size={20} color={T.info} />, bg: T.infoSoft, count: stats?.links },
    { key: 'polls', label: 'Опросы', icon: <BarChart3 size={20} color={T.warning} />, bg: T.warningSoft, count: stats?.polls },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn} accessibilityLabel="Назад">
          <ChevronLeft size={26} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isGroup ? 'Группа' : 'Информация'}</Text>
        {isGroup && rights.can_change_info ? (
          <TouchableOpacity
            onPress={() => {
              setNewName(name);
              setRenameOpen(true);
            }}
            style={styles.iconBtn}
            accessibilityLabel="Изменить название"
          >
            <Pencil size={20} color={C.accent} />
          </TouchableOpacity>
        ) : (
          <View style={styles.iconBtn} />
        )}
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* ===== HERO ===== */}
        <View style={styles.hero}>
          <View>
            <Avatar name={name} url={chat.avatar_url} size={96} />
            {isGroup && rights.can_change_info && (
              <TouchableOpacity onPress={changeAvatar} style={styles.cameraBtn} disabled={uploadingAvatar} accessibilityLabel="Сменить фото группы">
                {uploadingAvatar ? <ActivityIndicator size="small" color={T.onAccent} /> : <Camera size={16} color={T.onAccent} />}
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.heroName} numberOfLines={2}>
            {name}
          </Text>
          <Text style={[styles.heroSub, !isGroup && online[peer?.id]?.online && { color: C.accent }]}>
            {isGroup
              ? `${chat.is_supergroup ? 'Группа с темами' : 'Группа'} · ${members.length} ${plural(members.length, ['участник', 'участника', 'участников'])}${onlineCount > 1 ? `, ${onlineCount} в сети` : ''}`
              : online[peer?.id]?.online
                ? 'в сети'
                : lastSeenLabel(online[peer?.id]?.last_seen_at)}
          </Text>
          {!isGroup && peer && (
            <TouchableOpacity style={styles.heroAction} onPress={() => navigation.navigate('UserProfile', { userId: peer.id })} activeOpacity={0.7}>
              <UserRound size={18} color={C.accent} />
              <Text style={styles.heroActionText}>Профиль сотрудника</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ===== МЕДИА ===== */}
        <View style={styles.card}>
          {mediaRows.map((r, i) => (
            <TouchableOpacity
              key={r.key}
              style={[styles.row, i > 0 && styles.rowDivider]}
              onPress={() => navigation.navigate('MediaList', { chatId: String(chatId), type: r.key })}
              activeOpacity={0.6}
            >
              <View style={[styles.rowIcon, { backgroundColor: r.bg }]}>{r.icon}</View>
              <Text style={styles.rowText}>{r.label}</Text>
              <Text style={styles.rowCount}>{r.count ?? ''}</Text>
              <ChevronRight size={18} color={T.textMuted} />
            </TouchableOpacity>
          ))}
        </View>

        {/* ===== УВЕДОМЛЕНИЯ И ФОН ===== */}
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.row}
            onPress={() => (isMuted(chat?.muted_until) ? changeMute(0) : setMuteOpen(true))}
            activeOpacity={0.6}
          >
            <View style={[styles.rowIcon, { backgroundColor: isMuted(chat?.muted_until) ? T.inputBg : C.accentSoft }]}>
              {isMuted(chat?.muted_until) ? <BellOff size={19} color={T.textSecondary} /> : <Bell size={19} color={C.accent} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowText}>Уведомления</Text>
              <Text style={styles.rowHint}>{muteLabel(chat?.muted_until)}</Text>
            </View>
            <Text style={[styles.rowCount, { color: C.accent }]}>{isMuted(chat?.muted_until) ? 'Включить' : ''}</Text>
            {!isMuted(chat?.muted_until) && <ChevronRight size={18} color={T.textMuted} />}
          </TouchableOpacity>
        </View>
        <View style={styles.card}>
          <TouchableOpacity style={styles.row} onPress={() => setWallpaperOpen(true)} activeOpacity={0.6}>
            <View style={[styles.rowIcon, { overflow: 'hidden' }]}>
              <WallpaperView wallpaper={wallpaper} radius={10} />
              <WallpaperIcon size={18} color={T.textPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowText}>Фон чата</Text>
              <Text style={styles.rowHint}>{customWallpaper ? 'Свой фон для этого чата' : 'Как у всех чатов'}</Text>
            </View>
            <ChevronRight size={18} color={T.textMuted} />
          </TouchableOpacity>
        </View>

        {/* ===== ТЕМЫ ===== */}
        {isGroup && rights.can_change_info && (
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={[styles.rowIcon, { backgroundColor: C.accentSoft }]}>
                <Layers size={20} color={C.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowText}>Темы</Text>
                <Text style={styles.rowHint}>Разделить переписку на отдельные ветки</Text>
              </View>
              <Switch value={!!chat.is_supergroup} onValueChange={toggleTopics} trackColor={{ false: T.surfaceActive, true: C.accent }} thumbColor={T.onAccent} />
            </View>
          </View>
        )}

        {/* ===== УЧАСТНИКИ ===== */}
        {isGroup && (
          <>
            <Text style={styles.sectionLabel}>
              {members.length} {plural(members.length, ['УЧАСТНИК', 'УЧАСТНИКА', 'УЧАСТНИКОВ'])}
            </Text>
            <View style={styles.card}>
              {rights.can_add_users && (
                <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('AddMembers', { chatId })} activeOpacity={0.6}>
                  <View style={[styles.rowIcon, { backgroundColor: C.accentSoft }]}>
                    <UserPlus size={20} color={C.accent} />
                  </View>
                  <Text style={[styles.rowText, { color: C.accent, fontWeight: '600' }]}>Добавить участников</Text>
                </TouchableOpacity>
              )}
              {members.map((m, i) => {
                const pres = online[m.id];
                return (
                  <TouchableOpacity
                    key={m.id}
                    style={[styles.memberRow, (i > 0 || rights.can_add_users) && styles.rowDivider]}
                    onPress={() => setMemberMenu(m)}
                    activeOpacity={0.6}
                  >
                    <View>
                      <Avatar name={m.display_name || m.username} url={m.avatar_url} size={44} />
                      {pres?.online && <View style={styles.onlineDot} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.memberName} numberOfLines={1}>
                        {m.display_name || m.username}
                        {m.id === meId ? ' (вы)' : ''}
                      </Text>
                      <Text style={[styles.memberSub, pres?.online && { color: C.accent }]} numberOfLines={1}>
                        {pres?.online ? 'в сети' : lastSeenLabel(pres?.last_seen_at)}
                      </Text>
                    </View>
                    {m.role === 'creator' ? (
                      <View style={[styles.badge, { backgroundColor: T.warningSoft }]}>
                        <Crown size={11} color={T.warning} />
                        <Text style={[styles.badgeText, { color: T.warning }]}>владелец</Text>
                      </View>
                    ) : m.role === 'admin' ? (
                      <View style={[styles.badge, { backgroundColor: T.violetSoft }]}>
                        <Shield size={11} color={T.violet} />
                        <Text style={[styles.badgeText, { color: T.violet }]}>админ</Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {/* ===== ВЫХОД / УДАЛЕНИЕ ===== */}
        <View style={styles.card}>
          {isGroup && (
            <TouchableOpacity style={styles.row} onPress={leave} activeOpacity={0.6}>
              <View style={[styles.rowIcon, { backgroundColor: T.dangerSoft }]}>
                <LogOut size={20} color={C.danger} />
              </View>
              <Text style={[styles.rowText, { color: C.danger }]}>Покинуть группу</Text>
            </TouchableOpacity>
          )}
          {(!isGroup || rights.is_creator) && (
            <TouchableOpacity style={[styles.row, isGroup && styles.rowDivider]} onPress={deleteChat} activeOpacity={0.6}>
              <View style={[styles.rowIcon, { backgroundColor: T.dangerSoft }]}>
                <Trash2 size={20} color={C.danger} />
              </View>
              <Text style={[styles.rowText, { color: C.danger }]}>{isGroup ? 'Удалить группу' : 'Удалить чат'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* ===== Фон чата ===== */}
      <Modal visible={wallpaperOpen} transparent animationType="slide" onRequestClose={() => setWallpaperOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setWallpaperOpen(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Фон этого чата</Text>
          <Text style={styles.sheetHint}>Виден только вам. Общий фон для всех чатов — в настройках внешнего вида.</Text>
          <ScrollView style={{ maxHeight: 420 }}>
            <WallpaperPicker value={wallpaper} onChange={(wp) => setChatWallpaper(chatId, wp)} />
          </ScrollView>
          {customWallpaper && (
            <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: T.inputBg }]} onPress={() => setChatWallpaper(chatId, null)}>
              <Text style={[styles.primaryBtnText, { color: T.textPrimary }]}>Как у всех чатов</Text>
            </TouchableOpacity>
          )}
          <SafeBottom />
        </View>
      </Modal>

      {/* ===== Меню участника ===== */}
      <ActionSheet
        visible={muteOpen}
        title="Уведомления этого чата"
        actions={MUTE_OPTIONS.map((o) => ({ key: o.key, label: o.label, icon: <BellOff size={20} color={C.text} />, onPress: () => changeMute(o.ms) }))}
        onClose={() => setMuteOpen(false)}
      />
      <ActionSheet
        visible={!!memberMenu}
        title={memberMenu ? memberMenu.display_name || memberMenu.username : ''}
        actions={memberMenu ? memberActions(memberMenu) : []}
        onClose={() => setMemberMenu(null)}
      />

      {/* ===== Переименование ===== */}
      <Modal visible={renameOpen} transparent animationType="fade" onRequestClose={() => setRenameOpen(false)}>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={styles.dialogBackdrop}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>Название группы</Text>
            <TextInput style={styles.dialogInput} value={newName} onChangeText={setNewName} autoFocus maxLength={255} />
            <View style={styles.dialogActions}>
              <TouchableOpacity onPress={() => setRenameOpen(false)} style={styles.dialogBtn}>
                <Text style={styles.dialogBtnText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={rename} style={[styles.dialogBtn, styles.dialogBtnPrimary]} disabled={!newName.trim()}>
                <Text style={[styles.dialogBtnText, { color: T.onAccent }]}>Сохранить</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ===== Права администратора ===== */}
      <Modal visible={!!adminEditor} transparent animationType="slide" onRequestClose={() => setAdminEditor(null)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setAdminEditor(null)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          {adminEditor && (
            <>
              <View style={styles.sheetUser}>
                <Avatar name={adminEditor.user.display_name || adminEditor.user.username} url={adminEditor.user.avatar_url} size={44} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.memberName} numberOfLines={1}>{adminEditor.user.display_name || adminEditor.user.username}</Text>
                  <Text style={styles.memberSub}>{adminEditor.existing ? 'Администратор' : 'Станет администратором'}</Text>
                </View>
              </View>
              <Text style={styles.sectionLabel}>ЧТО МОЖЕТ АДМИНИСТРАТОР</Text>
              {PERMS.map((p) => {
                const on = adminEditor.perms.includes(p.key);
                const locked = p.key === 'add_admins' && !rights.is_creator;
                return (
                  <TouchableOpacity
                    key={p.key}
                    style={[styles.permRow, locked && { opacity: 0.4 }]}
                    disabled={locked}
                    onPress={() =>
                      setAdminEditor((ed) => ed && { ...ed, perms: on ? ed.perms.filter((x) => x !== p.key) : [...ed.perms, p.key] })
                    }
                  >
                    <Text style={styles.permLabel}>{p.label}</Text>
                    <View style={[styles.checkbox, on && styles.checkboxOn]}>{on && <Check size={14} color={T.onAccent} strokeWidth={3} />}</View>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity style={styles.primaryBtn} onPress={saveAdmin}>
                <Text style={styles.primaryBtnText}>{adminEditor.existing ? 'Сохранить права' : 'Назначить'}</Text>
              </TouchableOpacity>
            </>
          )}
          <SafeBottom />
        </View>
      </Modal>

      {/* ===== Выключение тем ===== */}
      <Modal visible={!!topicsDialog} transparent animationType="slide" onRequestClose={() => setTopicsDialog(null)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setTopicsDialog(null)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Выключить темы?</Text>
          <Text style={styles.sheetHint}>
            Сообщения тем не удаляются — они сохранятся и вернутся, если включить темы снова. Можно перенести одну тему в общий чат.
          </Text>
          {topicsDialog && (
            <>
              <ScrollView style={{ maxHeight: 220 }}>
                {[{ id: null, title: 'Ничего не переносить' }, ...topicsDialog.topics].map((t: any) => (
                  <TouchableOpacity
                    key={String(t.id)}
                    style={[styles.topicRow, topicsDialog.keep === t.id && styles.topicRowActive]}
                    onPress={() => setTopicsDialog((d) => d && { ...d, keep: t.id })}
                  >
                    <Hash size={16} color={topicsDialog.keep === t.id ? C.accent : C.textMuted} />
                    <Text style={styles.rowText}>{t.title}</Text>
                    {topicsDialog.keep === t.id && <Check size={18} color={C.accent} />}
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: C.danger }]} onPress={disableTopics}>
                <Text style={styles.primaryBtnText}>Выключить темы</Text>
              </TouchableOpacity>
            </>
          )}
          <SafeBottom />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = themed(() => ({
  container: { flex: 1, backgroundColor: T.inputBg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { color: C.textMuted, fontSize: 15 },
  header: { flexDirection: 'row', alignItems: 'center', height: 56, paddingHorizontal: 4, backgroundColor: T.card },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: C.text, textAlign: 'center' },
  hero: { alignItems: 'center', paddingVertical: 22, paddingHorizontal: 20, backgroundColor: T.card, marginBottom: 12 },
  cameraBtn: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.accent,
    borderWidth: 3,
    borderColor: T.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroName: { fontSize: 22, fontWeight: '800', color: C.text, marginTop: 12, textAlign: 'center' },
  heroSub: { fontSize: 14, color: C.textMuted, marginTop: 4, textAlign: 'center' },
  heroAction: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, paddingHorizontal: 16, height: 40, borderRadius: 12, backgroundColor: C.accentSoft },
  heroActionText: { color: C.accent, fontWeight: '700', fontSize: 15 },
  card: { backgroundColor: T.card, marginHorizontal: 12, marginBottom: 12, borderRadius: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, minHeight: 54 },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  rowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, fontSize: 16, color: C.text },
  rowHint: { fontSize: 12, color: C.textMuted, marginTop: 1 },
  rowCount: { fontSize: 15, color: C.textMuted },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: C.textMuted, marginHorizontal: 26, marginBottom: 6, marginTop: 4 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 8 },
  memberName: { fontSize: 16, fontWeight: '600', color: C.text },
  memberSub: { fontSize: 13, color: C.textMuted, marginTop: 1 },
  onlineDot: { position: 'absolute', right: 0, bottom: 0, width: 13, height: 13, borderRadius: 7, backgroundColor: T.success, borderWidth: 2, borderColor: T.card },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, height: 22, borderRadius: 11 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  dialogBackdrop: { flex: 1, backgroundColor: C.overlay, justifyContent: 'center', padding: 24 },
  dialog: { backgroundColor: T.card, borderRadius: 18, padding: 20 },
  dialogTitle: { fontSize: 18, fontWeight: '700', color: C.text, marginBottom: 12 },
  dialogInput: { fontSize: 17, color: C.text, borderBottomWidth: 2, borderBottomColor: C.accent, paddingVertical: 8 },
  dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 20 },
  dialogBtn: { paddingHorizontal: 16, height: 42, borderRadius: 12, justifyContent: 'center' },
  dialogBtnPrimary: { backgroundColor: C.accent },
  dialogBtnText: { fontSize: 15, fontWeight: '700', color: C.text },
  sheetBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: C.overlay },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: T.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: 30,
  },
  sheetHandle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: T.surfaceActive, marginBottom: 12 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: C.text },
  sheetHint: { fontSize: 14, color: C.textMuted, marginTop: 6, marginBottom: 10, lineHeight: 20 },
  sheetUser: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  permRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  permLabel: { flex: 1, fontSize: 15, color: C.text },
  checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: T.border, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: C.accent, borderColor: C.accent },
  topicRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, height: 48, borderRadius: 12 },
  topicRowActive: { backgroundColor: C.accentSoft },
  primaryBtn: { marginTop: 16, height: 50, borderRadius: 14, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { color: T.onAccent, fontSize: 16, fontWeight: '700' },
}));
