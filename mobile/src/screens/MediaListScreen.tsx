import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Image, ActivityIndicator, StyleSheet, useWindowDimensions, Linking, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, FileText, Link2, BarChart3, Play } from 'lucide-react-native';
import { SERVER_URL } from '../config';
import { request, signedFileUrl } from '../services/http';
import MediaViewer, { ViewerItem } from '../components/chat/MediaViewer';
import { C, formatDuration, formatSize } from '../components/chat/chatUtils';

/**
 * Общие материалы чата: фото и видео (сетка, открываются во встроенном
 * просмотрщике), файлы, ссылки и опросы. Подгружаются постранично.
 */

type Kind = 'images' | 'files' | 'links' | 'polls';
const TABS: { key: Kind; label: string }[] = [
  { key: 'images', label: 'Медиа' },
  { key: 'files', label: 'Файлы' },
  { key: 'links', label: 'Ссылки' },
  { key: 'polls', label: 'Опросы' },
];
const COLS = 3;
const GAP = 2;
const URL_RE = /https?:\/\/[^\s<>"']+/gi;

export default function MediaListScreen({ route, navigation }: any) {
  const { chatId, topicId } = route.params;
  const [kind, setKind] = useState<Kind>(route.params.type === 'media' ? 'images' : route.params.type || 'images');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const { width } = useWindowDimensions();
  const cell = (width - GAP * (COLS - 1)) / COLS;

  const load = useCallback(
    async (before?: number) => {
      try {
        const data = await request<any[]>(`/api/chats/${chatId}/messages`, {
          query: { type: kind === 'images' ? 'media' : kind, limit: 60, before, topic_id: topicId ?? undefined },
        });
        setItems((prev) => (before ? [...prev, ...data] : data));
        setHasMore(data.length >= 60);
      } catch (e: any) {
        Alert.alert('Ошибка', e?.message || 'Не удалось загрузить');
      } finally {
        setLoading(false);
      }
    },
    [chatId, kind, topicId],
  );

  useEffect(() => {
    setLoading(true);
    setItems([]);
    load();
  }, [load]);

  const goToMessage = (item: any) =>
    navigation.navigate('Chat', { chatId: String(item.chat_id), chatName: 'Чат', messageId: item.id, topicId: item.topic_id || null });

  const openFile = async (item: any) => {
    try {
      await Linking.openURL(await signedFileUrl(item.file_url));
    } catch (e: any) {
      Alert.alert('Не удалось открыть файл', e?.message || '');
    }
  };

  const date = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });

  const renderItem = ({ item, index }: { item: any; index: number }) => {
    if (kind === 'images') {
      return (
        <TouchableOpacity
          style={{ width: cell, height: cell, marginRight: (index + 1) % COLS ? GAP : 0, marginBottom: GAP }}
          onPress={() => setViewerIndex(index)}
          onLongPress={() => goToMessage(item)}
          activeOpacity={0.85}
        >
          {item.thumb_url ? (
            <Image source={{ uri: SERVER_URL + item.thumb_url }} style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#2B2F2C' }]} />
          )}
          {item.media_kind === 'video' && (
            <View style={styles.videoPill}>
              <Play size={10} color="#FFFFFF" fill="#FFFFFF" />
              <Text style={styles.videoText}>{item.media_duration ? formatDuration(item.media_duration) : 'видео'}</Text>
            </View>
          )}
        </TouchableOpacity>
      );
    }
    if (kind === 'files') {
      return (
        <TouchableOpacity style={styles.row} onPress={() => openFile(item)} onLongPress={() => goToMessage(item)} activeOpacity={0.6}>
          <View style={[styles.rowIcon, { backgroundColor: C.accentSoft }]}>
            <FileText size={22} color={C.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {item.file_name || 'Файл'}
            </Text>
            <Text style={styles.rowSub}>
              {[formatSize(item.file_size), date(item.created_at), item.sender_display_name || item.sender_name].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </TouchableOpacity>
      );
    }
    if (kind === 'links') {
      const urls: string[] = (item.text || '').match(URL_RE) || [];
      return (
        <TouchableOpacity style={styles.row} onPress={() => urls[0] && Linking.openURL(urls[0])} onLongPress={() => goToMessage(item)} activeOpacity={0.6}>
          <View style={[styles.rowIcon, { backgroundColor: '#E0F2FE' }]}>
            <Link2 size={22} color="#0EA5E9" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: '#0284C7' }]} numberOfLines={1}>
              {urls[0] || item.text}
            </Text>
            <Text style={styles.rowSub} numberOfLines={2}>
              {item.text}
            </Text>
          </View>
        </TouchableOpacity>
      );
    }
    return (
      <TouchableOpacity style={styles.row} onPress={() => goToMessage(item)} activeOpacity={0.6}>
        <View style={[styles.rowIcon, { backgroundColor: '#FEF3C7' }]}>
          <BarChart3 size={22} color="#F59E0B" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle} numberOfLines={2}>
            {item.poll_question || 'Опрос'}
          </Text>
          <Text style={styles.rowSub}>
            {date(item.created_at)} · {item.sender_display_name || item.sender_name}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const viewerItems: ViewerItem[] = kind === 'images' ? items.map((m) => ({ ...m, sender_name: m.sender_display_name || m.sender_name })) : [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn} accessibilityLabel="Назад">
          <ChevronLeft size={26} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Материалы чата</Text>
        <View style={styles.iconBtn} />
      </View>
      <View style={styles.tabs}>
        {TABS.map((t) => (
          <TouchableOpacity key={t.key} style={[styles.tab, kind === t.key && styles.tabActive]} onPress={() => setKind(t.key)}>
            <Text style={[styles.tabText, kind === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading ? (
        <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          key={kind === 'images' ? 'grid' : 'list'}
          data={items}
          numColumns={kind === 'images' ? COLS : 1}
          keyExtractor={(m) => String(m.id)}
          renderItem={renderItem}
          onEndReached={() => hasMore && items.length && load(items[items.length - 1].id)}
          onEndReachedThreshold={0.5}
          ItemSeparatorComponent={kind === 'images' ? undefined : () => <View style={styles.sep} />}
          ListEmptyComponent={<Text style={styles.empty}>Здесь пока пусто</Text>}
        />
      )}
      <MediaViewer
        visible={viewerIndex !== null}
        items={viewerItems}
        initialIndex={viewerIndex || 0}
        onClose={() => setViewerIndex(null)}
        onShowInChat={(it) => {
          setViewerIndex(null);
          goToMessage(it);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { flexDirection: 'row', alignItems: 'center', height: 56, paddingHorizontal: 4 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: C.text, textAlign: 'center' },
  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: C.accent },
  tabText: { fontSize: 14, fontWeight: '600', color: C.textMuted },
  tabTextActive: { color: C.accent },
  videoPill: {
    position: 'absolute',
    left: 5,
    bottom: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  videoText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  rowIcon: { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '600', color: C.text },
  rowSub: { fontSize: 13, color: C.textMuted, marginTop: 2 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginLeft: 74 },
  empty: { textAlign: 'center', color: C.textMuted, marginTop: 50 },
});
