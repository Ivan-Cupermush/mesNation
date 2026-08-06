import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform,
  ActivityIndicator, Alert, TextInput, Modal, Image, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, RouteProp } from '@react-navigation/native';
import {
  ChevronLeft, Pencil, Trash2, RotateCcw, Check, X, Image as ImageIcon,
  Paperclip, Link as LinkIcon, BarChart3, Forward, ChevronRight,
} from 'lucide-react-native';
import { getToken, SERVER_URL } from '../utils';
import {
  TOPIC_ICONS, TOPIC_COLORS, TOPIC_OPACITIES, DEFAULT_TOPIC_STYLE, hexToRgba,
} from '../theme/topicIcons';

type TopicInfoRouteProp = RouteProp<{ params: { chatId: string; topicId: number } }, 'params'>;

const SCREEN_W = Dimensions.get('window').width;
const GRID_ITEM_SIZE = (SCREEN_W - 60) / 3;

export default function TopicInfoScreen({ navigation }: any) {
  const route = useRoute<TopicInfoRouteProp>();
  const chatId = route.params.chatId;
  const topicId = route.params.topicId;

  const [topic, setTopic] = useState<any>(null);
  const [chat, setChat] = useState<any>(null);
  const [meId, setMeId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>({ media: 0, files: 0, links: 0, polls: 0 });

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [icon, setIcon] = useState(DEFAULT_TOPIC_STYLE.icon);
  const [color, setColor] = useState(DEFAULT_TOPIC_STYLE.color);
  const [opacity, setOpacity] = useState(DEFAULT_TOPIC_STYLE.opacity);
  const [saving, setSaving] = useState(false);

  const [activeTab, setActiveTab] = useState<'media' | 'files' | 'links' | 'polls'>('media');
  const [tabItems, setTabItems] = useState<any[]>([]);
  const [loadingTab, setLoadingTab] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [availableChats, setAvailableChats] = useState<any[]>([]);

  const load = async () => {
    const tok = await getToken();
    if (!tok) { setLoading(false); return; }
    const h = { headers: { Authorization: `Bearer ${tok}` } };
    try {
      const [meRes, topicsRes, chatsRes, statsRes] = await Promise.all([
        fetch(`${SERVER_URL}/api/auth/me`, h),
        fetch(`${SERVER_URL}/api/chats/${chatId}/topics`, h),
        fetch(`${SERVER_URL}/api/chats`, h),
        fetch(`${SERVER_URL}/api/chats/${chatId}/topics/${topicId}/stats`, h),
      ]);
      if (meRes.ok) setMeId((await meRes.json()).id);
      if (topicsRes.ok) {
        const topics = await topicsRes.json();
        const found = topics.find((t: any) => t.id === topicId);
        if (found) {
          setTopic(found);
          setTitle(found.title || '');
          setIcon(found.icon || DEFAULT_TOPIC_STYLE.icon);
          setColor(found.icon_color || DEFAULT_TOPIC_STYLE.color);
          setOpacity(found.icon_opacity ?? DEFAULT_TOPIC_STYLE.opacity);
        }
      }
      if (chatsRes.ok) {
        const chats = await chatsRes.json();
        setChat(chats.find((c: any) => String(c.id) === String(chatId)) || null);
      }
      if (statsRes.ok) setStats(await statsRes.json());
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось загрузить топик');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [chatId, topicId]);

  useEffect(() => {
    if (topicId) loadTabItems(activeTab);
  }, [activeTab, topicId]);

  const isCreator = chat?.created_by === meId;

  const hasChanges =
    topic &&
    (title !== (topic.title || '') ||
      icon !== (topic.icon || DEFAULT_TOPIC_STYLE.icon) ||
      color !== (topic.icon_color || DEFAULT_TOPIC_STYLE.color) ||
      opacity !== (topic.icon_opacity ?? DEFAULT_TOPIC_STYLE.opacity));

  const resetDefaults = () => {
    setIcon(DEFAULT_TOPIC_STYLE.icon);
    setColor(DEFAULT_TOPIC_STYLE.color);
    setOpacity(DEFAULT_TOPIC_STYLE.opacity);
  };

  const handleSave = async () => {
    if (!title.trim()) { Alert.alert('Ошибка', 'Название не может быть пустым'); return; }
    setSaving(true);
    try {
      const tok = await getToken();
      const res = await fetch(`${SERVER_URL}/api/topics/${topicId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ title: title.trim(), icon, icon_color: color, icon_opacity: opacity }),
      });
      if (res.ok) {
        Alert.alert('Готово', 'Топик обновлён');
        setEditing(false);
        load();
      } else {
        const d = await res.json();
        Alert.alert('Ошибка', d.error || 'Не удалось сохранить');
      }
    } catch (e) {
      Alert.alert('Ошибка', 'Сервер недоступен');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert('Удалить топик?', 'Сообщения в топике будут перенесены в общий чат.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить', style: 'destructive',
        onPress: async () => {
          const tok = await getToken();
          const res = await fetch(`${SERVER_URL}/api/topics/${topicId}`, {
            method: 'DELETE', headers: { Authorization: `Bearer ${tok}` },
          });
          if (res.ok) { Alert.alert('Успешно', 'Топик удалён'); navigation.goBack(); }
          else { const d = await res.json(); Alert.alert('Ошибка', d.error || 'Не удалось удалить'); }
        },
      },
    ]);
  };

  const loadTabItems = async (type: 'media' | 'files' | 'links' | 'polls') => {
    setLoadingTab(true);
    try {
      const tok = await getToken();
      const res = await fetch(`${SERVER_URL}/api/chats/${chatId}/topics/${topicId}/media/${type}`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (res.ok) setTabItems(await res.json());
      else setTabItems([]);
    } catch (e) { setTabItems([]); }
    setLoadingTab(false);
  };

  const switchTab = (type: 'media' | 'files' | 'links' | 'polls') => {
    setActiveTab(type);
    setSelectedIds([]);
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const startForward = async () => {
    const tok = await getToken();
    if (!tok) return;
    try {
      const res = await fetch(`${SERVER_URL}/api/chats`, { headers: { Authorization: `Bearer ${tok}` } });
      if (res.ok) {
        const chats = await res.json();
        setAvailableChats(chats.filter((c: any) => String(c.id) !== String(chatId)));
        setShowForwardModal(true);
      }
    } catch (e) {}
  };

  const forwardTo = async (toChatId: number) => {
    const tok = await getToken();
    if (!tok) return;
    try {
      for (const msgId of selectedIds) {
        await fetch(`${SERVER_URL}/api/messages/reply-to-another-chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
          body: JSON.stringify({ message_id: msgId, target_chat_id: toChatId, text: '' }),
        });
      }
      Alert.alert('Готово', `Переслано: ${selectedIds.length}`);
    } catch (e) { Alert.alert('Ошибка', 'Не удалось переслать'); }
    setShowForwardModal(false);
    setSelectedIds([]);
  };

  const goToMessage = (item: any) => {
    navigation.navigate('Chat', {
      chatId,
      chatName: chat?.name || 'Чат',
      topicId: item.topic_id || topicId,
      messageId: activeTab === 'polls' ? item.message_id : item.id,
    });
  };

  if (loading || !topic) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingWrap}><ActivityIndicator size="large" color="#1F7A52" /></View>
      </SafeAreaView>
    );
  }

  const PreviewIcon = TOPIC_ICONS[icon] || TOPIC_ICONS.hash;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ===== HEADER ===== */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBackBtn}>
          <ChevronLeft size={24} color="#141414" strokeWidth={2} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>ПРОФИЛЬ ТОПИКА</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* ===== HERO ===== */}
        <View style={styles.heroCard}>
          <View style={[styles.heroIconWrap, { backgroundColor: hexToRgba(color, 0.12) }]}>
            <PreviewIcon size={32} color={color} strokeWidth={2} style={{ opacity }} />
          </View>
          <Text style={styles.heroTitle} numberOfLines={1}>{topic.title}</Text>
          <Text style={styles.heroSubtitle}>Топик · {chat?.name || 'супергруппа'}</Text>

          {isCreator && !editing && (
            <TouchableOpacity style={styles.editBtn} onPress={() => setEditing(true)} activeOpacity={0.7}>
              <Pencil size={16} color="#1F7A52" strokeWidth={2} />
              <Text style={styles.editBtnText}>Редактировать</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ===== РЕДАКТОР ===== */}
        {editing && (
          <View style={styles.editorCard}>
            <Text style={styles.fieldLabel}>Название</Text>
            <TextInput
              style={styles.textInput}
              value={title}
              onChangeText={setTitle}
              placeholder="Название топика"
              placeholderTextColor="#BDBDBD"
              autoFocus
            />

            <Text style={styles.fieldLabel}>Иконка</Text>
            <View style={styles.iconGrid}>
              {Object.entries(TOPIC_ICONS).map(([key, IconComp]: [string, any]) => {
                const active = icon === key;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.iconCell, active && { backgroundColor: hexToRgba(color, 0.12), borderColor: color }]}
                    onPress={() => setIcon(key)}
                    activeOpacity={0.7}
                  >
                    <IconComp size={20} color={active ? color : '#6F6F73'} strokeWidth={2} />
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>Цвет</Text>
            <View style={styles.colorRow}>
              {TOPIC_COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.colorSwatch, { backgroundColor: c }, color === c && styles.colorSwatchActive]}
                  onPress={() => setColor(c)}
                  activeOpacity={0.7}
                >
                  {color === c && <Check size={14} color="#FFFFFF" strokeWidth={3} />}
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Прозрачность</Text>
            <View style={styles.opacityRow}>
              {TOPIC_OPACITIES.map((o) => (
                <TouchableOpacity
                  key={o.value}
                  style={[styles.opacityChip, opacity === o.value && styles.opacityChipActive]}
                  onPress={() => setOpacity(o.value)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.opacityChipText, opacity === o.value && styles.opacityChipTextActive]}>
                    {o.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.editorActions}>
              <TouchableOpacity onPress={resetDefaults} style={styles.resetBtn}>
                <RotateCcw size={16} color="#6F6F73" strokeWidth={2} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setEditing(false); load(); }} style={styles.cancelBtn}>
                <Text style={styles.cancelBtnText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSave}
                disabled={saving || !hasChanges}
                style={[styles.saveBtn, { backgroundColor: saving || !hasChanges ? '#ECECE8' : '#1F7A52' }]}
              >
                {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.saveBtnText}>Сохранить</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ===== МЕДИА-ВКЛАДКИ ===== */}
        <View style={styles.card}>
          <View style={styles.tabsRow}>
            {[
              { key: 'media', label: 'Фото', count: stats.media, icon: ImageIcon },
              { key: 'files', label: 'Файлы', count: stats.files, icon: Paperclip },
              { key: 'links', label: 'Ссылки', count: stats.links, icon: LinkIcon },
              { key: 'polls', label: 'Опросы', count: stats.polls, icon: BarChart3 },
            ].map((tab) => {
              const TIcon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => switchTab(tab.key as any)}
                  style={[styles.tabBtn, isActive && styles.tabBtnActive]}
                  activeOpacity={0.7}
                >
                  <TIcon size={14} color={isActive ? '#1F7A52' : '#6F6F73'} strokeWidth={2} />
                  <Text style={[styles.tabBtnText, isActive && styles.tabBtnTextActive]}>
                    {tab.label} {tab.count > 0 && `(${tab.count})`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {loadingTab ? (
            <View style={{ padding: 20 }}><ActivityIndicator color="#1F7A52" /></View>
          ) : tabItems.length === 0 ? (
            <View style={styles.emptyTab}>
              <Text style={styles.emptyTabText}>Пока пусто</Text>
            </View>
          ) : activeTab === 'media' ? (
            <View style={styles.mediaGrid}>
              {tabItems.map((item) => {
                const isSelected = selectedIds.includes(item.id);
                return (
                  <TouchableOpacity
                    key={item.id}
                    onLongPress={() => toggleSelect(item.id)}
                    onPress={() => selectedIds.length > 0 ? toggleSelect(item.id) : goToMessage(item)}
                    activeOpacity={0.8}
                    style={[styles.mediaItem, isSelected && styles.mediaItemSelected]}
                  >
                    <Image
                      source={{ uri: SERVER_URL + item.thumb_url }}
                      style={styles.mediaImage}
                      resizeMode="cover"
                    />
                    {isSelected && (
                      <View style={styles.mediaCheck}>
                        <Check size={14} color="#FFFFFF" strokeWidth={3} />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <View style={styles.listWrap}>
              {tabItems.map((item) => {
                const id = activeTab === 'polls' ? item.id : item.id;
                const isSelected = selectedIds.includes(id);
                return (
                  <TouchableOpacity
                    key={id}
                    onLongPress={() => toggleSelect(id)}
                    onPress={() => selectedIds.length > 0 ? toggleSelect(id) : goToMessage(item)}
                    style={[styles.listItem, isSelected && styles.listItemSelected]}
                    activeOpacity={0.7}
                  >
                    <View style={styles.listIcon}>
                      {activeTab === 'files' && <Paperclip size={16} color="#1F7A52" strokeWidth={2} />}
                      {activeTab === 'links' && <LinkIcon size={16} color="#1F7A52" strokeWidth={2} />}
                      {activeTab === 'polls' && <BarChart3 size={16} color="#1F7A52" strokeWidth={2} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.listItemTitle} numberOfLines={1}>
                        {activeTab === 'polls' ? item.question : (activeTab === 'files' ? item.file_name : (item.text?.match(/https?:\/\/[^\s]+/)?.[0] || 'Ссылка'))}
                      </Text>
                      <Text style={styles.listItemDate}>
                        {new Date(item.created_at || item.message_created_at).toLocaleDateString('ru-RU')}
                      </Text>
                    </View>
                    <ChevronRight size={16} color="#BDBDBD" strokeWidth={2} />
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {selectedIds.length > 0 && (
            <View style={styles.selectionBar}>
              <Text style={styles.selectionText}>Выбрано: {selectedIds.length}</Text>
              <TouchableOpacity onPress={() => setSelectedIds([])} style={styles.selectionBtn}>
                <X size={18} color="#6F6F73" strokeWidth={2} />
              </TouchableOpacity>
              <TouchableOpacity onPress={startForward} style={[styles.selectionBtn, styles.selectionBtnPrimary]}>
                <Forward size={18} color="#FFFFFF" strokeWidth={2} />
                <Text style={styles.selectionBtnText}>Переслать</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ===== ОПАСНАЯ ЗОНА ===== */}
        {isCreator && !editing && (
          <View style={styles.card}>
            <TouchableOpacity style={styles.dangerRow} onPress={handleDelete} activeOpacity={0.7}>
              <View style={[styles.cardIconWrap, { backgroundColor: '#FEE2E2' }]}>
                <Trash2 size={18} color="#DC2626" strokeWidth={2} />
              </View>
              <Text style={styles.dangerText}>Удалить топик</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ===== МОДАЛКА ПЕРЕСЫЛКИ ===== */}
      <Modal visible={showForwardModal} transparent animationType="slide">
        <TouchableOpacity activeOpacity={1} onPress={() => setShowForwardModal(false)} style={styles.sheetOverlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>ПЕРЕСЛАТЬ В...</Text>
            <ScrollView style={{ maxHeight: 400 }}>
              {availableChats.map((c: any) => (
                <TouchableOpacity
                  key={c.id}
                  style={styles.forwardRow}
                  onPress={() => forwardTo(c.id)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.forwardAvatar, { backgroundColor: '#1F7A52' }]}>
                    <Text style={styles.forwardAvatarText}>{(c.name || '?')[0].toUpperCase()}</Text>
                  </View>
                  <Text style={styles.forwardName}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
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
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#ECECE8',
  },
  headerBackBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  headerTitle: {
    fontFamily: Platform.OS === 'ios' ? 'Bebas Neue' : 'sans-serif-condensed',
    fontSize: 22, fontWeight: '900', color: '#141414', letterSpacing: 1,
  },

  scrollContent: { padding: 20, gap: 20 },

  heroCard: {
    backgroundColor: '#FFFFFF', borderRadius: 22, padding: 28, alignItems: 'center', gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 16, elevation: 3,
  },
  heroIconWrap: {
    width: 72, height: 72, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  heroTitle: { fontSize: 20, fontWeight: '700', color: '#141414' },
  heroSubtitle: { fontSize: 13, color: '#6F6F73', fontWeight: '500' },
  editBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 16, borderRadius: 12,
    backgroundColor: '#ECFDF5', marginTop: 8,
  },
  editBtnText: { fontSize: 14, fontWeight: '600', color: '#1F7A52' },

  editorCard: {
    backgroundColor: '#FFFFFF', borderRadius: 22, padding: 20, gap: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 16, elevation: 3,
  },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#6F6F73', textTransform: 'uppercase', letterSpacing: 0.5 },
  textInput: {
    fontSize: 16, color: '#141414', fontWeight: '500',
    backgroundColor: '#FAFAF8', borderWidth: 1, borderColor: '#ECECE8', borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconCell: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: '#FAFAF8', borderWidth: 1.5, borderColor: '#ECECE8',
    alignItems: 'center', justifyContent: 'center',
  },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorSwatch: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  colorSwatchActive: { borderWidth: 3, borderColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 4 },
  opacityRow: { flexDirection: 'row', gap: 8 },
  opacityChip: {
    flex: 1, paddingVertical: 10, borderRadius: 12,
    backgroundColor: '#FAFAF8', borderWidth: 1.5, borderColor: '#ECECE8', alignItems: 'center',
  },
  opacityChipActive: { backgroundColor: '#ECFDF5', borderColor: '#1F7A52' },
  opacityChipText: { fontSize: 13, fontWeight: '600', color: '#6F6F73' },
  opacityChipTextActive: { color: '#1F7A52' },
  editorActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  resetBtn: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: '#F4F4F5',
    alignItems: 'center', justifyContent: 'center',
  },
  cancelBtn: {
    flex: 1, height: 44, borderRadius: 12, backgroundColor: '#F4F4F5',
    alignItems: 'center', justifyContent: 'center',
  },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: '#6F6F73' },
  saveBtn: {
    flex: 2, height: 44, borderRadius: 12, backgroundColor: '#1F7A52',
    alignItems: 'center', justifyContent: 'center',
  },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },

  card: {
    backgroundColor: '#FFFFFF', borderRadius: 22, padding: 16, gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 16, elevation: 3,
  },
  cardIconWrap: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center' },
  dangerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dangerText: { fontSize: 15, fontWeight: '600', color: '#DC2626' },

  tabsRow: { flexDirection: 'row', gap: 6 },
  tabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: 8, borderRadius: 10, backgroundColor: '#FAFAF8',
  },
  tabBtnActive: { backgroundColor: '#ECFDF5' },
  tabBtnText: { fontSize: 11, fontWeight: '600', color: '#6F6F73' },
  tabBtnTextActive: { color: '#1F7A52' },
  emptyTab: { paddingVertical: 32, alignItems: 'center' },
  emptyTabText: { fontSize: 13, color: '#BDBDBD', fontWeight: '500' },

  mediaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  mediaItem: {
    width: GRID_ITEM_SIZE, height: GRID_ITEM_SIZE, borderRadius: 8, overflow: 'hidden',
    backgroundColor: '#F4F4F5',
  },
  mediaItemSelected: { borderWidth: 3, borderColor: '#1F7A52' },
  mediaImage: { width: '100%', height: '100%' },
  mediaCheck: {
    position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#1F7A52', alignItems: 'center', justifyContent: 'center',
  },

  listWrap: { gap: 6 },
  listItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10,
    borderRadius: 12, backgroundColor: '#FAFAF8',
  },
  listItemSelected: { backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#1F7A52' },
  listIcon: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: '#ECFDF5',
    alignItems: 'center', justifyContent: 'center',
  },
  listItemTitle: { fontSize: 14, fontWeight: '600', color: '#141414' },
  listItemDate: { fontSize: 11, color: '#6F6F73', marginTop: 2 },

  selectionBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 10, backgroundColor: '#ECFDF5', borderRadius: 14, marginTop: 8,
  },
  selectionText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#1F7A52' },
  selectionBtn: { padding: 8, borderRadius: 10, backgroundColor: '#FFFFFF' },
  selectionBtnPrimary: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, backgroundColor: '#1F7A52',
  },
  selectionBtnText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },

  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 32, gap: 14 },
  sheetHandle: { width: 40, height: 4, backgroundColor: '#ECECE8', borderRadius: 2, alignSelf: 'center' },
  sheetTitle: {
    fontFamily: Platform.OS === 'ios' ? 'Bebas Neue' : 'sans-serif-condensed',
    fontSize: 24, fontWeight: '900', color: '#141414', letterSpacing: 1,
  },
  forwardRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F4F4F5' },
  forwardAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  forwardAvatarText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  forwardName: { fontSize: 15, fontWeight: '600', color: '#141414' },
});