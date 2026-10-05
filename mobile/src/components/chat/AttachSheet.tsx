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
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraRoll, PhotoIdentifier } from '@react-native-camera-roll/camera-roll';
import { launchCamera } from 'react-native-image-picker';
import { pick, types, isErrorWithCode, errorCodes } from '@react-native-documents/picker';
import {
  Camera,
  Image as ImageIcon,
  FileText,
  NotebookPen,
  SendHorizonal,
  Check,
  ImageOff,
  MoreVertical,
  ChevronLeft,
  X,
  Plus,
  Play,
  FolderOpen,
  Images,
} from 'lucide-react-native';
import { PollGlyph } from '../PollBubble';
import { C, fileBadge, formatDuration, formatSize, plural, requestCameraPermission, requestGalleryPermission } from './chatUtils';

import { T, themed } from '../../theme/runtime';
import { withAlpha } from '../../theme/palettes';

/**
 * «Скрепка» как в Telegram.
 *
 * Галерея: сетка последних фото и видео; кружок в углу — выбрать (с номером
 * порядка), нажатие на само фото — открыть на весь экран. Когда что-то
 * выбрано, внизу поле подписи и кнопка с числом выбранного; в «⋮» —
 * «Группировать» (альбомом) и «Без сжатия» (как файлы).
 *
 * Файлы: выбранные документы сначала попадают в список — их можно убрать,
 * добавить ещё и подписать. Отправка только по кнопке.
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

export interface PickedFile {
  uri: string;
  name: string;
  type?: string | null;
  size?: number | null;
}

export interface MediaSendOptions {
  /** Несколько фото/видео — одним альбомом (по 10, как в Telegram). */
  group: boolean;
  /** Без сжатия: отправить как файлы. */
  asFile: boolean;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onSendMedia: (items: PickedMedia[], caption: string, opts: MediaSendOptions) => void;
  onSendFiles: (files: PickedFile[], caption: string, opts: { group: boolean }) => void;
  onPoll: () => void;
  onNote: () => void;
}

const PAGE = 60;
const COLS = 3;
const GAP = 2;
const MAX_SELECTED = 100;
const MAX_FILE_BYTES = 200 * 1024 * 1024;

type GalleryState = 'loading' | 'ready' | 'denied';
type Mode = 'gallery' | 'files';

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

