import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import sharp from 'sharp';
import { UPLOAD_DIRS } from '../lib/uploads';
import { logger } from '../lib/logger';

const run = promisify(execFile);

/**
 * Обработка медиа для чата: превью и размеры фото, кадр-обложка и длительность
 * видео. Размеры нужны клиенту, чтобы сразу нарисовать пузырь правильной
 * формы (как в Telegram), не дожидаясь загрузки картинки.
 */

export interface MediaInfo {
  kind: 'photo' | 'video' | 'file' | 'voice' | 'video_note';
  thumbUrl: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
}

const VIDEO_EXT = new Set(['.mp4', '.mov', '.m4v', '.webm', '.3gp', '.mkv', '.avi']);
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif', '.bmp']);

let ffmpegAvailable: boolean | null = null;
async function hasFfmpeg(): Promise<boolean> {
  if (ffmpegAvailable === null) {
    try {
      await run('ffprobe', ['-version'], { timeout: 5000 });
      await run('ffmpeg', ['-version'], { timeout: 5000 });
      ffmpegAvailable = true;
    } catch {
      ffmpegAvailable = false;
      logger.warn('ffmpeg не найден: у видео в чате не будет обложки и длительности');
    }
  }
  return ffmpegAvailable;
}

function thumbName(fileName: string) {
  return 'thumb_' + path.basename(fileName, path.extname(fileName)) + '.jpg';
}

async function processImage(filePath: string, fileName: string): Promise<MediaInfo | null> {
  try {
    const image = sharp(filePath, { animated: false }).rotate();
    const meta = await sharp(filePath).metadata();
    // EXIF-поворот на 90°/270° меняет местами ширину и высоту.
    const swap = meta.orientation !== undefined && meta.orientation >= 5;
    const width = (swap ? meta.height : meta.width) ?? null;
    const height = (swap ? meta.width : meta.height) ?? null;
    const name = thumbName(fileName);
    await image.resize(1280, 1280, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(path.join(UPLOAD_DIRS.thumbs, name));
    return { kind: 'photo', thumbUrl: `/uploads/thumbs/${name}`, width, height, duration: null };
  } catch {
    return null; // не картинка, хоть и с таким расширением
  }
}

async function processVideo(filePath: string, fileName: string): Promise<MediaInfo> {
  const info: MediaInfo = { kind: 'video', thumbUrl: null, width: null, height: null, duration: null };
  if (!(await hasFfmpeg())) return info;
  try {
    const { stdout } = await run(
      'ffprobe',
      ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:stream_tags=rotate:format=duration', '-of', 'json', filePath],
      { timeout: 15000 },
    );
    const probe = JSON.parse(stdout);
    const stream = probe.streams?.[0] || {};
    const rotate = Math.abs(Number(stream.tags?.rotate || 0)) % 180 === 90;
    info.width = (rotate ? stream.height : stream.width) ?? null;
    info.height = (rotate ? stream.width : stream.height) ?? null;
    info.duration = probe.format?.duration ? Math.round(Number(probe.format.duration) * 100) / 100 : null;
    const name = thumbName(fileName);
    const at = info.duration && info.duration > 2 ? '1' : '0';
    await run('ffmpeg', ['-y', '-ss', at, '-i', filePath, '-frames:v', '1', '-vf', 'scale=720:-2', '-q:v', '4', path.join(UPLOAD_DIRS.thumbs, name)], {
      timeout: 30000,
    });
    info.thumbUrl = `/uploads/thumbs/${name}`;
  } catch (err) {
    logger.warn({ err }, 'Не удалось обработать видео');
  }
  return info;
}

/** Длительность аудио (голосовое) по ffprobe; без ffmpeg — null. */
async function audioDuration(filePath: string): Promise<number | null> {
  if (!(await hasFfmpeg())) return null;
  try {
    const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', filePath], { timeout: 15000 });
    const d = Number(JSON.parse(stdout).format?.duration);
    return Number.isFinite(d) ? Math.round(d * 100) / 100 : null;
  } catch {
    return null;
  }
}

export async function processUpload(
  file: Express.Multer.File,
  asFile = false,
  special?: 'voice' | 'video_note',
): Promise<MediaInfo> {
  const ext = path.extname(file.originalname || file.filename).toLowerCase();
  if (special === 'voice') {
    return { kind: 'voice', thumbUrl: null, width: null, height: null, duration: await audioDuration(file.path) };
  }
  if (special === 'video_note') {
    const v = await processVideo(file.path, file.filename);
    return { ...v, kind: 'video_note' };
  }
  if (!asFile) {
    if (file.mimetype.startsWith('image/') || IMAGE_EXT.has(ext)) {
      const img = await processImage(file.path, file.filename);
      if (img) return img;
    } else if (file.mimetype.startsWith('video/') || VIDEO_EXT.has(ext)) {
      return processVideo(file.path, file.filename);
    }
  }
  return { kind: 'file', thumbUrl: null, width: null, height: null, duration: null };
}
