import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
  StatusBar,
  Modal,
  Pressable,
  Linking
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Clipboard from '@react-native-clipboard/clipboard';
import { pick, types, isErrorWithCode, errorCodes } from '@react-native-documents/picker';
import { api, Note, NoteFile } from '../../services/api';
import { signedFileUrl, UploadFile } from '../../services/http';
import ShareToChatModal from '../../components/ShareToChatModal';
import {
  ArrowLeft, Star, Check, PenLine, Calendar, MoreVertical, Copy, CopyPlus, FileDown, Send,
  Trash2, Paperclip, FileText, X
} from 'lucide-react-native';

import { T, themed } from '../../theme/runtime';
import SafeBottom from '../../components/ui/SafeBottom';
// Форматируем дату в локальное YYYY-MM-DD
const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatSize = (bytes?: number | null) => {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
};

type PendingFile = UploadFile & { size?: number | null };

function MenuItem({ icon: Icon, label, onPress, danger }: { icon: any; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={0.7}>
      <Icon size={20} color={danger ? T.danger : T.textPrimary} strokeWidth={2} />
      <Text style={[styles.menuText, danger && styles.menuTextDanger]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function NoteEditorScreen({ route, navigation }: any) {
  const { noteId, noteDate } = route.params || {};

  const [note, setNote] = useState<Note | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [files, setFiles] = useState<NoteFile[]>([]);
  // Файлы, выбранные до первого сохранения новой заметки.
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(!!noteId);
  const [saving, setSaving] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const initialDataRef = useRef({ title: '', content: '', isFavorite: false });
  const titleInputRef = useRef<TextInput>(null);
  // Выход разрешён без вопроса (после удаления, сохранения, «Не сохранять»).
  const leavingRef = useRef(false);

  const applyLoaded = (found: Note) => {
    setNote(found);
    setTitle(found.title);
    setContent(found.content);
    setIsFavorite(found.is_favorite);
    setFiles(found.files || []);
    initialDataRef.current = { title: found.title, content: found.content, isFavorite: found.is_favorite };
  };

  useEffect(() => {
    if (noteId) {
      loadNote();
    } else {
      setLoading(false);
      setTimeout(() => titleInputRef.current?.focus(), 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadNote = async () => {
    try {
      applyLoaded(await api.getNote(noteId));
    } catch (e: any) {
      leavingRef.current = true;
      Alert.alert('Ошибка', e?.status === 404 ? 'Заметка не найдена' : 'Не удалось загрузить заметку');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const hasChanges = (): boolean => {
    return (
      title !== initialDataRef.current.title ||
      content !== initialDataRef.current.content ||
      isFavorite !== initialDataRef.current.isFavorite ||
      pendingFiles.length > 0
    );
  };
  const hasChangesRef = useRef(hasChanges);
  hasChangesRef.current = hasChanges;

  /** Сохраняет заметку (создаёт, если её ещё нет) и догружает выбранные файлы. */
  const persist = async (): Promise<Note | null> => {
    if (!title.trim() && !content.trim()) {
      Alert.alert('Пустая заметка', 'Добавьте заголовок или текст перед сохранением');
      return null;
    }
    setSaving(true);
    try {
      let saved: Note;
      if (note) {
        saved = await api.updateNote(note.id, { title, content, is_favorite: isFavorite });
      } else {
        saved = await api.createNote({
          title,
          content,
          note_date: noteDate || formatLocalDate(new Date()),
          is_favorite: isFavorite,
        });
      }
      let uploaded: NoteFile[] = [];
      if (pendingFiles.length) {
        const failed: string[] = [];
        for (const f of pendingFiles) {
          try {
            uploaded.push(await api.uploadNoteFile(saved.id, f));
          } catch {
            failed.push(f.name);
          }
        }
        setPendingFiles([]);
        if (failed.length) Alert.alert('Не все файлы загружены', failed.join('\n'));
      }
      const merged = { ...saved, files: [...(saved.files || files), ...uploaded] };
      applyLoaded(merged);
      return merged;
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message || 'Не удалось сохранить заметку');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    const wasEditing = !!note;
    const saved = await persist();
    if (!saved) return;
    leavingRef.current = true;
    if (wasEditing) {
      Alert.alert('Сохранено', 'Изменения сохранены', [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } else {
      navigation.goBack();
    }
  };

  // Вопрос о несохранённых изменениях — на любой способ выхода
  // (стрелка, системная «Назад», жест).
  useEffect(() => {
    return navigation.addListener('beforeRemove', (e: any) => {
      if (leavingRef.current || !hasChangesRef.current()) return;
      e.preventDefault();
      Alert.alert(
        'Несохранённые изменения',
        'Вы внесли изменения. Сохранить заметку?',
        [
          {
            text: 'Не сохранять',
            style: 'destructive',
            onPress: () => {
              leavingRef.current = true;
              navigation.dispatch(e.data.action);
            },
          },
          { text: 'Отмена', style: 'cancel' },
          {
            text: 'Сохранить',
            onPress: async () => {
              if (await persistRef.current()) {
                leavingRef.current = true;
                navigation.dispatch(e.data.action);
              }
            },
          },
        ],
        { cancelable: true },
      );
    });
  }, [navigation]);
  const persistRef = useRef(persist);
  persistRef.current = persist;

  const toggleFavorite = () => {
    setIsFavorite(!isFavorite);
  };

  const handleBack = () => navigation.goBack();

  // ---------- Вложения ----------

  const pickFiles = async () => {
    let picked;
    try {
      picked = await pick({ type: [types.allFiles], allowMultiSelection: true });
    } catch (e: any) {
      if (!(isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED)) {
        Alert.alert('Ошибка', 'Не удалось выбрать файл');
      }
      return;
    }
    const chosen: PendingFile[] = picked
      .filter((f) => f.uri)
      .map((f) => ({ uri: f.uri, name: f.name || 'file', type: f.type ?? null, size: f.size ?? null }));
    if (!note) {
      // Новая заметка: файлы загрузятся при сохранении.
      setPendingFiles((prev) => [...prev, ...chosen]);
      return;
    }
    setUploading(true);
    const failed: string[] = [];
    for (const f of chosen) {
      try {
        const uploaded = await api.uploadNoteFile(note.id, f);
        setFiles((prev) => [...prev, uploaded]);
      } catch (e: any) {
        failed.push(`${f.name}: ${e?.message || 'ошибка'}`);
      }
    }
    setUploading(false);
    if (failed.length) Alert.alert('Не все файлы загружены', failed.join('\n'));
  };

  const openFile = async (f: NoteFile) => {
    try {
      await Linking.openURL(await signedFileUrl(f.file_url));
    } catch (e: any) {
      Alert.alert('Не удалось открыть файл', e?.message || '');
    }
  };

  const removeFile = (f: NoteFile) => {
    if (!note) return;
    Alert.alert('Удалить вложение?', f.file_name, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteNoteFile(note.id, f.id);
            setFiles((prev) => prev.filter((x) => x.id !== f.id));
          } catch (e: any) {
            Alert.alert('Ошибка', e?.message || 'Не удалось удалить файл');
          }
        },
      },
    ]);
  };

  // ---------- Действия меню ----------

  /** Для действий на сервере заметка должна быть сохранена в актуальном виде. */
  const ensureSaved = async (): Promise<Note | null> => {
    if (note && !hasChanges()) return note;
    return persist();
  };

  const runAction = async (key: string, fn: () => Promise<void>) => {
    setMenuOpen(false);
    setBusyAction(key);
    try {
      await fn();
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message || 'Не удалось выполнить действие');
    } finally {
      setBusyAction(null);
    }
  };

  const copyText = () => {
    setMenuOpen(false);
    const text = [title.trim(), content.trim()].filter(Boolean).join('\n\n');
    if (!text) {
      Alert.alert('Нечего копировать', 'Заметка пустая');
      return;
    }
    Clipboard.setString(text);
    Alert.alert('Скопировано', 'Текст заметки в буфере обмена');
  };

  const duplicate = () =>
    runAction('duplicate', async () => {
      const saved = await ensureSaved();
      if (!saved) return;
      const copy = await api.duplicateNote(saved.id);
      leavingRef.current = true;
      navigation.replace('NoteEditor', { noteId: copy.id, noteDate: copy.note_date });
    });

  const exportPdf = () =>
    runAction('pdf', async () => {
      const saved = await ensureSaved();
      if (!saved) return;
      await Linking.openURL(await api.getNotePdfUrl(saved.id));
    });

  const openShare = () =>
    runAction('share', async () => {
      const saved = await ensureSaved();
      if (saved) setShareOpen(true);
    });

  const shareToChat = async (chatId: number, comment: string) => {
    if (!note) return;
    try {
      await api.shareNote(note.id, { chat_id: chatId, comment: comment || undefined });
      setShareOpen(false);
      Alert.alert('Отправлено', 'Получатель сможет принять заметку к себе.');
    } catch (e: any) {
      Alert.alert('Не удалось отправить', e?.message || '');
    }
  };

  const deleteNote = () => {
    setMenuOpen(false);
    if (!note) return;
    Alert.alert('Удалить заметку?', 'Заметка и её вложения будут удалены без возможности восстановления.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () =>
          runAction('delete', async () => {
            await api.deleteNote(note.id);
            leavingRef.current = true;
            navigation.goBack();
          }),
      },
    ]);
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr + 'T00:00:00');
    const months = [
      'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
    ];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={T.accent} />
      </SafeAreaView>
    );
  }

  const isEditing = !!note;
  const saveButtonEnabled = !saving && (title.trim().length > 0 || content.trim().length > 0);
  const currentNoteDate = note
    ? formatDate(note.note_date)
    : formatDate(noteDate || formatLocalDate(new Date()));
  const canAct = title.trim().length > 0 || content.trim().length > 0;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={T.statusBar} backgroundColor="transparent" translucent />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        {/* Header row */}
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn} activeOpacity={0.85} accessibilityLabel="Назад">
            <ArrowLeft size={22} color={T.textPrimary} strokeWidth={2.2} />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            {busyAction ? (
              <ActivityIndicator size="small" color={T.accent} />
            ) : (
              isEditing && hasChanges() && <View style={styles.unsavedDot} />
            )}
          </View>

          <TouchableOpacity
            onPress={toggleFavorite}
            activeOpacity={0.85}
            style={[styles.iconBtn, isFavorite && styles.iconBtnActiveFav]}
            accessibilityLabel="Избранное"
          >
            <Star
              size={20}
              color={isFavorite ? T.onAccent : T.warning}
              fill={isFavorite ? T.onAccent : T.warning}
              strokeWidth={2.2}
            />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setMenuOpen(true)}
            activeOpacity={0.85}
            style={[styles.iconBtn, { marginLeft: 10 }, !canAct && { opacity: 0.4 }]}
            disabled={!canAct}
            accessibilityLabel="Действия с заметкой"
          >
            <MoreVertical size={20} color={T.textPrimary} strokeWidth={2.2} />
          </TouchableOpacity>
        </View>

        {/* Big premium title */}
        <View style={styles.heroHeader}>
          <Text style={styles.bigTitle}>
            {isEditing ? 'РЕДАКТИРОВАНИЕ' : 'НОВАЯ ЗАМЕТКА'}
          </Text>
          <View style={styles.dateRow}>
            <Calendar size={14} color={T.textSecondary} strokeWidth={2.2} />
            <Text style={styles.bigSubtitle}>{currentNoteDate}</Text>
          </View>
        </View>

        {/* Content */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TextInput
            ref={titleInputRef}
            style={styles.titleInput}
            value={title}
            onChangeText={setTitle}
            placeholder="Заголовок заметки"
            placeholderTextColor={T.textMuted}
            multiline={false}
            returnKeyType="next"
            maxLength={255}
          />

          <View style={styles.divider} />

          <View style={styles.contentRow}>
            <PenLine size={18} color={T.textMuted} strokeWidth={2} style={{ marginTop: 4 }} />
            <TextInput
              style={styles.contentInput}
              value={content}
              onChangeText={setContent}
              placeholder="Напишите свои мысли..."
              placeholderTextColor={T.textMuted}
              multiline
              textAlignVertical="top"
              scrollEnabled={false}
            />
          </View>

          {/* Вложения */}
          <View style={styles.attachSection}>
            <View style={styles.attachHeader}>
              <Text style={styles.attachTitle}>Вложения{files.length + pendingFiles.length ? ` · ${files.length + pendingFiles.length}` : ''}</Text>
              <TouchableOpacity onPress={pickFiles} style={styles.attachBtn} disabled={uploading} activeOpacity={0.8}>
                {uploading ? (
                  <ActivityIndicator size="small" color={T.accent} />
                ) : (
                  <>
                    <Paperclip size={16} color={T.accent} strokeWidth={2.2} />
                    <Text style={styles.attachBtnText}>Прикрепить</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
            {files.map((f) => (
              <TouchableOpacity key={f.id} style={styles.fileRow} onPress={() => openFile(f)} onLongPress={() => removeFile(f)}>
                <FileText size={18} color={T.accent} strokeWidth={2} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.fileName} numberOfLines={1}>{f.file_name}</Text>
                  {f.file_size ? <Text style={styles.fileMeta}>{formatSize(f.file_size)}</Text> : null}
                </View>
                <TouchableOpacity onPress={() => removeFile(f)} hitSlop={10} accessibilityLabel="Удалить вложение">
                  <X size={18} color={T.textMuted} />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
            {pendingFiles.map((f, i) => (
              <View key={`${f.uri}-${i}`} style={[styles.fileRow, { opacity: 0.7 }]}>
                <FileText size={18} color={T.textSecondary} strokeWidth={2} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.fileName} numberOfLines={1}>{f.name}</Text>
                  <Text style={styles.fileMeta}>Загрузится при сохранении{f.size ? ` · ${formatSize(f.size)}` : ''}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setPendingFiles((prev) => prev.filter((_, j) => j !== i))}
                  hitSlop={10}
                  accessibilityLabel="Убрать файл"
                >
                  <X size={18} color={T.textMuted} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </ScrollView>

        {/* Floating Save button */}
        <TouchableOpacity
          onPress={handleSave}
          disabled={!saveButtonEnabled}
          activeOpacity={0.85}
          style={[
            styles.fab,
            !saveButtonEnabled && styles.fabDisabled,
          ]}
        >
          {saving ? (
            <ActivityIndicator size="small" color={T.onAccent} />
          ) : (
            <>
              <Check size={22} color={T.onAccent} strokeWidth={2.8} />
              <Text style={styles.fabText}>
                {isEditing ? 'Сохранить' : 'Создать'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </KeyboardAvoidingView>

      {/* Меню действий */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)}>
          <Pressable style={styles.menuSheet}>
            <MenuItem icon={Copy} label="Скопировать текст" onPress={copyText} />
            <MenuItem icon={CopyPlus} label="Создать копию заметки" onPress={duplicate} />
            <MenuItem icon={FileDown} label="Экспорт в PDF" onPress={exportPdf} />
            <MenuItem icon={Send} label="Отправить в чат" onPress={openShare} />
            {isEditing && <MenuItem icon={Trash2} label="Удалить заметку" onPress={deleteNote} danger />}
            <SafeBottom />
          </Pressable>
        </Pressable>
      </Modal>

      <ShareToChatModal
        visible={shareOpen}
        title="Отправить заметку"
        onClose={() => setShareOpen(false)}
        onSend={shareToChat}
      />
    </SafeAreaView>
  );
}

const styles = themed(() => ({
  container: { flex: 1, backgroundColor: T.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: T.background },

  // ===== HEADER ROW =====
  headerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 12,
  },
  backBtn: {
    width: 44, height: 44, borderRadius: 14, backgroundColor: T.card,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: T.shadow, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.05, shadowRadius: 24, elevation: 4,
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  unsavedDot: {
    width: 10, height: 10, borderRadius: 5, backgroundColor: T.accent,
  },
  iconBtn: {
    width: 44, height: 44, borderRadius: 14, backgroundColor: T.card,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: T.shadow, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.05, shadowRadius: 24, elevation: 4,
  },
  iconBtnActiveFav: { backgroundColor: T.warning },

  // ===== HERO HEADER =====
  heroHeader: { paddingHorizontal: 24, marginBottom: 20, paddingTop: 8 },
  bigTitle: {
    fontFamily: Platform.OS === 'ios' ? 'Bebas Neue' : 'sans-serif-condensed',
    fontSize: 40, fontWeight: '900', color: T.textPrimary, letterSpacing: -0.5, lineHeight: 44,
  },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  bigSubtitle: {
    fontSize: 14, color: T.textSecondary, fontWeight: '500',
  },

  // ===== CONTENT =====
  scrollView: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 120 },
  titleInput: {
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 16,
    padding: 0,
    color: T.textPrimary,
    fontFamily: Platform.OS === 'ios' ? 'Montserrat' : 'sans-serif-medium',
  },
  divider: {
    height: 1,
    backgroundColor: T.surfaceActive,
    marginBottom: 20,
  },
  contentRow: { flexDirection: 'row' },
  contentInput: {
    flex: 1,
    fontSize: 17,
    lineHeight: 26,
    minHeight: 300,
    padding: 0,
    paddingLeft: 12,
    color: T.textPrimary,
    fontFamily: Platform.OS === 'ios' ? 'Montserrat' : 'sans-serif',
    fontWeight: '500',
  },

  // ===== FAB (Save button) =====
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 22,
    backgroundColor: T.accent,
    shadowColor: T.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  fabDisabled: { backgroundColor: T.disabled, shadowOpacity: 0.1 },
  fabText: {
    fontSize: 15,
    fontWeight: '700',
    color: T.onAccent,
    fontFamily: Platform.OS === 'ios' ? 'Montserrat' : 'sans-serif-medium',
  },

  // ===== ВЛОЖЕНИЯ =====
  attachSection: { marginTop: 28 },
  attachHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  attachTitle: { fontSize: 13, fontWeight: '700', color: T.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  attachBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36,
    paddingHorizontal: 12, borderRadius: 12, backgroundColor: T.accentMuted,
  },
  attachBtnText: { color: T.accent, fontWeight: '700', fontSize: 14 },
  fileRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, marginBottom: 8,
    borderRadius: 14, backgroundColor: T.card, borderWidth: 1, borderColor: T.border,
  },
  fileName: { fontSize: 15, color: T.textPrimary, fontWeight: '500' },
  fileMeta: { fontSize: 12, color: T.textMuted, marginTop: 2 },

  // ===== МЕНЮ =====
  menuBackdrop: { flex: 1, backgroundColor: T.overlay, justifyContent: 'flex-end' },
  menuSheet: {
    backgroundColor: T.card, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingTop: 10, paddingBottom: 28,
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 24, paddingVertical: 15 },
  menuText: { fontSize: 16, color: T.textPrimary, fontWeight: '500' },
  menuTextDanger: { color: T.danger }
}));
