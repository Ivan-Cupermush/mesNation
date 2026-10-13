import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, ActivityIndicator, Alert, Linking, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  NotebookPen,
  Paperclip,
  Check,
  X,
  Plus,
  RefreshCw,
  Clock3,
  MoreHorizontal,
  BookOpenCheck,
  FileText,
  Info,
} from 'lucide-react-native';
import { api, NoteShareCard, SharedNote } from '../services/api';
import { signedFileUrl } from '../services/http';
import { T, themed } from '../theme/runtime';
import { withAlpha } from '../theme/palettes';
import UserAvatar from './ui/UserAvatar';
import ActionSheet, { SheetAction } from './chat/ActionSheet';
import { fileBadge, formatSize, plural } from './chat/chatUtils';

/**
 * Заметка в чате — как файл в Telegram: карточка-«страница» с названием,
 * началом текста и автором, подпись — обычным текстом под ней.
 *
 * Отправляется снимок (копия на момент отправки). Получатель добавляет её
 * себе одной кнопкой, а если автор с тех пор что-то поменял — запрашивает
 * текущую версию: у автора появится запрос в колокольчике.
 */

const shortDate = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
};

const filesLabel = (n: number) => `${n} ${plural(n, ['вложение', 'вложения', 'вложений'])}`;

/** Запросить у автора текущую версию; возвращает текст для всплывающей подсказки. */
export async function requestNoteVersion(shareId: number, ownerName?: string | null): Promise<string> {
  const r = await api.requestNoteVersion(shareId);
  if (r.already) return 'Запрос уже отправлен — ждём ответа автора';
  return ownerName ? `Запрос отправлен. ${ownerName} получит уведомление` : 'Запрос отправлен';
}

/** Сама карточка — и в сообщении, и в предпросмотре перед отправкой. */
export function NoteCard({
  title,
  preview,
  filesCount,
  ownerName,
  ownerAvatar,
  ownerLine,
  mine,
  footerRight,
  width = 252,
}: {
  title: string;
  preview?: string | null;
  filesCount: number;
  ownerName?: string | null;
  ownerAvatar?: string | null;
  ownerLine: string;
  mine: boolean;
  footerRight?: React.ReactNode;
  width?: number;
}) {
  const fg = mine ? T.myMessageText : T.textPrimary;
  const sub = mine ? T.myMessageMuted : T.textSecondary;
  return (
    <View style={[styles.card, mine ? styles.cardMine : styles.cardOther, { width }]}>
      <View style={styles.head}>
        <View style={[styles.tile, mine ? styles.tileMine : styles.tileOther]}>
          <NotebookPen size={19} color={mine ? T.onAccent : T.accent} strokeWidth={2.1} />
        </View>
        <View style={styles.headText}>
          <Text style={[styles.title, { color: fg }]} numberOfLines={2}>
            {title || 'Без названия'}
          </Text>
          <View style={styles.kindRow}>
            <Text style={[styles.kind, { color: sub }]}>Заметка</Text>
            {filesCount > 0 && (
              <>
                <Text style={[styles.kind, { color: sub }]}> · </Text>
                <Paperclip size={11} color={sub} strokeWidth={2.4} />
                <Text style={[styles.kind, { color: sub }]}> {filesLabel(filesCount)}</Text>
              </>
            )}
          </View>
        </View>
      </View>

      {preview ? (
        <View style={[styles.page, mine ? styles.pageMine : styles.pageOther]}>
          <View style={[styles.pageRule, { backgroundColor: mine ? withAlpha('#FFFFFF', 0.5) : withAlpha(T.accent, 0.55) }]} />
          <Text style={[styles.pageText, { color: mine ? withAlpha(T.myMessageText, 0.9) : T.textSecondary }]} numberOfLines={3}>
            {preview}
          </Text>
        </View>
      ) : null}

      <View style={[styles.foot, { borderTopColor: mine ? withAlpha('#FFFFFF', 0.18) : withAlpha(T.textPrimary, 0.08) }]}>
        <UserAvatar name={ownerName} url={ownerAvatar} size={20} />
        <Text style={[styles.footText, { color: sub }]} numberOfLines={1}>
          {ownerLine}
        </Text>
        {footerRight}
      </View>
    </View>
  );
}

