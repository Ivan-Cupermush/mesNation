import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, TextInput, ScrollView, Keyboard, useWindowDimensions, ViewToken } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Clock3,
  Smile,
  Hand,
  PawPrint,
  Apple,
  Volleyball,
  Car,
  Lightbulb,
  Heart,
  Flag,
  Delete,
  Search,
  ArrowLeft,
  X,
} from 'lucide-react-native';
import { T, themed } from '../../theme/runtime';
import { withAlpha } from '../../theme/palettes';
import { EMOJI_CATEGORIES, searchEmoji } from './emojiData';

/**
 * Панель смайликов вместо клавиатуры — как в Telegram: недавние сверху,
 * разделы с вкладками снизу, кнопка «стереть», поиск по словам
 * (при поиске открывается клавиатура, а найденное — строкой над ней).
 */

const RECENT_KEY = '@offix/emoji/recent';
const RECENT_MAX = 32;
const ICONS: Record<string, any> = {
  recent: Clock3,
  smileys: Smile,
  people: Hand,
  nature: PawPrint,
  food: Apple,
  activity: Volleyball,
  travel: Car,
  objects: Lightbulb,
  symbols: Heart,
  flags: Flag,
};

let recentCache: string[] | null = null;

export async function loadRecentEmoji(): Promise<string[]> {
  if (recentCache) return recentCache;
  try {
    recentCache = JSON.parse((await AsyncStorage.getItem(RECENT_KEY)) || '[]');
  } catch {
    recentCache = [];
  }
  return recentCache!;
}

function rememberEmoji(e: string) {
  const next = [e, ...(recentCache || []).filter((x) => x !== e)].slice(0, RECENT_MAX);
  recentCache = next;
  AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => undefined);
  return next;
}

type Row = { type: 'title'; key: string; cat: string; label: string } | { type: 'row'; key: string; cat: string; items: string[] };

const TITLE_H = 34;
const CELL = 44;

