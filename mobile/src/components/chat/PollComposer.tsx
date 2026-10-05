import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  Switch,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Image,
  } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { launchImageLibrary } from 'react-native-image-picker';
import { pick, types, isErrorWithCode, errorCodes } from '@react-native-documents/picker';
import { X, Check, Lightbulb, ImagePlus, Paperclip, Play, FileText } from 'lucide-react-native';
import { C, fileBadge, formatSize, plural } from './chatUtils';

import { T, themed } from '../../theme/runtime';
/**
 * «Новый опрос» как в Telegram: вопрос, до 10 вариантов (новое поле
 * появляется само, когда заполняете последнее), анонимность, несколько
 * ответов, режим викторины с правильным ответом и пояснением.
 */

export interface PollDraft {
  question: string;
  options: string[];
  is_anonymous: boolean;
  allows_multiple: boolean;
  is_quiz: boolean;
  correct_option_index: number | null;
  explanation: string | null;
}

/** Вложение опроса: фото, видео или файл над вопросом (как в Telegram). */
export interface PollMediaDraft {
  uri: string;
  name: string;
  type: string;
  kind: 'photo' | 'video' | 'file';
  size?: number | null;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubmit: (poll: PollDraft, media: PollMediaDraft | null) => Promise<void>;
}

const MAX_OPTIONS = 10;

