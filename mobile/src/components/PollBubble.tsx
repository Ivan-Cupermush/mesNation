import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, ActivityIndicator, Animated, Alert, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, X, Lightbulb, ChevronLeft } from 'lucide-react-native';
import { request } from '../services/http';
import { SERVER_URL } from '../config';
import { C, hashColor, initials, plural } from './chat/chatUtils';

import { T, themed } from '../theme/runtime';
/**
 * Опрос в ленте — как в Telegram:
 * до голосования — кружки (или квадраты при нескольких ответах),
 * после — проценты и анимированные полосы, отметка своего ответа;
 * викторина подсвечивает верный/неверный ответ и показывает пояснение;
 * в публичном опросе — аватарки проголосовавших и экран «Результаты».
 */

// ===== Иконка опроса (полоски-диаграмма) =====
export const PollGlyph = ({ width = 16, color = T.accent }: { width?: number; color?: string }) => (
  <View style={{ width, alignItems: 'flex-start', justifyContent: 'center' }}>
    <View style={{ width, height: 2.5, backgroundColor: color, borderRadius: 2, marginBottom: 3 }} />
    <View style={{ width: width * 0.66, height: 2.5, backgroundColor: color, borderRadius: 2, marginBottom: 3, opacity: 0.7 }} />
    <View style={{ width: width * 0.85, height: 2.5, backgroundColor: color, borderRadius: 2, opacity: 0.45 }} />
  </View>
);

export const PollIcon = ({ size = 30, color = T.accent, bg = T.accentMuted }: { size?: number; color?: string; bg?: string }) => (
  <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
    <PollGlyph width={size * 0.52} color={color} />
  </View>
);

// Список сотрудников для аватарок голосовавших — один запрос на всё приложение.
let usersCache: Promise<Record<number, any>> | null = null;
function loadUsers() {
  if (!usersCache) {
    usersCache = request<any[]>('/api/users')
      .then((list) => Object.fromEntries(list.map((u) => [u.id, u])))
      .catch(() => {
        usersCache = null;
        return {};
      });
  }
  return usersCache;
}

function MiniAvatar({ user, size = 20, border }: { user?: any; size?: number; border: string }) {
  const name = user?.display_name || user?.username || '?';
  return (
    <View style={[styles.mini, { width: size, height: size, borderRadius: size / 2, backgroundColor: hashColor(name), borderColor: border }]}>
      {user?.avatar_url ? (
        <Image source={{ uri: SERVER_URL + user.avatar_url }} style={{ width: size - 3, height: size - 3, borderRadius: size / 2 }} />
      ) : (
        <Text style={{ color: T.onAccent, fontSize: size * 0.4, fontWeight: '700' }}>{initials(name)}</Text>
      )}
    </View>
  );
}

function ResultBar({ percent, color }: { percent: number; color: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: percent, duration: 450, useNativeDriver: false }).start();
  }, [percent, anim]);
  return (
    <Animated.View
      style={[
        styles.bar,
        { backgroundColor: color, width: anim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) },
      ]}
    />
  );
}

interface Props {
  poll: any;
  myVotes: number[];
  currentUserId: number;
  isMine: boolean;
}

