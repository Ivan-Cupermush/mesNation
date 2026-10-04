import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NotebookPen, Paperclip, Check, X, FileText, Download } from 'lucide-react-native';
import { api, NoteShareCard, SharedNote } from '../services/api';
import { signedFileUrl } from '../services/http';

/**
 * Заметка, отправленная в чат: карточка в ленте и окно просмотра с кнопкой
 * «Принять в мои заметки» — копия попадает в заметки получателя на сегодня.
 */

interface Props {
  card: NoteShareCard;
  mine: boolean;
  currentUserId: number;
  /** Получатель принял заметку: обновить карточку и предложить открыть её. */
  onAccepted: (noteId: number) => void;
}

export default function NoteShareBubble({ card, mine, currentUserId, onAccepted }: Props) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<SharedNote | null>(null);
  const [loading, setLoading] = useState(false);
  const [accepting, setAccepting] = useState(false);

  const accepted = card.accepted_user_ids.includes(currentUserId);
  const isSender = card.sender_id === currentUserId;

  const openNote = async () => {
    setOpen(true);
    setLoading(true);
    try {
      setNote(await api.getSharedNote(card.id));
    } catch (e: any) {
      setOpen(false);
      Alert.alert('Не удалось открыть заметку', e?.message || '');
    } finally {
      setLoading(false);
    }
  };

  const accept = async () => {
    setAccepting(true);
    try {
      const created = await api.acceptSharedNote(card.id);
      setNote((n) => (n ? { ...n, is_accepted: true, accepted_note_id: created.id } : n));
      setOpen(false);
      onAccepted(created.id);
    } catch (e: any) {
      Alert.alert('Не удалось принять заметку', e?.message || '');
    } finally {
      setAccepting(false);
    }
  };

  const openFile = async (url: string) => {
    try {
      await Linking.openURL(await signedFileUrl(url));
    } catch (e: any) {
      Alert.alert('Не удалось открыть файл', e?.message || '');
    }
  };

  const fg = mine ? '#FFFFFF' : '#141414';
  const sub = mine ? 'rgba(255,255,255,0.8)' : '#6F6F73';

  return (
    <>
      <TouchableOpacity activeOpacity={0.85} onPress={openNote} style={[styles.card, mine && styles.cardMine]}>
        <View style={styles.cardHeader}>
          <View style={[styles.iconWrap, mine && styles.iconWrapMine]}>
            <NotebookPen size={16} color={mine ? '#FFFFFF' : '#1F7A52'} strokeWidth={2.2} />
          </View>
          <Text style={[styles.kicker, { color: sub }]}>Заметка</Text>
        </View>
        <Text style={[styles.title, { color: fg }]} numberOfLines={2}>
          {card.title || 'Без названия'}
        </Text>
        {card.preview ? (
          <Text style={[styles.preview, { color: sub }]} numberOfLines={3}>
            {card.preview}
          </Text>
        ) : null}
        {card.files_count > 0 && (
          <View style={styles.filesRow}>
            <Paperclip size={13} color={sub} strokeWidth={2.2} />
            <Text style={[styles.filesText, { color: sub }]}>Вложений: {card.files_count}</Text>
          </View>
        )}
        {!isSender && (
          <View style={[styles.cta, accepted ? styles.ctaDone : null, mine && styles.ctaMine]}>
            {accepted ? <Check size={14} color="#1F7A52" strokeWidth={2.6} /> : <Download size={14} color="#FFFFFF" strokeWidth={2.4} />}
            <Text style={[styles.ctaText, accepted && styles.ctaTextDone]}>
              {accepted ? 'В ваших заметках' : 'Открыть и принять'}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setOpen(false)} style={styles.closeBtn} accessibilityLabel="Закрыть">
              <X size={22} color="#141414" />
            </TouchableOpacity>
            <Text style={styles.modalTitle} numberOfLines={1}>
              Заметка{note?.sender_name ? ` от ${note.sender_name}` : ''}
            </Text>
          </View>

          {loading || !note ? (
            <ActivityIndicator style={{ marginTop: 40 }} color="#1F7A52" size="large" />
          ) : (
            <>
              <ScrollView contentContainerStyle={styles.modalBody}>
                <Text style={styles.noteTitle}>{note.title || 'Без названия'}</Text>
                <Text style={styles.noteContent} selectable>
                  {note.content || 'Текста нет'}
                </Text>
                {note.files.length > 0 && (
                  <View style={{ marginTop: 24 }}>
                    <Text style={styles.sectionLabel}>Вложения</Text>
                    {note.files.map((f) => (
                      <TouchableOpacity key={f.file_url} style={styles.fileRow} onPress={() => openFile(f.file_url)}>
                        <FileText size={18} color="#1F7A52" />
                        <Text style={styles.fileName} numberOfLines={1}>
                          {f.file_name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </ScrollView>

              {!isSender && (
                <View style={styles.footer}>
                  {note.is_accepted ? (
                    <TouchableOpacity
                      style={[styles.acceptBtn, styles.acceptBtnDone]}
                      onPress={() => {
                        setOpen(false);
                        if (note.accepted_note_id) onAccepted(note.accepted_note_id);
                      }}
                    >
                      <Check size={18} color="#1F7A52" strokeWidth={2.6} />
                      <Text style={[styles.acceptText, { color: '#1F7A52' }]}>Уже в ваших заметках — открыть</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity style={styles.acceptBtn} onPress={accept} disabled={accepting}>
                      {accepting ? (
                        <ActivityIndicator color="#FFFFFF" />
                      ) : (
                        <>
                          <Download size={18} color="#FFFFFF" strokeWidth={2.4} />
                          <Text style={styles.acceptText}>Принять в мои заметки</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </>
          )}
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    minWidth: 220,
    maxWidth: 280,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#F1F7F4',
    borderWidth: 1,
    borderColor: '#D5E8DE',
    marginVertical: 4,
  },
  cardMine: { backgroundColor: 'rgba(255,255,255,0.14)', borderColor: 'rgba(255,255,255,0.25)' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  iconWrap: { width: 26, height: 26, borderRadius: 8, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  iconWrapMine: { backgroundColor: 'rgba(255,255,255,0.2)' },
  kicker: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  title: { fontSize: 16, fontWeight: '700' },
  preview: { fontSize: 14, marginTop: 4, lineHeight: 19 },
  filesRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  filesText: { fontSize: 12 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#1F7A52',
  },
  ctaMine: { backgroundColor: 'rgba(255,255,255,0.25)' },
  ctaDone: { backgroundColor: '#E3F1EA' },
  ctaText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  ctaTextDone: { color: '#1F7A52' },

  modal: { flex: 1, backgroundColor: '#FAFAF8' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  closeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#141414' },
  modalBody: { padding: 20, paddingBottom: 40 },
  noteTitle: { fontSize: 26, fontWeight: '800', color: '#141414', marginBottom: 14 },
  noteContent: { fontSize: 16, lineHeight: 24, color: '#141414' },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#6F6F73', textTransform: 'uppercase', marginBottom: 8 },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    marginBottom: 8,
  },
  fileName: { flex: 1, fontSize: 15, color: '#141414' },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: '#ECECE8' },
  acceptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#1F7A52',
  },
  acceptBtnDone: { backgroundColor: '#E3F1EA' },
  acceptText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
