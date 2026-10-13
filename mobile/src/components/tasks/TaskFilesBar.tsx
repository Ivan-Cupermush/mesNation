import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ActivityIndicator, Image, Modal } from 'react-native';
import * as RNFS from 'react-native-fs';
import { Trash2, Forward, Share2, FileText } from 'lucide-react-native';
import { cachedSignedUrl, request } from '../../services/http';
import { shareFiles, nativeShareAvailable } from '../../native/share';
import { ChatTargetsModal, ChatTarget } from '../ChatTargetsPicker';
import { plural } from '../chat/chatUtils';
import { showToast } from '../ui/toast';
import { openChat } from '../../navigation/ref';
import { T, themed } from '../../theme/runtime';

/**
 * Панель выделенных вложений задачи — вместо поля комментария, как панель
 * выделения сообщений в чате: удалить, переслать в чаты Offix, отправить
 * в другие приложения через системное «Поделиться».
 */

export interface TaskFileItem {
  id: number;
  file_url: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  uploaded_by: number;
}

const nameWord = (n: number) => plural(n, ['файл', 'файла', 'файлов']);

export default function TaskFilesBar({
  taskId,
  taskTitle,
  files,
  selected,
  canDelete,
  onDone,
}: {
  taskId: number;
  taskTitle: string;
  files: TaskFileItem[];
  selected: number[];
  /** Можно ли удалить этот файл (свой или вы создатель задачи). */
  canDelete: (f: TaskFileItem) => boolean;
  /** Действие выполнено: выйти из выделения; reload — список поменялся. */
  onDone: (reload: boolean) => void;
}) {
  const [forwardOpen, setForwardOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [preparing, setPreparing] = useState<{ done: number; total: number } | null>(null);
  const chosen = files.filter((f) => selected.includes(f.id));
  const deletable = chosen.filter(canDelete);
  const none = chosen.length === 0;

  const remove = () => {
    if (!deletable.length) {
      Alert.alert('Нельзя удалить', 'Удалить файл может его автор или создатель задачи.');
      return;
    }
    const partial = deletable.length < chosen.length;
    Alert.alert(
      `Удалить ${deletable.length} ${nameWord(deletable.length)}?`,
      partial
        ? `Удалятся только ваши файлы (${deletable.length} из ${chosen.length}) — чужие может удалить их автор или создатель задачи.`
        : 'Файлы пропадут из задачи у всех участников. Копии, пересланные в чаты, останутся.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            try {
              await request(`/api/tasks/${taskId}/files/bulk-delete`, { method: 'POST', body: { file_ids: deletable.map((f) => f.id) } });
              showToast(deletable.length === 1 ? 'Файл удалён' : `Удалено: ${deletable.length}`);
              onDone(true);
            } catch (e: any) {
              Alert.alert('Не удалось удалить', e?.message || '');
            }
          },
        },
      ],
    );
  };

  const forward = async (targets: ChatTarget[]) => {
    setProgress({ done: 0, total: targets.length });
    try {
      await request(`/api/tasks/${taskId}/files/forward`, {
        method: 'POST',
        body: {
          file_ids: chosen.map((f) => f.id),
          targets: targets.map((t) => ({ chat_id: t.chatId, topic_id: t.topicId ?? undefined })),
          comment: comment.trim() || undefined,
        },
      });
      setForwardOpen(false);
      setComment('');
      onDone(false);
      if (targets.length === 1) {
        const t = targets[0];
        openChat({ chatId: String(t.chatId), chatName: t.name, topicId: t.topicId });
      } else {
        showToast(`Переслано в ${targets.length} ${plural(targets.length, ['чат', 'чата', 'чатов'])}`);
      }
    } catch (e: any) {
      Alert.alert('Не удалось переслать', e?.message || '');
    } finally {
      setProgress(null);
    }
  };

  /** Скачиваем во временную папку и открываем системное «Поделиться» (WhatsApp, почта, галерея). */
  const shareOut = async () => {
    if (!nativeShareAvailable()) {
      Alert.alert('Обновите приложение', 'Отправка файлов в другие приложения появилась в новой версии Offix.');
      return;
    }
    setPreparing({ done: 0, total: chosen.length });
    try {
      const dir = `${RNFS.CachesDirectoryPath}/share/task_${taskId}_${Date.now()}`;
      await RNFS.mkdir(dir);
      const out: { path: string; mime: string; name: string }[] = [];
      for (const f of chosen) {
        const name = (f.file_name || `file_${f.id}`).replace(/[\\/:*?"<>|]+/g, '_');
        const path = `${dir}/${name}`;
        const res = await RNFS.downloadFile({ fromUrl: await cachedSignedUrl(f.file_url), toFile: path }).promise;
        if (res.statusCode && res.statusCode >= 400) throw new Error(`«${f.file_name}» недоступен`);
        out.push({ path, mime: f.mime_type || 'application/octet-stream', name });
        setPreparing((p) => (p ? { ...p, done: p.done + 1 } : p));
      }
      await shareFiles(out, { title: chosen.length === 1 ? chosen[0].file_name : `${chosen.length} ${nameWord(chosen.length)} из задачи` });
      onDone(false);
    } catch (e: any) {
      Alert.alert('Не удалось отправить', e?.message || '');
    } finally {
      setPreparing(null);
    }
  };

  return (
    <>
      <View style={styles.bar}>
        <Action icon={<Trash2 size={21} color={none ? T.textMuted : T.danger} />} label="Удалить" color={T.danger} onPress={remove} disabled={none} />
        <Action icon={<Forward size={21} color={none ? T.textMuted : T.accent} />} label="Переслать" color={T.accent} onPress={() => setForwardOpen(true)} disabled={none} />
        <Action icon={<Share2 size={20} color={none ? T.textMuted : T.accent} />} label="Отправить" color={T.accent} onPress={shareOut} disabled={none} />
      </View>

      <ChatTargetsModal
        visible={forwardOpen}
        title="Переслать"
        subtitle={`${chosen.length} ${nameWord(chosen.length)} из задачи «${taskTitle}»`}
        onClose={() => setForwardOpen(false)}
        header={<SelectedPreview files={chosen} />}
        caption={comment}
        onCaption={setComment}
        captionPlaceholder="Добавить подпись…"
        hasContent
        progress={progress}
        onSend={forward}
      />

      <Modal visible={!!preparing} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.dim}>
          <View style={styles.prepCard}>
            <ActivityIndicator color={T.accent} size="large" />
            <Text style={styles.prepText}>
              Готовим {preparing?.total === 1 ? 'файл' : `файлы: ${preparing?.done ?? 0} из ${preparing?.total ?? 0}`}
            </Text>
          </View>
        </View>
      </Modal>
    </>
  );
}

