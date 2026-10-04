import React from 'react';
import { View, Text, TouchableOpacity, Alert, useWindowDimensions } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { Check, ImagePlus, Ban } from 'lucide-react-native';
import { T, themed } from '../../theme/runtime';
import { GRADIENTS, PATTERNS, Wallpaper, persistImage } from '../../theme/wallpapers';
import { WallpaperView } from './ChatWallpaper';

/** Сетка выбора фона: без фона, узоры, градиенты, своё фото. */

const same = (a: Wallpaper, b: Wallpaper) =>
  a.type === b.type && ((a as any).id ?? (a as any).uri) === ((b as any).id ?? (b as any).uri);

export default function WallpaperPicker({ value, onChange }: { value: Wallpaper; onChange: (wp: Wallpaper) => void }) {
  const { width } = useWindowDimensions();
  const tile = Math.floor((Math.min(width, 520) - 32 - 2 * 10) / 3);

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

  return (
    <View style={styles.grid}>
      {options.map((o, i) => {
        const active = same(o.wp, value);
        return (
          <TouchableOpacity key={i} onPress={() => onChange(o.wp)} activeOpacity={0.8} style={{ width: tile }}>
            <View style={[styles.tile, { height: tile * 1.3 }, active && styles.tileActive]}>
              <WallpaperView wallpaper={o.wp} radius={12} />
              {o.wp.type === 'none' && <Ban size={22} color={T.textMuted} style={styles.centerIcon} />}
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
      <TouchableOpacity onPress={pickPhoto} activeOpacity={0.8} style={{ width: tile }}>
        <View style={[styles.tile, styles.addTile, { height: tile * 1.3 }]}>
          <ImagePlus size={26} color={T.accent} />
        </View>
        <Text style={styles.label}>Из галереи</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = themed(() => ({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { borderRadius: 14, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  tileActive: { borderColor: T.accent },
  addTile: { backgroundColor: T.inputBg, borderStyle: 'dashed', borderColor: T.border },
  centerIcon: { position: 'absolute' },
  check: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: T.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 12, color: T.textSecondary, textAlign: 'center', marginTop: 5 },
}));
