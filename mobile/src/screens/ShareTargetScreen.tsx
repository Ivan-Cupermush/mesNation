import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  Modal,
  Pressable,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';
import { X, Search, Send, Check, FileText, Play, Users, Hash, ChevronRight, Link2, ImageOff, Info } from 'lucide-react-native';
import { request } from '../services/http';
import { fuzzyMatch } from '../utils/fuzzySearch';
import { useContactNames } from '../services/contacts';
import { CHAT_FILE_LIMIT, isMedia, sendFiles, sendText } from '../services/sendToChat';
import type { IncomingShare } from '../native/share';
import { formatSize, plural } from '../components/chat/chatUtils';
import UserAvatar from '../components/ui/UserAvatar';
import { showToast } from '../components/ui/toast';
import { openChat } from '../navigation/ref';
import { T, themed } from '../theme/runtime';
import { withAlpha } from '../theme/palettes';

/**
 * «Отправить в…» — Offix в системном «Поделиться» (как Telegram и WhatsApp):
 * что пришло (фото, видео, файлы, текст или ссылка), поиск, несколько чатов
 * сразу, тема в группе с темами, подпись. Один чат — после отправки он
 * открывается; несколько — короткое «Отправлено».
 */

interface Target {
  chatId: number;
  topicId: number | null;
  name: string;
}

const key = (t: { chatId: number; topicId: number | null }) => `${t.chatId}:${t.topicId ?? 0}`;