function Action({ icon, label, color, onPress, disabled }: { icon: React.ReactNode; label: string; color: string; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity style={styles.action} onPress={onPress} disabled={disabled} activeOpacity={0.7} accessibilityLabel={label}>
      {icon}
      <Text style={[styles.actionText, { color: disabled ? T.textMuted : color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

/** Что пересылаем — миниатюры фото и имена файлов. */
function SelectedPreview({ files }: { files: TaskFileItem[] }) {
  return (
    <View style={styles.preview}>
      {files.slice(0, 6).map((f) => (
        <View key={f.id} style={styles.previewItem}>
          <FileThumb file={f} size={40} />
          <Text style={styles.previewName} numberOfLines={1}>
            {f.file_name}
          </Text>
        </View>
      ))}
      {files.length > 6 ? <Text style={styles.previewMore}>и ещё {files.length - 6}</Text> : null}
    </View>
  );
}

/** Миниатюра фото (по подписанной ссылке) или значок файла. */
export function FileThumb({ file, size, fallback }: { file: TaskFileItem; size: number; fallback?: React.ReactNode }) {
  const isImage = (file.mime_type || '').startsWith('image/');
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    if (!isImage) return;
    let alive = true;
    cachedSignedUrl(file.file_url)
      .then((u) => alive && setUri(u))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [file.file_url, isImage]);
  if (isImage && uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size * 0.25, backgroundColor: T.inputBg }} />;
  return (
    <>
      {fallback ?? (
        <View style={[styles.fileFallback, { width: size, height: size, borderRadius: size * 0.25 }]}>
          <FileText size={size * 0.48} color={T.accent} />
        </View>
      )}
    </>
  );
}

const styles = themed(() => ({
  bar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: T.border, backgroundColor: T.card, paddingTop: 6, paddingBottom: 8 },
  action: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 4 },
  actionText: { fontSize: 12.5, fontWeight: '700' },
  preview: { marginHorizontal: 14, marginBottom: 8, padding: 10, borderRadius: 18, backgroundColor: T.card, borderWidth: 1, borderColor: T.border, gap: 8 },
  previewItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  previewName: { flex: 1, fontSize: 14.5, fontWeight: '600', color: T.textPrimary },
  previewMore: { fontSize: 13, color: T.textSecondary, marginLeft: 50 },
  fileFallback: { backgroundColor: T.accentMuted, alignItems: 'center', justifyContent: 'center' },
  dim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  prepCard: { minWidth: 220, padding: 22, borderRadius: 20, backgroundColor: T.elevated, alignItems: 'center', gap: 12 },
  prepText: { fontSize: 15, fontWeight: '600', color: T.textPrimary },
}));
