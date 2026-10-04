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
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X, Check, Lightbulb } from 'lucide-react-native';
import { C, plural } from './chatUtils';

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

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubmit: (poll: PollDraft) => Promise<void>;
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
    }
  }, [visible]);

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
      });
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
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
            <Text style={styles.section}>ВОПРОС</Text>
            <View style={styles.card}>
              <TextInput
                style={styles.questionInput}
                value={question}
                onChangeText={setQuestion}
                placeholder="Задайте вопрос"
                placeholderTextColor="#A1A1AA"
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
                        {correct === i && <Check size={13} color="#FFFFFF" strokeWidth={3} />}
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
                      placeholderTextColor="#A1A1AA"
                      maxLength={100}
                      returnKeyType="next"
                      onSubmitEditing={() => inputs.current[i + 1]?.focus()}
                      blurOnSubmit={false}
                    />
                    {!isLastEmpty && options.length > 2 && (
                      <TouchableOpacity onPress={() => removeOption(i)} hitSlop={10} accessibilityLabel="Удалить вариант">
                        <X size={18} color="#A1A1AA" />
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
                  <Lightbulb size={18} color="#F59E0B" />
                  <TextInput
                    style={styles.explainInput}
                    value={explanation}
                    onChangeText={setExplanation}
                    placeholder="Покажется после ответа (необязательно)"
                    placeholderTextColor="#A1A1AA"
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
        trackColor={{ false: '#E4E4E7', true: C.accent }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F3F1' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    height: 52,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  headerBtn: { minWidth: 84, height: 44, justifyContent: 'center', paddingHorizontal: 8 },
  headerBtnText: { fontSize: 16, color: C.accent },
  headerBtnPrimary: { fontWeight: '700', textAlign: 'right' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: C.text },
  body: { padding: 16, paddingBottom: 40 },
  section: { fontSize: 13, fontWeight: '600', color: C.textMuted, marginTop: 14, marginBottom: 6, marginLeft: 12 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 14, paddingHorizontal: 14 },
  questionInput: { fontSize: 17, color: C.text, minHeight: 50, paddingVertical: 12 },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50 },
  optionDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  optionInput: { flex: 1, fontSize: 16, color: C.text, paddingVertical: 12 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#C4C4C8', alignItems: 'center', justifyContent: 'center' },
  radioOn: { backgroundColor: '#22C55E', borderColor: '#22C55E' },
  hint: { fontSize: 13, color: C.textMuted, marginTop: 6, marginHorizontal: 12, lineHeight: 18 },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  settingTitle: { fontSize: 16, color: C.text },
  settingHint: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  explainRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  explainInput: { flex: 1, fontSize: 15, color: C.text, minHeight: 48, paddingVertical: 12 },
});
