import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform,
  ActivityIndicator, Alert, TextInput, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { ChevronLeft, Hash, MessageSquare, Plus, ChevronRight, X, Info } from 'lucide-react-native';
import { getToken, SERVER_URL } from '../utils';
import { TOPIC_ICONS, hexToRgba } from '../theme/topicIcons';

type TopicListRouteProp = RouteProp<{ params: { chatId: string; chatName: string } }, 'params'>;

export default function TopicListScreen({ navigation }: any) {
  const route = useRoute<TopicListRouteProp>();
  const chatId = route.params.chatId;
  const chatName = route.params.chatName || 'Супергруппа';

  const [chat, setChat] = useState<any>(null);
  const [topics, setTopics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreator, setIsCreator] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const token = await getToken();
    if (!token) { setLoading(false); return; }
    try {
      const [meRes, topicsRes, listRes] = await Promise.all([
        fetch(`${SERVER_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${SERVER_URL}/api/chats/${chatId}/topics`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${SERVER_URL}/api/chats`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      let me: any = null;
      if (meRes.ok) me = await meRes.json();
      if (topicsRes.ok) setTopics(await topicsRes.json());
      if (listRes.ok) {
        const list = await listRes.json();
        const ch = list.find((x: any) => String(x.id) === String(chatId));
        if (ch) { setChat(ch); if (me) setIsCreator(ch.created_by === me.id); }
      }
    } catch (e) { Alert.alert('Ошибка', 'Не удалось загрузить топики'); }
    setLoading(false);
  }, [chatId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleCreate = async () => {
    if (!newTitle.trim()) { Alert.alert('Ошибка', 'Введите название'); return; }
    setCreating(true);
    try {
      const tok = await getToken();
      const res = await fetch(`${SERVER_URL}/api/chats/${chatId}/topics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      if (res.ok) { setNewTitle(''); setShowCreateModal(false); load(); }
      else { const d = await res.json(); Alert.alert('Ошибка', d.error || 'Не удалось'); }
    } catch (e) { Alert.alert('Ошибка', 'Сервер недоступен'); }
    finally { setCreating(false); }
  };

  const openTopic = (topicId: number | null, topicName: string) => {
    navigation.navigate('Chat', {
      chatId,
      chatName: topicId ? `${chatName} · ${topicName}` : chatName,
      topicId,
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ===== HEADER ===== */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBackBtn}>
          <ChevronLeft size={24} color="#141414" strokeWidth={2} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>ТОПИКИ</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>{chatName}</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('ChatInfo', { chatId })} style={styles.headerBtn}>
          <Info size={20} color="#141414" strokeWidth={2} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}><ActivityIndicator size="large" color="#1F7A52" /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* ===== ОБЩИЙ ЧАТ ===== */}
          <TouchableOpacity onPress={() => openTopic(null, 'Общий чат')} style={styles.topicCard} activeOpacity={0.7}>
            <View style={[styles.topicIconWrap, { backgroundColor: '#ECFDF5' }]}>
              <MessageSquare size={20} color="#1F7A52" strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.topicTitle}>Общий чат</Text>
              <Text style={styles.topicHint}>Сообщения без топика</Text>
            </View>
            <ChevronRight size={18} color="#BDBDBD" strokeWidth={2} />
          </TouchableOpacity>

          <Text style={styles.sectionTitle}>ТОПИКИ</Text>

          {topics.length === 0 ? (
            <View style={styles.emptyCard}>
              <Hash size={32} color="#BDBDBD" strokeWidth={1.5} />
              <Text style={styles.emptyTitle}>Топиков пока нет</Text>
              <Text style={styles.emptySubtitle}>
                {isCreator ? 'Создайте первый топик для обсуждений' : 'Создатель супергруппы ещё не создал топики'}
              </Text>
            </View>
          ) : (
            topics.map((t) => {
              const Icon = TOPIC_ICONS[t.icon] || TOPIC_ICONS.hash;
              const color = t.icon_color || '#1F7A52';
              const opacity = t.icon_opacity ?? 1;
              return (
                <TouchableOpacity
                  key={t.id}
                  onPress={() => openTopic(t.id, t.title)}
                  style={styles.topicCard}
                  activeOpacity={0.7}
                >
                  <View style={[styles.topicIconWrap, { backgroundColor: hexToRgba(color, 0.12) }]}>
                    <Icon size={20} color={color} strokeWidth={2} style={{ opacity }} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.topicTitle} numberOfLines={1}>{t.title}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation();
                      navigation.navigate('TopicInfo', { chatId, topicId: t.id });
                    }}
                    style={styles.topicInfoBtn}
                  >
                    <Info size={16} color="#6F6F73" strokeWidth={2} />
                  </TouchableOpacity>
                  <ChevronRight size={18} color="#BDBDBD" strokeWidth={2} />
                </TouchableOpacity>
              );
            })
          )}

          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* ===== FAB: создать топик ===== */}
      {isCreator && (
        <TouchableOpacity onPress={() => setShowCreateModal(true)} style={styles.fab} activeOpacity={0.85}>
          <Plus size={24} color="#FFFFFF" strokeWidth={2.5} />
        </TouchableOpacity>
      )}

      {/* ===== МОДАЛКА СОЗДАНИЯ ===== */}
      <Modal visible={showCreateModal} transparent animationType="slide">
        <TouchableOpacity activeOpacity={1} onPress={() => setShowCreateModal(false)} style={styles.sheetOverlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>НОВЫЙ ТОПИК</Text>
              <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                <X size={22} color="#141414" strokeWidth={2} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.textInput}
              placeholder="Например: Обсуждение отчётов"
              placeholderTextColor="#BDBDBD"
              value={newTitle}
              onChangeText={setNewTitle}
              autoFocus
            />
            <TouchableOpacity
              onPress={handleCreate}
              disabled={creating || !newTitle.trim()}
              style={[styles.createBtn, { backgroundColor: creating || !newTitle.trim() ? '#ECECE8' : '#1F7A52' }]}
            >
              {creating ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.createBtnText}>Создать топик</Text>}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAF8' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#ECECE8', gap: 10,
  },
  headerBackBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  headerTitle: {
    fontFamily: Platform.OS === 'ios' ? 'Bebas Neue' : 'sans-serif-condensed',
    fontSize: 22, fontWeight: '900', color: '#141414', letterSpacing: 1,
  },
  headerSubtitle: { fontSize: 12, color: '#6F6F73', fontWeight: '500', maxWidth: 220 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: 20, gap: 12 },
  sectionTitle: {
    fontFamily: Platform.OS === 'ios' ? 'Bebas Neue' : 'sans-serif-condensed',
    fontSize: 20, fontWeight: '900', color: '#141414', letterSpacing: 1, marginTop: 8,
  },
  topicCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 12, elevation: 2,
  },
  topicIconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  topicTitle: { fontSize: 16, fontWeight: '700', color: '#141414' },
  topicHint: { fontSize: 12, color: '#6F6F73', marginTop: 2, fontWeight: '500' },
  topicInfoBtn: { padding: 8 },
  emptyCard: { backgroundColor: '#FFFFFF', borderRadius: 22, padding: 32, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#141414', marginTop: 4 },
  emptySubtitle: { fontSize: 12, color: '#6F6F73', textAlign: 'center' },
  fab: {
    position: 'absolute', right: 24, bottom: 24, width: 56, height: 56, borderRadius: 18,
    backgroundColor: '#1F7A52', justifyContent: 'center', alignItems: 'center',
    shadowColor: '#1F7A52', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 8,
  },
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 32, gap: 14 },
  sheetHandle: { width: 40, height: 4, backgroundColor: '#ECECE8', borderRadius: 2, alignSelf: 'center' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: {
    fontFamily: Platform.OS === 'ios' ? 'Bebas Neue' : 'sans-serif-condensed',
    fontSize: 24, fontWeight: '900', color: '#141414', letterSpacing: 1,
  },
  textInput: {
    fontSize: 16, color: '#141414', fontWeight: '500',
    backgroundColor: '#FAFAF8', borderWidth: 1, borderColor: '#ECECE8', borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  createBtn: { height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  createBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});