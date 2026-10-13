import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator, Alert, RefreshControl, Modal, TextInput, KeyboardAvoidingView, Pressable, ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { pick, types, isErrorWithCode, errorCodes } from '@react-native-documents/picker';
import { ChevronLeft, FileText, Upload, Trash2, RotateCcw, Clock, CheckCircle2, AlertCircle, Loader, Tag, X } from 'lucide-react-native';
import { api, can, KnowledgeDocument, KnowledgeStats } from '../../services/api';
import { formatSize, plural } from '../../components/chat/chatUtils';
import { showToast } from '../../components/ui/toast';
import { T, themed } from '../../theme/runtime';
import { withAlpha } from '../../theme/palettes';

/**
 * Документы базы знаний — как на сайте: из них ассистент берёт ответы.
 * Видят все; загружают, удаляют и обрабатывают повторно те, у кого есть
 * функция «База знаний» (директор, руководители, кому её включили).
 */

type Filter = 'all' | 'completed' | 'progress' | 'failed';

/** Цвета берутся в момент отрисовки — при смене темы они тоже меняются. */
const statusOf = (s: KnowledgeDocument['status']): { label: string; color: string; Icon: any } => {
  switch (s) {
    case 'processing':
      return { label: 'Обрабатывается', color: T.info, Icon: Loader };
    case 'completed':
      return { label: 'Готов', color: T.success, Icon: CheckCircle2 };
    case 'failed':
      return { label: 'Ошибка', color: T.danger, Icon: AlertCircle };
    default:
      return { label: 'В очереди', color: T.textSecondary, Icon: Clock };
  }
};

const MAX_BYTES = 20 * 1024 * 1024;
const EXT = ['pdf', 'docx', 'doc', 'txt', 'md'];

