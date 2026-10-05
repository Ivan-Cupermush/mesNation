import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Check, CheckCheck, Sun, Moon, Smartphone } from 'lucide-react-native';
import { useTheme, BUBBLE_RADIUS_RANGE } from '../theme/ThemeContext';
import { PALETTES, ThemePreference, buildColors, PaletteColors } from '../theme/palettes';
import { T, themed } from '../theme/runtime';
import { PATTERN_INTENSITY, Wallpaper, getGlobalWallpaper, setGlobalWallpaper } from '../theme/wallpapers';
import { WallpaperView } from '../components/chat/ChatWallpaper';
import WallpaperPicker from '../components/chat/WallpaperPicker';
import StepSlider from '../components/ui/StepSlider';

/**
 * Внешний вид чатов (как «Настройки чатов» в Telegram): живой предпросмотр
 * сверху, размер текста и углы сообщений ползунками, тема и цвет —
 * карточками-мини-чатами, фон с затемнением, размытием и насыщенностью узора.
 */

const MODES: { key: ThemePreference; label: string; icon: any }[] = [
  { key: 'light', label: 'Светлая', icon: Sun },
  { key: 'dark', label: 'Тёмная', icon: Moon },
  { key: 'system', label: 'Как в системе', icon: Smartphone },
];