export default function AttachSheet({ visible, onClose, onSendMedia, onSendFiles, onPoll, onNote }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('gallery');
  const [state, setState] = useState<GalleryState>('loading');
  const [photos, setPhotos] = useState<PhotoIdentifier[]>([]);
  const [extra, setExtra] = useState<PickedMedia[]>([]); // снятые камерой
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(true);
  const [selected, setSelected] = useState<string[]>([]); // uri в порядке выбора
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [caption, setCaption] = useState('');
  const [compress, setCompress] = useState(true);
  const [group, setGroup] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);
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
      setMode('gallery');
      setSelected([]);
      setFiles([]);
      setCaption('');
      setCompress(true);
      setGroup(true);
      setExtra([]);
      setMenuOpen(false);
      setPreview(null);
      slide.setValue(0);
      Animated.spring(slide, { toValue: 1, useNativeDriver: true, friction: 9 }).start();
      init();
    }
  }, [visible, init, slide]);

  const all = useMemo(() => [...extra, ...photos.map(toPicked)], [extra, photos]);
  const byUri = useMemo(() => new Map(all.map((p) => [p.uri, p])), [all]);

  const toggle = (uri: string) => {
    setSelected((prev) => {
      if (prev.includes(uri)) return prev.filter((u) => u !== uri);
      if (prev.length >= MAX_SELECTED) {
        Alert.alert('Слишком много', `За раз можно отправить до ${MAX_SELECTED} фото и видео`);
        return prev;
      }
      return [...prev, uri];
    });
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
    setSelected((prev) => [...prev, item.uri]);
  };

  // ===== Файлы =====
  const pickDocuments = async () => {
    try {
      const res = await pick({ type: [types.allFiles], allowMultiSelection: true });
      const tooBig = res.filter((f) => (f.size || 0) > MAX_FILE_BYTES);
      const ok = res
        .filter((f) => f.uri && (f.size || 0) <= MAX_FILE_BYTES)
        .map((f) => ({ uri: f.uri, name: f.name || 'Файл', type: f.type, size: f.size }));
      if (tooBig.length) Alert.alert('Слишком большой файл', `Файлы больше 200 МБ не отправляются: ${tooBig.map((f) => f.name).join(', ')}`);
      setFiles((prev) => {
        const seen = new Set(prev.map((f) => f.uri));
        return [...prev, ...ok.filter((f) => !seen.has(f.uri))];
      });
    } catch (err: any) {
      if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) return;
      Alert.alert('Не удалось выбрать файл', err?.message || '');
    }
  };

  const openFiles = () => {
    setMode('files');
    setMenuOpen(false);
    if (!files.length) pickDocuments();
  };

  // ===== Отправка =====
  const sendSelectedMedia = (extraUri?: string) => {
    const uris = selected.length ? selected : extraUri ? [extraUri] : [];
    const items = uris.map((u) => byUri.get(u)).filter(Boolean) as PickedMedia[];
    if (!items.length) return;
    onSendMedia(items, caption.trim(), { group, asFile: !compress });
    onClose();
  };

  const sendFiles = () => {
    if (!files.length) return;
    onSendFiles(files, caption.trim(), { group });
    onClose();
  };

  const sheetHeight = Math.min(height * 0.74, height - insets.top - 40);
  const count = mode === 'files' ? files.length : selected.length;

  // ===== Галерея =====
  const renderCell = ({ item, index }: { item: PickedMedia | 'camera'; index: number }) => {
    const style = { width: cell, height: cell, marginRight: (index + 1) % COLS === 0 ? 0 : GAP, marginBottom: GAP };
    if (item === 'camera') {
      return (
        <TouchableOpacity style={[style, styles.cameraCell]} onPress={openCamera} activeOpacity={0.8} accessibilityLabel="Камера">
          <Camera size={30} color="#FFFFFF" />
          <Text style={styles.cameraText}>Камера</Text>
        </TouchableOpacity>
      );
    }
    const order = selected.indexOf(item.uri);
    const isSel = order >= 0;
    return (
      <View style={style}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          onPress={() => setPreview(all.findIndex((x) => x.uri === item.uri))}
          activeOpacity={0.85}
          accessibilityLabel={item.isVideo ? 'Открыть видео' : 'Открыть фото'}
        >
          <Image source={{ uri: item.uri }} style={[StyleSheet.absoluteFill, isSel && styles.cellSelected]} resizeMode="cover" />
          {item.isVideo && (
            <View style={styles.durationPill}>
              <Play size={9} color="#FFFFFF" fill="#FFFFFF" />
              <Text style={styles.durationText}>{formatDuration(item.duration)}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.checkHit}
          onPress={() => toggle(item.uri)}
          hitSlop={8}
          activeOpacity={0.7}
          accessibilityLabel={isSel ? 'Убрать из выбранных' : 'Выбрать'}
        >
          <View style={[styles.check, isSel && styles.checkOn]}>{isSel ? <Text style={styles.checkNum}>{order + 1}</Text> : null}</View>
        </TouchableOpacity>
      </View>
    );
  };

  // ===== Файлы =====
  const renderFile = ({ item }: { item: PickedFile }) => {
    const badge = fileBadge(item.name);
    return (
      <View style={styles.fileRow}>
        <View style={[styles.fileBadge, { backgroundColor: badge.color }]}>
          {badge.ext ? <Text style={styles.fileBadgeText}>{badge.ext}</Text> : <FileText size={20} color="#FFFFFF" />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.fileName} numberOfLines={2}>
            {item.name}
          </Text>
          {item.size ? <Text style={styles.fileMeta}>{formatSize(item.size)}</Text> : null}
        </View>
        <TouchableOpacity
          onPress={() => setFiles((prev) => prev.filter((f) => f.uri !== item.uri))}
          style={styles.fileRemove}
          hitSlop={8}
          accessibilityLabel={`Убрать ${item.name}`}
        >
          <X size={18} color={T.textSecondary} />
        </TouchableOpacity>
      </View>
    );
  };

  const tabs = [
    { key: 'gallery', label: 'Галерея', icon: <ImageIcon size={22} color="#FFFFFF" />, bg: T.info, onPress: () => setMode('gallery') },
    { key: 'files', label: 'Файл', icon: <FileText size={22} color="#FFFFFF" />, bg: '#3E7BFA', onPress: openFiles },
    { key: 'poll', label: 'Опрос', icon: <PollGlyph width={20} color="#FFFFFF" />, bg: T.warning, onPress: () => { onClose(); onPoll(); } },
    { key: 'note', label: 'Заметка', icon: <NotebookPen size={22} color="#FFFFFF" />, bg: C.accent, onPress: () => { onClose(); onNote(); } },
  ];

  if (!visible) return null;

  const headerTitle =
    mode === 'files'
      ? files.length
        ? `${files.length} ${plural(files.length, ['файл', 'файла', 'файлов'])}`
        : 'Файлы'
      : selected.length
        ? `Выбрано: ${selected.length}`
        : 'Недавние';

  const composer = (
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
      <TouchableOpacity
        style={styles.sendBtn}
        onPress={mode === 'files' ? sendFiles : () => sendSelectedMedia()}
        accessibilityLabel={`Отправить: ${count}`}
      >
        <SendHorizonal size={20} color="#FFFFFF" />
        <View style={styles.sendBadge}>
          <Text style={styles.sendBadgeText}>{count}</Text>
        </View>
      </TouchableOpacity>
    </View>
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => (preview !== null ? setPreview(null) : onClose())} statusBarTranslucent>
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
            {mode === 'files' && (
              <TouchableOpacity onPress={() => setMode('gallery')} style={styles.headerIcon} accessibilityLabel="Назад к галерее">
                <ChevronLeft size={24} color={T.textPrimary} />
              </TouchableOpacity>
            )}
            <Text style={styles.headerTitle}>{headerTitle}</Text>
            {count > 0 && (
              <TouchableOpacity onPress={() => setMenuOpen((v) => !v)} style={styles.headerIcon} accessibilityLabel="Параметры отправки">
                <MoreVertical size={22} color={T.textPrimary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Параметры отправки (как «⋮» в Telegram) */}
          {menuOpen && count > 0 && (
            <View style={styles.menu}>
              {count > 1 && (
                <MenuToggle
                  label={mode === 'files' ? 'Группировать файлы' : 'Группировать в альбом'}
                  hint={mode === 'files' ? 'Одним сообщением со списком' : 'До 10 в одном альбоме'}
                  value={group}
                  onPress={() => setGroup((v) => !v)}
                />
              )}
              {mode === 'gallery' && (
                <MenuToggle label="Без сжатия" hint="Отправить как файлы, в исходном качестве" value={!compress} onPress={() => setCompress((v) => !v)} />
              )}
            </View>
          )}

          {mode === 'gallery' ? (
            state === 'loading' ? (
              <ActivityIndicator style={{ marginTop: 40 }} color={C.accent} />
            ) : state === 'denied' ? (
              <View style={styles.denied}>
                <ImageOff size={40} color={C.textMuted} />
                <Text style={styles.deniedTitle}>Нет доступа к галерее</Text>
                <Text style={styles.deniedText}>Разрешите доступ к фото и видео, чтобы выбирать их прямо здесь.</Text>
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
            )
          ) : (
            <FlatList
              data={files}
              keyExtractor={(f) => f.uri}
              renderItem={renderFile}
              style={{ flex: 1 }}
              contentContainerStyle={files.length ? styles.filesList : styles.filesEmpty}
              ListEmptyComponent={
                <View style={styles.filesEmptyInner}>
                  <TouchableOpacity style={styles.bigAction} onPress={pickDocuments} activeOpacity={0.8}>
                    <View style={[styles.bigActionIcon, { backgroundColor: '#3E7BFA' }]}>
                      <FolderOpen size={22} color="#FFFFFF" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.bigActionTitle}>Выбрать файлы</Text>
                      <Text style={styles.bigActionHint}>Документы, таблицы, архивы — до 200 МБ</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.bigAction}
                    onPress={() => {
                      setCompress(false);
                      setMode('gallery');
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.bigActionIcon, { backgroundColor: T.info }]}>
                      <Images size={22} color="#FFFFFF" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.bigActionTitle}>Фото и видео без сжатия</Text>
                      <Text style={styles.bigActionHint}>Из галереи, в исходном качестве</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              }
              ListFooterComponent={
                files.length ? (
                  <TouchableOpacity style={styles.addMore} onPress={pickDocuments} activeOpacity={0.7}>
                    <Plus size={18} color={C.accent} />
                    <Text style={styles.addMoreText}>Добавить файлы</Text>
                  </TouchableOpacity>
                ) : null
              }
            />
          )}

          {mode === 'gallery' && !compress && selected.length > 0 && (
            <Text style={styles.asFileHint}>Будут отправлены как файлы, без сжатия</Text>
          )}

          {count > 0 ? (
            composer
          ) : (
            <View style={styles.tabs}>
              {tabs.map((t) => {
                const active = t.key === mode;
                return (
                  <TouchableOpacity key={t.key} style={styles.tab} onPress={t.onPress} activeOpacity={0.75}>
                    <View style={[styles.tabIcon, { backgroundColor: t.bg }, active && styles.tabIconActive]}>{t.icon}</View>
                    <Text style={[styles.tabLabel, active && { color: C.text, fontWeight: '700' }]}>{t.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </Animated.View>
      </KeyboardAvoidingView>

      {preview !== null && (
        <MediaPreview
          items={all}
          index={preview}
          selected={selected}
          caption={caption}
          onCaption={setCaption}
          onToggle={toggle}
          onClose={() => setPreview(null)}
          onSend={(uri) => sendSelectedMedia(uri)}
        />
      )}
    </Modal>
  );
}

function MenuToggle({ label, hint, value, onPress }: { label: string; hint: string; value: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.menuRow} onPress={onPress} activeOpacity={0.7} accessibilityRole="switch" accessibilityState={{ checked: value }}>
      <View style={{ flex: 1 }}>
        <Text style={styles.menuLabel}>{label}</Text>
        <Text style={styles.menuHint}>{hint}</Text>
      </View>
      <View style={[styles.box, value && styles.boxOn]}>{value && <Check size={13} color="#FFFFFF" strokeWidth={3} />}</View>
    </TouchableOpacity>
  );
}

/** Полноэкранный просмотр перед отправкой: листание, выбор, подпись. */
function MediaPreview({
  items,
  index,
  selected,
  caption,
  onCaption,
  onToggle,
  onClose,
  onSend,
}: {
  items: PickedMedia[];
  index: number;
  selected: string[];
  caption: string;
  onCaption: (v: string) => void;
  onToggle: (uri: string) => void;
  onClose: () => void;
  onSend: (currentUri: string) => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState(index);
  const item = items[current];
  const order = item ? selected.indexOf(item.uri) : -1;
  const count = selected.length || 1;

  return (
    <View style={[StyleSheet.absoluteFill, styles.previewRoot]}>
      <FlatList
        data={items}
        horizontal
        pagingEnabled
        initialScrollIndex={index}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        keyExtractor={(m) => m.uri}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setCurrent(Math.round(e.nativeEvent.contentOffset.x / width))}
        windowSize={3}
        renderItem={({ item: m }) => (
          <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
            <Image source={{ uri: m.uri }} style={{ width, height: height * 0.78 }} resizeMode="contain" />
            {m.isVideo && (
              <View style={styles.previewPlay}>
                <Play size={28} color="#FFFFFF" fill="#FFFFFF" />
              </View>
            )}
          </View>
        )}
      />
      <View style={[styles.previewTop, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity onPress={onClose} style={styles.previewBtn} accessibilityLabel="Назад">
          <ChevronLeft size={26} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.previewCounter}>
          {current + 1} из {items.length}
        </Text>
        {item && (
          <TouchableOpacity onPress={() => onToggle(item.uri)} style={styles.previewBtn} accessibilityLabel={order >= 0 ? 'Убрать из выбранных' : 'Выбрать'}>
            <View style={[styles.check, styles.previewCheck, order >= 0 && styles.checkOn]}>
              {order >= 0 ? <Text style={styles.checkNum}>{order + 1}</Text> : null}
            </View>
          </TouchableOpacity>
        )}
      </View>
      <KeyboardAvoidingView behavior="padding" style={styles.previewBottomWrap} pointerEvents="box-none">
        <View style={[styles.previewBottom, { paddingBottom: insets.bottom + 10 }]}>
          <TextInput
            style={styles.previewCaption}
            value={caption}
            onChangeText={onCaption}
            placeholder="Добавить подпись…"
            placeholderTextColor="rgba(255,255,255,0.55)"
            multiline
            maxLength={4000}
          />
          <TouchableOpacity style={styles.sendBtn} onPress={() => item && onSend(item.uri)} accessibilityLabel={`Отправить: ${count}`}>
            <SendHorizonal size={20} color="#FFFFFF" />
            <View style={styles.sendBadge}>
              <Text style={styles.sendBadgeText}>{count}</Text>
            </View>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
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
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, minHeight: 48 },
  headerIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: C.text, paddingHorizontal: 4 },
  menu: {
    position: 'absolute',
    top: 52,
    right: 12,
    zIndex: 10,
    width: 270,
    borderRadius: 14,
    backgroundColor: T.card,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.border,
    shadowColor: T.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  menuLabel: { fontSize: 15, color: T.textPrimary, fontWeight: '600' },
  menuHint: { fontSize: 12, color: T.textSecondary, marginTop: 1 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: T.border, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: C.accent, borderColor: C.accent },
  cameraCell: { backgroundColor: '#1F2A24', alignItems: 'center', justifyContent: 'center', gap: 6 },
  cameraText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  cellSelected: { transform: [{ scale: 0.86 }], borderRadius: 6 },
  checkHit: { position: 'absolute', top: 0, right: 0, padding: 6 },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: C.accent, borderColor: '#FFFFFF' },
  checkNum: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  durationPill: {
    position: 'absolute',
    bottom: 5,
    left: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  durationText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },
  empty: { textAlign: 'center', color: C.textMuted, marginTop: 30 },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  deniedTitle: { fontSize: 17, fontWeight: '700', color: C.text, marginTop: 12 },
  deniedText: { fontSize: 14, color: C.textMuted, textAlign: 'center', marginTop: 6, lineHeight: 20 },
  deniedActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  primaryBtn: { backgroundColor: C.accent, paddingHorizontal: 20, height: 42, borderRadius: 12, justifyContent: 'center' },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  ghostBtn: { backgroundColor: C.accentSoft, paddingHorizontal: 20, height: 42, borderRadius: 12, justifyContent: 'center' },
  ghostBtnText: { color: C.accent, fontWeight: '700', fontSize: 15 },
  link: { color: C.accent, fontWeight: '600', fontSize: 15 },
  filesList: { paddingVertical: 6 },
  filesEmpty: { flexGrow: 1 },
  filesEmptyInner: { padding: 16, gap: 10 },
  bigAction: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 16, backgroundColor: T.inputBg },
  bigActionIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  bigActionTitle: { fontSize: 15, fontWeight: '700', color: T.textPrimary },
  bigActionHint: { fontSize: 12, color: T.textSecondary, marginTop: 2 },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 9 },
  fileBadge: { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  fileBadgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
  fileName: { fontSize: 15, fontWeight: '600', color: T.textPrimary },
  fileMeta: { fontSize: 12, color: T.textSecondary, marginTop: 2 },
  fileRemove: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: T.inputBg },
  addMore: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 14 },
  addMoreText: { color: C.accent, fontSize: 15, fontWeight: '600' },
  asFileHint: { fontSize: 12, color: T.textSecondary, textAlign: 'center', paddingTop: 6 },
  tabs: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  tab: { alignItems: 'center', gap: 5, minWidth: 70 },
  tabIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', opacity: 0.85 },
  tabIconActive: { opacity: 1, transform: [{ scale: 1.06 }] },
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
  // Полноэкранный предпросмотр
  previewRoot: { backgroundColor: '#000000' },
  previewPlay: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingBottom: 10,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  previewBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  previewCounter: { flex: 1, textAlign: 'center', color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  previewCheck: { width: 28, height: 28, borderRadius: 14 },
  previewBottomWrap: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end' },
  previewBottom: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  previewCaption: {
    flex: 1,
    minHeight: 42,
    maxHeight: 110,
    borderRadius: 21,
    backgroundColor: withAlpha('#FFFFFF', 0.12),
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    color: '#FFFFFF',
  },
}));
