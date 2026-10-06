import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Image, ActivityIndicator, LayoutAnimation, useWindowDimensions } from 'react-native';
import Video, { ViewType, OnProgressData, OnLoadData } from 'react-native-video';
import Svg, { Circle } from 'react-native-svg';
import { VolumeX } from 'lucide-react-native';
import { SERVER_URL } from '../../../config';
import { cachedSignedUrl } from '../../../services/http';
import { T, themed } from '../../../theme/runtime';
import { withAlpha } from '../../../theme/palettes';
import { C, formatDuration } from '../chatUtils';
import UploadProgress from '../UploadProgress';
import { claimMediaFocus, onMediaFocus } from './mediaFocus';
import { PlayGlyph } from './VoiceBubble';

/**
 * Кружочек (видеосообщение) как в Telegram: круг без пузыря; нажатие —
 * играет со звуком и увеличивается, вокруг идёт кольцо прогресса;
 * ещё нажатие — пауза. Пока не прослушан — точка у длительности.
 */
export default function VideoNoteBubble({
  msg,
  mine,
  unlistened,
  meta,
  onStarted,
  onLongPress,
  onCancel,
}: {
  msg: any;
  mine: boolean;
  unlistened: boolean;
  meta: React.ReactNode;
  onStarted: (msg: any) => void;
  onLongPress: () => void;
  onCancel?: (msg: any) => void;
}) {
  const { width: screenW } = useWindowDimensions();
  const small = Math.min(Math.round(screenW * 0.58), 230);
  const big = Math.min(Math.round(screenW * 0.78), 300);
  const [active, setActive] = useState(false);
  const [paused, setPaused] = useState(false);
  const [uri, setUri] = useState<string | null>(msg.local_uri || null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(Number(msg.media_duration || 0));
  const owner = `vn-${msg.id ?? msg.client_id}`;
  const started = useRef(false);

  // Другое медиа заиграло — ставим на паузу.
  useEffect(() => onMediaFocus((o) => o !== owner && setPaused(true)), [owner]);

  const size = active ? big : small;
  const sending = msg.status === 'sending';

  const press = async () => {
    if (sending) return;
    if (!active) {
      claimMediaFocus(owner);
      LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'scaleXY'));
      setActive(true);
      setPaused(false);
      setProgress(0);
      if (!uri && msg.file_url) {
        setLoading(true);
        try {
          setUri(await cachedSignedUrl(msg.file_url));
        } catch {
          setLoading(false);
          setActive(false);
        }
      }
      if (!started.current) {
        started.current = true;
        onStarted(msg);
      }
      return;
    }
    if (paused) claimMediaFocus(owner);
    setPaused((p) => !p);
  };

  const stop = () => {
    LayoutAnimation.configureNext(LayoutAnimation.create(200, 'easeInEaseOut', 'scaleXY'));
    setActive(false);
    setPaused(false);
    setProgress(0);
  };

  const R = size / 2;
  const ring = R - 3;
  const circ = 2 * Math.PI * ring;
  const thumb = msg.thumb_url ? SERVER_URL + msg.thumb_url : null;
  const shownTime = active ? Math.max(0, duration * (1 - progress)) : duration;

  return (
    <View style={[styles.wrap, mine ? styles.right : styles.left]}>
      <TouchableOpacity activeOpacity={0.9} onPress={press} onLongPress={onLongPress} delayLongPress={280} style={{ width: size, height: size }}>
        <View style={[styles.circle, { width: size, height: size, borderRadius: R }]}>
          {thumb && !active ? <Image source={{ uri: thumb }} style={styles.fill} resizeMode="cover" /> : null}
          {(active || (!thumb && uri)) && uri ? (
            <Video
              source={{ uri }}
              style={styles.fill}
              resizeMode="cover"
              viewType={ViewType.TEXTURE}
              paused={!active || paused}
              muted={!active}
              repeat={false}
              playInBackground={false}
              progressUpdateInterval={100}
              onLoad={(d: OnLoadData) => {
                setLoading(false);
                if (d.duration) setDuration(d.duration);
              }}
              onProgress={(p: OnProgressData) => {
                if (p.seekableDuration || p.playableDuration) {
                  const total = duration || p.seekableDuration || p.playableDuration;
                  if (total) setProgress(Math.min(1, p.currentTime / total));
                }
              }}
              onEnd={stop}
              onError={stop}
            />
          ) : null}
          {!thumb && !uri && <View style={[styles.fill, { backgroundColor: withAlpha(C.accent, 0.25) }]} />}
          {loading && (
            <View style={styles.center}>
              <ActivityIndicator color="#FFFFFF" />
            </View>
          )}
          {!active && !sending && (
            <View style={styles.center} pointerEvents="none">
              <View style={styles.playBadge}>
                <PlayGlyph playing={false} color="#FFFFFF" size={20} />
              </View>
            </View>
          )}
          {active && paused && (
            <View style={styles.center} pointerEvents="none">
              <View style={styles.playBadge}>
                <PlayGlyph playing={false} color="#FFFFFF" size={22} />
              </View>
            </View>
          )}
          {sending && (
            <View style={styles.center}>
              <UploadProgress progress={msg.progress} size={52} onCancel={onCancel ? () => onCancel(msg) : undefined} />
            </View>
          )}
        </View>
        {active && (
          <Svg width={size} height={size} style={styles.ringSvg} pointerEvents="none">
            <Circle
              cx={R}
              cy={R}
              r={ring}
              stroke={withAlpha('#FFFFFF', 0.95)}
              strokeWidth={3}
              fill="none"
              strokeDasharray={`${circ} ${circ}`}
              strokeDashoffset={circ * (1 - progress)}
              strokeLinecap="round"
              transform={`rotate(-90 ${R} ${R})`}
            />
          </Svg>
        )}
      </TouchableOpacity>
      <View style={[styles.info, mine ? styles.infoRight : styles.infoLeft]}>
        <View style={styles.pill}>
          <Text style={styles.pillText}>{formatDuration(shownTime)}</Text>
          {!active && <VolumeX size={12} color="#FFFFFF" />}
          {unlistened && <View style={styles.dot} />}
        </View>
        <View style={styles.pill}>{meta}</View>
      </View>
    </View>
  );
}

const styles = themed(() => ({
  wrap: { paddingVertical: 2 },
  left: { alignItems: 'flex-start' },
  right: { alignItems: 'flex-end' },
  circle: { overflow: 'hidden', backgroundColor: T.surfaceActive },
  fill: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 },
  center: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  playBadge: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', paddingLeft: 2 },
  ringSvg: { position: 'absolute', left: 0, top: 0 },
  info: { flexDirection: 'row', gap: 6, marginTop: 4 },
  infoLeft: { alignSelf: 'flex-start' },
  infoRight: { alignSelf: 'flex-end' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.38)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  pillText: { color: '#FFFFFF', fontSize: 12, fontVariant: ['tabular-nums'] },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF' },
}));