export default function KnowledgeDocumentsScreen({ navigation }: any) {
  const [docs, setDocs] = useState<KnowledgeDocument[] | null>(null);
  const [stats, setStats] = useState<KnowledgeStats | null>(null);
  const [admin, setAdmin] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [tag, setTag] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const me = await api.getCurrentUser();
      const isAdmin = can(me, 'knowledge_manage');
      setAdmin(isAdmin);
      const [list, st] = await Promise.all([api.getKnowledgeDocuments(), isAdmin ? api.getKnowledgeStats().catch(() => null) : Promise.resolve(null)]);
      setDocs(list);
      setStats(st);
    } catch (e: any) {
      setDocs((prev) => prev ?? []);
      Alert.alert('Не удалось загрузить документы', e?.message || '');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Пока что-то обрабатывается — обновляем список сами.
  useEffect(() => {
    if (!docs?.some((d) => d.status === 'pending' || d.status === 'processing')) return;
    const t = setTimeout(load, 5000);
    return () => clearTimeout(t);
  }, [docs, load]);

  const shown = useMemo(() => {
    let list = docs || [];
    if (filter === 'completed') list = list.filter((d) => d.status === 'completed');
    if (filter === 'progress') list = list.filter((d) => d.status === 'pending' || d.status === 'processing');
    if (filter === 'failed') list = list.filter((d) => d.status === 'failed');
    if (tag) list = list.filter((d) => d.tags?.includes(tag));
    return list;
  }, [docs, filter, tag]);

  const failed = docs?.filter((d) => d.status === 'failed').length ?? 0;
  const inProgress = docs?.filter((d) => d.status === 'pending' || d.status === 'processing').length ?? 0;
  const total = docs?.length ?? 0;

  const remove = (d: KnowledgeDocument) =>
    Alert.alert(`Удалить «${d.original_name}»?`, 'Ассистент перестанет опираться на этот документ.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteKnowledgeDocument(d.id);
            setDocs((prev) => (prev || []).filter((x) => x.id !== d.id));
            showToast('Документ удалён');
          } catch (e: any) {
            Alert.alert('Не удалось удалить', e?.message || '');
          }
        },
      },
    ]);

  const reprocess = async (d: KnowledgeDocument) => {
    try {
      await api.reprocessKnowledgeDocument(d.id);
      showToast('Документ поставлен в очередь на обработку');
      load();
    } catch (e: any) {
      Alert.alert('Не удалось запустить обработку', e?.message || '');
    }
  };

  const subtitle = stats
    ? `${total} ${plural(total, ['документ', 'документа', 'документов'])} · ${stats.total_chunks} ${plural(stats.total_chunks, ['фрагмент', 'фрагмента', 'фрагментов'])} · ${stats.messages_by_role?.user ?? 0} ${plural(stats.messages_by_role?.user ?? 0, ['вопрос', 'вопроса', 'вопросов'])}`
    : `${total} ${plural(total, ['документ', 'документа', 'документов'])}`;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn} accessibilityLabel="Назад">
          <ChevronLeft size={26} color={T.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Документы</Text>
          {docs ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {admin ? (
          <TouchableOpacity style={styles.uploadBtn} onPress={() => setUploadOpen(true)} activeOpacity={0.85}>
            <Upload size={17} color={T.onAccent} />
            <Text style={styles.uploadText}>Загрузить</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {total > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={{ flexGrow: 0 }}>
          {(
            [
              ['all', 'Все'],
              ['completed', 'Готовы'],
              ['progress', `В обработке${inProgress ? ` ${inProgress}` : ''}`],
              ['failed', `Ошибки${failed ? ` ${failed}` : ''}`],
            ] as [Filter, string][]
          ).map(([k, label]) => (
            <TouchableOpacity key={k} style={[styles.chip, filter === k && styles.chipOn]} onPress={() => setFilter(k)}>
              <Text style={[styles.chipText, filter === k && styles.chipTextOn]}>{label}</Text>
            </TouchableOpacity>
          ))}
          {tag ? (
            <TouchableOpacity style={[styles.chip, styles.chipOn]} onPress={() => setTag(null)}>
              <Tag size={13} color={T.onAccent} />
              <Text style={[styles.chipText, styles.chipTextOn]}>{tag}</Text>
              <X size={13} color={T.onAccent} />
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      ) : null}

      {docs === null ? (
        <ActivityIndicator color={T.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(d) => String(d.id)}
          contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
              tintColor={T.accent}
              colors={[T.accent]}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <FileText size={34} color={T.accent} />
              </View>
              <Text style={styles.emptyTitle}>{total ? 'Ничего не найдено' : 'Документов пока нет'}</Text>
              {!total ? (
                <Text style={styles.emptyText}>
                  {admin ? 'Загрузите регламенты, инструкции и ответы на частые вопросы — ассистент будет отвечать по ним.' : 'Руководители загрузят сюда документы компании, и ассистент будет отвечать по ним.'}
                </Text>
              ) : null}
            </View>
          }
          renderItem={({ item: d }) => {
            const st = statusOf(d.status);
            return (
              <View style={styles.doc}>
                <View style={styles.docIcon}>
                  <FileText size={20} color={T.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.docName} numberOfLines={2}>
                    {d.original_name}
                  </Text>
                  <Text style={styles.docMeta}>
                    {formatSize(d.file_size)} · {new Date(d.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                    {d.uploaded_by_name ? ` · ${d.uploaded_by_name}` : ''}
                  </Text>
                  {d.description ? (
                    <Text style={styles.docDesc} numberOfLines={3}>
                      {d.description}
                    </Text>
                  ) : null}
                  <View style={styles.tagsRow}>
                    <View style={[styles.status, { backgroundColor: withAlpha(st.color, 0.12) }]}>
                      <st.Icon size={13} color={st.color} />
                      <Text style={[styles.statusText, { color: st.color }]}>
                        {st.label}
                        {d.status === 'completed' && d.chunks_count ? ` · ${d.chunks_count} ${plural(d.chunks_count, ['фрагмент', 'фрагмента', 'фрагментов'])}` : ''}
                      </Text>
                    </View>
                    {(d.tags || []).map((t) => (
                      <TouchableOpacity key={t} onPress={() => setTag(t)}>
                        <Text style={styles.tag}>#{t}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {d.status === 'failed' && d.error_message ? <Text style={styles.docError}>{d.error_message}</Text> : null}
                  {admin && d.status === 'failed' ? (
                    <TouchableOpacity style={styles.retry} onPress={() => reprocess(d)}>
                      <RotateCcw size={15} color={T.accent} />
                      <Text style={styles.retryText}>Обработать снова</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                {admin ? (
                  <TouchableOpacity onPress={() => remove(d)} style={styles.iconBtn} accessibilityLabel="Удалить документ">
                    <Trash2 size={18} color={T.danger} />
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          }}
        />
      )}

      {uploadOpen ? (
        <UploadSheet
          onClose={() => setUploadOpen(false)}
          onDone={() => {
            setUploadOpen(false);
            showToast('Документ загружен — обработка займёт немного времени');
            load();
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

/** Загрузка: файл, теги, описание — как на сайте. */
function UploadSheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const [file, setFile] = useState<{ uri: string; name: string; type: string; size: number } | null>(null);
  const [tags, setTags] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const choose = async () => {
    try {
      const [f] = await pick({ type: [types.allFiles] });
      if (!f?.uri) return;
      const name = f.name || 'document';
      const ext = name.split('.').pop()?.toLowerCase() || '';
      if (!EXT.includes(ext)) return setError('Поддерживаются PDF, Word (.docx, .doc), .txt и .md');
      if ((f.size || 0) > MAX_BYTES) return setError('Файл больше 20 МБ');
      setError('');
      setFile({ uri: f.uri, name, type: f.type || 'application/octet-stream', size: f.size || 0 });
    } catch (e: any) {
      if (!(isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED)) setError('Не удалось выбрать файл');
    }
  };

  const submit = async () => {
    if (!file) return setError('Выберите файл');
    const list = [...new Set(tags.split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean))];
    if (list.length > 20 || list.some((t) => t.length > 50)) return setError('Не больше 20 тегов, каждый до 50 символов');
    setBusy(true);
    try {
      await api.uploadKnowledgeDocument(file, list, description.trim() || undefined);
      onDone();
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить документ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={busy ? () => undefined : onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={busy ? undefined : onClose} />
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: 'flex-end' }} pointerEvents="box-none">
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>Новый документ</Text>
          <TouchableOpacity style={[styles.filePick, !!error && !file && { borderColor: T.danger }]} onPress={choose} disabled={busy} activeOpacity={0.8}>
            <FileText size={24} color={T.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.fileName} numberOfLines={1}>
                {file ? file.name : 'Выберите файл'}
              </Text>
              <Text style={styles.fileHint}>{file ? formatSize(file.size) : 'PDF, Word, .txt или .md — до 20 МБ'}</Text>
            </View>
          </TouchableOpacity>
          {error ? <Text style={styles.formError}>{error}</Text> : null}
          <TextInput style={styles.input} value={tags} onChangeText={setTags} placeholder="Теги через запятую: отпуск, кадры" placeholderTextColor={T.textMuted} maxLength={600} />
          <TextInput
            style={[styles.input, { height: 90, textAlignVertical: 'top', paddingTop: 12 }]}
            value={description}
            onChangeText={setDescription}
            placeholder="Описание (необязательно): о чём документ"
            placeholderTextColor={T.textMuted}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity style={[styles.primary, (!file || busy) && { opacity: 0.6 }]} onPress={submit} disabled={!file || busy} activeOpacity={0.88}>
            {busy ? <ActivityIndicator color={T.onAccent} /> : <Text style={styles.primaryText}>Загрузить</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = themed(() => ({
  root: { flex: 1, backgroundColor: T.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 6, gap: 4 },
  iconBtn: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: T.textPrimary },
  subtitle: { fontSize: 12.5, color: T.textSecondary, marginTop: 1 },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 36, borderRadius: 18, backgroundColor: T.accent, marginRight: 8 },
  uploadText: { fontSize: 14, fontWeight: '700', color: T.onAccent },
  chips: { paddingHorizontal: 16, gap: 8, paddingBottom: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, height: 34, borderRadius: 17, backgroundColor: T.inputBg },
  chipOn: { backgroundColor: T.accent },
  chipText: { fontSize: 13.5, fontWeight: '600', color: T.textSecondary },
  chipTextOn: { color: T.onAccent },
  doc: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: 18, backgroundColor: T.card },
  docIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: T.accentMuted },
  docName: { fontSize: 15, fontWeight: '700', color: T.textPrimary },
  docMeta: { fontSize: 12.5, color: T.textMuted, marginTop: 2 },
  docDesc: { fontSize: 13.5, color: T.textSecondary, marginTop: 6, lineHeight: 18 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8, alignItems: 'center' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, height: 24, borderRadius: 12 },
  statusText: { fontSize: 12, fontWeight: '700' },
  tag: { fontSize: 12.5, fontWeight: '600', color: T.accent },
  docError: { fontSize: 12.5, color: T.danger, marginTop: 6 },
  retry: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, alignSelf: 'flex-start', paddingHorizontal: 10, height: 30, borderRadius: 15, backgroundColor: T.accentMuted },
  retryText: { fontSize: 13, fontWeight: '700', color: T.accent },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, paddingTop: 60 },
  emptyIcon: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: T.accentMuted },
  emptyTitle: { marginTop: 14, fontSize: 17, fontWeight: '800', color: T.textPrimary },
  emptyText: { marginTop: 6, fontSize: 14, lineHeight: 20, color: T.textSecondary, textAlign: 'center' },
  backdrop: { ...({ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 } as const), backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: T.elevated, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, gap: 12 },
  handle: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: withAlpha(T.textPrimary, 0.18), marginTop: 8 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: T.textPrimary },
  filePick: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: T.border, backgroundColor: T.card },
  fileName: { fontSize: 15, fontWeight: '700', color: T.textPrimary },
  fileHint: { fontSize: 12.5, color: T.textMuted, marginTop: 2 },
  formError: { fontSize: 13, color: T.danger },
  input: { minHeight: 48, borderRadius: 14, paddingHorizontal: 14, backgroundColor: T.inputBg, fontSize: 15, color: T.textPrimary },
  primary: { height: 52, borderRadius: 16, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  primaryText: { fontSize: 16, fontWeight: '800', color: T.onAccent },
}));
