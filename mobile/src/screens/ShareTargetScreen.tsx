import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Image, KeyboardAvoidingView, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';
import { X, Check, FileText, Play, Link2, ImageOff, Info } from 'lucide-react-native';
import { CHAT_FILE_LIMIT, isMedia, sendFiles, sendText } from '../services/sendToChat';
import type { IncomingShare } from '../native/share';
import { formatSize, plural } from '../components/chat/chatUtils';
import ChatTargetsPicker, { ChatTarget } from '../components/ChatTargetsPicker';
import { showToast } from '../components/ui/toast';
import { openChat } from '../navigation/ref';
import { T, themed } from '../theme/runtime';

/**
 * «Отправить в…» — Offix в системном «Поделиться» (как Telegram и WhatsApp):
 * что пришло (фото, видео, файлы, текст или ссылка), поиск, несколько чатов
 * сразу, тема в группе с темами, подпись. Один чат — после отправки он
 * открывается; несколько — короткое «Отправлено».
 */
export default function ShareTargetScreen({ navigation }: any) {
  const share: IncomingShare = useRoute<any>().params?.share;
  const [caption, setCaption] = useState(() => [share?.subject, share?.text].filter(Boolean).join('\n').trim());
  const [asFiles, setAsFiles] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const files = useMemo(() => share?.files || [], [share]);
  const tooBig = files.filter((f) => f.size > CHAT_FILE_LIMIT);
  const sendable = files.filter((f) => f.size <= CHAT_FILE_LIMIT);
  const media = sendable.filter((f) => isMedia(f.mime));
  const docs = sendable.filter((f) => !isMedia(f.mime));
  const textOnly = !files.length;
  const link = textOnly && /^https?:\/\/\S+$/i.test((share?.text || '').trim()) ? share!.text!.trim() : null;

  const send = async (targets: ChatTarget[]) => {
    if (!targets.length) return;
    setProgress({ done: 0, total: (sendable.length || 1) * targets.length });
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
    navigation.goBack();
    if (targets.length === 1) {
      const t = targets[0];
      openChat({ chatId: String(t.chatId), chatName: t.name, topicId: t.topicId });
    } else {
      showToast(`Отправлено в ${targets.length} ${plural(targets.length, ['чат', 'чата', 'чатов'])}`);
    }
  };

  const preview = (
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
  );

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn} accessibilityLabel="Отмена">
            <X size={24} color={T.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Отправить в…</Text>
            <Text style={styles.subtitle}>Выберите чат — можно несколько</Text>
          </View>
        </View>
        <ChatTargetsPicker
          header={preview}
          preselectChatId={share?.chatId}
          caption={caption}
          onCaption={setCaption}
          captionPlaceholder={textOnly ? 'Сообщение' : 'Добавить подпись…'}
          hasContent={sendable.length > 0}
          progress={progress}
          onSend={send}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
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
}));