export default function AppearanceScreen({ navigation }: any) {
  const {
    preference,
    setPreference,
    paletteId,
    setPalette,
    mode,
    messageFontSize,
    setMessageFontSize,
    bubbleRadius,
    setBubbleRadius,
    sendByEnter,
    setSendByEnter,
  } = useTheme();
  const [wallpaper, setWallpaper] = useState<Wallpaper | null>(null);

  useEffect(() => {
    getGlobalWallpaper().then(setWallpaper);
  }, []);

  const changeWallpaper = (wp: Wallpaper) => {
    setWallpaper(wp);
    setGlobalWallpaper(wp);
  };

  const small = Math.max(4, Math.round(bubbleRadius / 3));

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn} accessibilityLabel="Назад">
          <ChevronLeft size={26} color={T.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Внешний вид</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {/* ===== Живой предпросмотр ===== */}
        <View style={styles.preview}>
          {wallpaper && <WallpaperView wallpaper={wallpaper} radius={20} />}
          <View style={styles.dateChip}>
            <Text style={styles.dateChipText}>Сегодня</Text>
          </View>
          <View style={[styles.bubble, styles.bubbleIn, { borderRadius: bubbleRadius, borderBottomLeftRadius: small }]}>
            <Text style={[styles.bubbleName, { color: T.accent }]}>Анна</Text>
            <View style={[styles.quote, { borderLeftColor: T.accent }]}>
              <Text style={[styles.quoteName, { color: T.accent }]}>Вы</Text>
              <Text style={styles.quoteText} numberOfLines={1}>
                Пришлите отчёт за квартал
              </Text>
            </View>
            <Text style={[styles.bubbleText, { fontSize: messageFontSize, lineHeight: Math.round(messageFontSize * 1.32), color: T.otherMessageText }]}>
              Готово, отчёт в общей папке
            </Text>
            <Text style={[styles.bubbleTime, { color: T.textMuted }]}>10:41</Text>
          </View>
          <View style={[styles.bubble, styles.bubbleOut, { borderRadius: bubbleRadius, borderBottomRightRadius: small }]}>
            <Text style={[styles.bubbleText, { fontSize: messageFontSize, lineHeight: Math.round(messageFontSize * 1.32), color: T.myMessageText }]}>
              Спасибо, смотрю
            </Text>
            <View style={styles.outMeta}>
              <Text style={[styles.bubbleTime, { color: T.myMessageMuted }]}>10:42</Text>
              <CheckCheck size={14} color={T.readTick} />
            </View>
          </View>
        </View>

        {/* ===== Размер текста ===== */}
        <Text style={styles.section}>РАЗМЕР ТЕКСТА СООБЩЕНИЙ</Text>
        <View style={[styles.card, styles.sliderRow]}>
          <Text style={[styles.sliderEdge, { fontSize: 13 }]}>A</Text>
          <View style={{ flex: 1 }}>
            <StepSlider min={13} max={22} value={messageFontSize} onChange={setMessageFontSize} accessibilityLabel="Размер текста сообщений" />
          </View>
          <Text style={[styles.sliderEdge, { fontSize: 22 }]}>A</Text>
          <Text style={styles.sliderValue}>{messageFontSize}</Text>
        </View>

        {/* ===== Углы сообщений ===== */}
        <Text style={styles.section}>УГЛЫ СООБЩЕНИЙ</Text>
        <View style={[styles.card, styles.sliderRow]}>
          <View style={[styles.cornerIcon, { borderTopLeftRadius: 3 }]} />
          <View style={{ flex: 1 }}>
            <StepSlider
              min={BUBBLE_RADIUS_RANGE.min}
              max={BUBBLE_RADIUS_RANGE.max}
              step={2}
              value={bubbleRadius}
              onChange={setBubbleRadius}
              accessibilityLabel="Скругление углов сообщений"
            />
          </View>
          <View style={[styles.cornerIcon, { borderTopLeftRadius: 12 }]} />
        </View>

        {/* ===== Тема ===== */}
        <Text style={styles.section}>ТЕМА</Text>
        <View style={styles.modes}>
          {MODES.map((m) => {
            const active = preference === m.key;
            const Icon = m.icon;
            return (
              <TouchableOpacity
                key={m.key}
                onPress={() => setPreference(m.key)}
                style={[styles.mode, active && styles.modeActive]}
                activeOpacity={0.85}
                accessibilityState={{ selected: active }}
              >
                <ModeThumb kind={m.key} paletteId={paletteId} />
                <View style={styles.modeLabelRow}>
                  <Icon size={14} color={active ? T.accent : T.textSecondary} />
                  <Text style={[styles.modeText, active && { color: T.accent, fontWeight: '700' }]} numberOfLines={1}>
                    {m.label}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ===== Цветовая тема ===== */}
        <Text style={styles.section}>ЦВЕТОВАЯ ТЕМА</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.palettes}>
          {PALETTES.map((p) => (
            <PaletteCard key={p.id} id={p.id} name={p.name} active={p.id === paletteId} mode={mode} onPress={() => setPalette(p.id)} />
          ))}
        </ScrollView>

        {/* ===== Фон чатов ===== */}
        <Text style={styles.section}>ФОН ЧАТОВ</Text>
        <View style={styles.card}>
          {wallpaper && <WallpaperPicker value={wallpaper} onChange={changeWallpaper} />}

          {wallpaper?.type === 'pattern' && (
            <View style={styles.wpOption}>
              <Text style={styles.optionTitle}>Насыщенность узора</Text>
              <StepSlider
                min={PATTERN_INTENSITY.min}
                max={PATTERN_INTENSITY.max}
                step={0.01}
                showTicks={false}
                value={wallpaper.intensity ?? PATTERN_INTENSITY.default}
                onChange={(v) => changeWallpaper({ ...wallpaper, intensity: v })}
                accessibilityLabel="Насыщенность узора"
              />
            </View>
          )}
          {wallpaper?.type === 'image' && (
            <>
              <View style={styles.wpOption}>
                <Text style={styles.optionTitle}>Затемнение</Text>
                <StepSlider
                  min={0}
                  max={0.7}
                  step={0.1}
                  value={wallpaper.dim ?? (mode === 'dark' ? 0.4 : 0)}
                  onChange={(v) => changeWallpaper({ ...wallpaper, dim: v })}
                  accessibilityLabel="Затемнение фона"
                />
              </View>
              <View style={[styles.wpOption, styles.switchRow]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionTitle}>Размытие</Text>
                  <Text style={styles.optionHint}>Фото не отвлекает от сообщений</Text>
                </View>
                <Switch
                  value={!!wallpaper.blur}
                  onValueChange={(v) => changeWallpaper({ ...wallpaper, blur: v })}
                  trackColor={{ true: T.accent, false: T.surfaceActive }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </>
          )}
          <Text style={styles.hint}>Фон для всех чатов. Свой фон для отдельного чата — в информации о чате, пункт «Фон чата».</Text>
        </View>

        {/* ===== Чат ===== */}
        <Text style={styles.section}>ЧАТЫ</Text>
        <View style={[styles.card, styles.switchRow]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.optionTitle}>Отправка по Enter</Text>
            <Text style={styles.optionHint}>Клавиша Enter отправляет сообщение вместо новой строки</Text>
          </View>
          <Switch value={sendByEnter} onValueChange={setSendByEnter} trackColor={{ true: T.accent, false: T.surfaceActive }} thumbColor="#FFFFFF" />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/** Миниатюра режима: светлый, тёмный или «как в системе» (половина на половину). */
function ModeThumb({ kind, paletteId }: { kind: ThemePreference; paletteId: any }) {
  const light = useMemo(() => buildColors(paletteId, 'light'), [paletteId]);
  const dark = useMemo(() => buildColors(paletteId, 'dark'), [paletteId]);
  if (kind === 'system') {
    return (
      <View style={styles.modeThumb}>
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <View style={{ flex: 1, overflow: 'hidden' }}>
            <MiniChat c={light} />
          </View>
          <View style={{ flex: 1, overflow: 'hidden' }}>
            <MiniChat c={dark} />
          </View>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.modeThumb}>
      <MiniChat c={kind === 'dark' ? dark : light} />
    </View>
  );
}

function MiniChat({ c }: { c: PaletteColors }) {
  return (
    <View style={[styles.miniChat, { backgroundColor: c.chatBg }]}>
      <View style={[styles.miniBar, { backgroundColor: c.card }]} />
      <View style={[styles.miniBubble, { backgroundColor: c.otherMessageBubble, alignSelf: 'flex-start', width: '62%' }]} />
      <View style={[styles.miniBubble, { backgroundColor: c.myMessageBubble, alignSelf: 'flex-end', width: '50%' }]} />
      <View style={[styles.miniBubble, { backgroundColor: c.otherMessageBubble, alignSelf: 'flex-start', width: '40%' }]} />
    </View>
  );
}

function PaletteCard({ id, name, active, mode, onPress }: { id: any; name: string; active: boolean; mode: 'light' | 'dark'; onPress: () => void }) {
  const c = useMemo(() => buildColors(id, mode), [id, mode]);
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.paletteItem} accessibilityLabel={`Цвет: ${name}`} accessibilityState={{ selected: active }}>
      <View style={[styles.paletteCard, { borderColor: active ? c.accent : 'transparent' }]}>
        <MiniChat c={c} />
        <View style={[styles.paletteDot, { backgroundColor: c.accent }]}>{active && <Check size={12} color="#FFFFFF" strokeWidth={3} />}</View>
      </View>
      <Text style={[styles.paletteName, active && { color: T.textPrimary, fontWeight: '700' }]} numberOfLines={1}>
        {name}
      </Text>
    </TouchableOpacity>
  );
}

const styles = themed(() => ({
  container: { flex: 1, backgroundColor: T.background },
  header: { flexDirection: 'row', alignItems: 'center', height: 56, paddingHorizontal: 4, backgroundColor: T.card },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700', color: T.textPrimary },
  body: { padding: 16, paddingBottom: 40 },
  // Предпросмотр
  preview: { borderRadius: 20, overflow: 'hidden', padding: 14, paddingTop: 12, gap: 8, backgroundColor: T.chatBg, minHeight: 230, justifyContent: 'flex-end' },
  dateChip: { alignSelf: 'center', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.28)', marginBottom: 2 },
  dateChipText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  bubble: { maxWidth: '80%', paddingHorizontal: 11, paddingTop: 7, paddingBottom: 6 },
  bubbleIn: { alignSelf: 'flex-start', backgroundColor: T.otherMessageBubble },
  bubbleOut: { alignSelf: 'flex-end', backgroundColor: T.myMessageBubble },
  bubbleName: { fontSize: 13, fontWeight: '700', marginBottom: 3 },
  quote: { borderLeftWidth: 3, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 4, backgroundColor: T.accentMuted },
  quoteName: { fontSize: 12, fontWeight: '700' },
  quoteText: { fontSize: 12, color: T.textSecondary },
  bubbleText: {},
  bubbleTime: { fontSize: 11, alignSelf: 'flex-end', marginTop: 2 },
  outMeta: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', gap: 3 },
  section: { fontSize: 12, fontWeight: '700', color: T.textSecondary, marginTop: 22, marginBottom: 8, marginLeft: 12 },
  card: { backgroundColor: T.card, borderRadius: 16, padding: 14 },
  // Ползунки
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  sliderEdge: { color: T.textSecondary, fontWeight: '700', width: 18, textAlign: 'center' },
  sliderValue: { width: 26, textAlign: 'right', fontSize: 14, fontWeight: '700', color: T.accent },
  cornerIcon: { width: 16, height: 16, borderTopWidth: 2.5, borderLeftWidth: 2.5, borderColor: T.textSecondary },
  // Тема
  modes: { flexDirection: 'row', gap: 10 },
  mode: { flex: 1, borderRadius: 16, padding: 6, paddingBottom: 8, borderWidth: 2, borderColor: 'transparent', backgroundColor: T.card },
  modeActive: { borderColor: T.accent },
  modeThumb: { height: 78, borderRadius: 11, overflow: 'hidden' },
  modeLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 7 },
  modeText: { fontSize: 12, color: T.textSecondary },
  miniChat: { flex: 1, padding: 6, gap: 4, justifyContent: 'flex-end' },
  miniBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 12 },
  miniBubble: { height: 9, borderRadius: 5 },
  // Цвета
  palettes: { gap: 10, paddingHorizontal: 2 },
  paletteItem: { width: 84, alignItems: 'center' },
  paletteCard: { width: 84, height: 108, borderRadius: 16, overflow: 'hidden', borderWidth: 2.5 },
  paletteDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  paletteName: { fontSize: 12, color: T.textSecondary, marginTop: 6 },
  // Фон
  wpOption: { marginTop: 16 },
  optionTitle: { fontSize: 15, fontWeight: '600', color: T.textPrimary },
  optionHint: { fontSize: 12, color: T.textSecondary, marginTop: 2 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  hint: { fontSize: 12, color: T.textSecondary, marginTop: 14, lineHeight: 17 },
}));