interface Props {
  card: NoteShareCard;
  mine: boolean;
  currentUserId: number;
  /** Получатель принял заметку: обновить карточку и предложить открыть её. */
  onAccepted: (noteId: number) => void;
  /** Открыть заметку из своих заметок (оригинал или полученную версию). */
  onOpenNote?: (noteId: number) => void;
}

export default function NoteShareBubble({ card, mine, currentUserId, onAccepted, onOpenNote }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const accepted = card.accepted_user_ids.includes(currentUserId);
  const isOwner = card.sender_id === currentUserId;

  const acceptNow = async () => {
    if (accepted) {
      setOpen(true);
      return;
    }
    setBusy(true);
    try {
      const created = await api.acceptSharedNote(card.id);
      onAccepted(created.id);
    } catch (e: any) {
      Alert.alert('Не удалось добавить заметку', e?.message || '');
    } finally {
      setBusy(false);
    }
  };

  const ownerLine = isOwner
    ? `Ваша копия · ${shortDate(card.created_at)}`.replace(/ · $/, '')
    : card.sender_name || 'Автор заметки';

  const sub = mine ? T.myMessageMuted : T.accent;
  const cta = isOwner ? null : (
    <TouchableOpacity
      onPress={acceptNow}
      disabled={busy}
      hitSlop={8}
      style={[styles.cta, mine ? styles.ctaMine : accepted ? styles.ctaDone : styles.ctaOther]}
      accessibilityLabel={accepted ? 'Уже в ваших заметках' : 'Добавить в мои заметки'}
    >
      {busy ? (
        <ActivityIndicator size="small" color={mine ? T.onAccent : T.accent} />
      ) : accepted ? (
        <Check size={13} color={mine ? T.onAccent : T.accent} strokeWidth={2.8} />
      ) : (
        <Plus size={14} color={T.onAccent} strokeWidth={2.8} />
      )}
      <Text style={[styles.ctaText, { color: mine ? T.onAccent : accepted ? sub : T.onAccent }]}>{accepted ? 'В заметках' : 'В заметки'}</Text>
    </TouchableOpacity>
  );

  return (
    <>
      <TouchableOpacity activeOpacity={0.85} onPress={() => setOpen(true)} accessibilityLabel={`Заметка «${card.title || 'Без названия'}»`}>
        <NoteCard
          title={card.title}
          preview={card.preview}
          filesCount={card.files_count}
          ownerName={card.sender_name}
          ownerAvatar={card.sender_avatar_url}
          ownerLine={ownerLine}
          mine={mine}
          footerRight={cta}
        />
      </TouchableOpacity>
      {open && (
        <SharedNoteViewer
          shareId={card.id}
          onClose={() => setOpen(false)}
          onAccepted={(id) => {
            setOpen(false);
            onAccepted(id);
          }}
          onOpenNote={(id) => {
            setOpen(false);
            onOpenNote?.(id);
          }}
        />
      )}
    </>
  );
}

