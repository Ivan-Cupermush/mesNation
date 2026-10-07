import { PermissionsAndroid, Platform } from 'react-native';
import type { createSound, RecordBackType } from 'react-native-nitro-sound';
import { dbToLevel } from './waveformData';

type SoundType = ReturnType<typeof createSound>;

/**
 * Запись голосового: AAC в MP4 (m4a), моно, с уровнем громкости для волны.
 * Отдельный экземпляр от плеера — можно слушать запись, не мешая плееру.
 */

let rec: SoundType | null = null;
function recorder(): SoundType {
  if (!rec) {
    const mod = require('react-native-nitro-sound');
    rec = mod.createSound() as SoundType;
    rec.setSubscriptionDuration(0.05);
  }
  return rec;
}

export async function ensureMicPermission(): Promise<'granted' | 'asked' | 'denied'> {
  if (Platform.OS !== 'android') return 'granted';
  const perm = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
  if (await PermissionsAndroid.check(perm)) return 'granted';
  const res = await PermissionsAndroid.request(perm);
  // Только что спросили — палец уже отпущен, запись начнём со следующего нажатия.
  return res === PermissionsAndroid.RESULTS.GRANTED ? 'asked' : 'denied';
}

export async function ensureCameraPermissions(): Promise<'granted' | 'asked' | 'denied'> {
  if (Platform.OS !== 'android') return 'granted';
  const perms = [PermissionsAndroid.PERMISSIONS.CAMERA, PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
  const has = await Promise.all(perms.map((p) => PermissionsAndroid.check(p)));
  if (has.every(Boolean)) return 'granted';
  const res = await PermissionsAndroid.requestMultiple(perms);
  return Object.values(res).every((v) => v === PermissionsAndroid.RESULTS.GRANTED) ? 'asked' : 'denied';
}

export interface RecordedAudio {
  uri: string;
  durationMs: number;
  levels: number[];
}

let levels: number[] = [];
let lastMs = 0;

export async function startAudio(onTick: (ms: number, level: number) => void): Promise<void> {
  const r = recorder();
  levels = [];
  lastMs = 0;
  r.removeRecordBackListener();
  r.addRecordBackListener((e: RecordBackType) => {
    const level = dbToLevel(e.currentMetering);
    levels.push(level);
    lastMs = e.currentPosition;
    onTick(e.currentPosition, level);
  });
  const mod = require('react-native-nitro-sound');
  await r.startRecorder(
    undefined,
    {
      AudioSourceAndroid: mod.AudioSourceAndroidType.MIC,
      OutputFormatAndroid: mod.OutputFormatAndroidType.MPEG_4,
      AudioEncoderAndroid: mod.AudioEncoderAndroidType.AAC,
      AudioSamplingRate: 48000,
      AudioEncodingBitRate: 64000,
      AudioChannels: 1,
      AVFormatIDKeyIOS: 'aac',
      AVNumberOfChannelsKeyIOS: 1,
    },
    true,
  );
}

export async function stopAudio(): Promise<RecordedAudio | null> {
  const r = recorder();
  try {
    const path = await r.stopRecorder();
    r.removeRecordBackListener();
    if (!path || path === 'recorder already stopped') return null;
    const uri = path.startsWith('file://') || path.startsWith('content://') ? path : `file://${path}`;
    return { uri, durationMs: lastMs, levels: levels.slice() };
  } catch {
    return null;
  }
}

export async function cancelAudio(): Promise<void> {
  await stopAudio().catch(() => undefined);
}
