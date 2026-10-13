import { parseOffixLink, profileLink } from '../src/services/links';
import { linkify } from '../src/utils/linkify';
import { qrMatrix, qrPaths } from '../src/components/qr/QrCode';

describe('ссылки Offix', () => {
  it('профиль по ссылке из QR-кода и по offix://', () => {
    expect(parseOffixLink('https://offixcrm.ru/u/ivan.petrov')).toEqual({ kind: 'user', username: 'ivan.petrov' });
    expect(parseOffixLink(profileLink('mgr_1'))).toEqual({ kind: 'user', username: 'mgr_1' });
    expect(parseOffixLink('offix://u/anna')).toEqual({ kind: 'user', username: 'anna' });
    expect(parseOffixLink('http://192.168.1.10:5000/u/anna')).toEqual({ kind: 'user', username: 'anna' });
  });

  it('вход по QR, чат, задача', () => {
    const token = 'A'.repeat(32);
    expect(parseOffixLink(`https://offixcrm.ru/qr/${token}`)).toEqual({ kind: 'qr_login', token });
    expect(parseOffixLink('offix://chat/12')).toEqual({ kind: 'chat', id: 12 });
    expect(parseOffixLink('https://offixcrm.ru/tasks/7')).toEqual({ kind: 'task', id: 7 });
  });

  it('чужие сайты и текст не принимаются за профиль', () => {
    expect(parseOffixLink('https://evil.example/u/anna').kind).toBe('url');
    expect(parseOffixLink('https://offixcrm.ru/u/../../etc').kind).toBe('url');
    expect(parseOffixLink('просто текст')).toEqual({ kind: 'text', text: 'просто текст' });
    expect(parseOffixLink('offix://unknown/1').kind).toBe('text');
  });

  it('ссылки в тексте сообщения', () => {
    expect(linkify('см. https://offixcrm.ru/u/anna, спасибо')).toEqual(['см. ', { url: 'https://offixcrm.ru/u/anna' }, ', спасибо']);
    expect(linkify('без ссылок')).toEqual(['без ссылок']);
  });
});

describe('QR-код', () => {
  it('строится матрица и пути точек с вырезом под значок', () => {
    const m = qrMatrix(profileLink('ivan.petrov'));
    expect(m.size).toBeGreaterThanOrEqual(21);
    const p = qrPaths(m, 8, 7);
    expect(p.dots.length).toBeGreaterThan(100);
    expect(p.eyes).toContain('Z');
    expect(p.holeSize).toBe(56);
  });
});
