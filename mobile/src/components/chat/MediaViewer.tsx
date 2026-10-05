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
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import * as RNFS from 'react-native-fs';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import { X, Forward, Download, MessageSquareText } from 'lucide-react-native';
import { SERVER_URL } from '../../config';
import { authHeaders, signedFileUrl } from '../../services/http';
import ZoomableImage from './ZoomableImage';
import VideoPlayer from './VideoPlayer';
import { formatTime, requestSavePermission } from './chatUtils';

import { themed } from '../../theme/runtime';
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

// Подписанная ссылка живёт 10 минут; держим её 8, чтобы повторное открытие
// фото брало картинку из кеша, а не скачивало заново.
const signedCache = new Map<string, { url: string; at: number }>();
async function cachedSignedUrl(path: string): Promise<string> {
  const hit = signedCache.get(path);
  if (hit && Date.now() - hit.at < 8 * 60_000) return hit.url;
  const url = await signedFileUrl(path);
  signedCache.set(path, { url, at: Date.now() });
  return url;
}

export default function MediaViewer({ visible, items, initialIndex, onClose, onForward, onShowInChat }: Props) {
  const win = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(initialIndex);
  const [chrome, setChrome] = useState(true);
  const [zoomed, setZoomed] = useState(false);
  const [headers, setHeaders] = useState<Record<string, string>>({});
  // Подписанные ссылки на оригиналы (фото и видео): без заголовков авторизации,
  // поэтому нет гонки «картинка запросилась раньше, чем пришёл токен».
  const [fileUrls, setFileUrls] = useState<Record<number, string>>({});
  // Реальный размер полноэкранного окна: на Android 15 высота окна приложения
  // меньше экрана (без системных панелей), из-за чего фото было смещено.
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const requested = useRef(new Set<number>());
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

  const current = items[index];
  // Ссылки на текущий файл и соседей — чтобы листание было без ожидания.
  useEffect(() => {
    if (!visible) return;
    [index, index + 1, index - 1].forEach((i) => {
      const it = items[i];
      if (!it || fileUrls[it.id] || requested.current.has(it.id)) return;
      requested.current.add(it.id);
      cachedSignedUrl(it.file_url)
        .catch(() => SERVER_URL + it.file_url)
        .then((url) => setFileUrls((prev) => (prev[it.id] ? prev : { ...prev, [it.id]: url })));
    });
  }, [visible, index, items, fileUrls]);

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
      const { promise } = RNFS.downloadFile({ fromUrl: await cachedSignedUrl(current.file_url), toFile: path });
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

  const width = box?.w || win.width;
  const height = box?.h || win.height;

  const renderItem = ({ item, index: i }: { item: ViewerItem; index: number }) => {
    if (item.media_kind === 'video') {
      return (
        <VideoPlayer
          width={width}
          height={height}
          uri={fileUrls[item.id] || null}
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
        uri={fileUrls[item.id] || null}
        headers={fileUrls[item.id]?.includes('token=') ? undefined : headers}
        hiRes={i === index}
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
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent hidden={!chrome} />
      <View
        style={StyleSheet.absoluteFill}
        onLayout={(e) => {
          const { width: w, height: h } = e.nativeEvent.layout;
          if (!box || box.w !== w || box.h !== h) setBox({ w, h });
        }}
      >
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: bgOpacity }]} />
        {box && (
          <FlatList
            key={`${box.w}x${box.h}`}
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
            maxToRenderPerBatch={1}
          />
        )}

        {chrome && current && (
          <>
            <View style={[styles.topBar, { paddingTop: insets.top + 4 }]}>
              <Shade direction="down" />
              <TouchableOpacity onPress={onClose} style={styles.iconBtn} accessibilityLabel="Закрыть" hitSlop={8}>
                <X size={24} color="#FFFFFF" />
              </TouchableOpacity>
              <View style={styles.titleWrap}>
                <Text style={styles.title} numberOfLines={1}>
                  {current.sender_name || 'Медиа'}
                </Text>
                <Text style={styles.subtitle} numberOfLines={1}>
                  {new Date(current.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })} в {formatTime(current.created_at)}
                </Text>
              </View>
              {items.length > 1 ? (
                <Text style={styles.counter}>
                  {index + 1} из {items.length}
                </Text>
              ) : (
                <View style={styles.iconBtn} />
              )}
            </View>

            <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 8 }]}>
              <Shade direction="up" />
              {current.text ? (
                <Text style={styles.caption} numberOfLines={4}>
                  {current.text}
                </Text>
              ) : null}
              <View style={styles.actions}>
                {onForward && (
                  <TouchableOpacity onPress={() => onForward(current)} style={styles.action} accessibilityLabel="Переслать">
                    <Forward size={22} color="#FFFFFF" />
                    <Text style={styles.actionText}>Переслать</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={save} style={styles.action} disabled={saving} accessibilityLabel="Сохранить в галерею">
                  {saving ? <ActivityIndicator color="#FFFFFF" /> : <Download size={22} color="#FFFFFF" />}
                  <Text style={styles.actionText}>Сохранить</Text>
                </TouchableOpacity>
                {onShowInChat && (
                  <TouchableOpacity onPress={() => onShowInChat(current)} style={styles.action} accessibilityLabel="Показать в чате">
                    <MessageSquareText size={22} color="#FFFFFF" />
                    <Text style={styles.actionText}>В чате</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

/** Плавное затемнение под панелями (как в Telegram), а не сплошная плашка. */
function Shade({ direction }: { direction: 'up' | 'down' }) {
  const id = `shade-${direction}`;
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#000" stopOpacity={direction === 'down' ? 0.6 : 0} />
          <Stop offset="1" stopColor="#000" stopOpacity={direction === 'down' ? 0 : 0.6} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
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
    gap: 4,
    paddingHorizontal: 6,
    paddingBottom: 28,
  },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  titleWrap: { flex: 1, paddingHorizontal: 4 },
  title: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  subtitle: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 1 },
  counter: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', paddingHorizontal: 10 },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 36,
    paddingHorizontal: 16,
  },
  caption: { color: '#FFFFFF', fontSize: 15, lineHeight: 20, marginBottom: 12 },
  actions: { flexDirection: 'row', justifyContent: 'space-around' },
  action: { alignItems: 'center', gap: 4, minWidth: 80, paddingVertical: 6 },
  actionText: { color: '#FFFFFF', fontSize: 12, fontWeight: '500' },
}));
