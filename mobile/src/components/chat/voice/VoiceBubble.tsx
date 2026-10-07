import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { T, themed } from '../../../theme/runtime';
import { withAlpha } from '../../../theme/palettes';
import { C, formatDuration } from '../chatUtils';
import UploadProgress from '../UploadProgress';
import Waveform from './Waveform';
import { decodeWaveform } from './waveformData';
import { useVoiceFor } from './useVoice';

/** Треугольник «играть» и «пауза» — залитые, как в Telegram. */
export function PlayGlyph({ playing, color, size = 18 }: { playing: boolean; color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {playing ? (
        <>
          <Rect x="5" y="4" width="5" height="16" rx="1.5" fill={color} />
          <Rect x="14" y="4" width="5" height="16" rx="1.5" fill={color} />
        </>
      ) : (
        <Path d="M7 4.8v14.4c0 .9 1 1.5 1.8 1L20 13c.7-.5.7-1.5 0-2L8.8 3.8C8 3.3 7 3.9 7 4.8Z" fill={color} />
      )}
    </Svg>
  );
}

/**
 * Голосовое в пузыре: круглая кнопка, волна (перемотка пальцем),
 * длительность и точка «не прослушано».
 */
export default function VoiceBubble({
  msg,
  mine,
  unlistened,
  onPlay,
  onSeek,
  onCancel,
}: {
  msg: any;
  mine: boolean;
  unlistened: boolean;
  onPlay: (msg: any) => void;
  onSeek: (msg: any, ratio: number) => void;
  onCancel?: (msg: any) => void;
}) {
  const st = useVoiceFor(msg);
  const levels = useMemo(() => decodeWaveform(msg.media_waveform, msg.id ?? msg.client_id), [msg.media_waveform, msg.id, msg.client_id]);
  const duration = st?.duration ? st.duration / 1000 : Number(msg.media_duration || 0);
  const progress = st && st.duration ? st.position / st.duration : 0;
  const playing = !!st?.playing;
  const sending = msg.status === 'sending';

  const btnBg = mine ? T.myMessageText : C.accent;
  const btnFg = mine ? C.bubbleOut : T.onAccent;
  const wave = mine ? T.myMessageText : C.accent;
  const waveDim = withAlpha(wave, mine ? 0.4 : 0.3);
  const sub = mine ? C.textOutMuted : C.textMuted;

  return (
    <View style={styles.wrap}>
      {sending ? (
        <View style={[styles.btn, { backgroundColor: btnBg }]}>
          <UploadProgress progress={msg.progress} size={46} background="transparent" track={withAlpha(btnFg, 0.3)} color={btnFg} onCancel={onCancel ? () => onCancel(msg) : undefined} />
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: btnBg }]}
          onPress={() => onPlay(msg)}
          activeOpacity={0.8}
          accessibilityLabel={playing ? 'Пауза' : 'Слушать голосовое'}
        >
          {st?.loading ? <ActivityIndicator color={btnFg} /> : <PlayGlyph playing={playing} color={btnFg} size={20} />}
        </TouchableOpacity>
      )}
      <View style={styles.body}>
        <Waveform levels={levels} progress={progress} color={wave} dimColor={waveDim} onSeek={sending ? undefined : (r) => onSeek(msg, r)} />
        <View style={styles.metaRow}>
          <Text style={[styles.dur, { color: sub }]}>{formatDuration(st && (playing || st.position > 0) ? st.position / 1000 : duration)}</Text>
          {unlistened && <View style={[styles.dot, { backgroundColor: mine ? T.myMessageText : C.accent }]} />}
        </View>
      </View>
    </View>
  );
}

const styles = themed(() => ({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 10, width: 232, paddingTop: 2, paddingBottom: 2 },
  btn: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, paddingTop: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3, height: 16 },
  dur: { fontSize: 12, fontVariant: ['tabular-nums'] },
  dot: { width: 6, height: 6, borderRadius: 3 },
}));
