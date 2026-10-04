import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Check, Sun, Moon, Smartphone, Minus, Plus, CheckCheck } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';
import { PALETTES, ThemePreference } from '../theme/palettes';
import { T, themed } from '../theme/runtime';
import { Wallpaper, getGlobalWallpaper, setGlobalWallpaper } from '../theme/wallpapers';
import { WallpaperView } from '../components/chat/ChatWallpaper';
import WallpaperPicker from '../components/chat/WallpaperPicker';

/**
 * Оформление (как «Настройки чатов» в Telegram): тема, цвет акцента,
 * фон чатов и размер текста сообщений — с живым предпросмотром.
 */

const MODES: { key: ThemePreference; label: string; icon: any }[] = [
  { key: 'light', label: 'Светлая', icon: Sun },
  { key: 'dark', label: 'Тёмная', icon: Moon },
  { key: 'system', label: 'Как в системе', icon: Smartphone },
];

export default function AppearanceScreen({ navigation }: any) {
  const { preference, setPreference, paletteId, setPalette, isDark, messageFontSize, setMessageFontSize } = useTheme();
  const [wallpaper, setWallpaper] = useState<Wallpaper | null>(null);

  useEffect(() => {
    getGlobalWallpaper().then(setWallpaper);
  }, []);

  const changeWallpaper = (wp: Wallpaper) => {
    setWallpaper(wp);
    setGlobalWallpaper(wp);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn} accessibilityLabel="Назад">
          <ChevronLeft size={26} color={T.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Оформление</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {/* ===== Предпросмотр ===== */}
        <View style={styles.preview}>
          {wallpaper && <WallpaperView wallpaper={wallpaper} radius={18} />}
          <View style={[styles.bubble, styles.bubbleIn]}>
            <Text style={[styles.bubbleName, { color: T.accent }]}>Анна</Text>
            <Text style={[styles.bubbleText, { fontSize: messageFontSize, color: T.otherMessageText }]}>Отчёт за квартал готов, посмотрите?</Text>
            <Text style={[styles.bubbleTime, { color: T.textMuted }]}>10:41</Text>
          </View>
          <View style={[styles.bubble, styles.bubbleOut]}>
            <Text style={[styles.bubbleText, { fontSize: messageFontSize, color: T.myMessageText }]}>Да, уже открыл 👍</Text>
            <View style={styles.outMeta}>
              <Text style={[styles.bubbleTime, { color: T.myMessageMuted }]}>10:42</Text>
              <CheckCheck size={14} color={T.readTick} />
            </View>
          </View>
        </View>

        {/* ===== Тема ===== */}
        <Text style={styles.section}>ТЕМА</Text>
        <View style={styles.card}>
          <View style={styles.modes}>
            {MODES.map((m) => {
              const active = preference === m.key;
              const Icon = m.icon;
              return (
                <TouchableOpacity key={m.key} onPress={() => setPreference(m.key)} style={[styles.mode, active && styles.modeActive]} activeOpacity={0.8}>
                  <Icon size={22} color={active ? T.accent : T.textSecondary} />
                  <Text style={[styles.modeText, active && { color: T.accent, fontWeight: '700' }]}>{m.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ===== Цвет ===== */}
        <Text style={styles.section}>ЦВЕТ ОФОРМЛЕНИЯ</Text>
        <View style={styles.card}>
          <View style={styles.palettes}>
            {PALETTES.map((p) => {
              const active = p.id === paletteId;
              const color = isDark ? p.dark : p.light;
              return (
                <TouchableOpacity key={p.id} onPress={() => setPalette(p.id)} style={styles.palette} activeOpacity={0.8} accessibilityLabel={p.name}>
                  <View style={[styles.swatchRing, active && { borderColor: color }]}>
                    <View style={[styles.swatch, { backgroundColor: color }]}>{active && <Check size={18} color="#FFFFFF" strokeWidth={3} />}</View>
                  </View>
                  <Text style={[styles.paletteName, active && { color: T.textPrimary, fontWeight: '700' }]} numberOfLines={1}>
                    {p.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ===== Размер текста ===== */}
        <Text style={styles.section}>РАЗМЕР ТЕКСТА СООБЩЕНИЙ</Text>
        <View style={[styles.card, styles.fontRow]}>
          <TouchableOpacity
            onPress={() => setMessageFontSize(Math.max(13, messageFontSize - 1))}
            style={styles.fontBtn}
            disabled={messageFontSize <= 13}
            accessibilityLabel="Меньше"
          >
            <Minus size={18} color={messageFontSize <= 13 ? T.textMuted : T.textPrimary} />
          </TouchableOpacity>
          <View style={styles.fontTrack}>
            {Array.from({ length: 10 }, (_, i) => 13 + i).map((s) => (
              <TouchableOpacity key={s} onPress={() => setMessageFontSize(s)} hitSlop={6} style={styles.fontDotHit}>
                <View style={[styles.fontDot, s <= messageFontSize && { backgroundColor: T.accent }, s === messageFontSize && styles.fontDotActive]} />
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            onPress={() => setMessageFontSize(Math.min(22, messageFontSize + 1))}
            style={styles.fontBtn}
            disabled={messageFontSize >= 22}
            accessibilityLabel="Больше"
          >
            <Plus size={18} color={messageFontSize >= 22 ? T.textMuted : T.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* ===== Фон чатов ===== */}
        <Text style={styles.section}>ФОН ЧАТОВ</Text>
        <View style={styles.card}>
          {wallpaper && <WallpaperPicker value={wallpaper} onChange={changeWallpaper} />}
          <Text style={styles.hint}>
            Это фон для всех чатов. Для отдельного чата фон можно поменять в его информации: «Фон чата».
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themed(() => ({
  container: { flex: 1, backgroundColor: T.background },
  header: { flexDirection: 'row', alignItems: 'center', height: 56, paddingHorizontal: 4, backgroundColor: T.card },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700', color: T.textPrimary },
  body: { padding: 16, paddingBottom: 40 },
  preview: { height: 190, borderRadius: 18, overflow: 'hidden', padding: 14, justifyContent: 'flex-end', gap: 8, backgroundColor: T.chatBg },
  bubble: { maxWidth: '78%', paddingHorizontal: 12, paddingTop: 7, paddingBottom: 6, borderRadius: 16 },
  bubbleIn: { alignSelf: 'flex-start', backgroundColor: T.otherMessageBubble, borderBottomLeftRadius: 4 },
  bubbleOut: { alignSelf: 'flex-end', backgroundColor: T.myMessageBubble, borderBottomRightRadius: 4 },
  bubbleName: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  bubbleText: { lineHeight: 22 },
  bubbleTime: { fontSize: 11, alignSelf: 'flex-end', marginTop: 2 },
  outMeta: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', gap: 3 },
  section: { fontSize: 12, fontWeight: '700', color: T.textSecondary, marginTop: 22, marginBottom: 8, marginLeft: 12 },
  card: { backgroundColor: T.card, borderRadius: 16, padding: 14 },
  modes: { flexDirection: 'row', gap: 8 },
  mode: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: T.border },
  modeActive: { borderColor: T.accent, backgroundColor: T.accentMuted },
  modeText: { fontSize: 13, color: T.textSecondary, textAlign: 'center' },
  palettes: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 },
  palette: { width: '25%', alignItems: 'center', gap: 5 },
  swatchRing: { width: 52, height: 52, borderRadius: 26, borderWidth: 2.5, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  paletteName: { fontSize: 12, color: T.textSecondary },
  fontRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fontBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: T.inputBg, alignItems: 'center', justifyContent: 'center' },
  fontTrack: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fontDotHit: { padding: 4 },
  fontDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: T.surfaceActive },
  fontDotActive: { width: 18, height: 18, borderRadius: 9, borderWidth: 3, borderColor: T.card },
  hint: { fontSize: 13, color: T.textSecondary, marginTop: 12, lineHeight: 18 },
}));