export default function ShareTargetScreen({ navigation }: any) {
  const share: IncomingShare = useRoute<any>().params?.share;
  const insets = useSafeAreaInsets();
  const [chats, setChats] = useState<any[] | null>(null);
  const [query, setQuery] = useState('');
  const [targets, setTargets] = useState<Target[]>([]);
  const [caption, setCaption] = useState(() => [share?.subject, share?.text].filter(Boolean).join('\n').trim());
  const [asFiles, setAsFiles] = useState(false);
  const [topicChat, setTopicChat] = useState<any | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  useContactNames();

  const files = useMemo(() => share?.files || [], [share]);
  const tooBig = files.filter((f) => f.size > CHAT_FILE_LIMIT);
  const sendable = files.filter((f) => f.size <= CHAT_FILE_LIMIT);
  const media = sendable.filter((f) => isMedia(f.mime));
  const docs = sendable.filter((f) => !isMedia(f.mime));
  const textOnly = !files.length;
  const link = textOnly && /^https?:\/\/\S+$/i.test((share?.text || '').trim()) ? share!.text!.trim() : null;

  useEffect(() => {
    request<any[]>('/api/chats')
      .then((list) => {
        // Чат, выбранный прямо в системном окне, — сверху и уже отмечен.
        if (share?.chatId) {
          const picked = list.find((c) => c.id === share.chatId);
          if (picked) {
            setTargets([{ chatId: picked.id, topicId: null, name: picked.name }]);
            list = [picked, ...list.filter((c) => c.id !== picked.id)];
          }
        }
        setChats(list);
      })
      .catch((e) => {
        setChats([]);
        Alert.alert('Не удалось загрузить чаты', e?.message || '');
      });
  }, [share]);

  const shown = useMemo(() => {
    const list = chats || [];
    if (!query.trim()) return list;
    return list
      .map((c) => ({ c, r: fuzzyMatch(c.name || '', query) }))
      .filter((x) => x.r.match)
      .sort((a, b) => a.r.rank - b.r.rank)
      .map((x) => x.c);
  }, [chats, query]);

  const toggle = (t: Target) =>
    setTargets((prev) => (prev.some((p) => key(p) === key(t)) ? prev.filter((p) => key(p) !== key(t)) : [...prev, t]));

  const onChat = (c: any) => {
    if (c.is_supergroup) setTopicChat(c);
    else toggle({ chatId: c.id, topicId: null, name: c.name });
  };

  const close = () => navigation.goBack();

  const send = async () => {
    if (!targets.length) return;
    const perChat = sendable.length || 1;
    setProgress({ done: 0, total: perChat * targets.length });
    const failed: string[] = [];
    for (const t of targets) {
      try {
        if (sendable.length) {
          await sendFiles(
            t.chatId,
            t.topicId,
            sendable.map((f) => ({ uri: f.path, name: f.name, type: f.mime, size: f.size })),
            caption,
            { asFiles, onFileDone: () => setProgress((p) => (p ? { ...p, done: p.done + 1 } : p)) },
          );
        } else if (caption.trim()) {
          await sendText(t.chatId, t.topicId, caption.trim().slice(0, 4000));
          setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
        }
      } catch (e: any) {
        failed.push(`${t.name}: ${e?.message || 'ошибка'}`);
      }
    }
    setProgress(null);
    if (failed.length) {
      Alert.alert('Не всё отправилось', failed.join('\n'));
      return;
    }
    if (targets.length === 1) {
      const t = targets[0];
      navigation.goBack();
      openChat({ chatId: String(t.chatId), chatName: t.name, topicId: t.topicId });
    } else {
      showToast(`Отправлено в ${targets.length} ${plural(targets.length, ['чат', 'чата', 'чатов'])}`);
      navigation.goBack();
    }
  };

  const canSend = targets.length > 0 && (sendable.length > 0 || !!caption.trim()) && !progress;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <View style={styles.header}>
          <TouchableOpacity onPress={close} style={styles.iconBtn} accessibilityLabel="Отмена">
            <X size={24} color={T.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Отправить в…</Text>
            <Text style={styles.subtitle}>
              {targets.length ? `Выбрано: ${targets.length}` : 'Выберите чат — можно несколько'}
            </Text>
          </View>
        </View>

        {/* ===== Что отправляем ===== */}
        <View style={styles.previewWrap}>
          {media.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>
              {media.slice(0, 20).map((f) => (
                <View key={f.path} style={styles.thumb}>
                  <Image source={{ uri: `file://${f.path}` }} style={styles.thumbImg} />
                  {f.mime.startsWith('video/') ? (
                    <View style={styles.play}>
                      <Play size={14} color="#FFFFFF" fill="#FFFFFF" />
                    </View>
                  ) : null}
                </View>
              ))}
            </ScrollView>
          ) : null}
          {docs.slice(0, 3).map((f) => (
            <View key={f.path} style={styles.fileRow}>
              <View style={styles.fileIcon}>
                <FileText size={20} color={T.onAccent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fileName} numberOfLines={1}>
                  {f.name}
                </Text>
                <Text style={styles.fileMeta}>{formatSize(f.size)}</Text>
              </View>
            </View>
          ))}
          {docs.length > 3 ? <Text style={styles.more}>и ещё {docs.length - 3} {plural(docs.length - 3, ['файл', 'файла', 'файлов'])}</Text> : null}
          {link ? (
            <View style={styles.fileRow}>
              <View style={[styles.fileIcon, { backgroundColor: T.info }]}>
                <Link2 size={19} color="#FFFFFF" />
              </View>
              <Text style={[styles.fileName, { flex: 1 }]} numberOfLines={2}>
                {link}
              </Text>
            </View>
          ) : null}
          {media.length ? (
            <TouchableOpacity style={styles.toggleRow} onPress={() => setAsFiles((v) => !v)} activeOpacity={0.7}>
              <View style={[styles.checkbox, asFiles && styles.checkboxOn]}>{asFiles ? <Check size={13} color={T.onAccent} strokeWidth={3} /> : null}</View>
              <Text style={styles.toggleText}>Без сжатия — отправить файлами</Text>
            </TouchableOpacity>
          ) : null}
          {tooBig.length || share?.skipped ? (
            <View style={styles.note}>
              <Info size={15} color={T.warning} />
              <Text style={styles.noteText}>
                {tooBig.length ? `${tooBig.length} ${plural(tooBig.length, ['файл больше', 'файла больше', 'файлов больше'])} 200 МБ — не отправятся. ` : ''}
                {share?.skipped ? `${share.skipped} ${plural(share.skipped, ['файл', 'файла', 'файлов'])} не удалось открыть.` : ''}
              </Text>
            </View>
          ) : null}
          {!files.length && !share?.text ? (
            <View style={styles.note}>
              <ImageOff size={15} color={T.textMuted} />
              <Text style={styles.noteText}>Нечего отправлять</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.search}>
          <Search size={18} color={T.textMuted} />
          <TextInput style={styles.searchInput} value={query} onChangeText={setQuery} placeholder="Поиск чата или сотрудника" placeholderTextColor={T.textMuted} />
        </View>

        {chats === null ? (
          <ActivityIndicator color={T.accent} style={{ marginTop: 30 }} />
        ) : (
          <FlatList
            data={shown}
            keyExtractor={(c) => String(c.id)}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 12 }}
            ListEmptyComponent={<Text style={styles.empty}>Чаты не найдены</Text>}
            renderItem={({ item }) => {
              const chosen = targets.filter((t) => t.chatId === item.id);
              const on = chosen.length > 0;
              return (
                <TouchableOpacity style={styles.row} onPress={() => onChat(item)} activeOpacity={0.6}>
                  <View>
                    <UserAvatar name={item.name} url={item.avatar_url} size={48} />
                    {on ? (
                      <View style={styles.avatarCheck}>
                        <Check size={12} color={T.onAccent} strokeWidth={3.2} />
                      </View>
                    ) : null}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {item.name || 'Чат'}
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {item.is_supergroup
                        ? on
                          ? `Темы: ${chosen.map((c) => c.name.split(' › ')[1] || 'Общий').join(', ')}`
                          : 'Группа с темами — выберите тему'
                        : item.type === 'private'
                          ? 'Личный чат'
                          : membersLabel(item)}
                    </Text>
                  </View>
                  {item.is_supergroup ? (
                    <ChevronRight size={20} color={T.textMuted} />
                  ) : (
                    <View style={[styles.radio, on && styles.radioOn]}>{on ? <Check size={14} color={T.onAccent} strokeWidth={3} /> : null}</View>
                  )}
                </TouchableOpacity>
              );
            }}
          />
        )}

        {/* ===== Подпись и отправка ===== */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 8 }]}>
          {targets.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
              {targets.map((t) => (
                <TouchableOpacity key={key(t)} style={styles.chip} onPress={() => toggle(t)}>
                  <Text style={styles.chipText} numberOfLines={1}>
                    {t.name}
                  </Text>
                  <X size={13} color={T.accent} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : null}
          <View style={styles.composer}>
            <TextInput
              style={styles.caption}
              value={caption}
              onChangeText={setCaption}
              placeholder={textOnly ? 'Сообщение' : 'Добавить подпись…'}
              placeholderTextColor={T.textMuted}
              multiline
              maxLength={4000}
            />
            <TouchableOpacity style={[styles.sendBtn, !canSend && styles.sendOff]} onPress={send} disabled={!canSend} accessibilityLabel="Отправить">
              {progress ? <ActivityIndicator color={T.onAccent} /> : <Send size={20} color={T.onAccent} />}
              {targets.length > 1 && !progress ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{targets.length}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          </View>
          {progress ? (
            <View style={styles.progressTrack}>
              <View style={[styles.progressBar, { width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }]} />
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>

      {topicChat ? (
        <TopicPicker
          chat={topicChat}
          selected={targets.filter((t) => t.chatId === topicChat.id).map((t) => t.topicId)}
          onToggle={(topicId, title) => toggle({ chatId: topicChat.id, topicId, name: `${topicChat.name} › ${title}` })}
          onClose={() => setTopicChat(null)}
        />
      ) : null}
    </SafeAreaView>
  );
}

function membersLabel(chat: any) {
  const n = (chat.members || []).length;
  return n ? `${n} ${plural(n, ['участник', 'участника', 'участников'])}` : 'Группа';
}

/** Тема группы с темами, куда отправить (как «Выберите тему» в Telegram). */
function TopicPicker({
  chat,
  selected,
  onToggle,
  onClose,
}: {
  chat: any;
  selected: (number | null)[];
  onToggle: (topicId: number | null, title: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [topics, setTopics] = useState<any[] | null>(null);
  useEffect(() => {
    request<any[]>(`/api/chats/${chat.id}/topics`)
      .then(setTopics)
      .catch(() => setTopics([]));
  }, [chat.id]);
  const rows = [{ id: null, title: 'Общий' }, ...(topics || [])];
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.handle} />
        <View style={styles.sheetHead}>
          <Users size={18} color={T.accent} />
          <Text style={styles.sheetTitle} numberOfLines={1}>
            {chat.name}
          </Text>
          <TouchableOpacity onPress={onClose} style={styles.doneBtn}>
            <Text style={styles.doneText}>Готово</Text>
          </TouchableOpacity>
        </View>
        {topics === null ? (
          <ActivityIndicator color={T.accent} style={{ margin: 24 }} />
        ) : (
          <ScrollView style={{ maxHeight: 420 }}>
            {rows.map((t: any) => {
              const on = selected.includes(t.id ?? null);
              return (
                <TouchableOpacity key={String(t.id)} style={styles.topicRow} onPress={() => onToggle(t.id ?? null, t.title)} activeOpacity={0.6}>
                  <View style={[styles.topicIcon, { backgroundColor: withAlpha(t.icon_color || T.accent, 0.16) }]}>
                    <Hash size={17} color={t.icon_color || T.accent} />
                  </View>
                  <Text style={styles.topicTitle} numberOfLines={1}>
                    {t.title}
                  </Text>
                  <View style={[styles.radio, on && styles.radioOn]}>{on ? <Check size={14} color={T.onAccent} strokeWidth={3} /> : null}</View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = themed(() => ({
  root: { flex: 1, backgroundColor: T.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 6 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '800', color: T.textPrimary },
  subtitle: { fontSize: 13, color: T.textSecondary, marginTop: 1 },
  previewWrap: { marginHorizontal: 14, marginBottom: 8, padding: 10, borderRadius: 18, backgroundColor: T.card, borderWidth: 1, borderColor: T.border, gap: 8 },
  thumbs: { gap: 6 },
  thumb: { width: 72, height: 72, borderRadius: 12, overflow: 'hidden', backgroundColor: T.inputBg },
  thumbImg: { width: '100%', height: '100%' },
  play: { position: 'absolute', right: 5, bottom: 5, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fileIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center' },
  fileName: { fontSize: 15, fontWeight: '600', color: T.textPrimary },
  fileMeta: { fontSize: 12.5, color: T.textMuted, marginTop: 1 },
  more: { fontSize: 13, color: T.textSecondary, marginLeft: 50 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 2 },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: T.textMuted, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: T.accent, borderColor: T.accent },
  toggleText: { fontSize: 13.5, color: T.textSecondary },
  note: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  noteText: { flex: 1, fontSize: 12.5, color: T.textSecondary },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 14, paddingHorizontal: 12, borderRadius: 14, backgroundColor: T.inputBg },
  searchInput: { flex: 1, height: 42, fontSize: 15, color: T.textPrimary },
  empty: { textAlign: 'center', marginTop: 30, color: T.textMuted, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  rowName: { fontSize: 16, fontWeight: '700', color: T.textPrimary },
  rowSub: { fontSize: 13, color: T.textSecondary, marginTop: 2 },
  avatarCheck: { position: 'absolute', right: -2, bottom: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: T.accent, borderWidth: 2, borderColor: T.background, alignItems: 'center', justifyContent: 'center' },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: T.textMuted, alignItems: 'center', justifyContent: 'center' },
  radioOn: { backgroundColor: T.accent, borderColor: T.accent },
  footer: { borderTopWidth: 1, borderTopColor: T.border, backgroundColor: T.card, paddingTop: 8, paddingHorizontal: 10 },
  chips: { gap: 6, paddingBottom: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 220, paddingHorizontal: 10, height: 28, borderRadius: 14, backgroundColor: T.accentMuted },
  chipText: { fontSize: 13, fontWeight: '600', color: T.accent, flexShrink: 1 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  caption: { flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 22, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11, backgroundColor: T.inputBg, fontSize: 15.5, color: T.textPrimary },
  sendBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center' },
  sendOff: { opacity: 0.45 },
  badge: { position: 'absolute', right: -3, top: -3, minWidth: 19, height: 19, borderRadius: 10, paddingHorizontal: 4, backgroundColor: T.danger, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: T.card },
  badgeText: { fontSize: 10.5, fontWeight: '800', color: '#FFFFFF' },
  progressTrack: { height: 3, borderRadius: 2, backgroundColor: T.inputBg, marginTop: 8, overflow: 'hidden' },
  progressBar: { height: 3, backgroundColor: T.accent },
  backdrop: { ...({ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 } as const), backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: T.elevated, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 8 },
  handle: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: withAlpha(T.textPrimary, 0.18), marginTop: 8 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 10 },
  sheetTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: T.textPrimary },
  doneBtn: { paddingHorizontal: 12, height: 36, justifyContent: 'center' },
  doneText: { fontSize: 15.5, fontWeight: '700', color: T.accent },
  topicRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10 },
  topicIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  topicTitle: { flex: 1, fontSize: 16, fontWeight: '600', color: T.textPrimary },
}));
