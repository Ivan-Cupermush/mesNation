import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Animated, Easing, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  X,
  RefreshCw,
  ArrowDown,
  NotebookPen,
  Paperclip,
  CopyPlus,
  EyeOff,
  BellRing,
  Check,
  Hourglass,
  Send,
  Trash2,
} from 'lucide-react-native';
import { api, NoteVersionRequest } from '../services/api';
import { refreshUnread } from '../notifications/inbox';
import { clearNoteRequestNotification } from '../notifications/display';
import { NOTE_COLOR } from '../notifications/model';
import { openNote } from '../navigation/ref';
import UserAvatar from '../components/ui/UserAvatar';
import { T, themed } from '../theme/runtime';
import { withAlpha } from '../theme/palettes';

/**
 * «Поделиться новой версией?» — экран, который открывается из колокольчика,
 * баннера или шторки. Автор видит, кто просит, что у коллеги сейчас и что
 * он получит, и подтверждает одной кнопкой. Запросивший на этом же экране
 * видит, ждёт ли он ещё ответа.
 */

const when = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
};

const ago = (iso: string) => {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'только что';
  if (min < 60) return `${min} мин назад`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ч назад`;
  return when(iso);
};

const firstName = (name?: string | null) => (name || 'Коллега').split(' ')[0];

export default function NoteRequestScreen({ navigation, route }: any) {
  const requestId = Number(route.params?.requestId);
  const [r, setR] = useState<NoteVersionRequest | null>(null);
  const [busy, setBusy] = useState<'approve' | 'decline' | null>(null);
  const [justDone, setJustDone] = useState(false);
  const appear = useRef(new Animated.Value(0)).current;

  const load = useCallback(async () => {
    try {
      setR(await api.getNoteRequest(requestId));
      Animated.timing(appear, { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } catch (e: any) {
      Alert.alert('Запрос не найден', e?.message || 'Возможно, его уже удалили');
      navigation.goBack();
    }
  }, [requestId, appear, navigation]);

  useEffect(() => {
    load();
    clearNoteRequestNotification(requestId);
  }, [load, requestId]);

  const close = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main'));

  const approve = async () => {
    if (!r) return;
    setBusy('approve');
    try {
      setR(await api.approveNoteRequest(r.id));
      setJustDone(true);
      refreshUnread();
    } catch (e: any) {
      Alert.alert('Не удалось поделиться', e?.message || '');
    } finally {
      setBusy(null);
    }
  };

  const decline = () => {
    if (!r) return;
    Alert.alert('Отклонить запрос?', `${firstName(r.requester.name)} получит уведомление, что вы не стали делиться новой версией.`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Отклонить',
        style: 'destructive',
        onPress: async () => {
          setBusy('decline');
          try {
            setR(await api.declineNoteRequest(r.id));
            setJustDone(true);
            refreshUnread();
          } catch (e: any) {
            Alert.alert('Не удалось отклонить', e?.message || '');
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  if (!r) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <ActivityIndicator color={NOTE_COLOR} size="large" />
      </SafeAreaView>
    );
  }

  const slide = (d: number) => ({
    opacity: appear,
    transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [d, 0] }) }],
  });

  // ----- Ответ уже дан (или это экран запросившего) -----
  if (r.status !== 'pending' || !r.is_owner) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle={T.statusBar} backgroundColor="transparent" translucent />
        <View style={styles.topBar}>
          <View style={{ flex: 1 }} />
          <TouchableOpacity onPress={close} style={styles.closeBtn} accessibilityLabel="Закрыть">
            <X size={22} color={T.textPrimary} />
          </TouchableOpacity>
        </View>
        <Outcome r={r} justDone={justDone} onClose={close} />
      </SafeAreaView>
    );
  }

  // ----- Автор: подтверждение -----
  const who = firstName(r.requester.name);
  const noteGone = !r.note;
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={T.statusBar} backgroundColor="transparent" translucent />
      <View style={styles.topBar}>
        <Text style={styles.topKicker}>ЗАПРОС ЗАМЕТКИ</Text>
        <TouchableOpacity onPress={close} style={styles.closeBtn} accessibilityLabel="Закрыть">
          <X size={22} color={T.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* Кто просит */}
        <Animated.View style={[styles.hero, slide(10)]}>
          <View style={styles.avatarRing}>
            <UserAvatar name={r.requester.name} url={r.requester.avatar_url} size={78} />
            <View style={styles.heroBadge}>
              <RefreshCw size={15} color="#FFFFFF" strokeWidth={2.8} />
            </View>
          </View>
          <Text style={styles.question}>Поделиться новой версией?</Text>
          <Text style={styles.heroSub}>
            <Text style={styles.heroName}>{r.requester.name}</Text> просит текущую версию вашей заметки · {ago(r.created_at)}
          </Text>
        </Animated.View>

        {/* Что у него сейчас → что он получит */}
        <Animated.View style={slide(18)}>
          <View style={[styles.card, styles.cardNow]}>
            <Text style={styles.cardLabel}>СЕЙЧАС У КОЛЛЕГИ</Text>
            <View style={styles.cardTitleRow}>
              <NotebookPen size={16} color={T.textSecondary} />
              <Text style={[styles.cardTitle, { color: T.textSecondary }]} numberOfLines={1}>
                {r.shared.title || 'Без названия'}
              </Text>
            </View>
            <Text style={styles.cardMeta}>копия от {when(r.shared.created_at)}</Text>
          </View>

          <View style={styles.arrowWrap}>
            <View style={styles.arrow}>
              <ArrowDown size={16} color="#FFFFFF" strokeWidth={2.8} />
            </View>
          </View>

          {noteGone ? (
            <View style={[styles.card, styles.cardGone]}>
              <View style={styles.cardTitleRow}>
                <Trash2 size={16} color={T.danger} />
                <Text style={[styles.cardTitle, { color: T.danger }]}>Заметка удалена</Text>
              </View>
              <Text style={styles.cardMeta}>Делиться больше нечем — запрос можно только отклонить.</Text>
            </View>
          ) : (
            <View style={[styles.card, styles.cardNext]}>
              <View style={styles.cardHead}>
                <Text style={[styles.cardLabel, { color: NOTE_COLOR, marginBottom: 0 }]}>ПОЛУЧИТ</Text>
                <View style={[styles.tag, { backgroundColor: r.note!.changed_since_share ? withAlpha(NOTE_COLOR, 0.14) : T.inputBg }]}>
                  <Text style={[styles.tagText, { color: r.note!.changed_since_share ? NOTE_COLOR : T.textSecondary }]}>
                    {r.note!.changed_since_share ? 'Есть изменения' : 'Без изменений'}
                  </Text>
                </View>
              </View>
              <View style={styles.cardTitleRow}>
                <NotebookPen size={17} color={NOTE_COLOR} />
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {r.note!.title || 'Без названия'}
                </Text>
              </View>
              {r.note!.preview ? (
                <View style={styles.paper}>
                  <Text style={styles.paperText} numberOfLines={6}>
                    {r.note!.preview}
                  </Text>
                </View>
              ) : (
                <Text style={styles.cardMeta}>Текста нет</Text>
              )}
              <View style={styles.cardFoot}>
                {r.note!.files_count ? (
                  <>
                    <Paperclip size={13} color={T.textSecondary} />
                    <Text style={styles.cardMeta}>{r.note!.files_count} влож. · </Text>
                  </>
                ) : null}
                <Text style={styles.cardMeta}>изменена {when(r.note!.updated_at)}</Text>
              </View>
            </View>
          )}
        </Animated.View>

        {/* Что произойдёт */}
        {!noteGone && (
          <Animated.View style={[styles.facts, slide(26)]}>
            <Fact
              icon={<CopyPlus size={18} color={NOTE_COLOR} />}
              title="Придёт отдельной копией"
              text="У коллеги появится новая заметка. Если такое название у него уже есть — добавится номер, как в Проводнике: «… (2)». Прошлая копия не изменится."
            />
            <Fact
              icon={<EyeOff size={18} color={NOTE_COLOR} />}
              title="Без доступа к оригиналу"
              text="Вы делитесь только снимком на этот момент — следующие правки останутся у вас."
            />
            <Fact
              icon={<BellRing size={18} color={NOTE_COLOR} />}
              title={`${who} узнает сразу`}
              text="Придёт уведомление, копия откроется в один тап."
            />
          </Animated.View>
        )}
      </ScrollView>

      <View style={styles.bottom}>
        {!noteGone && (
          <TouchableOpacity style={styles.primary} onPress={approve} disabled={!!busy} activeOpacity={0.88} accessibilityLabel="Поделиться текущей версией">
            {busy === 'approve' ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Send size={18} color="#FFFFFF" strokeWidth={2.4} />
                <Text style={styles.primaryText}>Поделиться текущей версией</Text>
              </>
            )}
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.secondary} onPress={decline} disabled={!!busy} accessibilityLabel="Отклонить запрос">
          {busy === 'decline' ? <ActivityIndicator color={T.textSecondary} /> : <Text style={styles.secondaryText}>Отклонить</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function Fact({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <View style={styles.fact}>
      <View style={styles.factIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.factTitle}>{title}</Text>
        <Text style={styles.factText}>{text}</Text>
      </View>
    </View>
  );
}

/** Итог: поделились / отклонили / ждём ответа (для запросившего). */
function Outcome({ r, justDone, onClose }: { r: NoteVersionRequest; justDone: boolean; onClose: () => void }) {
  const pop = useRef(new Animated.Value(justDone ? 0 : 1)).current;
  useEffect(() => {
    if (justDone) Animated.spring(pop, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }).start();
  }, [justDone, pop]);

  const owner = r.is_owner;
  const other = owner ? r.requester : r.owner;
  const name = firstName(other.name);
  const title = r.note?.title || r.shared.title || 'Без названия';

  let tone = NOTE_COLOR;
  let Icon = Hourglass;
  let head = '';
  let text = '';
  if (r.status === 'approved') {
    tone = T.success;
    Icon = Check;
    head = owner ? 'Готово' : `${name} поделился(ась)`;
    text = owner
      ? `${name} получил(а) новую копию заметки «${title}». Ваш оригинал остался у вас.`
      : `Новая копия заметки «${title}» уже в ваших заметках.`;
  } else if (r.status === 'declined') {
    tone = T.textMuted;
    Icon = X;
    head = owner ? 'Запрос отклонён' : `${name} отклонил(а) запрос`;
    text = owner ? `${name} узнает, что вы не стали делиться новой версией.` : 'Можно попросить ещё раз позже — из заметки в чате.';
  } else {
    head = 'Ждём ответа';
    text = `${name} получил(а) ваш запрос текущей версии «${title}». Как только подтвердит — новая копия появится в ваших заметках.`;
  }

  return (
    <View style={styles.outcome}>
      <Animated.View style={[styles.outcomeIcon, { backgroundColor: withAlpha(tone, 0.14), transform: [{ scale: pop }] }]}>
        <View style={[styles.outcomeInner, { backgroundColor: tone }]}>
          <Icon size={34} color="#FFFFFF" strokeWidth={2.6} />
        </View>
      </Animated.View>
      <View style={styles.outcomeWho}>
        <UserAvatar name={other.name} url={other.avatar_url} size={22} />
        <Text style={styles.outcomeWhoText}>{other.name}</Text>
      </View>
      <Text style={styles.outcomeHead}>{head}</Text>
      <Text style={styles.outcomeText}>{text}</Text>
      {r.resolved_at ? <Text style={styles.outcomeWhen}>{when(r.resolved_at)}</Text> : null}

      <View style={styles.outcomeActions}>
        {!owner && r.status === 'approved' && r.result_note_id ? (
          <TouchableOpacity style={styles.primary} onPress={() => openNote(r.result_note_id!)} activeOpacity={0.88}>
            <NotebookPen size={18} color="#FFFFFF" />
            <Text style={styles.primaryText}>Открыть заметку</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={[styles.secondary, styles.secondaryBox]} onPress={onClose}>
          <Text style={[styles.secondaryText, { color: T.textPrimary }]}>{justDone ? 'Готово' : 'Закрыть'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = themed(() => ({
  container: { flex: 1, backgroundColor: T.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 8, paddingTop: 4, height: 52 },
  topKicker: { flex: 1, fontSize: 12, fontWeight: '800', letterSpacing: 1, color: NOTE_COLOR },
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: T.inputBg, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 20, paddingBottom: 24 },

  hero: { alignItems: 'center', paddingTop: 6, paddingBottom: 22 },
  avatarRing: { padding: 4, borderRadius: 50, borderWidth: 2, borderColor: withAlpha(NOTE_COLOR, 0.35) },
  heroBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: NOTE_COLOR,
    borderWidth: 3,
    borderColor: T.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  question: { fontSize: 25, fontWeight: '800', color: T.textPrimary, marginTop: 16, textAlign: 'center' },
  heroSub: { fontSize: 15, lineHeight: 21, color: T.textSecondary, textAlign: 'center', marginTop: 6, paddingHorizontal: 8 },
  heroName: { fontWeight: '700', color: T.textPrimary },

  card: { borderRadius: 18, padding: 14 },
  cardNow: { backgroundColor: T.card, borderWidth: 1, borderColor: T.border },
  cardNext: { backgroundColor: T.card, borderWidth: 1.5, borderColor: withAlpha(NOTE_COLOR, 0.55) },
  cardGone: { backgroundColor: withAlpha(T.danger, 0.06), borderWidth: 1, borderColor: withAlpha(T.danger, 0.3) },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  cardLabel: { fontSize: 11.5, fontWeight: '800', letterSpacing: 0.8, color: T.textMuted, marginBottom: 6 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { flex: 1, fontSize: 16.5, fontWeight: '700', color: T.textPrimary },
  cardMeta: { fontSize: 12.5, color: T.textSecondary, marginTop: 4 },
  cardFoot: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 6 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  tagText: { fontSize: 11.5, fontWeight: '700' },
  paper: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: withAlpha(NOTE_COLOR, 0.05),
    borderLeftWidth: 3,
    borderLeftColor: withAlpha(NOTE_COLOR, 0.55),
  },
  paperText: { fontSize: 14, lineHeight: 20, color: T.textPrimary },
  arrowWrap: { alignItems: 'center', marginVertical: -8, zIndex: 2 },
  arrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: NOTE_COLOR,
    borderWidth: 3,
    borderColor: T.background,
    alignItems: 'center',
    justifyContent: 'center',
  },

  facts: { marginTop: 22, gap: 14 },
  fact: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  factIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: withAlpha(NOTE_COLOR, 0.12), alignItems: 'center', justifyContent: 'center' },
  factTitle: { fontSize: 15, fontWeight: '700', color: T.textPrimary },
  factText: { fontSize: 13.5, lineHeight: 19, color: T.textSecondary, marginTop: 2 },

  bottom: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14, gap: 6, borderTopWidth: 1, borderTopColor: T.border, backgroundColor: T.background },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 54,
    borderRadius: 18,
    backgroundColor: T.accent,
    shadowColor: T.accent,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  primaryText: { color: '#FFFFFF', fontSize: 16.5, fontWeight: '800' },
  secondary: { height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
  secondaryBox: { backgroundColor: T.inputBg },
  secondaryText: { fontSize: 15.5, fontWeight: '700', color: T.danger },

  outcome: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingBottom: 40 },
  outcomeIcon: { width: 112, height: 112, borderRadius: 56, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  outcomeInner: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  outcomeWho: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: T.inputBg },
  outcomeWhoText: { fontSize: 13.5, fontWeight: '600', color: T.textPrimary },
  outcomeHead: { fontSize: 26, fontWeight: '800', color: T.textPrimary, marginTop: 14, textAlign: 'center' },
  outcomeText: { fontSize: 15.5, lineHeight: 22, color: T.textSecondary, textAlign: 'center', marginTop: 8 },
  outcomeWhen: { fontSize: 12.5, color: T.textMuted, marginTop: 8 },
  outcomeActions: { alignSelf: 'stretch', gap: 10, marginTop: 30 },
}));
