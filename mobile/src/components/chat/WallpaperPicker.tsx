import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, LayoutChangeEvent } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { Check, ImagePlus, Ban } from 'lucide-react-native';
import { T, themed } from '../../theme/runtime';
import { GRADIENTS, PATTERNS, Wallpaper, persistImage } from '../../theme/wallpapers';
import { WallpaperView } from './ChatWallpaper';

/**
 * Сетка выбора фона, как в Telegram: каждая плитка — маленький чат на этом
 * фоне. Ширина плиток считается по реальной ширине блока, поэтому ряды
 * ровные и по центру на любом экране.
 */

const COLS = 3;
const GAP = 10;

const same = (a: Wallpaper, b: Wallpaper) =>
  a.type === b.type && ((a as any).id ?? (a as any).uri) === ((b as any).id ?? (b as any).uri);

export default function WallpaperPicker({ value, onChange }: { value: Wallpaper; onChange: (wp: Wallpaper) => void }) {
  const [width, setWidth] = useState(0);
  const tile = width > 0 ? Math.floor((width - GAP * (COLS - 1)) / COLS) : 0;

  const options: { wp: Wallpaper; label: string }[] = [
    { wp: { type: 'none' }, label: 'Без фона' },
    ...PATTERNS.map((p) => ({ wp: { type: 'pattern', id: p.id } as Wallpaper, label: p.name })),
    ...GRADIENTS.map((g) => ({ wp: { type: 'gradient', id: g.id } as Wallpaper, label: g.name })),
  ];
  if (value.type === 'image') options.push({ wp: value, label: 'Своё фото' });

  const pickPhoto = async () => {
    const res = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1, quality: 0.9 });
    const a = res.assets?.[0];
    if (!a?.uri) return;
    try {
      onChange({ type: 'image', uri: await persistImage(a.uri) });
    } catch (e: any) {
      Alert.alert('Не удалось установить фон', e?.message || '');
    }
  };

  // Выбранный узор сохраняет свою насыщенность при повторном выборе.
  const choose = (wp: Wallpaper) => {
    if (wp.type === 'pattern' && value.type === 'pattern' && value.id === wp.id) return;
    onChange(wp);
  };

  return (
    <View style={styles.grid} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      {tile > 0 &&
        options.map((o, i) => {
          const active = same(o.wp, value);
          const wp = active ? value : o.wp;
          return (
            <TouchableOpacity
              key={i}
              onPress={() => choose(o.wp)}
              activeOpacity={0.8}
              style={{ width: tile }}
              accessibilityLabel={`Фон: ${o.label}`}
              accessibilityState={{ selected: active }}
            >
              <View style={[styles.tile, { height: Math.round(tile * 1.45) }, active && styles.tileActive]}>
                <WallpaperView wallpaper={wp} radius={12} />
                {o.wp.type === 'none' ? (
                  <Ban size={22} color={T.textMuted} />
                ) : (
                  <View style={styles.mini}>
                    <View style={[styles.miniBubble, styles.miniIn]} />
                    <View style={[styles.miniBubble, styles.miniOut]} />
                    <View style={[styles.miniBubble, styles.miniIn, { width: '45%' }]} />
                  </View>
                )}
                {active && (
                  <View style={styles.check}>
                    <Check size={14} color={T.onAccent} strokeWidth={3} />
                  </View>
                )}
              </View>
              <Text style={[styles.label, active && { color: T.accent, fontWeight: '700' }]} numberOfLines={1}>
                {o.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      {tile > 0 && (
        <TouchableOpacity onPress={pickPhoto} activeOpacity={0.8} style={{ width: tile }} accessibilityLabel="Фон из галереи">
          <View style={[styles.tile, styles.addTile, { height: Math.round(tile * 1.45) }]}>
            <ImagePlus size={26} color={T.accent} />
          </View>
          <Text style={styles.label}>Из галереи</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = themed(() => ({
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: GAP, rowGap: 14 },
  tile: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.chatBg,
  },
  tileActive: { borderColor: T.accent },
  addTile: { backgroundColor: T.inputBg, borderStyle: 'dashed', borderColor: T.border },
  mini: { position: 'absolute', left: 8, right: 8, bottom: 10, gap: 5 },
  miniBubble: { height: 10, borderRadius: 5 },
  miniIn: { width: '62%', alignSelf: 'flex-start', backgroundColor: T.otherMessageBubble },
  miniOut: { width: '55%', alignSelf: 'flex-end', backgroundColor: T.myMessageBubble },
  check: {
    position: 'absolute',
    right: 6,
    top: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: T.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 12, color: T.textSecondary, textAlign: 'center', marginTop: 5 },
}));
