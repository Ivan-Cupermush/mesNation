import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { X } from 'lucide-react-native';
import { T, themed } from '../../../theme/runtime';
import { withAlpha } from '../../../theme/palettes';
import { C, formatTime } from '../chatUtils';
import { cycleVoiceSpeed, pauseVoice, resumeVoice, stopVoice } from './voicePlayer';
import { useVoiceState } from './useVoice';
import { PlayGlyph } from './VoiceBubble';

/**
 * Полоска плеера под шапкой чата, пока играет голосовое (как в Telegram):
 * пауза, кто и когда отправил, скорость 1x/1.5x/2x, закрыть. Нажатие —
 * к сообщению в ленте.
 */
export default function VoicePlayerBar({ nameOf, onOpen }: { nameOf: (msg: any) => string; onOpen: (msg: any) => void }) {
  const s = useVoiceState();
  if (!s.msg) return null;
  const progress = s.duration ? Math.min(1, s.position / s.duration) : 0;
  return (
    <View style={styles.bar}>
      <TouchableOpacity onPress={() => (s.playing ? pauseVoice() : resumeVoice())} style={styles.btn} hitSlop={8} accessibilityLabel={s.playing ? 'Пауза' : 'Продолжить'}>
        <PlayGlyph playing={s.playing || s.loading} color={C.accent} size={18} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.body} onPress={() => onOpen(s.msg)} activeOpacity={0.7}>
        <Text style={styles.name} numberOfLines={1}>
          {nameOf(s.msg)}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          Голосовое сообщение · {formatTime(s.msg.created_at)}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={cycleVoiceSpeed} style={[styles.speed, s.speed !== 1 && styles.speedOn]} accessibilityLabel="Скорость воспроизведения">
        <Text style={[styles.speedText, s.speed !== 1 && styles.speedTextOn]}>{`${s.speed}x`.replace('.', ',')}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={stopVoice} style={styles.btn} hitSlop={8} accessibilityLabel="Закрыть плеер">
        <X size={20} color={C.textMuted} />
      </TouchableOpacity>
      <View style={[styles.progress, { width: `${progress * 100}%` }]} />
    </View>
  );
}

const styles = themed(() => ({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 46,
    paddingHorizontal: 6,
    backgroundColor: withAlpha(T.card, 0.94),
    borderBottomWidth: 0.5,
    borderBottomColor: C.border,
  },
  btn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, paddingHorizontal: 4 },
  name: { fontSize: 14, fontWeight: '700', color: C.text },
  sub: { fontSize: 12, color: C.textMuted },
  speed: { paddingHorizontal: 8, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: C.textMuted, alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  speedOn: { borderColor: C.accent, backgroundColor: withAlpha(T.accent, 0.12) },
  speedText: { fontSize: 12, fontWeight: '800', color: C.textMuted },
  speedTextOn: { color: C.accent },
  progress: { position: 'absolute', left: 0, bottom: 0, height: 2, backgroundColor: C.accent },
}));
