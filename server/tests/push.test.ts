import { describe, expect, it } from 'vitest';
import { groupPreview, pushImage, pushPreview } from '../src/services/push';

describe('текст уведомлений для всех типов сообщений', () => {
  it('голосовое и кружочек — с длительностью', () => {
    expect(pushPreview({ media_kind: 'voice', media_duration: 12 })).toBe('🎤 Голосовое сообщение (0:12)');
    expect(pushPreview({ media_kind: 'video_note', media_duration: 65 })).toBe('📹 Видеосообщение (1:05)');
    expect(pushPreview({ media_kind: 'voice' })).toBe('🎤 Голосовое сообщение');
  });

  it('фото, видео и файлы — с подписью', () => {
    expect(pushPreview({ media_kind: 'photo', text: 'Смотри' })).toBe('🖼 Фото, Смотри');
    expect(pushPreview({ media_kind: 'video', media_duration: 3725 })).toBe('🎬 Видео (1:02:05)');
    expect(pushPreview({ media_kind: 'file', file_name: 'отчёт.pdf', file_url: '/uploads/x.pdf' })).toBe('📎 отчёт.pdf');
  });

  it('контакт, заметка, опрос, текст', () => {
    expect(pushPreview({ contact_user_id: 3, contact: { display_name: 'Иван' } })).toBe('👤 Контакт: Иван');
    expect(pushPreview({ note_share_id: 1, note_share: { title: 'План' }, text: 'глянь' })).toBe('📝 Заметка «План», глянь');
    expect(pushPreview({ poll_id: 5, poll_question: 'Обед?' })).toBe('📊 Опрос: Обед?');
    expect(pushPreview({ text: 'Привет' })).toBe('Привет');
  });

  it('альбом и группа файлов, картинка для превью', () => {
    const album = [
      { media_kind: 'photo', thumb_url: '/uploads/thumbs/a.jpg' },
      { media_kind: 'video', thumb_url: '/uploads/thumbs/b.jpg', text: 'Отпуск' },
    ];
    expect(groupPreview(album)).toBe('🖼 Альбом: 1 фото, 1 видео, Отпуск');
    expect(groupPreview([{ media_kind: 'file' }, { media_kind: 'file' }])).toBe('📎 2 файла');
    expect(pushImage(album)).toBe('/uploads/thumbs/a.jpg');
    expect(pushImage([{ media_kind: 'file' }])).toBe('');
  });
});
