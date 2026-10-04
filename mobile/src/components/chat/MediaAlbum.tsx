import React from 'react';
import { View, Image, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Play, AlertCircle } from 'lucide-react-native';
import { SERVER_URL } from '../../config';
import { albumLayout, formatDuration } from './chatUtils';

import { T, themed } from '../../theme/runtime';
/**
 * Фото и видео в ленте: одиночное — в своих пропорциях, несколько —
 * мозаикой (как альбомы в Telegram). Пока файл загружается, показываем
 * локальную копию с индикатором.
 */

export interface AlbumItem {
  id: number | string;
  media_kind?: string | null;
  thumb_url?: string | null;
  media_width?: number | null;
  media_height?: number | null;
  media_duration?: number | string | null;
  /** Локальный файл (до окончания загрузки). */
  local_uri?: string | null;
  status?: 'sending' | 'sent' | 'failed';
}

interface Props {
  items: AlbumItem[];
  maxWidth: number;
  maxHeight?: number;
  /** Скругления совпадают с пузырём: сверху/снизу может быть подпись. */
  roundTop?: boolean;
  roundBottom?: boolean;
  onPress: (item: AlbumItem) => void;
  onLongPress?: () => void;
  /** Время и галочки поверх последней картинки (когда нет подписи). */
  overlay?: React.ReactNode;
}

const RADIUS = 14;

export default function MediaAlbum({ items, maxWidth, maxHeight = 360, roundTop = true, roundBottom = true, onPress, onLongPress, overlay }: Props) {
  const ratios = items.map((m) => (m.media_width && m.media_height ? m.media_width / m.media_height : m.media_kind === 'video' ? 16 / 9 : 1));
  const { cells, width, height } = albumLayout(ratios, maxWidth, maxHeight);

  return (
    <View
      style={[
        styles.wrap,
        { width, height },
        roundTop && { borderTopLeftRadius: RADIUS, borderTopRightRadius: RADIUS },
        roundBottom && { borderBottomLeftRadius: RADIUS, borderBottomRightRadius: RADIUS },
      ]}
    >
      {items.map((m, i) => {
        const cell = cells[i];
        const uri = m.local_uri || (m.thumb_url ? SERVER_URL + m.thumb_url : null);
        const isVideo = m.media_kind === 'video';
        return (
          <TouchableOpacity
            key={String(m.id)}
            activeOpacity={0.85}
            onPress={() => onPress(m)}
            onLongPress={onLongPress}
            delayLongPress={300}
            style={[styles.cell, { left: cell.x, top: cell.y, width: cell.w, height: cell.h }]}
          >
            {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <View style={[StyleSheet.absoluteFill, styles.placeholder]} />}
            {isVideo && (
              <>
                <View style={styles.playWrap}>
                  <Play size={22} color={T.onAccent} fill={T.onAccent} />
                </View>
                {m.media_duration ? (
                  <View style={styles.durationPill}>
                    <Text style={styles.durationText}>{formatDuration(m.media_duration)}</Text>
                  </View>
                ) : null}
              </>
            )}
            {m.status === 'sending' && (
              <View style={styles.progress}>
                <ActivityIndicator color={T.onAccent} />
              </View>
            )}
            {m.status === 'failed' && (
              <View style={styles.progress}>
                <AlertCircle size={28} color="#FECACA" />
              </View>
            )}
          </TouchableOpacity>
        );
      })}
      {overlay ? <View style={styles.overlay}>{overlay}</View> : null}
    </View>
  );
}

const styles = themed(() => ({
  wrap: { overflow: 'hidden', borderRadius: 4, backgroundColor: T.surfaceActive },
  cell: { position: 'absolute', overflow: 'hidden' },
  placeholder: { backgroundColor: '#2B2F2C' },
  playWrap: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 48,
    height: 48,
    marginLeft: -24,
    marginTop: -24,
    borderRadius: 24,
    backgroundColor: T.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 3,
  },
  durationPill: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: T.overlay,
  },
  durationText: { color: T.onAccent, fontSize: 12, fontWeight: '600' },
  progress: { ...StyleSheet.absoluteFill, backgroundColor: T.overlay, alignItems: 'center', justifyContent: 'center' },
  overlay: { position: 'absolute', right: 6, bottom: 6 },
}));
