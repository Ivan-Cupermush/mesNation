import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Linking,
  Animated,
  useWindowDimensions,
  KeyboardAvoidingView,
  } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraRoll, PhotoIdentifier } from '@react-native-camera-roll/camera-roll';
import { launchCamera } from 'react-native-image-picker';
import { Camera, Image as ImageIcon, FileText, NotebookPen, SendHorizonal, Check, ImageOff } from 'lucide-react-native';
import { PollGlyph } from '../PollBubble';
import { C, formatDuration, requestCameraPermission, requestGalleryPermission } from './chatUtils';

import { T, themed } from '../../theme/runtime';
/**
 * Меню «скрепки» как в Telegram: снизу выезжает галерея последних фото и
 * видео, можно отметить несколько (с номерами порядка), добавить подпись и
 * отправить одним альбомом. Внизу вкладки: Галерея, Файл, Опрос, Заметка.
 */

export interface PickedMedia {
  uri: string;
  type: string;
  name: string;
  width?: number;
  height?: number;
  duration?: number;
  isVideo: boolean;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onSendMedia: (items: PickedMedia[], caption: string, asFile: boolean) => void;
  onPickFiles: () => void;
  onPoll: () => void;
  onNote: () => void;
}

const PAGE = 60;
const COLS = 3;
const GAP = 2;

type GalleryState = 'loading' | 'ready' | 'denied';

function toPicked(p: PhotoIdentifier): PickedMedia {
  const img = p.node.image;
  const isVideo = p.node.type.startsWith('video');
  const ext = img.extension || (isVideo ? 'mp4' : 'jpg');
  return {
    uri: img.uri,
    type: p.node.type.includes('/') ? p.node.type : isVideo ? 'video/mp4' : 'image/jpeg',
    name: img.filename || `${isVideo ? 'video' : 'photo'}_${p.node.timestamp}.${ext}`,
    width: img.width || undefined,
    height: img.height || undefined,
    duration: img.playableDuration || undefined,
    isVideo,
  };
}

