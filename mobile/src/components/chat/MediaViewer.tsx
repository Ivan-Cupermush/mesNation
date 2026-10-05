import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  useWindowDimensions,
  Animated,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as RNFS from 'react-native-fs';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import { X, Forward, Download, MessageSquareText } from 'lucide-react-native';
import { SERVER_URL } from '../../config';
import { authHeaders, signedFileUrl } from '../../services/http';
import ZoomableImage from './ZoomableImage';
import VideoPlayer from './VideoPlayer';
import { formatTime, requestSavePermission } from './chatUtils';

import { T, themed } from '../../theme/runtime';
/**
 * Полноэкранный просмотр фото и видео чата (как в Telegram): листание
 * влево-вправо, зум, свайп вниз — закрыть, сохранить в галерею, переслать,
 * перейти к сообщению.
 */

export interface ViewerItem {
  id: number;
  media_kind?: string | null;
  file_url: string;
  thumb_url?: string | null;
  file_name?: string | null;
  text?: string | null;
  sender_name?: string;
  created_at: string;
  media_width?: number | null;
  media_height?: number | null;
}

interface Props {
  visible: boolean;
  items: ViewerItem[];
  initialIndex: number;
  onClose: () => void;
  onForward?: (item: ViewerItem) => void;
  onShowInChat?: (item: ViewerItem) => void;
}

export default function MediaViewer({ visible, items, initialIndex, onClose, onForward, onShowInChat }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(initialIndex);
  const [chrome, setChrome] = useState(true);
  const [zoomed, setZoomed] = useState(false);
  const [headers, setHeaders] = useState<Record<string, string>>({});
  const [videoUrls, setVideoUrls] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const bgOpacity = useRef(new Animated.Value(1)).current;
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    if (visible) {
      setIndex(initialIndex);
      setChrome(true);
      setZoomed(false);
      bgOpacity.setValue(1);
      authHeaders().then(setHeaders);
    }
  }, [visible, initialIndex, bgOpacity]);

  // Видео открываем по подписанной ссылке: плееру проще без заголовков.
  const current = items[index];
  useEffect(() => {
    if (!visible || !current || current.media_kind !== 'video' || videoUrls[current.id]) return;
    signedFileUrl(current.file_url)
      .then((url) => setVideoUrls((prev) => ({ ...prev, [current.id]: url })))
      .catch(() => undefined);
  }, [visible, current, videoUrls]);

  const onDismissProgress = useCallback(
    (dy: number) => {
      bgOpacity.setValue(Math.max(0.2, 1 - Math.abs(dy) / 400));
    },
    [bgOpacity],
  );

  const save = async () => {
    if (!current) return;
    setSaving(true);
    try {
      if (!(await requestSavePermission())) throw new Error('Нет разрешения на сохранение');
      const ext = (current.file_name?.split('.').pop() || (current.media_kind === 'video' ? 'mp4' : 'jpg')).toLowerCase();
      const path = `${RNFS.CachesDirectoryPath}/offix_${current.id}.${ext}`;
      const { promise } = RNFS.downloadFile({ fromUrl: await signedFileUrl(current.file_url), toFile: path });
      const result = await promise;
      if (result.statusCode && result.statusCode >= 400) throw new Error('Файл недоступен');
      await CameraRoll.saveAsset(`file://${path}`, { type: current.media_kind === 'video' ? 'video' : 'photo', album: 'Offix' });
      RNFS.unlink(path).catch(() => undefined);
      Alert.alert('Сохранено', current.media_kind === 'video' ? 'Видео сохранено в галерею' : 'Фото сохранено в галерею');
    } catch (e: any) {
      Alert.alert('Не удалось сохранить', e?.message || '');
    } finally {
      setSaving(false);
    }
  };

  const renderItem = ({ item, index: i }: { item: ViewerItem; index: number }) => {
    if (item.media_kind === 'video') {
      return (
        <VideoPlayer
          width={width}
          height={height}
          uri={videoUrls[item.id] || null}
          posterUri={item.thumb_url ? SERVER_URL + item.thumb_url : null}
          active={i === index}
          chromeVisible={chrome}
          onTap={() => setChrome((c) => !c)}
        />
      );
    }
    return (
      <ZoomableImage
        width={width}
        height={height}
        uri={SERVER_URL + item.file_url}
        headers={headers}
        previewUri={item.thumb_url ? SERVER_URL + item.thumb_url : null}
        imageWidth={item.media_width}
        imageHeight={item.media_height}
        onTap={() => setChrome((c) => !c)}
        onZoomChange={setZoomed}
        onDismissProgress={onDismissProgress}
        onDismiss={onClose}
      />
    );
  };

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent hidden={!chrome} />
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: bgOpacity }]} />
      <FlatList
        ref={listRef}
        data={items}
        horizontal
        pagingEnabled
        scrollEnabled={!zoomed}
        initialScrollIndex={initialIndex}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        keyExtractor={(m) => String(m.id)}
        renderItem={renderItem}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        windowSize={3}
        initialNumToRender={1}
      />

      {chrome && current && (
        <>
          <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
            <TouchableOpacity onPress={onClose} style={styles.iconBtn} accessibilityLabel="Закрыть">
              <X size={24} color={T.onAccent} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={1}>
                {current.sender_name || 'Медиа'}
              </Text>
              <Text style={styles.subtitle}>
                {new Date(current.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })} в {formatTime(current.created_at)}
              </Text>
            </View>
            {items.length > 1 && (
              <Text style={styles.counter}>
                {index + 1} из {items.length}
              </Text>
            )}
          </View>

          <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 10 }]}>
            {current.text ? (
              <Text style={styles.caption} numberOfLines={4}>
                {current.text}
              </Text>
            ) : null}
            <View style={styles.actions}>
              {onForward && (
                <TouchableOpacity onPress={() => onForward(current)} style={styles.action}>
                  <Forward size={22} color={T.onAccent} />
                  <Text style={styles.actionText}>Переслать</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={save} style={styles.action} disabled={saving}>
                {saving ? <ActivityIndicator color={T.onAccent} /> : <Download size={22} color={T.onAccent} />}
                <Text style={styles.actionText}>Сохранить</Text>
              </TouchableOpacity>
              {onShowInChat && (
                <TouchableOpacity onPress={() => onShowInChat(current)} style={styles.action}>
                  <MessageSquareText size={22} color={T.onAccent} />
                  <Text style={styles.actionText}>В чате</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </>
      )}
    </Modal>
  );
}

const styles = themed(() => ({
  backdrop: { backgroundColor: 'black' },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingBottom: 10,
    backgroundColor: T.overlay,
  },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { color: T.onAccent, fontSize: 16, fontWeight: '700' },
  subtitle: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 1 },
  counter: { color: T.onAccent, fontSize: 14, fontWeight: '600', paddingHorizontal: 8 },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 10,
    paddingHorizontal: 16,
    backgroundColor: T.overlay,
  },
  caption: { color: T.onAccent, fontSize: 15, lineHeight: 20, marginBottom: 10 },
  actions: { flexDirection: 'row', justifyContent: 'space-around' },
  action: { alignItems: 'center', gap: 4, minWidth: 80, paddingVertical: 4 },
  actionText: { color: T.onAccent, fontSize: 12 },
}));