export default function EmojiPanel({
  height,
  onPick,
  onBackspace,
  onSearchFocus,
}: {
  height: number;
  onPick: (emoji: string) => void;
  onBackspace: () => void;
  /** Поиск открыл клавиатуру — экрану чата нужно знать, чтобы не закрыть панель. */
  onSearchFocus?: (on: boolean) => void;
}) {
  const { width } = useWindowDimensions();
  const cols = Math.max(7, Math.floor((width - 12) / CELL));
  const [recent, setRecent] = useState<string[]>(recentCache || []);
  const [active, setActive] = useState('recent');
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState('');
  const list = useRef<FlatList<Row>>(null);

  useEffect(() => {
    loadRecentEmoji().then(setRecent);
  }, []);

  const rows = useMemo(() => {
    const out: Row[] = [];
    const add = (cat: string, label: string, emojis: string[]) => {
      if (!emojis.length) return;
      out.push({ type: 'title', key: `t-${cat}`, cat, label });
      for (let i = 0; i < emojis.length; i += cols) out.push({ type: 'row', key: `${cat}-${i}`, cat, items: emojis.slice(i, i + cols) });
    };
    add('recent', 'Недавние', recent);
    for (const c of EMOJI_CATEGORIES) add(c.key, c.label, c.emojis);
    return out;
  }, [recent, cols]);

  const offsets = useMemo(() => {
    let y = 0;
    return rows.map((r) => {
      const at = y;
      y += r.type === 'title' ? TITLE_H : CELL;
      return at;
    });
  }, [rows]);

  const tabs = useMemo(() => [...(recent.length ? ['recent'] : []), ...EMOJI_CATEGORIES.map((c) => c.key)], [recent.length]);

  const pick = useCallback(
    (e: string) => {
      onPick(e);
      // Недавние обновим, когда панель откроют снова — чтобы сетка не прыгала под пальцем.
      rememberEmoji(e);
    },
    [onPick],
  );

  const jump = (cat: string) => {
    const i = rows.findIndex((r) => r.type === 'title' && r.cat === cat);
    if (i >= 0) {
      setActive(cat);
      list.current?.scrollToOffset({ offset: offsets[i], animated: false });
    }
  };

  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems.find((v) => v.isViewable);
    if (first?.item?.cat) setActive(first.item.cat);
  }).current;

  const results = useMemo(() => (searching ? searchEmoji(q) : []), [searching, q]);

  if (searching) {
    return (
      <View style={styles.searchWrap}>
        <View style={styles.searchRow}>
          <TouchableOpacity
            onPress={() => {
              setSearching(false);
              setQ('');
              onSearchFocus?.(false);
              Keyboard.dismiss();
            }}
            style={styles.iconBtn}
            accessibilityLabel="Назад к смайликам"
          >
            <ArrowLeft size={20} color={T.textSecondary} />
          </TouchableOpacity>
          <TextInput
            style={styles.searchInput}
            value={q}
            onChangeText={setQ}
            placeholder="Поиск эмодзи"
            placeholderTextColor={T.textMuted}
            autoFocus
            onFocus={() => onSearchFocus?.(true)}
          />
          {q ? (
            <TouchableOpacity onPress={() => setQ('')} style={styles.iconBtn} accessibilityLabel="Очистить">
              <X size={18} color={T.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
        <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.resultsRow}>
          {q.trim() && !results.length ? <Text style={styles.noResults}>Ничего не нашлось — попробуйте другое слово</Text> : null}
          {!q.trim() ? <Text style={styles.noResults}>Например: «спасибо», «огонь», «кофе»</Text> : null}
          {results.map((e) => (
            <TouchableOpacity key={e} onPress={() => pick(e)} style={styles.cell} accessibilityLabel={e}>
              <Text style={styles.emoji}>{e}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.panel, { height }]}>
      <TouchableOpacity style={styles.searchPill} onPress={() => setSearching(true)} activeOpacity={0.7} accessibilityLabel="Поиск эмодзи">
        <Search size={16} color={T.textMuted} />
        <Text style={styles.searchPillText}>Поиск эмодзи</Text>
      </TouchableOpacity>
      <FlatList
        ref={list}
        data={rows}
        keyExtractor={(r) => r.key}
        keyboardShouldPersistTaps="always"
        initialNumToRender={14}
        windowSize={7}
        getItemLayout={(_, i) => ({ length: rows[i]?.type === 'title' ? TITLE_H : CELL, offset: offsets[i] ?? 0, index: i })}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 10 }}
        renderItem={({ item }) =>
          item.type === 'title' ? (
            <Text style={styles.title}>{item.label.toUpperCase()}</Text>
          ) : (
            <View style={styles.row}>
              {item.items.map((e, i) => (
                <TouchableOpacity key={`${e}-${i}`} onPress={() => pick(e)} style={styles.cell} accessibilityLabel={e}>
                  <Text style={styles.emoji}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )
        }
      />
      <View style={styles.tabs}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsInner}>
          {tabs.map((key) => {
            const Icon = ICONS[key] || Smile;
            const on = active === key;
            return (
              <TouchableOpacity key={key} onPress={() => jump(key)} style={[styles.tab, on && styles.tabOn]} accessibilityLabel={key}>
                <Icon size={19} color={on ? T.accent : T.textMuted} strokeWidth={2} />
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <TouchableOpacity onPress={onBackspace} onLongPress={onBackspace} style={styles.backspace} accessibilityLabel="Стереть">
          <Delete size={22} color={T.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = themed(() => ({
  panel: { backgroundColor: T.card, borderTopWidth: 1, borderTopColor: T.border },
  searchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 34,
    marginHorizontal: 10,
    marginTop: 8,
    marginBottom: 2,
    paddingHorizontal: 12,
    borderRadius: 17,
    backgroundColor: T.inputBg,
  },
  searchPillText: { fontSize: 14.5, color: T.textMuted },
  title: { height: TITLE_H, paddingTop: 12, paddingHorizontal: 14, fontSize: 12, fontWeight: '700', color: T.textMuted, letterSpacing: 0.4 },
  row: { flexDirection: 'row', paddingHorizontal: 6, height: CELL },
  cell: { width: CELL, height: CELL, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 28 },
  tabs: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: T.border, height: 46 },
  tabsInner: { paddingHorizontal: 6, gap: 2, alignItems: 'center' },
  tab: { width: 38, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: withAlpha(T.accent, 0.12) },
  backspace: { width: 52, height: 46, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderLeftColor: T.border },
  searchWrap: { backgroundColor: T.card, borderTopWidth: 1, borderTopColor: T.border, paddingBottom: 4 },
  searchRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingTop: 6 },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  searchInput: { flex: 1, height: 38, borderRadius: 19, paddingHorizontal: 14, backgroundColor: T.inputBg, fontSize: 15, color: T.textPrimary },
  resultsRow: { paddingHorizontal: 8, alignItems: 'center', minHeight: CELL + 8 },
  noResults: { fontSize: 13.5, color: T.textMuted, paddingHorizontal: 8 },
}));
