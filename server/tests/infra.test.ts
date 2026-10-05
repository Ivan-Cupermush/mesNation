import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import type { Express } from 'express';
import pool from '../src/db/pool';
import { createApp } from '../src/app';
import { trustProxySetting } from '../src/config/env';
import { UPLOAD_DIRS } from '../src/lib/uploads';
import { client, resetDatabase, seedCompany } from './helpers';

/**
 * Инфраструктура: сайт и API с одного адреса, заголовки безопасности,
 * сжатие, защита загрузок. Отдельный файл, чтобы не зависеть от сценариев api.test.ts.
 */

let app: Express;
let webDir: string;
let c: Awaited<ReturnType<typeof seedCompany>>;
const bigAsset = 'console.log("offix");\n'.repeat(400);

beforeAll(async () => {
  await resetDatabase();
  webDir = fs.mkdtempSync(path.join(os.tmpdir(), 'offix-web-'));
  fs.mkdirSync(path.join(webDir, 'assets'));
  fs.writeFileSync(path.join(webDir, 'index.html'), '<!doctype html><html><body><div id="root"></div></body></html>');
  fs.writeFileSync(path.join(webDir, 'assets', 'index-abc123.js'), bigAsset);
  fs.writeFileSync(path.join(webDir, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  app = createApp({ webDistDir: webDir });
  c = await seedCompany(app);
});

afterAll(async () => {
  fs.rmSync(webDir, { recursive: true, force: true });
  await pool.end();
});

describe('веб-версия с того же адреса, что и API', () => {
  it('главная и любые маршруты приложения отдают index.html без кеша', async () => {
    for (const url of ['/', '/tasks/12', '/chats/5?topic=3']) {
      const r = await request(app).get(url).set('Accept', 'text/html');
      expect(r.status).toBe(200);
      expect(r.text).toContain('<div id="root">');
      expect(r.headers['cache-control']).toBe('no-cache');
    }
  });

  it('файлы сборки кешируются навсегда и сжимаются', async () => {
    const r = await request(app).get('/assets/index-abc123.js').set('Accept-Encoding', 'gzip');
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toContain('immutable');
    expect(r.headers['content-encoding']).toBe('gzip');
    expect(r.text).toBe(bigAsset);
  });

  it('отсутствующий файл сборки — 404, а не index.html (старая вкладка после обновления)', async () => {
    const r = await request(app).get('/assets/index-old999.js').set('Accept', '*/*');
    expect(r.status).toBe(404);
    expect(r.text).not.toContain('<div id="root">');
  });

  it('API не подменяется страницей сайта', async () => {
    const unknownApi = await request(app).get('/api/no-such-thing').set('Accept', 'text/html');
    expect(unknownApi.status).toBe(401);
    expect(unknownApi.headers['content-type']).toContain('application/json');
    const health = await request(app).get('/api/health').set('Accept', 'text/html');
    expect(health.body.status).toBe('ok');
    const uploads = await request(app).get('/uploads/nothing.png').set('Accept', 'text/html');
    expect(uploads.status).toBe(401);
  });

  it('без собранного сайта сервер работает как чистый API', async () => {
    const apiOnly = createApp({ webDistDir: path.join(webDir, 'missing') });
    const r = await request(apiOnly).get('/').set('Accept', 'text/html');
    expect(r.status).toBe(404);
    expect(r.headers['content-type']).toContain('application/json');
  });
});

describe('заголовки безопасности', () => {
  it('CSP: только свои скрипты, без принудительного https (сайт по http://IP в локальной сети работает)', async () => {
    const r = await request(app).get('/').set('Accept', 'text/html');
    const csp = r.headers['content-security-policy'];
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain('upgrade-insecure-requests');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['x-powered-by']).toBeUndefined();
  });

  it('X-Forwarded-For по умолчанию принимается только от прокси на этой машине', () => {
    expect(trustProxySetting('loopback')).toBe('loopback');
    expect(trustProxySetting('true')).toBe('loopback');
    expect(trustProxySetting('2')).toBe(2);
    expect(trustProxySetting('false')).toBe(false);
    expect(trustProxySetting('10.0.0.1, 10.0.0.2')).toBe('10.0.0.1, 10.0.0.2');
  });
});

describe('загрузки', () => {
  it('документ базы знаний: имя на диске случайное, «../» в имени не выводит из папки', async () => {
    const escape = path.resolve(UPLOAD_DIRS.knowledge, '..', '..', 'evil.md');
    fs.rmSync(escape, { force: true });
    const r = await client(app, c.dir).upload(
      '/api/knowledge/documents',
      'file',
      Buffer.from('Регламент отпусков. '.repeat(10)),
      '../../evil.md',
    );
    expect(r.status).toBe(201);
    expect(r.body.filename).toMatch(/^kb_\d+-[0-9a-f]+\.md$/);
    expect(fs.existsSync(path.join(UPLOAD_DIRS.knowledge, r.body.filename))).toBe(true);
    expect(fs.existsSync(escape)).toBe(false);
    const del = await client(app, c.dir).delete(`/api/knowledge/documents/${r.body.id}`);
    expect(del.status).toBe(200);
    expect(fs.existsSync(path.join(UPLOAD_DIRS.knowledge, r.body.filename))).toBe(false);
  });

  it('недопустимый формат документа отклоняется', async () => {
    const r = await client(app, c.dir).upload('/api/knowledge/documents', 'file', Buffer.from('<script>'), 'page.html');
    expect(r.status).toBe(400);
  });

  it('вопрос к AI проверяется до обращения к нейросети', async () => {
    const empty = await client(app, c.mgr1).post('/api/knowledge/chat', { message: '   ' });
    expect(empty.status).toBe(400);
    const notText = await client(app, c.mgr1).post('/api/knowledge/chat', { message: { $ne: 1 } });
    expect(notText.status).toBe(400);
  });

  it('после «выйти на всех устройствах» старый токен не открывает файлы чата', async () => {
    const chat = await client(app, c.mgr1).post('/api/chats', { type: 'private', user_ids: [c.mgr2.id] });
    expect(chat.status).toBe(201);
    const up = await request(app)
      .post('/api/upload')
      .set('Authorization', `Bearer ${c.mgr1.token}`)
      .field('chatId', String(chat.body.id))
      .attach('file', Buffer.from('отчёт за месяц'), 'report.txt');
    expect(up.status).toBe(201);
    const url: string = up.body.file_url;
    const before = await request(app).get(url).set('Authorization', `Bearer ${c.mgr2.token}`);
    expect(before.status).toBe(200);

    const oldToken = c.mgr2.token;
    expect((await client(app, c.mgr2).post('/api/auth/logout-all')).status).toBe(200);
    const after = await request(app).get(url).set('Authorization', `Bearer ${oldToken}`);
    expect(after.status).toBe(401);
  });
});
