import React, { useEffect, useState } from 'react';
import { View, } from 'react-native';
import { ChatTargetsModal, ChatTarget } from './ChatTargetsPicker';
import { plural } from './chat/chatUtils';
import { themed } from '../theme/runtime';
import { showError } from './ui/toast';

/**
 * Отправка в чаты (заметка, контакт, QR-контакт) — тот же выбор, что при
 * пересылке: аватары, поиск, несколько чатов сразу и темы групп, как на сайте.
 * onSend вызывается для каждого выбранного чата; onDone — когда всё ушло.
 */

interface Props {
  visible: boolean;
  title: string;
  onClose: () => void;
  onSend: (chatId: number, comment: string, topicId: number | null) => Promise<void>;
  /** Всё отправлено: закрыть окно, показать «Отправлено». */
  onDone?: (count: number, targets: ChatTarget[]) => void;
  /** Что отправляем — показывается над поиском. */
  preview?: React.ReactNode;
  commentPlaceholder?: string;
}

export default function ShareToChatModal({ visible, title, onClose, onSend, onDone, preview, commentPlaceholder }: Props) {
  const [comment, setComment] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    if (visible) setComment('');
  }, [visible]);

  const send = async (targets: ChatTarget[]) => {
    setProgress({ done: 0, total: targets.length });
    const failed: string[] = [];
    for (const t of targets) {
      try {
        await onSend(t.chatId, comment.trim(), t.topicId);
      } catch (e: any) {
        failed.push(`${t.name}: ${e?.message || 'ошибка'}`);
      }
      setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
    }
    setProgress(null);
    if (failed.length) {
      showError(failed.join('\n'), 'Не всё отправилось');
      return;
    }
    onDone?.(targets.length, targets);
  };

  return (
    <ChatTargetsModal
      visible={visible}
      title={title}
      subtitle="Можно выбрать несколько чатов"
      onClose={onClose}
      header={preview ? <View style={styles.preview}>{preview}</View> : undefined}
      caption={comment}
      onCaption={setComment}
      captionPlaceholder={commentPlaceholder || 'Комментарий (необязательно)'}
      hasContent
      progress={progress}
      onSend={send}
    />
  );
}

/** «Отправлено в 3 чата» для тостов после отправки. */
export const sentToLabel = (n: number) => (n === 1 ? 'Отправлено' : `Отправлено в ${n} ${plural(n, ['чат', 'чата', 'чатов'])}`);

const styles = themed(() => ({
  preview: { alignItems: 'flex-end', paddingHorizontal: 14, paddingBottom: 10 },
}));
