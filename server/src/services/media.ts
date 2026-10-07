import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import sharp from 'sharp';
import { UPLOAD_DIRS } from '../lib/uploads';
import { logger } from '../lib/logger';

const run = promisify(execFile);

/**
 * ffmpeg/ffprobe: из FFMPEG_DIR, если задан (служба Windows от LocalSystem
 * не видит PATH пользователя, куда их ставит winget), иначе — из PATH.
 */
function bin(name: 'ffmpeg' | 'ffprobe') {
  const dir = process.env.FFMPEG_DIR?.trim();
  return dir ? path.join(dir, name) : name;
}

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
  /** Файл пересохранён в общий формат (голосовое из браузера → m4a, кружочек → mp4). */
  converted?: { path: string; filename: string; mime: string; size: number };
}

const VIDEO_EXT = new Set(['.mp4', '.mov', '.m4v', '.webm', '.3gp', '.mkv', '.avi']);
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif', '.bmp']);

let ffmpegAvailable: boolean | null = null;
export async function hasFfmpeg(): Promise<boolean> {
  if (ffmpegAvailable === null) {
    try {
      await run(bin('ffprobe'), ['-version'], { timeout: 5000 });
      await run(bin('ffmpeg'), ['-version'], { timeout: 5000 });
      ffmpegAvailable = true;
    } catch {
      ffmpegAvailable = false;
      logger.warn('ffmpeg не найден: у видео нет обложки и длительности, голосовые и кружочки из браузера не перекодируются');
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
      bin('ffprobe'),
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
    await run(bin('ffmpeg'), ['-y', '-ss', at, '-i', filePath, '-frames:v', '1', '-vf', 'scale=720:-2', '-q:v', '4', path.join(UPLOAD_DIRS.thumbs, name)], {
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
    const { stdout } = await run(bin('ffprobe'), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', filePath], { timeout: 15000 });
    const d = Number(JSON.parse(stdout).format?.duration);
    return Number.isFinite(d) ? Math.round(d * 100) / 100 : null;
  } catch {
    return null;
  }
}

/**
 * Голосовые и кружочки из браузера приходят в WebM: его нельзя перематывать
 * (нет длительности), а iPhone и часть Android его не играют. Пересохраняем
 * в AAC/M4A и H.264/MP4 — как пишет приложение. Без ffmpeg — оставляем как есть.
 */
async function normalize(file: Express.Multer.File, kind: 'voice' | 'video_note'): Promise<MediaInfo['converted'] | null> {
  const ext = path.extname(file.filename).toLowerCase();
  const isMp4 = ['.m4a', '.mp4', '.aac', '.mov', '.3gp'].includes(ext) || /^(audio|video)\/(mp4|aac|x-m4a)$/.test(file.mimetype);
  if (isMp4 || !(await hasFfmpeg())) return null;
  const outExt = kind === 'voice' ? '.m4a' : '.mp4';
  const filename = path.basename(file.filename, ext) + outExt;
  const out = path.join(path.dirname(file.path), filename);
  const args =
    kind === 'voice'
      ? ['-y', '-i', file.path, '-vn', '-ac', '1', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', out]
      : [
          '-y', '-i', file.path,
          // Кружочек — квадрат: обрезаем по центру, как это делает Telegram.
          '-vf', "crop='min(iw,ih)':'min(iw,ih)',scale=480:480",
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p',
          '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', out,
        ];
  try {
    await run(bin('ffmpeg'), args, { timeout: 120000 });
    const { size } = await import('fs').then((fs) => fs.promises.stat(out));
    return { path: out, filename, mime: kind === 'voice' ? 'audio/mp4' : 'video/mp4', size };
  } catch (err) {
    logger.warn({ err }, 'Не удалось пересохранить голосовое/кружочек — оставляю исходный файл');
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
    const converted = await normalize(file, 'voice');
    const info: MediaInfo = { kind: 'voice', thumbUrl: null, width: null, height: null, duration: await audioDuration(converted?.path ?? file.path) };
    return converted ? { ...info, converted } : info;
  }
  if (special === 'video_note') {
    const converted = await normalize(file, 'video_note');
    const v = await processVideo(converted?.path ?? file.path, converted?.filename ?? file.filename);
    return converted ? { ...v, kind: 'video_note', converted } : { ...v, kind: 'video_note' };
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
