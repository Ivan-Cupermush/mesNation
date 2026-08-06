import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, ActivityIndicator,
} from 'react-native';
import { Check, X, Lock, HelpCircle } from 'lucide-react-native';
import { getToken, SERVER_URL } from '../utils';

const AVATAR_COLORS = ['#1F7A52', '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#0EA5E9', '#14B8A6', '#EF4444'];
const hashColor = (s: string) => {
  const sum = (s || '?').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
};
const initials = (name: string) =>
  (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

// ===== Кастомная иконка опроса (полоски-диаграмма) =====
export const PollGlyph = ({ width = 16, color = '#1F7A52' }: { width?: number; color?: string }) => (
  <View style={{ width, alignItems: 'flex-start', justifyContent: 'center' }}>
    <View style={{ width: width, height: 2.5, backgroundColor: color, borderRadius: 2, marginBottom: 3 }} />
    <View style={{ width: width * 0.66, height: 2.5, backgroundColor: color, borderRadius: 2, marginBottom: 3, opacity: 0.7 }} />
    <View style={{ width: width * 0.85, height: 2.5, backgroundColor: color, borderRadius: 2, opacity: 0.45 }} />
  </View>
);

export const PollIcon = ({ size = 30, color = '#1F7A52', bg = '#ECFDF5' }: { size?: number; color?: string; bg?: string }) => (
  <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
    <PollGlyph width={size * 0.52} color={color} />
  </View>
);

const MiniAvatar = ({ name, size = 20 }: { name: string; size?: number }) => (
  <View style={{
    width: size, height: size, borderRadius: size / 2,
    backgroundColor: hashColor(name || '?'),
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#FFFFFF',
  }}>
    <Text style={{ color: '#FFFFFF', fontSize: size * 0.42, fontWeight: '700' }}>
      {initials(name || '?')}
    </Text>
  </View>
);

export default function PollBubble({ poll, myVotes: initialVotes, currentUserId, isMine }: any) {
  const [data, setData] = useState<any>(poll);
  const [myVotes, setMyVotes] = useState<number[]>(initialVotes || []);
  const [usersMap, setUsersMap] = useState<Record<number, any>>({});
  const [multiSelection, setMultiSelection] = useState<number[]>([]);
  const [loadingVote, setLoadingVote] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [votersDetails, setVotersDetails] = useState<any[] | null>(null);
  const [loadingResults, setLoadingResults] = useState(false);

  const voted = myVotes.length > 0;
  const showBars = voted || data.is_closed;

  useEffect(() => {
    (async () => {
      try {
        const tok = await getToken();
        const res = await fetch(`${SERVER_URL}/api/users`, { headers: { Authorization: `Bearer ${tok}` } });
        if (res.ok) {
          const users = await res.json();
          const map: Record<number, any> = {};
          users.forEach((u: any) => { map[u.id] = u; });
          setUsersMap(map);
        }
      } catch (e) {}
    })();
  }, []);

  const vote = async (optionIds: number[]) => {
    if (data.is_closed || loadingVote) return;
    setLoadingVote(true);
    try {
      const tok = await getToken();
      const res = await fetch(`${SERVER_URL}/api/polls/${data.id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ option_ids: optionIds }),
      });
      if (res.ok) {
        const d = await res.json();
        setData(d.poll);
        setMyVotes(d.my_votes && d.my_votes.length ? d.my_votes : optionIds);
        setMultiSelection([]);
      }
    } catch (e) {}
    finally { setLoadingVote(false); }
  };

  const openResults = async () => {
    setShowResults(true);
    if (data.is_anonymous) {
      setVotersDetails([]);
      return;
    }
    if (votersDetails === null) {
      setLoadingResults(true);
      try {
        const tok = await getToken();
        const res = await fetch(`${SERVER_URL}/api/polls/${data.id}/voters`, { headers: { Authorization: `Bearer ${tok}` } });
        if (res.ok) setVotersDetails(await res.json());
        else setVotersDetails([]);
      } catch (e) { setVotersDetails([]); }
      finally { setLoadingResults(false); }
    }
  };

  const total = data.total_votes || 0;
  const voterIds: number[] = Array.from(new Set((data.options || []).flatMap((o: any) => o.voters || [])));

  return (
    <View style={styles.card}>
      {/* ===== Шапка опроса ===== */}
      <View style={styles.header}>
        <PollIcon size={32} />
        <View style={{ flex: 1 }}>
          <View style={styles.headerLabelRow}>
            <Text style={styles.headerLabel}>ОПРОС</Text>
            {data.is_quiz && <HelpCircle size={12} color="#8B5CF6" strokeWidth={2.5} />}
            {data.is_anonymous && <Text style={styles.headerBadge}>анонимный</Text>}
            {data.allows_multiple && <Text style={styles.headerBadge}>несколько ответов</Text>}
          </View>
          <Text style={styles.question} numberOfLines={3}>{data.question}</Text>
        </View>
        {data.is_closed && (
          <View style={styles.closedBadge}>
            <Lock size={12} color="#6F6F73" strokeWidth={2.5} />
          </View>
        )}
      </View>

      {/* ===== Варианты ===== */}
      <View style={styles.options}>
        {(data.options || []).map((opt: any) => {
          const percent = total > 0 ? Math.round((opt.vote_count / total) * 100) : 0;
          const isMyOption = myVotes.includes(opt.id);
          const isSelected = multiSelection.includes(opt.id);
          const isCorrectReveal = data.is_quiz && showBars && opt.is_correct;
          const isWrongMine = data.is_quiz && showBars && isMyOption && !opt.is_correct;

          if (!showBars) {
            // ===== Ещё не голосовали: выбор =====
            return (
              <TouchableOpacity
                key={opt.id}
                style={styles.optionBtn}
                activeOpacity={0.7}
                disabled={loadingVote}
                onPress={() => {
                  if (data.allows_multiple) {
                    setMultiSelection(isSelected ? multiSelection.filter((x) => x !== opt.id) : [...multiSelection, opt.id]);
                  } else {
                    vote([opt.id]);
                  }
                }}
              >
                <View style={[
                  styles.radio,
                  data.allows_multiple && styles.radioSquare,
                  (isSelected || isMyOption) && styles.radioActive,
                ]}>
                  {(isSelected || isMyOption) && <Check size={12} color="#FFFFFF" strokeWidth={3} />}
                </View>
                <Text style={styles.optionBtnText}>{opt.text}</Text>
              </TouchableOpacity>
            );
          }

          // ===== Результаты с прогресс-баром =====
          return (
            <View key={opt.id} style={styles.optionResult}>
              <View style={styles.optionTopRow}>
                {isMyOption && !data.is_quiz && (
                  <View style={styles.myCheck}><Check size={10} color="#FFFFFF" strokeWidth={3} /></View>
                )}
                {isCorrectReveal && (
                  <View style={[styles.myCheck, { backgroundColor: '#10B981' }]}><Check size={10} color="#FFFFFF" strokeWidth={3} /></View>
                )}
                {isWrongMine && (
                  <View style={[styles.myCheck, { backgroundColor: '#EF4444' }]}><X size={10} color="#FFFFFF" strokeWidth={3} /></View>
                )}
                <Text style={[styles.percent, isCorrectReveal && { color: '#10B981' }, isWrongMine && { color: '#EF4444' }]}>
                  {percent}%
                </Text>
                <Text style={styles.optionText} numberOfLines={2}>{opt.text}</Text>
                <View style={styles.rightMeta}>
                  <Text style={styles.count}>{opt.vote_count}</Text>
                  {!data.is_anonymous && (
                    <View style={styles.votersStack}>
                      {(opt.voters || []).slice(0, 2).map((id: number) => (
                        <MiniAvatar key={id} name={usersMap[id]?.display_name || usersMap[id]?.username || '?'} />
                      ))}
                    </View>
                  )}
                </View>
              </View>
              <View style={styles.barTrack}>
                <View style={[
                  styles.barFill,
                  { width: `${percent}%` },
                  isCorrectReveal && { backgroundColor: '#10B981' },
                  isWrongMine && { backgroundColor: '#EF4444' },
                ]} />
              </View>
            </View>
          );
        })}
      </View>

      {/* ===== Кнопка голосования (multiple) ===== */}
      {!showBars && data.allows_multiple && multiSelection.length > 0 && (
        <TouchableOpacity style={styles.voteBtn} activeOpacity={0.85} onPress={() => vote(multiSelection)}>
          <Text style={styles.voteBtnText}>Голосовать</Text>
        </TouchableOpacity>
      )}

      {/* ===== Футер ===== */}
      <View style={styles.footer}>
        <View style={styles.footerLeft}>
          {voterIds.length > 0 && !data.is_anonymous && (
            <View style={styles.votersStack}>
              {voterIds.slice(0, 3).map((id: number) => (
                <MiniAvatar key={id} name={usersMap[id]?.display_name || usersMap[id]?.username || '?'} size={18} />
              ))}
            </View>
          )}
          <Text style={styles.footerText}>
            {total} {total === 1 ? 'голос' : total < 5 && total > 0 ? 'голоса' : 'голосов'}
          </Text>
        </View>
        {total > 0 && (
          <TouchableOpacity onPress={openResults}>
            <Text style={styles.footerLink}>Посмотреть голоса ({total})</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ===== Модалка результатов (как в TG) ===== */}
      <Modal visible={showResults} transparent animationType="fade">
        <TouchableOpacity activeOpacity={1} style={styles.modalOverlay} onPress={() => setShowResults(false)}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Результаты</Text>
                <Text style={styles.modalQuestion} numberOfLines={1}>{data.question}</Text>
                <Text style={styles.modalTotal}>{total} голосов</Text>
              </View>
              <TouchableOpacity onPress={() => setShowResults(false)} style={styles.modalClose}>
                <X size={22} color="#141414" strokeWidth={2} />
              </TouchableOpacity>
            </View>

            {loadingResults ? (
              <View style={{ padding: 30 }}><ActivityIndicator color="#1F7A52" /></View>
            ) : (
              <ScrollView style={{ maxHeight: 420 }}>
                {(data.options || []).map((opt: any) => {
                  const percent = total > 0 ? Math.round((opt.vote_count / total) * 100) : 0;
                  const optVoters = (votersDetails || []).filter((v: any) => v.option_id === opt.id);
                  return (
                    <View key={opt.id}>
                      <View style={styles.groupHeader}>
                        <Text style={styles.groupHeaderText}>
                          {opt.text} — {percent}%
                        </Text>
                        <Text style={styles.groupHeaderCount}>
                          {opt.vote_count} {opt.vote_count === 1 ? 'голос' : 'голоса'}
                        </Text>
                      </View>
                      {data.is_anonymous ? (
                        <Text style={styles.noVoters}>Анонимный опрос — голоса скрыты</Text>
                      ) : optVoters.length === 0 ? (
                        <Text style={styles.noVoters}>Нет голосов</Text>
                      ) : null}
                      {optVoters.map((v: any) => (
                        <View key={`${v.option_id}-${v.user_id}`} style={styles.voterRow}>
                          <MiniAvatar name={v.display_name || v.username} size={34} />
                          <Text style={styles.voterName} numberOfLines={1}>
                            {v.display_name || v.username}
                          </Text>
                          <Text style={styles.voterDate}>
                            {new Date(v.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}{'\n'}
                            {new Date(v.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        </View>
                      ))}
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    minWidth: 260,
    maxWidth: 320,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },

  header: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  headerLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  headerLabel: { fontSize: 10, fontWeight: '800', color: '#1F7A52', letterSpacing: 0.8 },
  headerBadge: { fontSize: 10, color: '#6F6F73', fontWeight: '500' },
  question: { fontSize: 15, fontWeight: '700', color: '#141414', lineHeight: 20 },
  closedBadge: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: '#F4F4F5',
    alignItems: 'center', justifyContent: 'center',
  },

  options: { gap: 8 },

  // ===== выбор =====
  optionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: '#FAFAF8', borderRadius: 12, borderWidth: 1, borderColor: '#ECECE8',
  },
  radio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: '#BDBDBD',
    alignItems: 'center', justifyContent: 'center',
  },
  radioSquare: { borderRadius: 6 },
  radioActive: { backgroundColor: '#1F7A52', borderColor: '#1F7A52' },
  optionBtnText: { flex: 1, fontSize: 14, fontWeight: '500', color: '#141414' },

  // ===== результаты =====
  optionResult: { gap: 5 },
  optionTopRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  myCheck: {
    width: 16, height: 16, borderRadius: 8, backgroundColor: '#1F7A52',
    alignItems: 'center', justifyContent: 'center',
  },
  percent: { fontSize: 13, fontWeight: '800', color: '#1F7A52', width: 38 },
  optionText: { flex: 1, fontSize: 14, fontWeight: '500', color: '#141414' },
  rightMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  count: { fontSize: 12, fontWeight: '700', color: '#6F6F73' },
  votersStack: { flexDirection: 'row' },
  barTrack: { height: 4, borderRadius: 2, backgroundColor: '#ECECE8', overflow: 'hidden' },
  barFill: { height: 4, borderRadius: 2, backgroundColor: '#1F7A52' },

  voteBtn: {
    marginTop: 10, height: 40, borderRadius: 12, backgroundColor: '#1F7A52',
    alignItems: 'center', justifyContent: 'center',
  },
  voteBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },

  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F4F4F5',
  },
  footerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  footerText: { fontSize: 12, color: '#6F6F73', fontWeight: '500' },
  footerLink: { fontSize: 12, fontWeight: '700', color: '#1F7A52' },

  // ===== модалка =====
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 20, paddingBottom: 32,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  modalTitle: {
    fontFamily: 'sans-serif-condensed', fontSize: 22, fontWeight: '900', color: '#141414', letterSpacing: 0.5,
  },
  modalQuestion: { fontSize: 14, fontWeight: '600', color: '#141414', marginTop: 4, maxWidth: 260 },
  modalTotal: { fontSize: 12, color: '#6F6F73', marginTop: 2 },
  modalClose: { padding: 4, alignSelf: 'flex-start' },

  groupHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#FAFAF8', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    marginTop: 10, marginBottom: 6,
  },
  groupHeaderText: { fontSize: 13, fontWeight: '700', color: '#1F7A52', flex: 1 },
  groupHeaderCount: { fontSize: 12, color: '#6F6F73', fontWeight: '600' },
  noVoters: { fontSize: 12, color: '#BDBDBD', paddingHorizontal: 12, paddingVertical: 4 },
  voterRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 6 },
  voterName: { flex: 1, fontSize: 14, fontWeight: '600', color: '#141414' },
  voterDate: { fontSize: 11, color: '#6F6F73', textAlign: 'right' },
});