/** Полноэкранный просмотр снимка: автор, запрос текущей версии, вложения. */
function SharedNoteViewer({
  shareId,
  onClose,
  onAccepted,
  onOpenNote,
}: {
  shareId: number;
  onClose: () => void;
  onAccepted: (noteId: number) => void;
  onOpenNote: (noteId: number) => void;
}) {
  const [note, setNote] = useState<SharedNote | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastAnim = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api
      .getSharedNote(shareId)
      .then(setNote)
      .catch((e: any) => {
        onClose();
        Alert.alert('Не удалось открыть заметку', e?.message || '');
      });
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareId]);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    Animated.spring(toastAnim, { toValue: 1, useNativeDriver: true, friction: 8, tension: 90 }).start();
    toastTimer.current = setTimeout(() => {
      Animated.timing(toastAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setToast(null));
    }, 2600);
  };

  const accept = async () => {
    if (!note) return;
    if (note.is_accepted && note.accepted_note_id) return onOpenNote(note.accepted_note_id);
    setAccepting(true);
    try {
      const created = await api.acceptSharedNote(note.id);
      onAccepted(created.id);
    } catch (e: any) {
      Alert.alert('Не удалось добавить заметку', e?.message || '');
    } finally {
      setAccepting(false);
    }
  };

  const askVersion = async () => {
    if (!note) return;
    setRequesting(true);
    try {
      const msg = await requestNoteVersion(note.id, note.sender_name);
      const fresh = await api.getSharedNote(note.id).catch(() => null);
      if (fresh) setNote(fresh);
      showToast(msg);
    } catch (e: any) {
      Alert.alert('Не удалось отправить запрос', e?.message || '');
    } finally {
      setRequesting(false);
    }
  };

  const openFile = async (url: string) => {
    try {
      await Linking.openURL(await signedFileUrl(url));
    } catch (e: any) {
      Alert.alert('Не удалось открыть файл', e?.message || '');
    }
  };

  const req = note?.my_request || null;
  const pending = req?.status === 'pending';
  const received = req?.status === 'approved' && req.result_note_id ? req.result_note_id : null;
  const canRequest = !!note && !note.is_owner && note.original_exists !== false;

  const menuActions: SheetAction[] = [];
  if (note && canRequest) {
    menuActions.push({
      key: 'request',
      label: pending ? 'Запрос уже отправлен' : 'Запросить текущую версию',
      icon: pending ? <Clock3 size={20} color={T.textPrimary} /> : <RefreshCw size={20} color={T.textPrimary} />,
      onPress: () => {
        setMenu(false);
        if (!pending) askVersion();
        else showToast('Запрос уже отправлен — ждём ответа автора');
      },
    });
  }
  if (note && received) {
    menuActions.push({
      key: 'received',
      label: 'Открыть полученную версию',
      icon: <BookOpenCheck size={20} color={T.textPrimary} />,
      onPress: () => onOpenNote(received),
    });
  }
  if (note && !note.is_owner) {
    menuActions.push({
      key: 'accept',
      label: note.is_accepted ? 'Открыть в моих заметках' : 'Добавить в мои заметки',
      icon: note.is_accepted ? <Check size={20} color={T.textPrimary} /> : <Plus size={20} color={T.textPrimary} />,
      onPress: () => {
        setMenu(false);
        accept();
      },
    });
  }
  if (note?.is_owner && note.original_note_id) {
    menuActions.push({
      key: 'original',
      label: 'Открыть оригинал',
      icon: <NotebookPen size={20} color={T.textPrimary} />,
      onPress: () => onOpenNote(note.original_note_id!),
    });
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.modal}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn} accessibilityLabel="Закрыть">
            <X size={22} color={T.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Заметка</Text>
          <TouchableOpacity onPress={() => setMenu(true)} style={styles.headerBtn} disabled={!note} accessibilityLabel="Ещё">
            <MoreHorizontal size={22} color={T.textPrimary} />
          </TouchableOpacity>
        </View>

        {!note ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={T.accent} size="large" />
        ) : (
          <>
            <ScrollView contentContainerStyle={styles.modalBody}>
              {/* Автор и запрос текущей версии */}
              <View style={styles.owner}>
                <View style={styles.ownerRow}>
                  <UserAvatar name={note.sender_name} url={note.sender_avatar_url} size={44} />
                  <View style={styles.ownerText}>
                    <Text style={styles.ownerName} numberOfLines={1}>
                      {note.is_owner ? 'Вы' : note.sender_name || 'Автор'}
                    </Text>
                    <Text style={styles.ownerSub} numberOfLines={2}>
                      {note.is_owner ? 'Вы поделились копией' : 'Автор заметки · поделился копией'} {shortDate(note.created_at)}
                    </Text>
                  </View>
                </View>

                {note.is_owner ? (
                  note.original_note_id ? (
                    <TouchableOpacity style={styles.ownerBtn} onPress={() => onOpenNote(note.original_note_id!)}>
                      <NotebookPen size={17} color={T.accent} />
                      <Text style={styles.ownerBtnText}>Открыть оригинал</Text>
                    </TouchableOpacity>
                  ) : null
                ) : !canRequest ? (
                  <View style={styles.ownerHint}>
                    <Info size={14} color={T.textMuted} />
                    <Text style={styles.ownerHintText}>Автор удалил оригинал — осталась только эта копия</Text>
                  </View>
                ) : (
                  <>
                    {received ? (
                      <TouchableOpacity style={[styles.ownerBtn, styles.ownerBtnFilled]} onPress={() => onOpenNote(received)}>
                        <BookOpenCheck size={17} color={T.onAccent} />
                        <Text style={[styles.ownerBtnText, { color: T.onAccent }]}>Открыть полученную версию</Text>
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                      style={[styles.ownerBtn, pending && styles.ownerBtnWaiting]}
                      onPress={pending ? () => showToast('Запрос уже отправлен — ждём ответа автора') : askVersion}
                      disabled={requesting}
                      accessibilityLabel="Запросить текущую версию"
                    >
                      {requesting ? (
                        <ActivityIndicator size="small" color={T.accent} />
                      ) : pending ? (
                        <Clock3 size={17} color={T.textSecondary} />
                      ) : (
                        <RefreshCw size={17} color={T.accent} />
                      )}
                      <Text style={[styles.ownerBtnText, pending && { color: T.textSecondary }]}>
                        {pending ? 'Запрос отправлен · ждём ответа' : received ? 'Запросить ещё раз' : 'Запросить текущую версию'}
                      </Text>
                    </TouchableOpacity>
                    {req?.status === 'declined' ? (
                      <Text style={styles.ownerFine}>Прошлый запрос автор отклонил — можно попросить снова.</Text>
                    ) : !pending && !received ? (
                      <Text style={styles.ownerFine}>Это копия на момент отправки. Если автор что-то поменял, он сможет поделиться новой версией — она придёт отдельной заметкой.</Text>
                    ) : null}
                  </>
                )}
              </View>

              <Text style={styles.noteTitle}>{note.title || 'Без названия'}</Text>
              <Text style={styles.noteContent} selectable>
                {note.content || 'Текста нет'}
              </Text>
              {note.files.length > 0 && (
                <View style={{ marginTop: 24 }}>
                  <Text style={styles.sectionLabel}>{filesLabel(note.files.length)}</Text>
                  {note.files.map((f) => {
                    const b = fileBadge(f.file_name);
                    return (
                      <TouchableOpacity key={f.file_url} style={styles.fileRow} onPress={() => openFile(f.file_url)}>
                        <View style={[styles.fileIcon, { backgroundColor: b.color }]}>
                          {b.ext ? <Text style={styles.fileExt}>{b.ext}</Text> : <FileText size={18} color="#FFFFFF" />}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.fileName} numberOfLines={1}>
                            {f.file_name}
                          </Text>
                          {f.file_size ? <Text style={styles.fileSize}>{formatSize(f.file_size)}</Text> : null}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </ScrollView>

            {!note.is_owner && (
              <View style={styles.footer}>
                <TouchableOpacity style={[styles.acceptBtn, note.is_accepted && styles.acceptBtnDone]} onPress={accept} disabled={accepting}>
                  {accepting ? (
                    <ActivityIndicator color={T.onAccent} />
                  ) : note.is_accepted ? (
                    <>
                      <Check size={18} color={T.accent} strokeWidth={2.6} />
                      <Text style={[styles.acceptText, { color: T.accent }]}>Открыть в моих заметках</Text>
                    </>
                  ) : (
                    <>
                      <Plus size={19} color={T.onAccent} strokeWidth={2.6} />
                      <Text style={styles.acceptText}>Добавить в мои заметки</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        {toast && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.toast,
              { opacity: toastAnim, transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] },
            ]}
          >
            <Check size={16} color="#FFFFFF" strokeWidth={2.8} />
            <Text style={styles.toastText}>{toast}</Text>
          </Animated.View>
        )}
      </SafeAreaView>
      <ActionSheet
        visible={menu}
        title={note ? (note.is_owner ? 'Ваша заметка' : `Автор: ${note.sender_name || 'неизвестен'}`) : ''}
        preview={note ? (note.is_owner ? 'Вы поделились копией этой заметки' : 'Эту заметку вам отправили — это копия на момент отправки') : ''}
        actions={menuActions}
        onClose={() => setMenu(false)}
      />
    </Modal>
  );
}

const styles = themed(() => ({
  card: { borderRadius: 14, overflow: 'hidden', marginTop: 2, marginBottom: 4, borderWidth: 1 },
  cardOther: { backgroundColor: withAlpha(T.accent, 0.07), borderColor: withAlpha(T.accent, 0.16) },
  cardMine: { backgroundColor: withAlpha('#FFFFFF', 0.13), borderColor: withAlpha('#FFFFFF', 0.22) },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 11, paddingTop: 11 },
  tile: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tileOther: { backgroundColor: withAlpha(T.accent, 0.14) },
  tileMine: { backgroundColor: withAlpha('#FFFFFF', 0.22) },
  headText: { flex: 1 },
  title: { fontSize: 15.5, fontWeight: '700', lineHeight: 20 },
  kindRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  kind: { fontSize: 12.5, fontWeight: '500' },
  page: { flexDirection: 'row', marginHorizontal: 11, marginTop: 9, borderRadius: 9, paddingVertical: 8, paddingRight: 10, overflow: 'hidden' },
  pageOther: { backgroundColor: withAlpha(T.card, 0.75) },
  pageMine: { backgroundColor: withAlpha('#000000', 0.1) },
  pageRule: { width: 3, borderRadius: 2, marginLeft: 8, marginRight: 8 },
  pageText: { flex: 1, fontSize: 13.5, lineHeight: 18.5 },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 10,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  footText: { flex: 1, fontSize: 12.5, fontWeight: '500' },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 26, paddingHorizontal: 10, borderRadius: 13 },
  ctaOther: { backgroundColor: T.accent },
  ctaDone: { backgroundColor: withAlpha(T.accent, 0.14) },
  ctaMine: { backgroundColor: withAlpha('#FFFFFF', 0.24) },
  ctaText: { fontSize: 12.5, fontWeight: '700' },

  modal: { flex: 1, backgroundColor: T.background },
  modalHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 6 },
  headerBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: T.textPrimary },
  modalBody: { padding: 16, paddingBottom: 40 },
  owner: { padding: 14, borderRadius: 18, backgroundColor: T.card, borderWidth: 1, borderColor: T.border, marginBottom: 22, gap: 10 },
  ownerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ownerText: { flex: 1 },
  ownerName: { fontSize: 16, fontWeight: '700', color: T.textPrimary },
  ownerSub: { fontSize: 13, color: T.textSecondary, marginTop: 2 },
  ownerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    borderRadius: 13,
    backgroundColor: withAlpha(T.accent, 0.12),
  },
  ownerBtnFilled: { backgroundColor: T.accent },
  ownerBtnWaiting: { backgroundColor: T.inputBg },
  ownerBtnText: { fontSize: 15, fontWeight: '700', color: T.accent },
  ownerHint: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ownerHintText: { flex: 1, fontSize: 13, color: T.textMuted },
  ownerFine: { fontSize: 12.5, lineHeight: 17, color: T.textMuted },
  noteTitle: { fontSize: 26, fontWeight: '800', color: T.textPrimary, marginBottom: 12 },
  noteContent: { fontSize: 16, lineHeight: 24, color: T.textPrimary },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: T.textSecondary, textTransform: 'uppercase', marginBottom: 8 },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 14, backgroundColor: T.card, marginBottom: 8 },
  fileIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  fileExt: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  fileName: { fontSize: 15, color: T.textPrimary, fontWeight: '600' },
  fileSize: { fontSize: 12.5, color: T.textMuted, marginTop: 1 },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: T.border },
  acceptBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 16, backgroundColor: T.accent },
  acceptBtnDone: { backgroundColor: withAlpha(T.accent, 0.12) },
  acceptText: { color: T.onAccent, fontSize: 16, fontWeight: '700' },
  toast: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 96,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(20,24,28,0.92)',
  },
  toastText: { flex: 1, color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
}));
