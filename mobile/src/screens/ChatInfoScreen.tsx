import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform,
  ActivityIndicator, Alert, TextInput, Modal, Switch, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, RouteProp } from '@react-navigation/native';
import {
  ChevronLeft, Camera, Pencil, Check, X, Users, Shield, FileText,
  Image as ImageIcon, Trash2, UserPlus, Crown, ChevronRight, Hash,
} from 'lucide-react-native';
import { getToken, SERVER_URL } from '../utils';
import { pick } from '@react-native-documents/picker';

type ChatInfoRouteProp = RouteProp<{ params: { chatId: string } }, 'params'>;

const PERMS = [
  { key: 'change_info', label: 'Изменение профиля группы' },
  { key: 'delete_messages', label: 'Удаление сообщений' },
  { key: 'ban_users', label: 'Блокировка пользователей' },
  { key: 'add_users', label: 'Добавление участников' },
  { key: 'pin_messages', label: 'Закрепление сообщений' },
  { key: 'add_admins', label: 'Добавление администраторов' },
];

const AVATAR_COLORS = ['#1F7A52','#3B82F6','#8B5CF6','#EC4899','#F59E0B','#0EA5E9','#14B8A6','#EF4444'];
const hashColor = (s: string) => {
  const sum = (s || '?').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
};
const initials = (name: string) => (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export default function ChatInfoScreen({ navigation }: any) {
  const route = useRoute<ChatInfoRouteProp>();
  const chatId = route.params.chatId;

  const [chat, setChat] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [admins, setAdmins] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [topics, setTopics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [meId, setMeId] = useState<number | null>(null);

  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);

  const [showAdminModal, setShowAdminModal] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [adminPermissions, setAdminPermissions] = useState<string[]>([]);

  const [showSupergroupDialog, setShowSupergroupDialog] = useState(false);
  const [selectedTopicId, setSelectedTopicId] = useState<number | null>(null);
  const [mergeMessages, setMergeMessages] = useState(true);

  const loadChatInfo = useCallback(async () => {
    const token = await getToken();
    if (!token) { setLoading(false); return; }
    const h = { headers: { Authorization: `Bearer ${token}` } };
    try {
      const meRes = await fetch(`${SERVER_URL}/api/auth/me`, h);
      if (meRes.ok) setMeId((await meRes.json()).id);

      // Чат ищем через СПИСОК (GET /api/chats/:id на сервере нет)
      const listRes = await fetch(`${SERVER_URL}/api/chats`, h);
      let found: any = null;
      if (listRes.ok) {
        const chats = await listRes.json();
        found = chats.find((x: any) => String(x.id) === String(chatId)) || null;
      }
      if (found) {
        setChat(found);
        setNewName(found.name || '');
        if (Array.isArray(found.members) && found.members.length) setMembers(found.members);
      } else {
        const chatRes = await fetch(`${SERVER_URL}/api/chats/${chatId}`, h);
        if (chatRes.ok) setChat(await chatRes.json());
      }

      try {
        const mRes = await fetch(`${SERVER_URL}/api/chats/${chatId}/members`, h);
        if (mRes.ok) {
          const d = await mRes.json();
          setMembers(Array.isArray(d) ? d : d.members || []);
        }
      } catch (e) {}
      try {
        const aRes = await fetch(`${SERVER_URL}/api/chats/${chatId}/admins`, h);
        if (aRes.ok) {
          const d = await aRes.json();
          setAdmins(Array.isArray(d) ? d : d.admins || []);
        }
      } catch (e) {}
      try {
        const sRes = await fetch(`${SERVER_URL}/api/chats/${chatId}/stats`, h);
        if (sRes.ok) setStats(await sRes.json());
      } catch (e) {}
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось загрузить информацию');
    }
    setLoading(false);
  }, [chatId]);

  useEffect(() => { loadChatInfo(); }, [loadChatInfo]);

  const isCreator = chat?.created_by === meId;
  const myAdmin = admins.find((a: any) => a.id === meId);
  const canManageAdmins = isCreator || myAdmin?.permissions?.includes('add_admins');

  const roleOf = (id: number) =>
    id === chat?.created_by ? 'creator' : admins.some((a: any) => a.id === id) ? 'admin' : 'member';

  // ===== Название =====
  const handleRename = async () => {
    if (!newName.trim()) return;
    const tok = await getToken();
    const res = await fetch(`${SERVER_URL}/api/chats/${chatId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
      body: JSON.stringify({ name: newName.trim() }),
    });
    if (res.ok) { Alert.alert('Готово', 'Название изменено'); setEditingName(false); loadChatInfo(); }
    else { const d = await res.json(); Alert.alert('Ошибка', d.error || 'Не удалось изменить название'); }
  };

  // ===== Аватар группы =====
  const handleChangeAvatar = async () => {
    try {
      const result = await pick({ type: ['image/*'], allowMultiSelection: false, copyTo: 'cachesDirectory' });
      const file = result[0];
      if (!file?.uri) return;
      setUploadingAvatar(true);
      const tok = await getToken();
      const fd = new FormData();
      fd.append('avatar', { uri: file.uri, name: file.name || 'avatar.jpg', type: file.type || 'image/jpeg' } as any);
      const res = await fetch(`${SERVER_URL}/api/chats/${chatId}/avatar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok}` },
        body: fd,
      });
      if (res.ok) { setAvatarFailed(false); loadChatInfo(); }
      else { const d = await res.json(); Alert.alert('Ошибка', d.error || 'Не удалось загрузить аватар'); }
    } catch (e: any) {
      if (!isCancelSafe(e)) Alert.alert('Ошибка', 'Не удалось выбрать файл');
    } finally { setUploadingAvatar(false); }
  };
  const isCancelSafe = (e: any) => e?.code === 'DOCUMENT_PICKER_CANCELED' || e?.name === 'AbortError';

  // ===== Супергруппа =====
  const handleToggleSupergroup = async () => {
    const newValue = !chat.is_supergroup;
    const tok = await getToken();
    if (newValue) {
      const res = await fetch(`${SERVER_URL}/api/chats/${chatId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ is_supergroup: true }),
      });
      if (res.ok) {
        navigation.reset({ index: 0, routes: [{ name: 'TopicList', params: { chatId: chatId.toString(), chatName: chat?.name || 'Чат' } }] });
      } else { const d = await res.json(); Alert.alert('Ошибка', d.error || 'Не удалось включить супергруппу'); }
    } else {
      const topicsRes = await fetch(`${SERVER_URL}/api/chats/${chatId}/topics`, { headers: { Authorization: `Bearer ${tok}` } });
      if (topicsRes.ok) setTopics(await topicsRes.json());
      setSelectedTopicId(null);
      setMergeMessages(true);
      setShowSupergroupDialog(true);
    }
  };

  const confirmDisableSupergroup = async () => {
    setShowSupergroupDialog(false);
    const tok = await getToken();
    const res = await fetch(`${SERVER_URL}/api/chats/${chatId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
      body: JSON.stringify({ is_supergroup: false, keep_topic_id: selectedTopicId, merge: mergeMessages }),
    });
    if (res.ok) {
      navigation.reset({ index: 1, routes: [{ name: 'ChatList' }, { name: 'Chat', params: { chatId: chatId.toString(), chatName: chat?.name || 'Чат' } }] });
    } else { const d = await res.json(); Alert.alert('Ошибка', d.error || 'Не удалось отключить супергруппу'); }
  };

  // ===== Участники =====
  const handleRemoveMember = (userId: number) => {
    Alert.alert('Удалить участника?', 'Он потеряет доступ к чату', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить', style: 'destructive',
        onPress: async () => {
          const tok = await getToken();
          const res = await fetch(`${SERVER_URL}/api/chats/${chatId}/members/${userId}`, {
            method: 'DELETE', headers: { Authorization: `Bearer ${tok}` },
          });
          if (res.ok) loadChatInfo();
          else Alert.alert('Ошибка', 'Не удалось удалить участника');
        },
      },
    ]);
  };

  // ===== Админы =====
  const openAdminModal = () => {
    const adminIds = admins.map((a: any) => a.id);
    setAvailableUsers(members.filter((m: any) => m.id !== chat?.created_by && !adminIds.includes(m.id)));
    setSelectedUserId(null);
    setAdminPermissions(['change_info', 'delete_messages', 'ban_users', 'add_users', 'pin_messages']);
    setShowAdminModal(true);
  };

  const saveAdmin = async () => {
    if (!selectedUserId) { Alert.alert('Ошибка', 'Выберите участника'); return; }
    const tok = await getToken();
    const existing = admins.find((a: any) => a.id === selectedUserId);
    const res = await fetch(
      `${SERVER_URL}/api/chats/${chatId}/admins${existing ? `/${selectedUserId}` : ''}`,
      {
        method: existing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify(existing ? { permissions: adminPermissions } : { user_id: selectedUserId, permissions: adminPermissions }),
      },
    );
    if (res.ok) { setShowAdminModal(false); loadChatInfo(); }
    else Alert.alert('Ошибка', 'Не удалось сохранить');
  };

  const removeAdmin = (adminId: number) => {
    Alert.alert('Снять администратора?', 'Права будут отозваны', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Снять', style: 'destructive',
        onPress: async () => {
          const tok = await getToken();
          const res = await fetch(`${SERVER_URL}/api/chats/${chatId}/admins/${adminId}`, {
            method: 'DELETE', headers: { Authorization: `Bearer ${tok}` },
          });
          if (res.ok) loadChatInfo();
        },
      },
    ]);
  };

  const handleDeleteChat = () => {
    Alert.alert('Удалить чат?', 'Все сообщения будут удалены безвозвратно', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить', style: 'destructive',
        onPress: async () => {
          const tok = await getToken();
          const res = await fetch(`${SERVER_URL}/api/chats/${chatId}`, {
            method: 'DELETE', headers: { Authorization: `Bearer ${tok}` },
          });
          if (res.ok) navigation.popToTop();
          else Alert.alert('Ошибка', 'Не удалось удалить чат');
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingWrap}><ActivityIndicator size="large" color="#1F7A52" /></View>
      </SafeAreaView>
    );
  }

  if (!chat) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBackBtn}>
            <ChevronLeft size={24} color="#141414" strokeWidth={2} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>ПРОФИЛЬ ГРУППЫ</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingWrap}>
          <Text style={{ fontSize: 15, color: '#6F6F73', fontWeight: '600' }}>Чат не найден</Text>
        </View>
      </SafeAreaView>
    );
  }

  const name = chat?.name || 'Чат';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ===== HEADER ===== */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBackBtn}>
          <ChevronLeft size={24} color="#141414" strokeWidth={2} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>ПРОФИЛЬ ГРУППЫ</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* ===== HERO ===== */}
        <View style={styles.heroCard}>
          <View style={styles.avatarWrap}>
            {chat?.avatar_url && !avatarFailed ? (
              <Image source={{ uri: SERVER_URL + chat.avatar_url }} style={styles.avatarImage} onError={() => setAvatarFailed(true)} />
            ) : (
              <View style={[styles.avatarImage, { backgroundColor: hashColor(name) }]}>
                <Text style={styles.avatarInitials}>{initials(name)}</Text>
              </View>
            )}
            {isCreator && (
              <TouchableOpacity onPress={handleChangeAvatar} disabled={uploadingAvatar} style={styles.avatarEditBtn}>
                {uploadingAvatar ? <ActivityIndicator size={12} color="#FFFFFF" /> : <Camera size={16} color="#FFFFFF" strokeWidth={2.5} />}
              </TouchableOpacity>
            )}
          </View>

          {editingName ? (
            <View style={styles.editNameRow}>
              <TextInput style={styles.editNameInput} value={newName} onChangeText={setNewName} autoFocus />
              <TouchableOpacity onPress={handleRename} style={styles.editNameBtn}>
                <Check size={18} color="#FFFFFF" strokeWidth={2.5} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setEditingName(false)} style={styles.editNameCancel}>
                <X size={18} color="#6F6F73" strokeWidth={2} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.nameRow}>
              <Text style={styles.heroName} numberOfLines={1}>{name}</Text>
              {isCreator && (
                <TouchableOpacity onPress={() => { setNewName(name); setEditingName(true); }} style={styles.nameEditBtn}>
                  <Pencil size={16} color="#1F7A52" strokeWidth={2} />
                </TouchableOpacity>
              )}
            </View>
          )}

          <Text style={styles.heroSubtitle}>
            {chat?.type === 'group' ? (chat?.is_supergroup ? 'Супергруппа' : 'Группа') : 'Личный чат'} · {members.length} участников
          </Text>

          {chat?.type === 'group' && isCreator && (
            <View style={styles.supergroupRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.supergroupTitle}>Супергруппа</Text>
                <Text style={styles.supergroupHint}>Топики, администраторы и права</Text>
              </View>
              <Switch
                value={!!chat?.is_supergroup}
                onValueChange={handleToggleSupergroup}
                trackColor={{ false: '#ECECE8', true: '#1F7A52' }}
                thumbColor="#FFFFFF"
              />
            </View>
          )}
        </View>

        {/* ===== МЕДИА ===== */}
        {stats && (
          <View style={styles.card}>
            <TouchableOpacity style={styles.mediaRow} onPress={() => navigation.navigate('MediaList', { chatId: chatId.toString(), type: 'files' })} activeOpacity={0.7}>
              <View style={[styles.mediaIcon, { backgroundColor: '#ECFDF5' }]}><FileText size={18} color="#1F7A52" strokeWidth={2} /></View>
              <Text style={styles.mediaLabel}>Файлы</Text>
              <Text style={styles.mediaCount}>{stats.total_files || 0}</Text>
              <ChevronRight size={16} color="#BDBDBD" strokeWidth={2} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.mediaRow} onPress={() => navigation.navigate('MediaList', { chatId: chatId.toString(), type: 'images' })} activeOpacity={0.7}>
              <View style={[styles.mediaIcon, { backgroundColor: '#EDE9FE' }]}><ImageIcon size={18} color="#8B5CF6" strokeWidth={2} /></View>
              <Text style={styles.mediaLabel}>Медиа</Text>
              <Text style={styles.mediaCount}>{stats.total_images || 0}</Text>
              <ChevronRight size={16} color="#BDBDBD" strokeWidth={2} />
            </TouchableOpacity>
          </View>
        )}

        {/* ===== УЧАСТНИКИ ===== */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIconWrap}><Users size={18} color="#1F7A52" strokeWidth={2} /></View>
            <Text style={styles.cardTitle}>Участники</Text>
            <View style={styles.countBadge}><Text style={styles.countBadgeText}>{members.length}</Text></View>
          </View>

          {isCreator && (
            <TouchableOpacity style={styles.addBtn} onPress={() => navigation.navigate('AddMembers', { chatId })} activeOpacity={0.7}>
              <UserPlus size={18} color="#1F7A52" strokeWidth={2} />
              <Text style={styles.addBtnText}>Добавить участников</Text>
            </TouchableOpacity>
          )}

          {members.map((m: any) => {
            const role = roleOf(m.id);
            return (
              <View key={m.id} style={styles.memberRow}>
                <TouchableOpacity
                  style={styles.memberMain}
                  activeOpacity={0.7}
                  onPress={() => navigation.navigate('UserProfile', { userId: m.id })}
                >
                  <View style={[styles.memberAvatar, { backgroundColor: hashColor(m.display_name || m.username) }]}>
                    <Text style={styles.memberAvatarText}>{initials(m.display_name || m.username)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.memberNameRow}>
                      <Text style={styles.memberName} numberOfLines={1}>{m.display_name || m.username}</Text>
                      {role === 'creator' && (
                        <View style={[styles.roleBadge, { backgroundColor: '#ECFDF5' }]}>
                          <Crown size={10} color="#1F7A52" strokeWidth={2.5} />
                          <Text style={[styles.roleBadgeText, { color: '#1F7A52' }]}>Владелец</Text>
                        </View>
                      )}
                      {role === 'admin' && (
                        <View style={[styles.roleBadge, { backgroundColor: '#EDE9FE' }]}>
                          <Shield size={10} color="#7C3AED" strokeWidth={2.5} />
                          <Text style={[styles.roleBadgeText, { color: '#7C3AED' }]}>Админ</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.memberUsername}>@{m.username}</Text>
                  </View>
                  <ChevronRight size={16} color="#BDBDBD" strokeWidth={2} />
                </TouchableOpacity>
                {isCreator && m.id !== meId && (
                  <TouchableOpacity onPress={() => handleRemoveMember(m.id)} style={styles.memberDeleteBtn}>
                    <Trash2 size={16} color="#DC2626" strokeWidth={2} />
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>

        {/* ===== АДМИНИСТРАТОРЫ ===== */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIconWrap}><Shield size={18} color="#1F7A52" strokeWidth={2} /></View>
            <Text style={styles.cardTitle}>Администраторы</Text>
            <View style={styles.countBadge}><Text style={styles.countBadgeText}>{admins.length}</Text></View>
          </View>

          {admins.length === 0 && <Text style={styles.emptyText}>Администраторы не назначены</Text>}

          {admins.map((a: any) => (
            <View key={a.id} style={styles.adminRow}>
              <View style={[styles.memberAvatar, { backgroundColor: hashColor(a.display_name || a.username) }]}>
                <Text style={styles.memberAvatarText}>{initials(a.display_name || a.username)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.memberName} numberOfLines={1}>{a.display_name || a.username}</Text>
                <Text style={styles.adminPerms}>{a.permissions?.length || 0} прав</Text>
              </View>
              {canManageAdmins && (
                <TouchableOpacity onPress={() => removeAdmin(a.id)} style={styles.memberDeleteBtn}>
                  <X size={16} color="#DC2626" strokeWidth={2} />
                </TouchableOpacity>
              )}
            </View>
          ))}

          {canManageAdmins && (
            <TouchableOpacity style={styles.addBtn} onPress={openAdminModal} activeOpacity={0.7}>
              <Shield size={18} color="#1F7A52" strokeWidth={2} />
              <Text style={styles.addBtnText}>Назначить администратора</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ===== ОПАСНАЯ ЗОНА ===== */}
        {isCreator && (
          <View style={styles.card}>
            <TouchableOpacity style={styles.dangerRow} onPress={handleDeleteChat} activeOpacity={0.7}>
              <View style={[styles.cardIconWrap, { backgroundColor: '#FEE2E2' }]}><Trash2 size={18} color="#DC2626" strokeWidth={2} /></View>
              <Text style={styles.dangerText}>Удалить чат</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ===== МОДАЛКА АДМИНА ===== */}
      <Modal visible={showAdminModal} transparent animationType="slide">
        <TouchableOpacity activeOpacity={1} onPress={() => setShowAdminModal(false)} style={styles.sheetOverlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>АДМИНИСТРАТОР</Text>

            <Text style={styles.sheetLabel}>Участник</Text>
            <ScrollView style={{ maxHeight: 160 }}>
              {availableUsers.map((u: any) => (
                <TouchableOpacity
                  key={u.id}
                  style={[styles.sheetUserRow, selectedUserId === u.id && styles.sheetUserRowActive]}
                  onPress={() => setSelectedUserId(u.id)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.memberAvatar, { backgroundColor: hashColor(u.display_name || u.username) }]}>
                    <Text style={styles.memberAvatarText}>{initials(u.display_name || u.username)}</Text>
                  </View>
                  <Text style={styles.sheetUserName}>{u.display_name || u.username}</Text>
                  {selectedUserId === u.id && <Check size={18} color="#1F7A52" strokeWidth={2.5} />}
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.sheetLabel}>Права</Text>
            {PERMS.map((p) => {
              const on = adminPermissions.includes(p.key);
              return (
                <TouchableOpacity
                  key={p.key}
                  style={styles.permRow}
                  onPress={() => setAdminPermissions(on ? adminPermissions.filter((x) => x !== p.key) : [...adminPermissions, p.key])}
                  activeOpacity={0.7}
                >
                  <Text style={styles.permLabel}>{p.label}</Text>
                  <View style={[styles.permCheck, on && styles.permCheckOn]}>
                    {on && <Check size={12} color="#FFFFFF" strokeWidth={3} />}
                  </View>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity style={styles.saveBtn} onPress={saveAdmin} activeOpacity={0.85}>
              <Text style={styles.saveBtnText}>Сохранить</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ===== ДИАЛОГ ОТКЛЮЧЕНИЯ СУПЕРГРУППЫ ===== */}
      <Modal visible={showSupergroupDialog} transparent animationType="fade">
        <TouchableOpacity activeOpacity={1} onPress={() => setShowSupergroupDialog(false)} style={styles.sheetOverlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>ВЫКЛЮЧИТЬ СУПЕРГРУППУ?</Text>
            <Text style={styles.sheetHint}>
              Все топики, кроме выбранного, будут удалены безвозвратно.
            </Text>

            <Text style={styles.sheetLabel}>Оставить топик</Text>
            <ScrollView style={{ maxHeight: 200 }}>
              <TouchableOpacity
                style={[styles.topicPickRow, selectedTopicId === null && styles.topicPickRowActive]}
                onPress={() => setSelectedTopicId(null)}
              >
                <Hash size={16} color={selectedTopicId === null ? '#1F7A52' : '#6F6F73'} strokeWidth={2} />
                <Text style={styles.topicPickText}>Общий чат (без топиков)</Text>
              </TouchableOpacity>
              {topics.map((t) => (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.topicPickRow, selectedTopicId === t.id && styles.topicPickRowActive]}
                  onPress={() => setSelectedTopicId(t.id)}
                >
                  <Hash size={16} color={selectedTopicId === t.id ? '#1F7A52' : '#6F6F73'} strokeWidth={2} />
                  <Text style={styles.topicPickText}>{t.title}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.mergeRow}>
              <Text style={styles.permLabel}>Объединить сообщения</Text>
              <Switch value={mergeMessages} onValueChange={setMergeMessages} trackColor={{ false: '#ECECE8', true: '#1F7A52' }} thumbColor="#FFFFFF" />
            </View>

            <View style={styles.dialogButtons}>
              <TouchableOpacity style={styles.dialogCancel} onPress={() => setShowSupergroupDialog(false)}>
                <Text style={styles.dialogCancelText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.dialogDanger} onPress={confirmDisableSupergroup}>
                <Text style={styles.dialogDangerText}>Отключить</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAF8' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#ECECE8',
  },
  headerBackBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  headerTitle: {
    fontFamily: Platform.OS === 'ios' ? 'Bebas Neue' : 'sans-serif-condensed',
    fontSize: 22, fontWeight: '900', color: '#141414', letterSpacing: 1,
  },

  scrollContent: { padding: 20, gap: 20 },

  heroCard: {
    backgroundColor: '#FFFFFF', borderRadius: 22, padding: 24, alignItems: 'center', gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 16, elevation: 3,
  },
  avatarWrap: { position: 'relative', marginBottom: 4 },
  avatarImage: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontSize: 30, fontWeight: '700', color: '#FFFFFF' },
  avatarEditBtn: {
    position: 'absolute', right: -2, bottom: -2, width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#1F7A52', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#FFFFFF',
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroName: { fontSize: 20, fontWeight: '700', color: '#141414' },
  nameEditBtn: { padding: 4 },
  editNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%' },
  editNameInput: {
    flex: 1, fontSize: 16, fontWeight: '600', color: '#141414',
    backgroundColor: '#FAFAF8', borderWidth: 1, borderColor: '#ECECE8', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8,
  },
  editNameBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#1F7A52', alignItems: 'center', justifyContent: 'center' },
  editNameCancel: { padding: 6 },
  heroSubtitle: { fontSize: 13, color: '#6F6F73', fontWeight: '500' },
  supergroupRow: { flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%', marginTop: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#ECECE8' },
  supergroupTitle: { fontSize: 15, fontWeight: '600', color: '#141414' },
  supergroupHint: { fontSize: 12, color: '#6F6F73', marginTop: 2 },

  card: {
    backgroundColor: '#FFFFFF', borderRadius: 22, padding: 20, gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 16, elevation: 3,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardIconWrap: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 17, fontWeight: '700', color: '#141414', flex: 1 },
  countBadge: { backgroundColor: '#1F7A52', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  countBadgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },

  mediaRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  mediaIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  mediaLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: '#141414' },
  mediaCount: { fontSize: 14, fontWeight: '700', color: '#6F6F73' },

  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: 14, backgroundColor: '#ECFDF5',
    borderWidth: 1.5, borderColor: '#D1FAE5', borderStyle: 'dashed',
  },
  addBtnText: { fontSize: 14, fontWeight: '600', color: '#1F7A52' },

  memberRow: { flexDirection: 'row', alignItems: 'center' },
  memberMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  memberAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  memberAvatarText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  memberNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  memberName: { fontSize: 15, fontWeight: '700', color: '#141414' },
  memberUsername: { fontSize: 12, color: '#6F6F73', marginTop: 1 },
  roleBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  roleBadgeText: { fontSize: 10, fontWeight: '700' },
  memberDeleteBtn: { padding: 8 },

  adminRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  adminPerms: { fontSize: 12, color: '#7C3AED', fontWeight: '600', marginTop: 1 },

  dangerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dangerText: { fontSize: 15, fontWeight: '600', color: '#DC2626' },
  emptyText: { fontSize: 13, color: '#BDBDBD', fontWeight: '500' },

  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 32, gap: 12 },
  sheetHandle: { width: 40, height: 4, backgroundColor: '#ECECE8', borderRadius: 2, alignSelf: 'center' },
  sheetTitle: {
    fontFamily: Platform.OS === 'ios' ? 'Bebas Neue' : 'sans-serif-condensed',
    fontSize: 24, fontWeight: '900', color: '#141414', letterSpacing: 1,
  },
  sheetHint: { fontSize: 13, color: '#6F6F73', lineHeight: 18 },
  sheetLabel: { fontSize: 12, fontWeight: '600', color: '#6F6F73', textTransform: 'uppercase', letterSpacing: 0.5 },
  sheetUserRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 12 },
  sheetUserRowActive: { backgroundColor: '#ECFDF5' },
  sheetUserName: { flex: 1, fontSize: 15, fontWeight: '600', color: '#141414' },
  permRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F4F4F5' },
  permLabel: { fontSize: 14, fontWeight: '500', color: '#141414', flex: 1 },
  permCheck: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: '#BDBDBD', alignItems: 'center', justifyContent: 'center' },
  permCheckOn: { backgroundColor: '#1F7A52', borderColor: '#1F7A52' },
  saveBtn: { height: 52, borderRadius: 18, backgroundColor: '#1F7A52', alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },

  topicPickRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#FAFAF8', marginBottom: 6 },
  topicPickRowActive: { backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#1F7A52' },
  topicPickText: { fontSize: 14, fontWeight: '600', color: '#141414' },
  mergeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dialogButtons: { flexDirection: 'row', gap: 10 },
  dialogCancel: { flex: 1, paddingVertical: 14, borderRadius: 16, backgroundColor: '#F3F4F6', alignItems: 'center' },
  dialogCancelText: { fontSize: 15, fontWeight: '600', color: '#141414' },
  dialogDanger: { flex: 1, paddingVertical: 14, borderRadius: 16, backgroundColor: '#7F1D1D', alignItems: 'center' },
  dialogDangerText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
});