export default function PollComposer({ visible, onClose, onSubmit }: Props) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [anonymous, setAnonymous] = useState(true);
  const [multiple, setMultiple] = useState(false);
  const [quiz, setQuiz] = useState(false);
  const [correct, setCorrect] = useState<number | null>(null);
  const [explanation, setExplanation] = useState('');
  const [sending, setSending] = useState(false);
  const [media, setMedia] = useState<PollMediaDraft | null>(null);
  const inputs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    if (visible) {
      setQuestion('');
      setOptions(['', '']);
      setAnonymous(true);
      setMultiple(false);
      setQuiz(false);
      setCorrect(null);
      setExplanation('');
      setMedia(null);
    }
  }, [visible]);

  const pickMedia = async () => {
    const res = await launchImageLibrary({ mediaType: 'mixed', selectionLimit: 1, quality: 0.9 });
    const a = res.assets?.[0];
    if (!a?.uri) return;
    const isVideo = (a.type || '').startsWith('video');
    setMedia({
      uri: a.uri,
      name: a.fileName || `poll_${Date.now()}.${isVideo ? 'mp4' : 'jpg'}`,
      type: a.type || (isVideo ? 'video/mp4' : 'image/jpeg'),
      kind: isVideo ? 'video' : 'photo',
      size: a.fileSize,
    });
  };

  const pickFile = async () => {
    try {
      const [f] = await pick({ type: [types.allFiles] });
      if (!f?.uri) return;
      if ((f.size || 0) > 200 * 1024 * 1024) {
        Alert.alert('Слишком большой файл', 'Максимальный размер — 200 МБ');
        return;
      }
      setMedia({ uri: f.uri, name: f.name || 'Файл', type: f.type || 'application/octet-stream', kind: 'file', size: f.size });
    } catch (err: any) {
      if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) return;
      Alert.alert('Не удалось выбрать файл', err?.message || '');
    }
  };

  const setOption = (i: number, value: string) => {
    setOptions((prev) => {
      const next = [...prev];
      next[i] = value;
      // Как в Telegram: заполнили последний вариант — появляется следующий пустой.
      if (i === next.length - 1 && value.trim() && next.length < MAX_OPTIONS) next.push('');
      return next;
    });
  };

  const removeOption = (i: number) => {
    setOptions((prev) => {
      const next = prev.filter((_, k) => k !== i);
      while (next.length < 2) next.push('');
      return next;
    });
    setCorrect((c) => (c === null ? null : c === i ? null : c > i ? c - 1 : c));
  };

  const filled = options.map((o) => o.trim()).filter(Boolean);
  const canSubmit = !!question.trim() && filled.length >= 2 && (!quiz || (correct !== null && !!options[correct]?.trim())) && !sending;
  const left = MAX_OPTIONS - filled.length;

  const submit = async () => {
    if (!canSubmit) {
      if (!question.trim()) Alert.alert('Опрос', 'Введите вопрос');
      else if (filled.length < 2) Alert.alert('Опрос', 'Нужно хотя бы два варианта ответа');
      else if (quiz) Alert.alert('Викторина', 'Отметьте правильный ответ — нажмите на кружок слева от варианта');
      return;
    }
    // Пустые поля пропускаем, индекс правильного ответа пересчитываем.
    let correctIndex: number | null = null;
    const cleaned: string[] = [];
    options.forEach((o, i) => {
      if (!o.trim()) return;
      if (quiz && i === correct) correctIndex = cleaned.length;
      cleaned.push(o.trim());
    });
    setSending(true);
    try {
      await onSubmit({
        question: question.trim(),
        options: cleaned,
        is_anonymous: anonymous,
        allows_multiple: multiple && !quiz,
        is_quiz: quiz,
        correct_option_index: correctIndex,
        explanation: quiz && explanation.trim() ? explanation.trim() : null,
      }, media);
      onClose();
    } catch (e: any) {
      Alert.alert('Не удалось создать опрос', e?.message || '');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
              <Text style={styles.headerBtnText}>Отмена</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{quiz ? 'Новая викторина' : 'Новый опрос'}</Text>
            <TouchableOpacity onPress={submit} style={styles.headerBtn} disabled={sending}>
              {sending ? (
                <ActivityIndicator color={C.accent} />
              ) : (
                <Text style={[styles.headerBtnText, styles.headerBtnPrimary, !canSubmit && { opacity: 0.4 }]}>Создать</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {/* Медиа над вопросом — фото, видео или файл */}
            {media ? (
              <View style={styles.mediaCard}>
                {media.kind === 'file' ? (
                  <View style={styles.mediaFile}>
                    <View style={[styles.mediaFileBadge, { backgroundColor: fileBadge(media.name).color }]}>
                      {fileBadge(media.name).ext ? (
                        <Text style={styles.mediaFileExt}>{fileBadge(media.name).ext}</Text>
                      ) : (
                        <FileText size={20} color="#FFFFFF" />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.mediaFileName} numberOfLines={2}>
                        {media.name}
                      </Text>
                      {media.size ? <Text style={styles.mediaFileMeta}>{formatSize(media.size)}</Text> : null}
                    </View>
                  </View>
                ) : (
                  <View>
                    <Image source={{ uri: media.uri }} style={styles.mediaImage} resizeMode="cover" />
                    {media.kind === 'video' && (
                      <View style={styles.mediaPlay}>
                        <Play size={22} color="#FFFFFF" fill="#FFFFFF" />
                      </View>
                    )}
                  </View>
                )}
                <TouchableOpacity onPress={() => setMedia(null)} style={styles.mediaRemove} accessibilityLabel="Убрать вложение">
                  <X size={16} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.mediaActions}>
                <TouchableOpacity style={styles.mediaAction} onPress={pickMedia} activeOpacity={0.75}>
                  <ImagePlus size={20} color={C.accent} />
                  <Text style={styles.mediaActionText}>Фото или видео</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.mediaAction} onPress={pickFile} activeOpacity={0.75}>
                  <Paperclip size={20} color={C.accent} />
                  <Text style={styles.mediaActionText}>Файл</Text>
                </TouchableOpacity>
              </View>
            )}

            <Text style={styles.section}>ВОПРОС</Text>
            <View style={styles.card}>
              <TextInput
                style={styles.questionInput}
                value={question}
                onChangeText={setQuestion}
                placeholder="Задайте вопрос"
                placeholderTextColor={T.textMuted}
                multiline
                maxLength={255}
                autoFocus
              />
            </View>

            <Text style={styles.section}>ВАРИАНТЫ ОТВЕТА</Text>
            <View style={styles.card}>
              {options.map((o, i) => {
                const isLastEmpty = i === options.length - 1 && !o.trim() && options.length > 2;
                return (
                  <View key={i} style={[styles.optionRow, i > 0 && styles.optionDivider]}>
                    {quiz && (
                      <TouchableOpacity
                        onPress={() => setCorrect(i)}
                        style={[styles.radio, correct === i && styles.radioOn]}
                        hitSlop={8}
                        accessibilityLabel="Правильный ответ"
                      >
                        {correct === i && <Check size={13} color={T.onAccent} strokeWidth={3} />}
                      </TouchableOpacity>
                    )}
                    <TextInput
                      ref={(r) => {
                        inputs.current[i] = r;
                      }}
                      style={styles.optionInput}
                      value={o}
                      onChangeText={(v) => setOption(i, v)}
                      placeholder={i < 2 ? `Вариант ${i + 1}` : 'Добавить вариант'}
                      placeholderTextColor={T.textMuted}
                      maxLength={100}
                      returnKeyType="next"
                      onSubmitEditing={() => inputs.current[i + 1]?.focus()}
                      blurOnSubmit={false}
                    />
                    {!isLastEmpty && options.length > 2 && (
                      <TouchableOpacity onPress={() => removeOption(i)} hitSlop={10} accessibilityLabel="Удалить вариант">
                        <X size={18} color={T.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
            <Text style={styles.hint}>
              {left > 0 ? `Можно добавить ещё ${left} ${plural(left, ['вариант', 'варианта', 'вариантов'])}.` : 'Добавлено максимальное число вариантов.'}
              {quiz ? ' Нажмите на кружок, чтобы отметить правильный ответ.' : ''}
            </Text>

            <Text style={styles.section}>НАСТРОЙКИ</Text>
            <View style={styles.card}>
              <SettingRow title="Анонимное голосование" hint="Никто не увидит, кто как проголосовал" value={anonymous} onChange={setAnonymous} />
              <SettingRow
                title="Выбор нескольких ответов"
                hint={quiz ? 'Недоступно в викторине' : 'Можно отметить несколько вариантов'}
                value={multiple && !quiz}
                onChange={setMultiple}
                disabled={quiz}
                divider
              />
              <SettingRow
                title="Режим викторины"
                hint="Один правильный ответ, изменить ответ нельзя"
                value={quiz}
                onChange={(v) => {
                  setQuiz(v);
                  if (v) setMultiple(false);
                  else setCorrect(null);
                }}
                divider
              />
            </View>

            {quiz && (
              <>
                <Text style={styles.section}>ПОЯСНЕНИЕ</Text>
                <View style={[styles.card, styles.explainRow]}>
                  <Lightbulb size={18} color={T.warning} />
                  <TextInput
                    style={styles.explainInput}
                    value={explanation}
                    onChangeText={setExplanation}
                    placeholder="Покажется после ответа (необязательно)"
                    placeholderTextColor={T.textMuted}
                    multiline
                    maxLength={200}
                  />
                </View>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function SettingRow({
  title,
  hint,
  value,
  onChange,
  disabled,
  divider,
}: {
  title: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  divider?: boolean;
}) {
  return (
    <View style={[styles.settingRow, divider && styles.optionDivider, disabled && { opacity: 0.45 }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingHint}>{hint}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: T.surfaceActive, true: C.accent }}
        thumbColor={T.onAccent}
      />
    </View>
  );
}

const styles = themed(() => ({
  mediaActions: { flexDirection: 'row', gap: 10, marginBottom: 6 },
  mediaAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: T.border,
    backgroundColor: T.card,
  },
  mediaActionText: { color: C.accent, fontSize: 14, fontWeight: '600' },
  mediaCard: { borderRadius: 16, overflow: 'hidden', backgroundColor: T.card, marginBottom: 6 },
  mediaImage: { width: '100%', height: 200 },
  mediaPlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 48,
    height: 48,
    marginLeft: -24,
    marginTop: -24,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaRemove: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaFile: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, paddingRight: 48 },
  mediaFileBadge: { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  mediaFileExt: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  mediaFileName: { fontSize: 15, fontWeight: '600', color: T.textPrimary },
  mediaFileMeta: { fontSize: 12, color: T.textSecondary, marginTop: 2 },
  container: { flex: 1, backgroundColor: T.inputBg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    height: 52,
    backgroundColor: T.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  headerBtn: { minWidth: 84, height: 44, justifyContent: 'center', paddingHorizontal: 8 },
  headerBtnText: { fontSize: 16, color: C.accent },
  headerBtnPrimary: { fontWeight: '700', textAlign: 'right' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: C.text },
  body: { padding: 16, paddingBottom: 40 },
  section: { fontSize: 13, fontWeight: '600', color: C.textMuted, marginTop: 14, marginBottom: 6, marginLeft: 12 },
  card: { backgroundColor: T.card, borderRadius: 14, paddingHorizontal: 14 },
  questionInput: { fontSize: 17, color: C.text, minHeight: 50, paddingVertical: 12 },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50 },
  optionDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  optionInput: { flex: 1, fontSize: 16, color: C.text, paddingVertical: 12 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: T.border, alignItems: 'center', justifyContent: 'center' },
  radioOn: { backgroundColor: T.success, borderColor: T.success },
  hint: { fontSize: 13, color: C.textMuted, marginTop: 6, marginHorizontal: 12, lineHeight: 18 },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  settingTitle: { fontSize: 16, color: C.text },
  settingHint: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  explainRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  explainInput: { flex: 1, fontSize: 15, color: C.text, minHeight: 48, paddingVertical: 12 },
}));
