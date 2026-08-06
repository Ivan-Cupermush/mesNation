import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Image, ActivityIndicator,
  StyleSheet, Platform, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, FileText, ImageIcon } from 'lucide-react-native';
import { getToken, SERVER_URL } from '../utils';

const SCREEN_W = Dimensions.get('window').width;
const GAP = 4;
const ITEM_SIZE = (SCREEN_W - 32 - GAP * 2) / 3;

export default function MediaListScreen({ route, navigation }: any) {
  const { chatId, type } = route.params; // 'files' | 'images'
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<number | null>(null);

  const loadItems = async (before?: number) => {
    const tok = await getToken();
    if (!tok) return;
    try {
      const url = `${SERVER_URL}/api/chats/${chatId}/messages?type=${type}&limit=30${before ? `&before=${before}` : ''}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } });
      if (res.ok) {
        const data = await res.json();
        setItems((prev) => (before ? [...prev, ...data] : data));
        if (data.length > 0) setCursor(data[data.length - 1].id);
      }
    } catch (e) {}
    setLoading(false);
  };

  useEffect(() => { loadItems(); }, []);

  const openMessage = (item: any) => {
    navigation.navigate('Chat', {
      chatId: String(item.chat_id),
      chatName: 'Чат',
      messageId: item.id,
      topicId: item.topic_id || null,
    });
  };

  const isImages = type === 'images';

  const renderFile = ({ item }: any) => (
    <TouchableOpacity style={styles.fileCard} onPress={() => openMessage(item)} activeOpacity={0.7}>
      <View style={styles.fileIcon}>
        <FileText size={22} color="#1F7A52" strokeWidth={2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.fileName} numberOfLines={1}>{item.file_name || 'Файл'}</Text>
        <Text style={styles.fileDate}>
          {new Date(item.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const renderImage = ({ item }: any) => (
    <TouchableOpacity onPress={() => openMessage(item)} activeOpacity={0.8}>
      <Image
        source={{ uri: SERVER_URL + (item.thumb_url || item.file_url) }}
        style={styles.imageItem}
        resizeMode="cover"
      />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBackBtn}>
          <ChevronLeft size={24} color="#141414" strokeWidth={2} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isImages ? 'МЕДИА' : 'ФАЙЛЫ'}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}><ActivityIndicator size="large" color="#1F7A52" /></View>
      ) : items.length === 0 ? (
        <View style={styles.emptyCard}>
          {isImages ? <ImageIcon size={32} color="#BDBDBD" strokeWidth={1.5} /> : <FileText size={32} color="#BDBDBD" strokeWidth={1.5} />}
          <Text style={styles.emptyTitle}>{isImages ? 'Нет медиа' : 'Нет файлов'}</Text>
          <Text style={styles.emptySubtitle}>В этом чате пока пусто</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          renderItem={isImages ? renderImage : renderFile}
          numColumns={isImages ? 3 : 1}
          columnWrapperStyle={isImages ? { gap: GAP } : undefined}
          contentContainerStyle={isImages ? { padding: 16, gap: GAP } : { padding: 16, gap: 10 }}
          onEndReached={() => cursor && loadItems(cursor)}
          onEndReachedThreshold={0.5}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAF8' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#ECECE8',
  },
  headerBackBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  headerTitle: {
    fontFamily: Platform.OS === 'ios' ? 'Bebas Neue' : 'sans-serif-condensed',
    fontSize: 22, fontWeight: '900', color: '#141414', letterSpacing: 1,
  },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  imageItem: { width: ITEM_SIZE, height: ITEM_SIZE, borderRadius: 10, backgroundColor: '#ECECE8' },
  fileCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFFFFF', borderRadius: 18, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 12, elevation: 2,
  },
  fileIcon: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: '#ECFDF5',
    alignItems: 'center', justifyContent: 'center',
  },
  fileName: { fontSize: 14, fontWeight: '600', color: '#141414' },
  fileDate: { fontSize: 12, color: '#6F6F73', marginTop: 2 },
  emptyCard: { marginHorizontal: 16, backgroundColor: '#FFFFFF', borderRadius: 22, padding: 32, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#141414', marginTop: 4 },
  emptySubtitle: { fontSize: 12, color: '#6F6F73' },
});