export default function PollBubble({ poll, myVotes: initialVotes, isMine }: Props) {
  const [data, setData] = useState<any>(poll);
  const [myVotes, setMyVotes] = useState<number[]>(initialVotes || []);
  const [users, setUsers] = useState<Record<number, any>>({});
  const [selection, setSelection] = useState<number[]>([]);
  const [voting, setVoting] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [voters, setVoters] = useState<any[] | null>(null);

  // Обновления приходят сверху (событие poll_updated).
  useEffect(() => setData(poll), [poll]);
  useEffect(() => setMyVotes(initialVotes || []), [initialVotes]);
  useEffect(() => {
    if (!poll.is_anonymous) loadUsers().then(setUsers);
  }, [poll.is_anonymous]);

  const voted = myVotes.length > 0;
  const showResults = voted || data.is_closed;
  const total: number = data.total_votes || 0;

  const fg = isMine ? T.myMessageText : C.text;
  const sub = isMine ? C.textOutMuted : C.textMuted;
  const accent = isMine ? '#FFFFFF' : C.accent;
  const track = isMine ? 'rgba(255,255,255,0.25)' : T.inputBg;
  const bubbleBg = isMine ? C.bubbleOut : C.bubbleIn;

  const vote = async (optionIds: number[]) => {
    if (data.is_closed || voting) return;
    setVoting(true);
    try {
      const d = await request<any>(`/api/polls/${data.id}/vote`, { method: 'POST', body: { option_ids: optionIds } });
      setData(d.poll);
      setMyVotes(d.my_votes?.length ? d.my_votes : optionIds);
      setSelection([]);
      if (d.poll.is_quiz && d.poll.explanation) {
        const right = d.poll.options.find((o: any) => o.is_correct && optionIds.includes(o.id));
        Alert.alert(right ? 'Верно!' : 'Неверно', d.poll.explanation);
      }
    } catch (e: any) {
      Alert.alert('Не удалось проголосовать', e?.message || '');
    } finally {
      setVoting(false);
    }
  };

  const openResults = async () => {
    setResultsOpen(true);
    if (data.is_anonymous) return;
    try {
      setVoters(await request<any[]>(`/api/polls/${data.id}/voters`));
    } catch {
      setVoters([]);
    }
  };

  const kind = data.is_quiz ? (data.is_anonymous ? 'Анонимная викторина' : 'Викторина') : data.is_anonymous ? 'Анонимный опрос' : 'Публичный опрос';
  const recentVoters: number[] = Array.from(new Set<number>((data.options || []).flatMap((o: any) => o.voters || []))).slice(0, 3);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.question, { color: fg }]}>{data.question}</Text>
      <View style={styles.kindRow}>
        <Text style={[styles.kind, { color: sub }]}>
          {kind}
          {data.is_closed ? ' · завершён' : ''}
        </Text>
        {!data.is_anonymous && recentVoters.length > 0 && (
          <View style={styles.stack}>
            {recentVoters.map((id, i) => (
              <View key={id} style={{ marginLeft: i ? -6 : 0 }}>
                <MiniAvatar user={users[id]} size={18} border={bubbleBg} />
              </View>
            ))}
          </View>
        )}
        {data.is_quiz && data.explanation && showResults && (
          <TouchableOpacity onPress={() => Alert.alert('Пояснение', data.explanation)} hitSlop={10} style={{ marginLeft: 'auto' }}>
            <Lightbulb size={18} color={isMine ? '#FDE68A' : T.warning} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.options}>
        {(data.options || []).map((opt: any) => {
          const percent = total > 0 ? Math.round((opt.vote_count / total) * 100) : 0;
          const mine = myVotes.includes(opt.id);
          const selected = selection.includes(opt.id);

          if (!showResults) {
            return (
              <TouchableOpacity
                key={opt.id}
                style={styles.optionBtn}
                activeOpacity={0.6}
                disabled={voting}
                onPress={() => {
                  if (data.allows_multiple) setSelection(selected ? selection.filter((x) => x !== opt.id) : [...selection, opt.id]);
                  else vote([opt.id]);
                }}
              >
                <View
                  style={[
                    styles.radio,
                    { borderColor: isMine ? 'rgba(255,255,255,0.7)' : T.border },
                    data.allows_multiple && styles.radioSquare,
                    selected && { backgroundColor: accent, borderColor: accent },
                  ]}
                >
                  {selected && <Check size={12} color={isMine ? C.accent : T.onAccent} strokeWidth={3} />}
                </View>
                <Text style={[styles.optionText, { color: fg }]}>{opt.text}</Text>
              </TouchableOpacity>
            );
          }

          const correct = data.is_quiz && opt.is_correct;
          const wrongMine = data.is_quiz && mine && !opt.is_correct;
          const barColor = correct ? '#22C55E' : wrongMine ? '#EF4444' : accent;
          return (
            <View key={opt.id} style={styles.result}>
              <View style={styles.resultTop}>
                <Text style={[styles.percent, { color: fg }]}>{percent}%</Text>
                <Text style={[styles.optionText, { color: fg }]}>{opt.text}</Text>
              </View>
              <View style={styles.barRow}>
                <View style={styles.markSlot}>
                  {correct ? (
                    <View style={[styles.mark, { backgroundColor: T.success }]}>
                      <Check size={10} color={T.onAccent} strokeWidth={3.5} />
                    </View>
                  ) : wrongMine ? (
                    <View style={[styles.mark, { backgroundColor: T.danger }]}>
                      <X size={10} color={T.onAccent} strokeWidth={3.5} />
                    </View>
                  ) : mine ? (
                    <View style={[styles.mark, { backgroundColor: accent }]}>
                      <Check size={10} color={isMine ? C.accent : T.onAccent} strokeWidth={3.5} />
                    </View>
                  ) : null}
                </View>
                <View style={[styles.track, { backgroundColor: track }]}>
                  <ResultBar percent={Math.max(percent, opt.vote_count ? 2 : 0)} color={barColor} />
                </View>
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.footer}>
        {!showResults && data.allows_multiple ? (
          <TouchableOpacity onPress={() => vote(selection)} disabled={!selection.length || voting} hitSlop={8}>
            {voting ? (
              <ActivityIndicator color={accent} />
            ) : (
              <Text style={[styles.footerAction, { color: accent, opacity: selection.length ? 1 : 0.5 }]}>Голосовать</Text>
            )}
          </TouchableOpacity>
        ) : showResults && !data.is_anonymous && total > 0 ? (
          <TouchableOpacity onPress={openResults} hitSlop={8}>
            <Text style={[styles.footerAction, { color: accent }]}>Результаты</Text>
          </TouchableOpacity>
        ) : voting ? (
          <ActivityIndicator color={accent} />
        ) : (
          <Text style={[styles.footerText, { color: sub }]}>
            {total ? `${total} ${plural(total, ['голос', 'голоса', 'голосов'])}` : data.is_quiz ? 'Пока никто не ответил' : 'Пока нет голосов'}
          </Text>
        )}
      </View>

      {/* ===== Результаты публичного опроса ===== */}
      <Modal visible={resultsOpen} animationType="slide" onRequestClose={() => setResultsOpen(false)}>
        <SafeAreaView style={styles.resultsScreen}>
          <View style={styles.resultsHeader}>
            <TouchableOpacity onPress={() => setResultsOpen(false)} style={styles.backBtn} accessibilityLabel="Назад">
              <ChevronLeft size={26} color={C.text} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.resultsTitle}>{data.is_quiz ? 'Результаты викторины' : 'Результаты опроса'}</Text>
              <Text style={styles.resultsSub}>
                {total} {plural(total, ['голос', 'голоса', 'голосов'])}
              </Text>
            </View>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            <Text style={styles.resultsQuestion}>{data.question}</Text>
            {voters === null && !data.is_anonymous ? (
              <ActivityIndicator color={C.accent} style={{ marginTop: 24 }} />
            ) : (
              (data.options || []).map((opt: any) => {
                const percent = total > 0 ? Math.round((opt.vote_count / total) * 100) : 0;
                const list = (voters || []).filter((v) => v.option_id === opt.id);
                return (
                  <View key={opt.id} style={styles.group}>
                    <View style={styles.groupHeader}>
                      <Text style={styles.groupTitle} numberOfLines={2}>
                        {opt.text}
                        {data.is_quiz && opt.is_correct ? '  ✓' : ''}
                      </Text>
                      <Text style={styles.groupPercent}>
                        {percent}% · {opt.vote_count}
                      </Text>
                    </View>
                    {data.is_anonymous ? (
                      <Text style={styles.groupEmpty}>Анонимный опрос — голоса скрыты</Text>
                    ) : list.length === 0 ? (
                      <Text style={styles.groupEmpty}>Никто не выбрал</Text>
                    ) : (
                      list.map((v) => (
                        <View key={`${v.option_id}-${v.user_id}`} style={styles.voterRow}>
                          <MiniAvatar user={v} size={36} border={T.card} />
                          <Text style={styles.voterName} numberOfLines={1}>
                            {v.display_name || v.username}
                          </Text>
                          <Text style={styles.voterTime}>
                            {new Date(v.created_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        </View>
                      ))
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = themed(() => ({
  wrap: { minWidth: 240, maxWidth: 300, paddingTop: 2 },
  question: { fontSize: 16, fontWeight: '700', lineHeight: 21 },
  kindRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3, marginBottom: 8 },
  kind: { fontSize: 13 },
  stack: { flexDirection: 'row' },
  mini: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, overflow: 'hidden' },
  options: { gap: 2 },
  optionBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  radioSquare: { borderRadius: 6 },
  optionText: { flex: 1, fontSize: 15, lineHeight: 20 },
  result: { paddingVertical: 5 },
  resultTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  percent: { width: 40, fontSize: 14, fontWeight: '700', textAlign: 'right', lineHeight: 20 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 },
  markSlot: { width: 40, alignItems: 'flex-end' },
  mark: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  track: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  bar: { height: 4, borderRadius: 2 },
  footer: { alignItems: 'center', paddingTop: 10, paddingBottom: 2, minHeight: 30, justifyContent: 'center' },
  footerAction: { fontSize: 15, fontWeight: '700' },
  footerText: { fontSize: 13 },
  resultsScreen: { flex: 1, backgroundColor: T.inputBg },
  resultsHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, height: 56, backgroundColor: T.card },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  resultsTitle: { fontSize: 17, fontWeight: '700', color: C.text },
  resultsSub: { fontSize: 13, color: C.textMuted },
  resultsQuestion: { fontSize: 18, fontWeight: '700', color: C.text, marginBottom: 12 },
  group: { backgroundColor: T.card, borderRadius: 14, marginBottom: 12, overflow: 'hidden' },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  groupTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: C.text },
  groupPercent: { fontSize: 13, color: C.textMuted, fontWeight: '600' },
  groupEmpty: { padding: 14, color: C.textMuted, fontSize: 14 },
  voterRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 8 },
  voterName: { flex: 1, fontSize: 15, color: C.text },
  voterTime: { fontSize: 12, color: C.textMuted },
}));