export default function AttachSheet({ visible, onClose, onSendMedia, onPickFiles, onPoll, onNote }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<GalleryState>('loading');
  const [photos, setPhotos] = useState<PhotoIdentifier[]>([]);
  const [extra, setExtra] = useState<PickedMedia[]>([]); // снятые камерой
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(true);
  const [selected, setSelected] = useState<string[]>([]); // uri в порядке выбора
  const [caption, setCaption] = useState('');
  const [compress, setCompress] = useState(true);
  const loadingMore = useRef(false);
  const slide = useRef(new Animated.Value(0)).current;

  const cell = (width - GAP * (COLS - 1)) / COLS;

  const loadPage = useCallback(async (after?: string) => {
    if (loadingMore.current) return;
    loadingMore.current = true;
    try {
      const page = await CameraRoll.getPhotos({
        first: PAGE,
        after,
        assetType: 'All',
        include: ['filename', 'imageSize', 'playableDuration', 'fileExtension'],
      });
      setPhotos((prev) => (after ? [...prev, ...page.edges] : page.edges));
      setCursor(page.page_info.end_cursor);
      setHasMore(page.page_info.has_next_page);
      setState('ready');
    } catch {
      setState('denied');
    } finally {
      loadingMore.current = false;
    }
  }, []);

  const init = useCallback(async () => {
    setState('loading');
    if (!(await requestGalleryPermission())) {
      setState('denied');
      return;
    }
    loadPage();
  }, [loadPage]);

  useEffect(() => {
    if (visible) {
      setSelected([]);
      setCaption('');
      setCompress(true);
      setExtra([]);
      slide.setValue(0);
      Animated.spring(slide, { toValue: 1, useNativeDriver: true, friction: 9 }).start();
      init();
    }
  }, [visible, init, slide]);

  const all = useMemo(() => [...extra, ...photos.map(toPicked)], [extra, photos]);
  const byUri = useMemo(() => new Map(all.map((p) => [p.uri, p])), [all]);

  const toggle = (uri: string) => {
    setSelected((prev) => (prev.includes(uri) ? prev.filter((u) => u !== uri) : prev.length >= 10 ? prev : [...prev, uri]));
  };

  const openCamera = async () => {
    if (!(await requestCameraPermission())) return;
    const res = await launchCamera({ mediaType: 'mixed', saveToPhotos: false, quality: 0.9, videoQuality: 'high' });
    const a = res.assets?.[0];
    if (!a?.uri) return;
    const isVideo = (a.type || '').startsWith('video');
    const item: PickedMedia = {
      uri: a.uri,
      type: a.type || (isVideo ? 'video/mp4' : 'image/jpeg'),
      name: a.fileName || `camera_${Date.now()}.${isVideo ? 'mp4' : 'jpg'}`,
      width: a.width,
      height: a.height,
      duration: a.duration,
      isVideo,
    };
    setExtra((prev) => [item, ...prev]);
    setSelected((prev) => [...prev, item.uri].slice(0, 10));
  };

  const send = () => {
    const items = selected.map((u) => byUri.get(u)).filter(Boolean) as PickedMedia[];
    if (!items.length) return;
    onSendMedia(items, caption.trim(), !compress);
    onClose();
  };

  const sheetHeight = Math.min(height * 0.72, height - insets.top - 40);

  const renderCell = ({ item, index }: { item: PickedMedia | 'camera'; index: number }) => {
    const style = { width: cell, height: cell, marginRight: (index + 1) % COLS === 0 ? 0 : GAP, marginBottom: GAP };
    if (item === 'camera') {
      return (
        <TouchableOpacity style={[style, styles.cameraCell]} onPress={openCamera} activeOpacity={0.8} accessibilityLabel="Камера">
          <Camera size={30} color={T.onAccent} />
          <Text style={styles.cameraText}>Камера</Text>
        </TouchableOpacity>
      );
    }
    const order = selected.indexOf(item.uri);
    const isSel = order >= 0;
    return (
      <TouchableOpacity style={style} onPress={() => toggle(item.uri)} activeOpacity={0.85}>
        <Image source={{ uri: item.uri }} style={[StyleSheet.absoluteFill, isSel && styles.cellSelected]} resizeMode="cover" />
        {item.isVideo && (
          <View style={styles.durationPill}>
            <Text style={styles.durationText}>{formatDuration(item.duration)}</Text>
          </View>
        )}
        <View style={[styles.check, isSel && styles.checkOn]}>
          {isSel ? <Text style={styles.checkNum}>{order + 1}</Text> : null}
        </View>
      </TouchableOpacity>
    );
  };

  const tabs = [
    { key: 'gallery', label: 'Галерея', icon: <ImageIcon size={22} color={T.onAccent} />, bg: T.info, onPress: () => undefined },
    { key: 'file', label: 'Файл', icon: <FileText size={22} color={T.onAccent} />, bg: T.info, onPress: () => { onClose(); onPickFiles(); } },
    { key: 'poll', label: 'Опрос', icon: <PollGlyph width={20} color={T.onAccent} />, bg: T.warning, onPress: () => { onClose(); onPoll(); } },
    { key: 'note', label: 'Заметка', icon: <NotebookPen size={22} color={T.onAccent} />, bg: C.accent, onPress: () => { onClose(); onNote(); } },
  ];

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior="padding" style={styles.kav} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.sheet,
            { height: sheetHeight + insets.bottom, paddingBottom: insets.bottom },
            { transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [sheetHeight, 0] }) }] },
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>{selected.length ? `Выбрано: ${selected.length}` : 'Недавние'}</Text>
            {selected.length > 0 && (
              <TouchableOpacity onPress={() => setCompress((v) => !v)} style={styles.compressBtn} activeOpacity={0.7}>
                <View style={[styles.box, compress && styles.boxOn]}>{compress && <Check size={12} color={T.onAccent} strokeWidth={3} />}</View>
                <Text style={styles.compressText}>Сжать</Text>
              </TouchableOpacity>
            )}
          </View>

          {state === 'loading' ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={C.accent} />
          ) : state === 'denied' ? (
            <View style={styles.denied}>
              <ImageOff size={40} color={C.textMuted} />
              <Text style={styles.deniedTitle}>Нет доступа к галерее</Text>
              <Text style={styles.deniedText}>Разрешите доступ к фото и видео, чтобы выбирать их прямо здесь, как в Telegram.</Text>
              <View style={styles.deniedActions}>
                <TouchableOpacity style={styles.primaryBtn} onPress={init}>
                  <Text style={styles.primaryBtnText}>Разрешить</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.ghostBtn} onPress={() => Linking.openSettings()}>
                  <Text style={styles.ghostBtnText}>Настройки</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={openCamera} style={{ marginTop: 14 }}>
                <Text style={styles.link}>Снять на камеру</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={['camera' as const, ...all]}
              numColumns={COLS}
              keyExtractor={(it) => (it === 'camera' ? 'camera' : it.uri)}
              renderItem={renderCell}
              onEndReached={() => hasMore && cursor && loadPage(cursor)}
              onEndReachedThreshold={0.6}
              ListEmptyComponent={<Text style={styles.empty}>В галерее пока нет фото и видео</Text>}
              style={{ flex: 1 }}
              extraData={selected}
            />
          )}

          {selected.length > 0 ? (
            <View style={styles.composer}>
              <TextInput
                style={styles.captionInput}
                value={caption}
                onChangeText={setCaption}
                placeholder="Добавить подпись…"
                placeholderTextColor={T.textMuted}
                multiline
                maxLength={4000}
              />
              <TouchableOpacity style={styles.sendBtn} onPress={send} accessibilityLabel="Отправить">
                <SendHorizonal size={20} color={T.onAccent} />
                <View style={styles.sendBadge}>
                  <Text style={styles.sendBadgeText}>{selected.length}</Text>
                </View>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.tabs}>
              {tabs.map((t) => (
                <TouchableOpacity key={t.key} style={styles.tab} onPress={t.onPress} activeOpacity={0.75}>
                  <View style={[styles.tabIcon, { backgroundColor: t.bg }, t.key === 'gallery' && styles.tabIconActive]}>{t.icon}</View>
                  <Text style={[styles.tabLabel, t.key === 'gallery' && { color: C.text, fontWeight: '700' }]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = themed(() => ({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: C.overlay },
  kav: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: T.card,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    overflow: 'hidden',
  },
  handle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: T.surfaceActive, marginTop: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: C.text },
  compressBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  compressText: { fontSize: 14, color: C.text },
  box: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: T.border, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: C.accent, borderColor: C.accent },
  cameraCell: { backgroundColor: '#1F2A24', alignItems: 'center', justifyContent: 'center', gap: 6 },
  cameraText: { color: T.onAccent, fontSize: 12, fontWeight: '600' },
  cellSelected: { transform: [{ scale: 0.86 }], borderRadius: 6 },
  check: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: T.card,
    backgroundColor: 'rgba(0,0,0,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: C.accent, borderColor: T.card },
  checkNum: { color: T.onAccent, fontSize: 12, fontWeight: '800' },
  durationPill: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 8,
    backgroundColor: T.overlay,
  },
  durationText: { color: T.onAccent, fontSize: 11, fontWeight: '600' },
  empty: { textAlign: 'center', color: C.textMuted, marginTop: 30 },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  deniedTitle: { fontSize: 17, fontWeight: '700', color: C.text, marginTop: 12 },
  deniedText: { fontSize: 14, color: C.textMuted, textAlign: 'center', marginTop: 6, lineHeight: 20 },
  deniedActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  primaryBtn: { backgroundColor: C.accent, paddingHorizontal: 20, height: 42, borderRadius: 12, justifyContent: 'center' },
  primaryBtnText: { color: T.onAccent, fontWeight: '700', fontSize: 15 },
  ghostBtn: { backgroundColor: C.accentSoft, paddingHorizontal: 20, height: 42, borderRadius: 12, justifyContent: 'center' },
  ghostBtnText: { color: C.accent, fontWeight: '700', fontSize: 15 },
  link: { color: C.accent, fontWeight: '600', fontSize: 15 },
  tabs: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  tab: { alignItems: 'center', gap: 5, minWidth: 70 },
  tabIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', opacity: 0.92 },
  tabIconActive: { opacity: 1, transform: [{ scale: 1.05 }] },
  tabLabel: { fontSize: 12, color: C.textMuted },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  captionInput: {
    flex: 1,
    minHeight: 42,
    maxHeight: 110,
    borderRadius: 21,
    backgroundColor: T.inputBg,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    color: C.text,
  },
  sendBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  sendBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: T.card,
    borderWidth: 2,
    borderColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBadgeText: { color: C.accent, fontSize: 11, fontWeight: '800' },
}));
