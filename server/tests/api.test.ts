import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, Server } from 'http';
import type { AddressInfo } from 'net';
import { io as ioClient, Socket } from 'socket.io-client';
import type { Express } from 'express';
import pool from '../src/db/pool';
import { createApp } from '../src/app';
import { initSocket } from '../src/realtime/socket';
import { Actor, client, login, resetDatabase, seedCompany } from './helpers';

let app: Express;
let server: Server;
let baseUrl: string;
let c: Awaited<ReturnType<typeof seedCompany>>;

beforeAll(async () => {
  await resetDatabase();
  app = createApp({ webDistDir: null });
  server = createServer(app);
  initSocket(server);
  await new Promise<void>((r) => server.listen(0, r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  c = await seedCompany(app);
});

afterAll(async () => {
  await new Promise((r) => server.close(r));
  await pool.end();
});

const as = (a?: Actor) => client(app, a);

describe('авторизация', () => {
  it('самостоятельная регистрация закрыта', async () => {
    const r = await as().post('/api/auth/register', { username: 'hacker', email: 'h@x.ru', password: 'secret-pass' });
    expect(r.status).toBe(403);
  });

  it('без токена данные не отдаются (раньше история чатов была открыта)', async () => {
    expect((await as().get('/api/messages/1')).status).toBe(401);
    expect((await as().get('/api/messages/1/pinned')).status).toBe(401);
    expect((await as().get('/api/tasks/1')).status).toBe(401);
  });

  it('импорт KPI без токена запрещён', async () => {
    expect((await as().post('/api/kpi/import')).status).toBe(401);
  });

  it('вход по email без учёта регистра', async () => {
    const r = await as().post('/api/auth/login', { username: 'MGR1@Test.ru', password: 'secret-pass' });
    expect(r.status).toBe(200);
  });

  it('ошибки приходят по-русски, без кракозябр', async () => {
    const r = await as().post('/api/auth/login', { username: 'mgr1', password: 'wrong' });
    expect(r.status).toBe(401);
    expect(r.body.error).toBe('Неверный логин или пароль');
  });

  it('вход на сайт по QR: телефон подтверждает, сайт один раз забирает сессию', async () => {
    const created = await as().post('/api/auth/qr', {});
    expect(created.status).toBe(201);
    const { token, secret } = created.body;
    expect((await as().post('/api/auth/qr/poll', { token, secret })).body.status).toBe('pending');
    // Без secret (сфотографировали код с чужого экрана) — сессию не забрать.
    expect((await as().post('/api/auth/qr/poll', { token, secret: 'x'.repeat(40) })).status).toBe(404);
    // Без входа на телефоне подтвердить нельзя.
    expect((await as().post(`/api/auth/qr/${token}/approve`)).status).toBe(401);

    const info = await as(c.mgr1).get(`/api/auth/qr/${token}`);
    expect(info.status).toBe(200);
    expect(info.body.status).toBe('scanned');
    expect(info.body.device.label).toBeTruthy();
    const scanned = (await as().post('/api/auth/qr/poll', { token, secret })).body;
    expect(scanned.status).toBe('scanned');
    expect(scanned.user.display_name).toBeTruthy();

    expect((await as(c.mgr1).post(`/api/auth/qr/${token}/approve`)).body.status).toBe('approved');
    const done = (await as().post('/api/auth/qr/poll', { token, secret })).body;
    expect(done.status).toBe('approved');
    expect(done.user.id).toBe(c.mgr1.id);
    const me = await client(app, { ...c.mgr1, token: done.token }).get('/api/auth/me');
    expect(me.body.id).toBe(c.mgr1.id);
    // Второй раз — уже нет.
    expect((await as().post('/api/auth/qr/poll', { token, secret })).body.status).toBe('expired');
    expect((await as(c.mgr1).post(`/api/auth/qr/${token}/approve`)).status).toBe(400);
  });

  it('вход по QR можно отклонить', async () => {
    const { token, secret } = (await as().post('/api/auth/qr', {})).body;
    await as(c.mgr2).post(`/api/auth/qr/${token}/decline`);
    expect((await as().post('/api/auth/qr/poll', { token, secret })).body.status).toBe('declined');
    expect((await as(c.mgr2).post(`/api/auth/qr/${token}/approve`)).status).toBe(400);
    expect((await as(c.mgr2).get('/api/auth/qr/not-a-token')).status).toBe(400);
  });

  it('профиль по логину (ссылка и QR-код /u/логин) и assetlinks для Android', async () => {
    const r = await as(c.mgr2).get('/api/users/by-username/MGR1');
    expect(r.status).toBe(200);
    expect(r.body.id).toBe(c.mgr1.id);
    expect(r.body.email).toBeUndefined();
    expect((await as(c.mgr2).get('/api/users/by-username/nobody')).status).toBe(404);
    expect((await as().get('/api/users/by-username/mgr1')).status).toBe(401);
    const links = await as().get('/.well-known/assetlinks.json');
    expect(links.status).toBe(200);
    expect(links.body[0].target.package_name).toBe('com.mesnation');
    expect(links.body[0].target.sha256_cert_fingerprints[0]).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
  });

  it('/me содержит название компании и признак директора', async () => {
    const me = (await as(c.dir).get('/api/auth/me')).body;
    expect(me.company_name).toBe('ООО Тест');
    expect(me.is_director).toBe(true);
    expect((await as(c.mgr1).get('/api/auth/me')).body.is_director).toBe(false);
  });
});

describe('дерево ролей', () => {
  it('одинаковые названия ролей в разных отделах разрешены', () => {
    expect(c.nodes.mgrNode).not.toBe(c.nodes.bkNode);
  });

  it('переименование корня не лишает директора прав', async () => {
    const r = await as(c.dir).patch(`/api/role-tree/${c.nodes.root}`, { name: 'Генеральный директор' });
    expect(r.status).toBe(200);
    expect((await as(c.dir).get('/api/auth/me')).body.is_director).toBe(true);
    const n = await as(c.dir).post('/api/role-tree', { name: 'Юрист', parent_id: c.nodes.root });
    expect(n.status).toBe(201);
  });

  it('не директор не может менять дерево', async () => {
    const r = await as(c.sales).post('/api/role-tree', { name: 'Стажёр', parent_id: c.nodes.mgrNode });
    expect(r.status).toBe(403);
  });

  it('нельзя перенести роль внутрь своего поддерева', async () => {
    const r = await as(c.dir).patch(`/api/role-tree/${c.nodes.salesNode}`, { parent_id: c.nodes.mgrNode });
    expect(r.status).toBe(400);
  });

  it('у дерева один корень: «потерянная» роль возвращается под директора', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    // Второй корень база больше не принимает.
    await expect(pool.query(`INSERT INTO role_tree (name, parent_id) VALUES ('Сирота', NULL)`)).rejects.toThrow();
    // Старые данные: снимаем защиту и создаём роль без родителя, как после старого удаления.
    await pool.query('DROP INDEX uq_role_tree_single_root');
    const stray = (await pool.query(`INSERT INTO role_tree (name, parent_id) VALUES ('Сирота', NULL) RETURNING id`)).rows[0].id;
    const sql = readFileSync(join(__dirname, '../src/db/migrations/0013_role_tree_single_root.sql'), 'utf8');
    await pool.query(sql);
    const row = (await pool.query('SELECT parent_id, level FROM role_tree WHERE id = $1', [stray])).rows[0];
    expect(row.parent_id).toBe(c.nodes.root);
    expect(row.level).toBe(1);
    const roots = await pool.query('SELECT id FROM role_tree WHERE parent_id IS NULL');
    expect(roots.rows.map((r) => r.id)).toEqual([c.nodes.root]);
    expect((await as(c.dir).get('/api/auth/me')).body.is_director).toBe(true);
    await as(c.dir).delete(`/api/role-tree/${stray}`);
  });

  it('прямые члены роли отдаются одним запросом', async () => {
    const r = await as(c.dir).get(`/api/role-tree/${c.nodes.mgrNode}/users`);
    expect(r.body.map((u: any) => u.username).sort()).toEqual(['mgr1', 'mgr2']);
  });
});

describe('иерархия при постановке задач', () => {
  const assignable = async (a: Actor) =>
    ((await as(a).get('/api/users/assignable')).body as any[]).map((u) => u.username).sort();

  it('менеджер: себе, коллеге своей должности и людям своего уровня из других отделов; вверх — нельзя', async () => {
    expect(await assignable(c.mgr1)).toEqual(['bk', 'mgr1', 'mgr2']);
  });

  it('руководитель: своё поддерево и коллеги своего уровня', async () => {
    expect(await assignable(c.sales)).toEqual(['acc', 'mgr1', 'mgr2', 'sales']);
  });

  it('директор: все', async () => {
    expect(await assignable(c.dir)).toEqual(['acc', 'bk', 'dir', 'mgr1', 'mgr2', 'sales']);
  });

  it('задачу начальнику поставить нельзя', async () => {
    const r = await as(c.mgr1).post('/api/tasks', { title: 'Вверх', assignee_ids: [c.sales.id] });
    expect(r.status).toBe(403);
  });

  it('задачу подчинённому и самому себе — можно', async () => {
    expect((await as(c.sales).post('/api/tasks', { title: 'Вниз', assignee_ids: [c.mgr1.id] })).status).toBe(201);
    expect((await as(c.mgr1).post('/api/tasks', { title: 'Себе', assignee_ids: [c.mgr1.id] })).status).toBe(201);
  });
});

describe('задачи', () => {
  let taskId: number;

  beforeAll(async () => {
    const r = await as(c.mgr1).post('/api/tasks', {
      title: 'Сверка с бухгалтерией',
      assignee_ids: [c.bk.id],
      watcher_ids: [c.mgr2.id],
      // Общий срок через 2 дня, сдать на проверку нужно было час назад.
      executor_deadline: new Date(Date.now() + 2 * 86400_000).toISOString(),
      reviewer_deadline: new Date(Date.now() - 3600_000).toISOString(),
      checkpoints: [{ title: 'Черновик', deadline: new Date(Date.now() + 3600_000).toISOString() }],
    });
    expect(r.status).toBe(201);
    taskId = r.body.id;
    expect(r.body.reviewer_deadline).not.toBeNull(); // раньше сервер его терял
  });

  it('роли в задаче видны для иконок на плашке', async () => {
    const list = (await as(c.mgr2).get('/api/tasks')).body as any[];
    const t = list.find((x) => x.id === taskId);
    expect(t).toMatchObject({ is_creator: false, is_assignee: false, is_watcher: true });
    expect(t.watchers.map((w: any) => w.username)).toEqual(['mgr2']);
  });

  it('просрочка вычисляется (фильтр «Просроченные» больше не пустой)', async () => {
    const list = (await as(c.mgr1).get('/api/tasks?overdue=true')).body as any[];
    expect(list.some((t) => t.id === taskId && t.is_overdue)).toBe(true);
  });

  it('дедлайн проверки — не позже дедлайна выполнения (общего срока)', async () => {
    const soon = new Date(Date.now() + 86400_000).toISOString();
    const later = new Date(Date.now() + 3 * 86400_000).toISOString();
    const bad = await as(c.mgr1).post('/api/tasks', { title: 'Х', assignee_ids: [c.bk.id], executor_deadline: soon, reviewer_deadline: later });
    expect(bad.status).toBe(400);
    const ok = await as(c.mgr1).post('/api/tasks', { title: 'Отчёт', assignee_ids: [c.bk.id], executor_deadline: later, reviewer_deadline: soon });
    expect(ok.status).toBe(201);
    // Текущий срок до сдачи — дедлайн проверки.
    expect(new Date(ok.body.current_deadline).toISOString()).toBe(soon);
    // Перенос общего срока раньше дедлайна проверки запрещён.
    expect((await as(c.mgr1).patch(`/api/tasks/${ok.body.id}`, { executor_deadline: new Date(Date.now() + 3600_000).toISOString() })).status).toBe(400);
    // Сдали на проверку после дедлайна проверки — наблюдателям остаётся общий срок.
    const late = await as(c.mgr1).post('/api/tasks', {
      title: 'Поздняя сдача',
      assignee_ids: [c.bk.id],
      executor_deadline: later,
      reviewer_deadline: new Date(Date.now() - 3600_000).toISOString(),
    });
    expect(late.body.is_overdue).toBe(true);
    await as(c.bk).post(`/api/tasks/${late.body.id}/transition`, { to_status: 'in_progress' });
    const sent = await as(c.bk).post(`/api/tasks/${late.body.id}/transition`, { to_status: 'on_review' });
    expect(sent.status).toBe(200);
    const after = (await as(c.mgr1).get(`/api/tasks/${late.body.id}`)).body;
    expect(after.is_overdue).toBe(false);
    expect(new Date(after.current_deadline).toISOString()).toBe(later);
  });

  it('проверяют наблюдатели: наблюдатель принимает или отклоняет, исполнитель — нет', async () => {
    const t = await as(c.mgr1).post('/api/tasks', { title: 'Проверка наблюдателем', assignee_ids: [c.bk.id], watcher_ids: [c.mgr2.id] });
    await as(c.bk).post(`/api/tasks/${t.body.id}/transition`, { to_status: 'on_review' });
    const forWatcher = (await as(c.mgr2).get(`/api/tasks/${t.body.id}`)).body;
    expect(forWatcher.available_transitions.map((x: any) => x.to).sort()).toEqual(['done', 'rejected']);
    expect((await as(c.bk).post(`/api/tasks/${t.body.id}/transition`, { to_status: 'done' })).status).toBe(403);
    expect((await as(c.mgr2).post(`/api/tasks/${t.body.id}/transition`, { to_status: 'rejected' })).status).toBe(400); // без причины
    expect((await as(c.mgr2).post(`/api/tasks/${t.body.id}/transition`, { to_status: 'rejected', comment: 'Нет подписи' })).status).toBe(200);
    await as(c.bk).post(`/api/tasks/${t.body.id}/transition`, { to_status: 'on_review' });
    expect((await as(c.mgr2).post(`/api/tasks/${t.body.id}/transition`, { to_status: 'done' })).status).toBe(200);
  });

  it('посторонний не видит задачу, руководитель исполнителя — видит', async () => {
    expect((await as(c.sales).get(`/api/tasks/${taskId}`)).status).toBe(200); // руководитель создателя
    expect((await as(c.acc).get(`/api/tasks/${taskId}`)).status).toBe(200); // руководитель исполнителя
    const outsider = await login(app, 'mgr2', 'secret-pass');
    await as(c.mgr1).patch(`/api/tasks/${taskId}`, { watcher_ids: [c.mgr1.id] });
    expect((await as(outsider).get(`/api/tasks/${taskId}`)).status).toBe(403);
    expect((await as(outsider).get(`/api/tasks/${taskId}/comments`)).status).toBe(403);
  });

  it('дедлайн может переносить только создатель', async () => {
    const r = await as(c.bk).patch(`/api/tasks/${taskId}`, { executor_deadline: new Date().toISOString() });
    expect(r.status).toBe(403);
    const ok = await as(c.mgr1).patch(`/api/tasks/${taskId}`, { executor_deadline: new Date(Date.now() + 86400_000).toISOString() });
    expect(ok.status).toBe(200);
  });

  it('вложения: выделить, удалить несколько, переслать в чат альбомом с подписью', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    const up = async (who: Actor, name: string, data: Buffer) => (await as(who).upload(`/api/tasks/${taskId}/files`, 'file', data, name)).body;
    const a = await up(c.mgr1, 'схема.png', png);
    const b = await up(c.mgr1, 'фото.png', png);
    const doc = await up(c.bk, 'акт.txt', Buffer.from('акт сверки'));
    expect(a.id && b.id && doc.id).toBeTruthy();

    // Пересылка в чат: два фото альбомом, документ отдельно, подпись — у первого фото.
    const chat = (await as(c.mgr1).post('/api/chats', { type: 'private', user_ids: [c.mgr2.id] })).body;
    const fwd = await as(c.mgr1).post(`/api/tasks/${taskId}/files/forward`, {
      file_ids: [a.id, b.id, doc.id],
      targets: [{ chat_id: chat.id }],
      comment: 'Файлы по сверке',
    });
    expect(fwd.status).toBe(200);
    expect(fwd.body.sent).toBe(3);
    const msgs = (await as(c.mgr2).get(`/api/messages/${chat.id}`)).body as any[];
    const forwarded = msgs.filter((m) => m.file_name && ['схема.png', 'фото.png', 'акт.txt'].includes(m.file_name));
    expect(forwarded).toHaveLength(3);
    const photos = forwarded.filter((m) => m.media_kind === 'photo');
    expect(photos).toHaveLength(2);
    expect(photos[0].media_group_id).toBeTruthy();
    expect(photos[0].media_group_id).toBe(photos[1].media_group_id);
    expect(forwarded.find((m) => m.text === 'Файлы по сверке')?.media_kind).toBe('photo');
    // Файл в чате — копия: удаление вложения задачи его не трогает.
    const copy = forwarded.find((m) => m.file_name === 'акт.txt');
    expect((await as(c.mgr2).get(copy.file_url)).status).toBe(200);

    // В чужой чат переслать нельзя.
    const foreign = (await as(c.dir).post('/api/chats', { type: 'private', user_ids: [c.acc.id] })).body;
    expect((await as(c.mgr1).post(`/api/tasks/${taskId}/files/forward`, { file_ids: [a.id], targets: [{ chat_id: foreign.id }] })).status).toBe(403);

    // Удалить несколько: создатель задачи (mgr1) — любые; наблюдатель mgr2 — только свои.
    const denied = await as(c.mgr2).post(`/api/tasks/${taskId}/files/bulk-delete`, { file_ids: [a.id, doc.id] });
    expect(denied.status).toBe(403);
    const del = await as(c.mgr1).post(`/api/tasks/${taskId}/files/bulk-delete`, { file_ids: [a.id, b.id, doc.id] });
    expect(del.body.deleted.sort()).toEqual([a.id, b.id, doc.id].sort());
    expect((await as(c.mgr1).get(`/api/tasks/${taskId}/files`)).body).toHaveLength(0);
    expect((await as(c.mgr2).get(copy.file_url)).status).toBe(200);
  });

  it('удаление = архив с пометкой, разархивация возвращает задачу', async () => {
    await as(c.bk).post(`/api/tasks/${taskId}/transition`, { to_status: 'in_progress' });
    expect((await as(c.mgr1).delete(`/api/tasks/${taskId}`)).body.archived_as).toBe('deleted');
    const archived = (await as(c.mgr1).get(`/api/tasks/${taskId}`)).body;
    expect(archived.status_new).toBe('archived');
    const back = await as(c.mgr1).post(`/api/tasks/${taskId}/unarchive`);
    expect(back.status).toBe(200);
    expect(back.body.status_new).toBe('in_progress');
  });
});

describe('чаты', () => {
  let groupId: number;

  beforeAll(async () => {
    const r = await as(c.mgr1).post('/api/chats', { type: 'group', name: 'Продажи', user_ids: [c.mgr2.id] });
    expect(r.status).toBe(201);
    groupId = r.body.id;
  });

  it('не участник не может добавить себя в чужую группу (раньше мог)', async () => {
    const r = await as(c.bk).post(`/api/chats/${groupId}/members`, { user_ids: [c.bk.id] });
    expect(r.status).toBe(403);
    expect((await as(c.bk).get(`/api/messages/${groupId}`)).status).toBe(403);
  });

  it('личный чат называется именем собеседника', async () => {
    const r = await as(c.mgr1).post('/api/chats', { type: 'private', user_ids: [c.bk.id] });
    expect(r.body.name).toBe('BK');
    const list = (await as(c.bk).get('/api/chats')).body as any[];
    expect(list.find((x) => x.id === r.body.id).name).toBe('MGR1');
  });

  it('фото группы: снимок больше 10 МБ принимается, нечитаемый файл — понятная ошибка', async () => {
    const sharp = (await import('sharp')).default;
    // Шум почти не сжимается: JPEG такого размера — как снимок с камеры телефона.
    const big = await sharp({ create: { width: 3600, height: 3600, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 70 } } })
      .jpeg({ quality: 100 })
      .toBuffer();
    expect(big.length).toBeGreaterThan(10 * 1024 * 1024);
    const ok = await as(c.mgr1).upload(`/api/chats/${groupId}/avatar`, 'avatar', big, 'IMG_0001.jpg');
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.avatar_url).toMatch(/^\/uploads\/avatars\/.+\.jpg$/);
    // Файл аватара на месте (раньше у .jpg он удалялся сразу после сохранения).
    const img = await as(c.mgr1).get(ok.body.avatar_url);
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toMatch(/image\/jpeg/);

    const broken = await as(c.mgr1).upload(`/api/chats/${groupId}/avatar`, 'avatar', Buffer.from('not an image at all'), 'IMG_0002.heic');
    expect(broken.status).toBe(400);
    expect(broken.body.error).toMatch(/JPG или PNG/);
  });

  it('ранее отсутствовавшие эндпоинты работают', async () => {
    expect((await as(c.mgr1).get(`/api/chats/${groupId}`)).status).toBe(200);
    expect((await as(c.mgr1).get(`/api/chats/${groupId}/members`)).body).toHaveLength(2);
    expect((await as(c.mgr1).get(`/api/chats/${groupId}/stats`)).status).toBe(200);
    expect((await as(c.mgr1).get(`/api/chats/${groupId}/messages?type=files`)).status).toBe(200);
  });
});

describe('сокеты и сообщения', () => {
  const connect = (a?: Actor) =>
    ioClient(baseUrl, { auth: a ? { token: a.token } : {}, transports: ['websocket'], forceNew: true });
  const once = <T>(s: Socket, ev: string) => new Promise<T>((r) => s.once(ev, r));

  it('подключение без токена отклоняется', async () => {
    const s = connect();
    const err = await once<Error>(s, 'connect_error');
    expect(err.message).toBe('unauthorized');
    s.close();
  });

  it('отправка, закрепление POST, «удалить у себя» не задевает других', async () => {
    const chat = await as(c.mgr1).post('/api/chats', { type: 'group', name: 'Сокеты', user_ids: [c.mgr2.id] });
    const chatId = chat.body.id;
    const a = connect(c.mgr1);
    const b = connect(c.mgr2);
    const outsider = connect(c.bk);
    await Promise.all([once(a, 'connect'), once(b, 'connect'), once(outsider, 'connect')]);
    const join = (s: Socket) => new Promise<any>((r) => s.emit('join_chat', String(chatId), r));
    expect(await join(a)).toEqual({ ok: true });
    expect(await join(b)).toEqual({ ok: true });
    expect(await join(outsider)).toEqual({ ok: false });

    const received = once<any>(b, 'new_message');
    // senderId от клиента игнорируется: отправитель берётся из токена.
    const ack = await new Promise<any>((r) =>
      a.emit('send_message', { chatId, text: 'Привет', senderId: c.dir.id, client_id: 'c-1' }, r),
    );
    expect(ack.ok).toBe(true);
    expect(ack.message.sender_id).toBe(c.mgr1.id);
    expect((await received).text).toBe('Привет');

    // Повторная отправка того же client_id не создаёт дубль.
    const again = await new Promise<any>((r) => a.emit('send_message', { chatId, text: 'Привет', client_id: 'c-1' }, r));
    expect(again.message.id).toBe(ack.message.id);

    expect((await as(c.mgr2).post(`/api/messages/${ack.message.id}/pin`)).status).toBe(200);
    expect((await as(c.mgr1).get(`/api/messages/${chatId}/pinned`)).body).toHaveLength(1);

    let leaked = false;
    b.on('message_deleted', () => (leaked = true));
    await as(c.mgr1).delete(`/api/messages/${ack.message.id}?scope=me`);
    await new Promise((r) => setTimeout(r, 200));
    expect(leaked).toBe(false);
    const regular = (r: any) => (r.body as any[]).filter((m) => m.content_type !== 'service');
    expect(regular(await as(c.mgr2).get(`/api/messages/${chatId}`))).toHaveLength(1);
    expect(regular(await as(c.mgr1).get(`/api/messages/${chatId}`))).toHaveLength(0);

    a.close();
    b.close();
    outsider.close();
  });
});

describe('сотрудники: активность и пароли', () => {
  it('админ видит роли и email всех сотрудников', async () => {
    const list = (await as(c.dir).get('/api/users')).body as any[];
    const mgr = list.find((u) => u.username === 'mgr1');
    expect(mgr.role_name).toBe('Менеджер');
    expect(mgr.email).toBe('mgr1@test.ru');
  });

  it('деактивированный не входит и не предлагается в исполнители', async () => {
    const tmp = await as(c.dir).post('/api/role-tree/users', {
      username: 'temp', email: 'temp@test.ru', password: 'secret-pass', role_node_id: c.nodes.mgrNode,
    });
    const t = await login(app, 'temp', 'secret-pass');
    expect((await as(c.dir).patch(`/api/users/${tmp.body.id}/active`, { is_active: false })).status).toBe(200);
    expect((await as().post('/api/auth/login', { username: 'temp', password: 'secret-pass' })).status).toBe(403);
    expect((await as(t).get('/api/auth/me')).status).toBe(403); // старый токен тоже перестал работать
    const assignable = (await as(c.sales).get('/api/users/assignable')).body as any[];
    expect(assignable.some((u) => u.username === 'temp')).toBe(false);
    const all = (await as(c.dir).get('/api/users?include_inactive=true')).body as any[];
    expect(all.find((u) => u.username === 'temp').is_active).toBe(false);
  });

  it('менеджер не может деактивировать начальника', async () => {
    expect((await as(c.mgr1).patch(`/api/users/${c.sales.id}/active`, { is_active: false })).status).toBe(403);
  });

  it('сброс пароля возвращает новый пароль один раз', async () => {
    const r = await as(c.dir).post(`/api/users/${c.mgr2.id}/reset-password`);
    expect(r.body.password).toMatch(/^[A-Za-z0-9]{12}$/);
    expect((await as(c.mgr2).get('/api/auth/me')).status).toBe(401); // старая сессия завершена
    c.mgr2 = await login(app, 'mgr2', r.body.password);
  });
});

describe('отложенная отправка', () => {
  it('сообщение уходит в назначенное время и только один раз', async () => {
    const chat = await as(c.mgr1).post('/api/chats', { type: 'group', name: 'Позже', user_ids: [c.mgr2.id] });
    const chatId = chat.body.id;
    const past = await as(c.mgr1).post(`/api/chats/${chatId}/scheduled`, { text: 'x', send_at: new Date(Date.now() - 1000).toISOString() });
    expect(past.status).toBe(400);
    const s = await as(c.mgr1).post(`/api/chats/${chatId}/scheduled`, {
      text: 'Напоминание', send_at: new Date(Date.now() + 120_000).toISOString(),
    });
    expect(s.status).toBe(201);
    expect((await as(c.mgr2).get(`/api/chats/${chatId}/scheduled`)).body).toHaveLength(0); // чужие не видны
    expect((await as(c.mgr1).get(`/api/chats/${chatId}/scheduled`)).body).toHaveLength(1);
    expect((await as(c.mgr1).post(`/api/scheduled/${s.body.id}/send-now`)).status).toBe(200);
    const { dispatchDueMessages } = await import('../src/services/scheduledMessages');
    await dispatchDueMessages();
    const msgs = (await as(c.mgr2).get(`/api/messages/${chatId}`)).body as any[];
    expect(msgs.filter((m) => m.text === 'Напоминание')).toHaveLength(1);
    expect((await as(c.mgr1).get(`/api/chats/${chatId}/scheduled`)).body).toHaveLength(0);
  });
});

describe('заметки: вложения, копия, PDF, отправка в чат', () => {
  it('полный сценарий', async () => {
    const note = await as(c.mgr1).post('/api/notes', { title: 'План встречи', content: 'Обсудить квартальный отчёт' });
    expect(note.status).toBe(201);
    const noteId = note.body.id;

    const file = await as(c.mgr1).upload(`/api/notes/${noteId}/files`, 'file', Buffer.from('hello'), 'Отчёт.txt');
    expect(file.status).toBe(201);
    expect(file.body.file_name).toBe('Отчёт.txt');
    expect((await as(c.mgr2).get(`/api/notes/${noteId}`)).status).toBe(403);
    expect((await as(c.mgr2).get(file.body.file_url)).status).toBe(403);

    const full = await as(c.mgr1).get(`/api/notes/${noteId}`);
    expect(full.body.files).toHaveLength(1);
    expect(full.body.files_count).toBe(1);

    const copy = await as(c.mgr1).post(`/api/notes/${noteId}/duplicate`);
    expect(copy.body.title).toBe('План встречи (копия)');
    expect(copy.body.files).toHaveLength(1);
    // Удаление копии не удаляет файл оригинала.
    expect((await as(c.mgr1).delete(`/api/notes/${copy.body.id}`)).status).toBe(200);
    expect((await as(c.mgr1).get(file.body.file_url)).status).toBe(200);

    const link = await as(c.mgr1).get(`/api/notes/${noteId}/pdf-link`);
    const pdf = await as().get(link.body.url);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect((await as().get('/api/notes-pdf?token=bad')).status).toBe(401);

    // Отправка в чат: получатель видит карточку и принимает заметку себе.
    const chat = await as(c.mgr1).post('/api/chats', { type: 'private', user_ids: [c.mgr2.id] });
    expect((await as(c.mgr1).post(`/api/notes/${noteId}/share`, { chat_id: 999999 })).status).toBe(403);
    const msg = await as(c.mgr1).post(`/api/notes/${noteId}/share`, { chat_id: chat.body.id });
    expect(msg.status).toBe(201);
    expect(msg.body.content_type).toBe('note');
    expect(msg.body.note_share.title).toBe('План встречи');

    const shareId = msg.body.note_share_id;
    expect((await as(c.bk).get(`/api/notes/shared/${shareId}`)).status).toBe(403);
    expect((await as(c.mgr2).get(file.body.file_url)).status).toBe(200);

    const accepted = await as(c.mgr2).post(`/api/notes/shared/${shareId}/accept`);
    expect(accepted.status).toBe(201);
    expect(accepted.body.user_id).toBe(c.mgr2.id);
    expect(accepted.body.content).toBe('Обсудить квартальный отчёт');
    expect(accepted.body.files).toHaveLength(1);
    // Повторное принятие не плодит копии.
    const again = await as(c.mgr2).post(`/api/notes/shared/${shareId}/accept`);
    expect(again.body.id).toBe(accepted.body.id);
    const shared = await as(c.mgr2).get(`/api/notes/shared/${shareId}`);
    expect(shared.body.is_accepted).toBe(true);
    const history = (await as(c.mgr2).get(`/api/messages/${chat.body.id}`)).body as any[];
    expect(history.find((m) => m.id === msg.body.id).note_share.accepted_user_ids).toContain(c.mgr2.id);
  });

  it('подпись в том же сообщении, запрос актуальной версии, копия «Название (2)»', async () => {
    const note = await as(c.mgr1).post('/api/notes', { title: 'Скрипт звонка', content: 'Версия 1' });
    const chat = await as(c.mgr1).post('/api/chats', { type: 'private', user_ids: [c.mgr2.id] });
    const msg = await as(c.mgr1).post(`/api/notes/${note.body.id}/share`, { chat_id: chat.body.id, comment: 'Посмотри до созвона' });
    expect(msg.status).toBe(201);
    // Подпись — текст самой заметки-сообщения, отдельного сообщения нет.
    expect(msg.body.text).toBe('Посмотри до созвона');
    expect(msg.body.note_share.sender_name).toBeTruthy();
    const list = (await as(c.mgr2).get('/api/chats')).body as any[];
    expect(list.find((x) => x.id === chat.body.id).last_message.note_title).toBe('Скрипт звонка');
    const shareId = msg.body.note_share_id;

    // Принял снимок, автор потом обновил заметку.
    await as(c.mgr2).post(`/api/notes/shared/${shareId}/accept`);
    await as(c.mgr1).patch(`/api/notes/${note.body.id}`, { content: 'Версия 2' });

    // Автор сам у себя запросить не может, посторонний — тоже.
    expect((await as(c.mgr1).post(`/api/notes/shared/${shareId}/request`)).status).toBe(400);
    expect((await as(c.bk).post(`/api/notes/shared/${shareId}/request`)).status).toBe(403);

    const before = (await as(c.mgr1).get('/api/notifications/unread-count')).body.count;
    const r1 = await as(c.mgr2).post(`/api/notes/shared/${shareId}/request`);
    expect(r1.status).toBe(201);
    expect(r1.body.status).toBe('pending');
    // Повторное нажатие не создаёт второй запрос.
    const r2 = await as(c.mgr2).post(`/api/notes/shared/${shareId}/request`);
    expect(r2.body.id).toBe(r1.body.id);
    expect(r2.body.already).toBe(true);
    expect((await as(c.mgr2).get(`/api/notes/shared/${shareId}`)).body.my_request.status).toBe('pending');

    // У автора — уведомление в колокольчике и экран запроса с актуальной версией.
    expect((await as(c.mgr1).get('/api/notifications/unread-count')).body.count).toBe(before + 1);
    const feed = (await as(c.mgr1).get('/api/notifications')).body as any[];
    const n = feed.find((x) => x.kind === 'note_request' && x.data.request_id === r1.body.id);
    expect(n.request_status).toBe('pending');
    expect(n.actor_id).toBe(c.mgr2.id);
    const view = await as(c.mgr1).get(`/api/notes/requests/${r1.body.id}`);
    expect(view.body.is_owner).toBe(true);
    expect(view.body.note.preview).toBe('Версия 2');
    expect(view.body.note.changed_since_share).toBe(true);
    // Запросивший не видит текст до подтверждения, чужие — вообще ничего.
    expect((await as(c.mgr2).get(`/api/notes/requests/${r1.body.id}`)).body.note.preview).toBeNull();
    expect((await as(c.bk).get(`/api/notes/requests/${r1.body.id}`)).status).toBe(404);
    expect((await as(c.mgr2).post(`/api/notes/requests/${r1.body.id}/approve`)).status).toBe(403);

    const ok = await as(c.mgr1).post(`/api/notes/requests/${r1.body.id}/approve`);
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('approved');
    // Повтор ничего не ломает и не плодит копий.
    expect((await as(c.mgr1).post(`/api/notes/requests/${r1.body.id}/approve`)).body.status).toBe('approved');

    // У запросившего — новая копия рядом с принятой ранее, как в Проводнике.
    const mine = (await as(c.mgr2).get('/api/notes')).body as any[];
    const copies = mine.filter((x) => x.title.startsWith('Скрипт звонка'));
    expect(copies.map((x) => x.title).sort()).toEqual(['Скрипт звонка', 'Скрипт звонка (2)']);
    expect(copies.find((x) => x.title === 'Скрипт звонка (2)').content).toBe('Версия 2');
    expect(copies.find((x) => x.title === 'Скрипт звонка').content).toBe('Версия 1');
    const done = await as(c.mgr2).get(`/api/notes/requests/${r1.body.id}`);
    expect(done.body.result_note_id).toBe(copies.find((x) => x.title === 'Скрипт звонка (2)').id);
    const feed2 = (await as(c.mgr2).get('/api/notifications')).body as any[];
    expect(feed2.find((x) => x.kind === 'note_request_approved' && x.data.request_id === r1.body.id).body).toBe('Скрипт звонка (2)');

    // Второй запрос, отказ, третий запрос и третья копия.
    const r3 = await as(c.mgr2).post(`/api/notes/shared/${shareId}/request`);
    expect(r3.body.id).not.toBe(r1.body.id);
    expect((await as(c.mgr1).post(`/api/notes/requests/${r3.body.id}/decline`)).body.status).toBe('declined');
    expect((await as(c.mgr2).get('/api/notifications')).body.some((x: any) => x.kind === 'note_request_declined')).toBe(true);
    const r4 = await as(c.mgr2).post(`/api/notes/shared/${shareId}/request`);
    await as(c.mgr1).post(`/api/notes/requests/${r4.body.id}/approve`);
    const titles = ((await as(c.mgr2).get('/api/notes')).body as any[]).map((x) => x.title);
    expect(titles).toContain('Скрипт звонка (3)');

    // Прочитать всё.
    expect((await as(c.mgr2).post('/api/notifications/read', {})).body.count).toBe(0);

    // Подпись у заметки можно изменить и убрать.
    const ed = await as(c.mgr1).patch(`/api/messages/${msg.body.id}`, { text: '' });
    expect(ed.status).toBe(200);
    expect(ed.body.text).toBeNull();

    // Автор удалил заметку — запросить уже нечего.
    await as(c.mgr1).delete(`/api/notes/${note.body.id}`);
    const gone = await as(c.mgr2).post(`/api/notes/shared/${shareId}/request`);
    expect(gone.status).toBe(400);
    expect(gone.body.error).toMatch(/удалил/);
  });
});

describe('контакты как в Telegram', () => {
  it('своё имя для коллеги видно только мне, контакт в сообщении, добавить в группу', async () => {
    const chat = await as(c.mgr1).post('/api/chats', { type: 'private', user_ids: [c.mgr2.id] });
    // Своё имя — только у меня; у собеседника имя прежнее.
    const set = await as(c.mgr1).put(`/api/contacts/${c.mgr2.id}/name`, { first_name: 'Костя', last_name: 'Склад' });
    expect(set.status).toBe(200);
    const mine = ((await as(c.mgr1).get('/api/chats')).body as any[]).find((x) => x.id === chat.body.id);
    expect(mine.name).toBe('Костя Склад');
    expect(mine.peer.contact_name).toBe('Костя Склад');
    expect(mine.peer.display_name).not.toBe('Костя Склад');
    expect((await as(c.mgr1).get(`/api/chats/${chat.body.id}`)).body.name).toBe('Костя Склад');
    const names = (await as(c.mgr1).get('/api/contacts/names')).body as any[];
    expect(names).toEqual([{ user_id: c.mgr2.id, first_name: 'Костя', last_name: 'Склад' }]);
    expect((await as(c.mgr2).get('/api/contacts/names')).body).toEqual([]);
    // Профиль сотрудника не меняется.
    expect((await as(c.mgr1).get(`/api/users/${c.mgr2.id}`)).body.display_name).not.toBe('Костя Склад');
    // Себя переименовать нельзя, пустое имя — сброс.
    expect((await as(c.mgr1).put(`/api/contacts/${c.mgr1.id}/name`, { first_name: 'Я' })).status).toBe(400);
    await as(c.mgr1).put(`/api/contacts/${c.mgr2.id}/name`, { first_name: '', last_name: '' });
    expect((await as(c.mgr1).get('/api/contacts/names')).body).toEqual([]);

    // Поделиться контактом: карточка сотрудника, подпись, пересылка.
    const msg = await as(c.mgr1).post(`/api/chats/${chat.body.id}/contact`, { user_id: c.bk.id, comment: 'Наш бухгалтер' });
    expect(msg.status).toBe(201);
    expect(msg.body.content_type).toBe('contact');
    expect(msg.body.contact.id).toBe(c.bk.id);
    expect(msg.body.contact.display_name || msg.body.contact.username).toBeTruthy();
    expect(msg.body.text).toBe('Наш бухгалтер');
    const list = ((await as(c.mgr2).get('/api/chats')).body as any[]).find((x) => x.id === chat.body.id);
    expect(list.last_message.contact_user_id).toBe(c.bk.id);
    expect(list.last_message.contact_name).toBeTruthy();
    expect((await as(c.acc).post(`/api/chats/${chat.body.id}/contact`, { user_id: c.bk.id })).status).toBe(403);
    const group = await as(c.mgr1).post('/api/chats', { type: 'group', name: 'Склад', user_ids: [c.mgr2.id] });
    const fwd = await as(c.mgr1).post('/api/messages/forward', { messageId: msg.body.id, toChatId: group.body.id });
    expect(fwd.body.contact.id).toBe(c.bk.id);

    // Добавить в группу: мои группы с правом добавлять и пометкой «уже в группе».
    const groups = (await as(c.mgr1).get(`/api/contacts/${c.bk.id}/groups`)).body as any[];
    const g = groups.find((x) => x.id === group.body.id);
    expect(g.can_add).toBe(true);
    expect(g.is_member).toBe(false);
    expect((await as(c.mgr1).post(`/api/chats/${group.body.id}/members`, { user_ids: [c.bk.id] })).status).toBe(200);
    expect(((await as(c.mgr1).get(`/api/contacts/${c.bk.id}/groups`)).body as any[]).find((x) => x.id === group.body.id).is_member).toBe(true);
    // Чужая группа, где меня нет, в списке не появляется.
    expect(((await as(c.acc).get(`/api/contacts/${c.bk.id}/groups`)).body as any[]).some((x) => x.id === group.body.id)).toBe(false);
  });
});

describe('колокольчик', () => {
  it('новая задача появляется в уведомлениях исполнителя', async () => {
    const t = await as(c.mgr1).post('/api/tasks', {
      title: 'Обзвонить клиентов',
      assignee_ids: [c.bk.id],
      executor_deadline: new Date(Date.now() + 86400_000).toISOString(),
    });
    expect(t.status).toBe(201);
    // Уведомление пишется в фоне — даём ему мгновение.
    let found: any;
    for (let i = 0; i < 20 && !found; i++) {
      const feed = (await as(c.bk).get('/api/notifications')).body as any[];
      found = feed.find((x) => x.kind === 'task' && x.data.task_id === t.body.id);
      if (!found) await new Promise((r) => setTimeout(r, 50));
    }
    expect(found.title).toBe('Новая задача');
    expect(found.body).toBe('Обзвонить клиентов');
    expect(found.actor_name).toBeTruthy();
    expect(found.read_at).toBeNull();
    // Автор задачи сам себе уведомление не получает.
    const own = (await as(c.mgr1).get('/api/notifications')).body as any[];
    expect(own.some((x) => x.kind === 'task' && x.data.task_id === t.body.id)).toBe(false);
  });
});

describe('название компании', () => {
  it('видно всем, менять может только директор', async () => {
    expect((await as(c.mgr1).patch('/api/company', { company_name: 'Взлом' })).status).toBe(403);
    expect((await as(c.dir).patch('/api/company', { company_name: '  ' })).status).toBe(400);
    const r = await as(c.dir).patch('/api/company', { company_name: 'ООО «Новое имя»' });
    expect(r.body.company_name).toBe('ООО «Новое имя»');
    expect((await as(c.mgr1).get('/api/auth/me')).body.company_name).toBe('ООО «Новое имя»');
  });
});

describe('имя и фамилия', () => {
  it('разбор полного имени: фамилия первой, ФИО, обычный порядок', async () => {
    const { splitFullName } = await import('../src/lib/names');
    expect(splitFullName('Тимуров Тимур')).toEqual({ first: 'Тимур', last: 'Тимуров' });
    expect(splitFullName('Тимур Тимуров')).toEqual({ first: 'Тимур', last: 'Тимуров' });
    expect(splitFullName('Иванова Анна')).toEqual({ first: 'Анна', last: 'Иванова' });
    expect(splitFullName('Тимуров Тимур Тимурович')).toEqual({ first: 'Тимур Тимурович', last: 'Тимуров' });
    expect(splitFullName('Тимур Тимурович Тимуров')).toEqual({ first: 'Тимур Тимурович', last: 'Тимуров' });
    // Короткие имена с «фамильным» окончанием не переставляем.
    expect(splitFullName('Лев Толстой')).toEqual({ first: 'Лев', last: 'Толстой' });
    expect(splitFullName('Константин Ким')).toEqual({ first: 'Константин', last: 'Ким' });
    expect(splitFullName('  Анна  ')).toEqual({ first: 'Анна', last: '' });
    expect(splitFullName('')).toEqual({ first: '', last: '' });
  });

  it('сотрудник с именем и фамилией: приветствие по имени, профиль меняет каждое поле', async () => {
    const created = await as(c.dir).post('/api/role-tree/users', {
      username: 'timur', email: 'timur@test.ru', password: 'timur-pass-1', role_node_id: c.nodes.mgrNode,
      first_name: 'Тимур', last_name: 'Тимуров',
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body).toMatchObject({ display_name: 'Тимур Тимуров', first_name: 'Тимур', last_name: 'Тимуров' });
    const timur = await login(app, 'timur', 'timur-pass-1');
    expect((await as(timur).get('/api/home')).body).toMatchObject({ name: 'Тимур Тимуров', first_name: 'Тимур' });
    const p = await as(timur).patch('/api/auth/profile', { last_name: 'Тимуровский' });
    expect(p.body).toMatchObject({ display_name: 'Тимур Тимуровский', first_name: 'Тимур', last_name: 'Тимуровский' });
    expect((await as(timur).patch('/api/auth/profile', { first_name: '  ' })).status).toBe(400);
    // Старое приложение присылает одно поле — фамилию первой тоже понимаем.
    const old = await as(timur).patch('/api/auth/profile', { display_name: 'Тимуров Тимур' });
    expect(old.body).toMatchObject({ display_name: 'Тимуров Тимур', first_name: 'Тимур', last_name: 'Тимуров' });
    expect((await as(timur).get('/api/home')).body.first_name).toBe('Тимур');
  });

  it('миграция разбирает уже сохранённые имена', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const u = await as(c.dir).post('/api/role-tree/users', {
      username: 'fio', email: 'fio@test.ru', password: 'fio-pass-12', role_node_id: c.nodes.mgrNode, display_name: 'x',
    });
    const cases: [string, string, string][] = [
      ['Тимуров Тимур Тимурович', 'Тимур Тимурович', 'Тимуров'],
      ['Тимуров Тимур', 'Тимур', 'Тимуров'],
      ['Анна Смирнова', 'Анна', 'Смирнова'],
      ['Мария', 'Мария', ''],
    ];
    const sql = fs.readFileSync(path.join(__dirname, '../src/db/migrations/0021_user_names.sql'), 'utf8');
    for (const [full, first, last] of cases) {
      await pool.query('UPDATE users SET display_name = $1, first_name = NULL, last_name = NULL WHERE id = $2', [full, u.body.id]);
      await pool.query(sql);
      const row = (await pool.query('SELECT display_name, first_name, last_name FROM users WHERE id = $1', [u.body.id])).rows[0];
      expect(row).toEqual({ display_name: full, first_name: first, last_name: last });
    }
  });
});

describe('безопасность сессий', () => {
  it('смена пароля завершает другие сессии и выдаёт новый токен', async () => {
    const u = await as(c.dir).post('/api/role-tree/users', {
      username: 'sess', email: 'sess@test.ru', password: 'first-pass-1', role_node_id: c.nodes.mgrNode,
    });
    expect(u.status).toBe(201);
    const phone = await login(app, 'sess', 'first-pass-1');
    const laptop = await login(app, 'sess', 'first-pass-1');
    expect((await as(phone).post('/api/auth/change-password', { current_password: 'first-pass-1', new_password: 'short' })).status).toBe(400);
    const r = await as(phone).post('/api/auth/change-password', { current_password: 'first-pass-1', new_password: 'second-pass-2' });
    expect(r.status).toBe(200);
    expect((await as(laptop).get('/api/auth/me')).status).toBe(401);
    expect((await as({ ...phone, token: r.body.token }).get('/api/auth/me')).status).toBe(200);
  });

  it('«выйти на всех устройствах» отзывает токены, сброс пароля админом тоже', async () => {
    const a = await login(app, 'sess', 'second-pass-2');
    expect((await as(a).post('/api/auth/logout-all')).status).toBe(200);
    expect((await as(a).get('/api/auth/me')).status).toBe(401);
    const b = await login(app, 'sess', 'second-pass-2');
    const reset = await as(c.dir).post(`/api/users/${b.id}/reset-password`);
    expect(reset.status).toBe(200);
    expect((await as(b).get('/api/auth/me')).status).toBe(401);
  });

  it('распространённые пароли не принимаются', async () => {
    const r = await as(c.dir).post('/api/role-tree/users', {
      username: 'weak', email: 'weak@test.ru', password: '12345678', role_node_id: c.nodes.mgrNode,
    });
    expect(r.status).toBe(400);
  });

  it('события безопасности пишутся в журнал', async () => {
    const { rows } = await pool.query("SELECT action FROM audit_log WHERE action IN ('login', 'login_failed', 'password_reset')");
    const actions = new Set(rows.map((r) => r.action));
    expect(actions.has('login')).toBe(true);
    expect(actions.has('login_failed')).toBe(true);
    expect(actions.has('password_reset')).toBe(true);
  });
});

describe('мессенджер как в Telegram', () => {
  it('участник группы не может исключать и включать темы, админ — может', async () => {
    const g = await as(c.mgr1).post('/api/chats', { type: 'group', name: 'Права', user_ids: [c.mgr2.id, c.bk.id] });
    const gid = g.body.id;
    expect((await as(c.mgr2).delete(`/api/chats/${gid}/members/${c.bk.id}`)).status).toBe(403);
    // Обычная группа, как в Telegram: название и фото меняет любой участник, темы — нет.
    expect((await as(c.mgr2).patch(`/api/chats/${gid}`, { name: 'Права и обязанности' })).status).toBe(200);
    expect((await as(c.mgr2).patch(`/api/chats/${gid}`, { is_supergroup: true })).status).toBe(403);
    expect((await as(c.mgr2).post(`/api/chats/${gid}/members`, { user_ids: [c.acc.id] })).status).toBe(200);
    const info = await as(c.mgr2).get(`/api/chats/${gid}`);
    expect(info.body.my_rights).toMatchObject({ can_add_users: true, can_ban_users: false, can_change_info: true, can_manage_topics: false });
    expect((await as(c.mgr1).get(`/api/chats/${gid}`)).body.my_rights).toMatchObject({ can_change_info: true, can_manage_topics: true });
    // В группе с темами название, фото и темы — только у владельца и админов.
    const forum = await as(c.mgr1).post('/api/chats', { type: 'group', name: 'Форум прав', user_ids: [c.mgr2.id], is_supergroup: true });
    expect((await as(c.mgr2).patch(`/api/chats/${forum.body.id}`, { name: 'Хаос' })).status).toBe(403);
    expect((await as(c.mgr2).get(`/api/chats/${forum.body.id}`)).body.my_rights).toMatchObject({ can_change_info: false });
    expect((await as(c.mgr1).post(`/api/chats/${gid}/admins`, { user_id: c.mgr2.id })).status).toBeLessThan(300);
    expect((await as(c.mgr2).delete(`/api/chats/${gid}/members/${c.bk.id}`)).status).toBe(200);
    const texts = ((await as(c.mgr1).get(`/api/messages/${gid}`)).body as any[])
      .filter((m) => m.content_type === 'service')
      .map((m) => m.text);
    expect(texts.some((t) => t.includes('создаёт группу'))).toBe(true);
    expect(texts.some((t) => t.includes('исключает'))).toBe(true);
  });

  it('непрочитанные и отметка «прочитано»', async () => {
    const chat = await as(c.mgr1).post('/api/chats', { type: 'private', user_ids: [c.acc.id] });
    const id = chat.body.id;
    const m1 = await as(c.mgr1).upload('/api/upload', 'file', Buffer.from('x'), 'a.txt').field('chatId', String(id));
    expect(m1.status).toBe(201);
    let list = (await as(c.acc).get('/api/chats')).body as any[];
    expect(list.find((x) => x.id === id).unread_count).toBe(1);
    expect((await as(c.mgr1).get(`/api/chats/${id}`)).body.peer_last_read_id).toBeLessThan(m1.body.id);
    await as(c.acc).post(`/api/chats/${id}/read`, { message_id: m1.body.id });
    list = (await as(c.acc).get('/api/chats')).body as any[];
    expect(list.find((x) => x.id === id).unread_count).toBe(0);
    expect((await as(c.mgr1).get(`/api/chats/${id}`)).body.peer_last_read_id).toBe(m1.body.id);
  });

  it('темы супергруппы: список с последним сообщением, права на изменение', async () => {
    const g = await as(c.mgr1).post('/api/chats', { type: 'group', name: 'Форум', user_ids: [c.mgr2.id], is_supergroup: true });
    expect(g.status).toBe(201);
    const gid = g.body.id;
    const topic = await as(c.mgr1).post(`/api/chats/${gid}/topics`, { title: 'Отчёты', icon: 'chart', icon_color: '#3B82F6' });
    expect(topic.status).toBe(201);
    const sent = await as(c.mgr2).post(`/api/chats/${gid}/messages`, { text: 'Отчёт https://example.com', topic_id: topic.body.id });
    expect(sent.status).toBe(201);
    // Раньше список тем всегда отвечал 500 (один параметр SQL использовался как число и как текст).
    const list = await as(c.mgr2).get(`/api/chats/${gid}/topics`);
    expect(list.status, JSON.stringify(list.body)).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].last_message).toMatchObject({ id: sent.body.id, text: 'Отчёт https://example.com' });
    const stats = await as(c.mgr2).get(`/api/chats/${gid}/topics/${topic.body.id}/stats`);
    expect(stats.body.links).toBe(1);
    const own = await as(c.mgr2).get(`/api/chats/${gid}/messages`).query({ type: 'links', topic_id: topic.body.id });
    expect(own.status).toBe(200);
    expect(own.body.map((m: any) => m.id)).toEqual([sent.body.id]);
    // Тему меняют автор и админы, обычный участник — нет.
    expect((await as(c.mgr2).patch(`/api/topics/${topic.body.id}`, { title: 'Чужое' })).status).toBe(403);
    expect((await as(c.mgr1).patch(`/api/topics/${topic.body.id}`, { title: 'Отчёты за месяц' })).status).toBe(200);
    expect((await as(c.mgr2).delete(`/api/topics/${topic.body.id}`)).status).toBe(403);
    expect((await as(c.mgr1).delete(`/api/topics/${topic.body.id}`)).status).toBe(200);
    expect((await as(c.mgr2).get(`/api/chats/${gid}/topics`)).body).toHaveLength(0);
  });

  it('удаление личного чата скрывает его только у себя, новое сообщение возвращает', async () => {
    const chat = await as(c.mgr2).post('/api/chats', { type: 'private', user_ids: [c.acc.id] });
    const id = chat.body.id;
    expect((await as(c.mgr2).delete(`/api/chats/${id}`)).body.action).toBe('hidden');
    expect(((await as(c.mgr2).get('/api/chats')).body as any[]).some((x) => x.id === id)).toBe(false);
    expect(((await as(c.acc).get('/api/chats')).body as any[]).some((x) => x.id === id)).toBe(true);
    await as(c.acc).upload('/api/upload', 'file', Buffer.from('y'), 'b.txt').field('chatId', String(id));
    expect(((await as(c.mgr2).get('/api/chats')).body as any[]).some((x) => x.id === id)).toBe(true);
  });

  it('владелец уходит — права переходят администратору', async () => {
    const g = await as(c.acc).post('/api/chats', { type: 'group', name: 'Наследство', user_ids: [c.bk.id, c.mgr1.id] });
    await as(c.acc).post(`/api/chats/${g.body.id}/admins`, { user_id: c.mgr1.id });
    expect((await as(c.acc).delete(`/api/chats/${g.body.id}?leave=true`)).body.action).toBe('left');
    const info = await as(c.mgr1).get(`/api/chats/${g.body.id}`);
    expect(info.body.created_by).toBe(c.mgr1.id);
    expect(info.body.my_rights.is_creator).toBe(true);
  });

  it('фото: размеры, превью и альбом', async () => {
    const sharp = (await import('sharp')).default;
    const png = await sharp({ create: { width: 800, height: 400, channels: 3, background: '#1F7A52' } }).png().toBuffer();
    const chat = await as(c.mgr1).post('/api/chats', { type: 'group', name: 'Фото', user_ids: [c.mgr2.id] });
    const send = () =>
      as(c.mgr1).upload('/api/upload', 'file', png, 'p.png').field('chatId', String(chat.body.id)).field('media_group_id', 'album-1');
    const [a, b] = [await send(), await send()];
    expect(a.body).toMatchObject({ media_kind: 'photo', media_width: 800, media_height: 400, media_group_id: 'album-1' });
    expect(b.body.thumb_url).toMatch(/^\/uploads\/thumbs\//);
    const asFile = await as(c.mgr1)
      .upload('/api/upload', 'file', png, 'p.png')
      .field('chatId', String(chat.body.id))
      .field('as_file', 'true');
    expect(asFile.body).toMatchObject({ media_kind: 'file', thumb_url: null, media_group_id: null });
  });

  it('файлы, отправленные вместе, группируются; подпись сохраняется', async () => {
    const chat = await as(c.mgr1).post('/api/chats', { type: 'group', name: 'Документы', user_ids: [c.mgr2.id] });
    const up = (name: string, caption?: string) => {
      const r = as(c.mgr1).upload('/api/upload', 'file', Buffer.from(name), name).field('chatId', String(chat.body.id)).field('media_group_id', 'docs-1');
      return caption ? r.field('caption', caption) : r;
    };
    const a = await up('a.pdf');
    const b = await up('b.pdf', 'Договор и приложение');
    expect(a.body).toMatchObject({ media_kind: 'file', media_group_id: 'docs-1' });
    expect(b.body).toMatchObject({ media_group_id: 'docs-1', text: 'Договор и приложение' });
  });

  it('голосовое: длительность, волна, прослушивание', async () => {
    const chat = await as(c.mgr1).post('/api/chats', { type: 'group', name: 'Голосовые', user_ids: [c.mgr2.id] });
    const voice = await as(c.mgr1)
      .upload('/api/upload', 'file', Buffer.from('fake-aac'), 'voice.m4a')
      .field('chatId', String(chat.body.id))
      .field('kind', 'voice')
      .field('duration', '4.2')
      .field('waveform', '0,5,31,12,7');
    expect(voice.status).toBe(201);
    expect(voice.body).toMatchObject({ media_kind: 'voice', content_type: 'voice', media_waveform: '0,5,31,12,7', listened_by: [] });
    expect(Number(voice.body.media_duration)).toBeCloseTo(4.2);

    const bad = await as(c.mgr1)
      .upload('/api/upload', 'file', Buffer.from('x'), 'v.m4a')
      .field('chatId', String(chat.body.id))
      .field('kind', 'voice')
      .field('waveform', '99,1');
    expect(bad.status).toBe(400);

    // Отправитель своё не «прослушивает»; получатель — да, один раз.
    await as(c.mgr1).post(`/api/messages/${voice.body.id}/listened`);
    expect((await as(c.mgr2).post(`/api/messages/${voice.body.id}/listened`)).status).toBe(200);
    await as(c.mgr2).post(`/api/messages/${voice.body.id}/listened`);
    const hist = await as(c.mgr1).get(`/api/messages/${chat.body.id}`);
    expect(hist.body.find((m: any) => m.id === voice.body.id).listened_by).toEqual([c.mgr2.id]);

    const note = await as(c.mgr1)
      .upload('/api/upload', 'file', Buffer.from('fake-mp4'), 'circle.mp4')
      .field('chatId', String(chat.body.id))
      .field('kind', 'video_note')
      .field('duration', '7');
    expect(note.body).toMatchObject({ media_kind: 'video_note', content_type: 'video_note' });

    // Обычное текстовое «прослушать» нельзя.
    const text = await as(c.mgr1).post(`/api/chats/${chat.body.id}/messages`, { text: 'привет' });
    expect((await as(c.mgr2).post(`/api/messages/${text.body.id}/listened`)).status).toBe(400);
  });

  it('реакции: одна от человека, повтор снимает, другая заменяет', async () => {
    const chat = await as(c.mgr1).post('/api/chats', { type: 'group', name: 'Реакции', user_ids: [c.mgr2.id] });
    const msg = await as(c.mgr1).post(`/api/chats/${chat.body.id}/messages`, { text: 'Сдали отчёт' });
    const r1 = await as(c.mgr2).post(`/api/messages/${msg.body.id}/reactions`, { emoji: '👍' });
    expect(r1.body.reactions).toEqual([{ emoji: '👍', count: 1, user_ids: [c.mgr2.id] }]);
    await as(c.mgr1).post(`/api/messages/${msg.body.id}/reactions`, { emoji: '👍' });
    const r2 = await as(c.mgr2).post(`/api/messages/${msg.body.id}/reactions`, { emoji: '🔥' });
    expect(r2.body.reactions).toEqual([
      { emoji: '👍', count: 1, user_ids: [c.mgr1.id] },
      { emoji: '🔥', count: 1, user_ids: [c.mgr2.id] },
    ]);
    const r3 = await as(c.mgr2).post(`/api/messages/${msg.body.id}/reactions`, { emoji: '🔥' });
    expect(r3.body.reactions).toEqual([{ emoji: '👍', count: 1, user_ids: [c.mgr1.id] }]);
    expect((await as(c.mgr2).post(`/api/messages/${msg.body.id}/reactions`, { emoji: '🤡' })).status).toBe(400);
    expect((await as(c.acc).post(`/api/messages/${msg.body.id}/reactions`, { emoji: '👍' })).status).toBe(403);
    const hist = await as(c.mgr2).get(`/api/messages/${chat.body.id}`);
    expect(hist.body.find((m: any) => m.id === msg.body.id).reactions).toHaveLength(1);
  });

  it('поиск по сообщениям чата', async () => {
    const chat = await as(c.mgr1).post('/api/chats', { type: 'group', name: 'Поиск', user_ids: [c.mgr2.id] });
    const send = (text: string) => as(c.mgr1).post(`/api/chats/${chat.body.id}/messages`, { text });
    await send('Договор с поставщиком');
    await send('Скидка 50% до пятницы');
    const last = await send('договор подписан');
    const r = await as(c.mgr2).get(`/api/messages/${chat.body.id}/search?q=ДОГОВОР`);
    expect(r.status).toBe(200);
    expect(r.body.map((m: any) => m.text)).toEqual(['договор подписан', 'Договор с поставщиком']);
    expect(r.body[0].id).toBe(last.body.id);
    // % и _ — обычные символы, а не шаблон.
    const pct = await as(c.mgr2).get(`/api/messages/${chat.body.id}/search?q=${encodeURIComponent('50%')}`);
    expect(pct.body).toHaveLength(1);
    expect((await as(c.mgr2).get(`/api/messages/${chat.body.id}/search?q=_`)).body).toHaveLength(0);
    expect((await as(c.acc).get(`/api/messages/${chat.body.id}/search?q=договор`)).status).toBe(403);
  });

  it('поиск как в Telegram: части слов в любом порядке, ё, раскладка, файлы и заметки, все чаты', async () => {
    const chat = await as(c.mgr1).post('/api/chats', { type: 'group', name: 'Поиск 2', user_ids: [c.mgr2.id] });
    const id = chat.body.id;
    const send = (text: string) => as(c.mgr1).post(`/api/chats/${id}/messages`, { text });
    const report = await send('Квартальный отчёт по продажам готов');
    await send('Отчет по закупкам отложили');
    await send('Привет всем');
    await as(c.mgr1).upload('/api/upload', 'file', Buffer.from('x'), 'Прайс-лист.xlsx').field('chatId', String(id)).field('as_file', 'true');
    const note = await as(c.mgr1).post('/api/notes', { title: 'Регламент отгрузки', content: '' });
    await as(c.mgr1).post(`/api/notes/${note.body.id}/share`, { chat_id: id });

    const find = async (q: string) =>
      ((await as(c.mgr2).get(`/api/messages/${id}/search?q=${encodeURIComponent(q)}`)).body as any[]).map((m) => m.text || m.file_name || m.note_share?.title);
    // Часть слова и ё = е — оба «отчёта».
    expect(await find('отчет')).toHaveLength(2);
    expect(await find('ОТЧЁ')).toHaveLength(2);
    // Слова в любом порядке, части слов.
    expect(await find('прод квартал')).toEqual(['Квартальный отчёт по продажам готов']);
    expect(await find('отчет закуп')).toEqual(['Отчет по закупкам отложили']);
    // Не та раскладка: «ghbdtn» → «привет».
    expect(await find('ghbdtn')).toEqual(['Привет всем']);
    // Имя файла и название заметки тоже ищутся.
    expect(await find('прайс')).toEqual(['Прайс-лист.xlsx']);
    expect(await find('регламент')).toEqual(['Регламент отгрузки']);

    // Поиск по всем чатам: с названием чата, без чужих чатов.
    const all = await as(c.mgr2).get(`/api/search/messages?q=${encodeURIComponent('квартал отч')}`);
    expect(all.status).toBe(200);
    const hit = (all.body as any[]).find((m) => m.id === report.body.id);
    expect(hit.chat_name).toBe('Поиск 2');
    expect(hit.chat_type).toBe('group');
    expect(((await as(c.acc).get(`/api/search/messages?q=${encodeURIComponent('квартал отч')}`)).body as any[]).some((m) => m.id === report.body.id)).toBe(false);
    // Постранично.
    const page = await as(c.mgr2).get(`/api/search/messages?q=${encodeURIComponent('отч')}&limit=1`);
    expect(page.body).toHaveLength(1);
    const next = await as(c.mgr2).get(`/api/search/messages?q=${encodeURIComponent('отч')}&limit=1&before=${page.body[0].id}`);
    expect(next.body[0].id).toBeLessThan(page.body[0].id);
  });

  it('голосовое и кружочек из браузера (WebM) пересохраняются в m4a и mp4', async () => {
    const { execFileSync } = await import('child_process');
    const { mkdtempSync, readFileSync } = await import('fs');
    const { tmpdir } = await import('os');
    const { join } = await import('path');
    try {
      execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    } catch {
      return; // без ffmpeg сервер оставляет файл как есть — проверять нечего
    }
    const dir = mkdtempSync(join(tmpdir(), 'offix-media-'));
    const voicePath = join(dir, 'voice.webm');
    const notePath = join(dir, 'note.webm');
    execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1.5', '-c:a', 'libopus', voicePath], { stdio: 'ignore' });
    execFileSync(
      'ffmpeg',
      ['-y', '-f', 'lavfi', '-i', 'testsrc=size=640x480:rate=15:duration=2', '-f', 'lavfi', '-i', 'sine=duration=2', '-c:v', 'libvpx', '-c:a', 'libopus', '-shortest', notePath],
      { stdio: 'ignore' },
    );
    const chat = await as(c.mgr1).post('/api/chats', { type: 'group', name: 'Голос с сайта', user_ids: [c.mgr2.id] });
    const voice = await as(c.mgr1)
      .upload('/api/upload', 'file', readFileSync(voicePath), 'voice.webm')
      .field('chatId', String(chat.body.id))
      .field('kind', 'voice')
      .field('duration', '1.5');
    expect(voice.status).toBe(201);
    expect(voice.body).toMatchObject({ media_kind: 'voice', mime_type: 'audio/mp4', file_name: 'voice.m4a' });
    expect(voice.body.file_url).toMatch(/\.m4a$/);
    expect(Number(voice.body.media_duration)).toBeGreaterThan(1);

    const note = await as(c.mgr1)
      .upload('/api/upload', 'file', readFileSync(notePath), 'note.webm')
      .field('chatId', String(chat.body.id))
      .field('kind', 'video_note')
      .field('duration', '2');
    expect(note.status).toBe(201);
    expect(note.body).toMatchObject({ media_kind: 'video_note', mime_type: 'video/mp4', media_width: 480, media_height: 480 });
    expect(note.body.file_url).toMatch(/\.mp4$/);
    expect(note.body.thumb_url).toMatch(/^\/uploads\/thumbs\//);
  }, 60_000);

  it('здоровье сервера показывает версию и последнюю миграцию', async () => {
    const r = await client(app).get('/api/health');
    expect(r.status).toBe(200);
    expect(r.body.migration).toMatch(/^\d{4}_/);
    expect(r.body).toHaveProperty('version');
    expect(r.body.media).toHaveProperty('ffmpeg');
  });

  it('удаление выделенных сообщений одним запросом', async () => {
    const chat = await as(c.mgr1).post('/api/chats', { type: 'group', name: 'Выделение', user_ids: [c.mgr2.id] });
    const send = (who: Actor, text: string) => as(who).post(`/api/chats/${chat.body.id}/messages`, { text });
    const a = await send(c.mgr1, 'раз');
    const b = await send(c.mgr1, 'два');
    const foreign = await send(c.mgr2, 'чужое');
    // Участник без прав не удалит у всех чужое — и ничего не удаляется (своё тоже).
    const denied = await as(c.mgr2).post('/api/messages/bulk-delete', { ids: [foreign.body.id, a.body.id], scope: 'all' });
    expect(denied.status).toBe(403);
    const texts = async (who: Actor) =>
      (await as(who).get(`/api/messages/${chat.body.id}`)).body.filter((m: any) => m.content_type !== 'service' && !m.deleted_for_all);
    expect(await texts(c.mgr2)).toHaveLength(3);
    const ok = await as(c.mgr1).post('/api/messages/bulk-delete', { ids: [a.body.id, b.body.id], scope: 'all' });
    expect(ok.body).toMatchObject({ success: true, deleted: 2 });
    const mine = await as(c.mgr1).post('/api/messages/bulk-delete', { ids: [foreign.body.id], scope: 'me' });
    expect(mine.status).toBe(200);
    expect(await texts(c.mgr1)).toHaveLength(0);
    expect(await texts(c.mgr2)).toHaveLength(1);
  });

  it('опрос с фото: медиа хранится в сообщении опроса', async () => {
    const sharp = (await import('sharp')).default;
    const png = await sharp({ create: { width: 300, height: 200, channels: 3, background: '#2563EB' } }).png().toBuffer();
    const chat = await as(c.mgr1).post('/api/chats', { type: 'group', name: 'Опрос с фото', user_ids: [c.mgr2.id] });
    const payload = JSON.stringify({ chat_id: chat.body.id, question: 'Какой макет?', options: ['Первый', 'Второй'] });
    const r = await as(c.mgr1).upload('/api/polls/with-media', 'file', png, 'mock.png').field('payload', payload);
    expect(r.status).toBe(201);
    expect(r.body.message).toMatchObject({ content_type: 'poll', media_kind: 'photo', media_width: 300 });
    expect(r.body.message.thumb_url).toMatch(/^\/uploads\/thumbs\//);
    const bad = await as(c.mgr1).upload('/api/polls/with-media', 'file', png, 'mock.png').field('payload', '{"chat_id":1}');
    expect(bad.status).toBe(400);
  });

  it('push: регистрация устройства, без звука для чата, отправка по HTTP', async () => {
    const token = 'fcm-token-' + 'x'.repeat(40);
    expect((await as(c.mgr1).post('/api/push/token', { token })).status).toBe(200);
    // Тот же телефон — другой вход: токен переходит к новому пользователю.
    expect((await as(c.mgr2).post('/api/push/token', { token })).status).toBe(200);
    const owner = await pool.query('SELECT user_id FROM push_tokens WHERE token = $1', [token]);
    expect(owner.rows[0].user_id).toBe(c.mgr2.id);
    expect((await as(c.mgr2).delete('/api/push/token').send({ token })).status).toBe(200);
    expect((await as(c.mgr1).get('/api/push/status')).body).toEqual({ enabled: false });

    const chat = await as(c.mgr1).post('/api/chats', { type: 'group', name: 'Тихий', user_ids: [c.mgr2.id] });
    const until = new Date(Date.now() + 3600_000).toISOString();
    expect((await as(c.mgr2).patch(`/api/chats/${chat.body.id}/membership`, { muted_until: until })).status).toBe(200);
    const list = (await as(c.mgr2).get('/api/chats')).body as any[];
    expect(list.find((x) => x.id === chat.body.id).muted_until).toBeTruthy();
    await as(c.mgr2).patch(`/api/chats/${chat.body.id}/membership`, { muted_until: null });
    expect((await as(c.mgr2).get(`/api/chats/${chat.body.id}`)).body.muted_until).toBeNull();

    const sent = await as(c.mgr2).post(`/api/chats/${chat.body.id}/messages`, { text: 'Ответ из уведомления', client_id: 'n-1' });
    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({ text: 'Ответ из уведомления', sender_id: c.mgr2.id });
    expect((await as(c.acc).post(`/api/chats/${chat.body.id}/messages`, { text: 'чужой' })).status).toBe(403);
  });

  it('викторина с пояснением, остановка опроса', async () => {
    const chat = await as(c.mgr1).post('/api/chats', { type: 'group', name: 'Квиз', user_ids: [c.mgr2.id] });
    const p = await as(c.mgr1).post('/api/polls', {
      chat_id: chat.body.id, question: '2+2?', options: ['3', '4'], is_quiz: true, correct_option_index: 1, explanation: 'Арифметика',
    });
    expect(p.status).toBe(201);
    expect(p.body.poll.explanation).toBe('Арифметика'); // автор видит
    const before = await as(c.mgr2).get(`/api/polls/${p.body.poll.id}`);
    expect(before.body.poll.explanation).toBeNull();
    const voted = await as(c.mgr2).post(`/api/polls/${p.body.poll.id}/vote`, { option_ids: [before.body.poll.options[0].id] });
    expect(voted.body.poll.explanation).toBe('Арифметика');
    const closed = await as(c.mgr1).post(`/api/polls/${p.body.poll.id}/close`);
    expect(closed.body.poll.is_closed).toBe(true);
  });

  it('статус в сети', async () => {
    const r = await as(c.mgr1).get(`/api/users/presence?ids=${c.mgr2.id},${c.acc.id}`);
    expect(r.body).toHaveLength(2);
    expect(r.body[0]).toHaveProperty('online');
  });
});

describe('список чатов', () => {
  it('закреплённые чаты идут первыми, превью знает тип вложения', async () => {
    const a = await as(c.bk).post('/api/chats', { type: 'group', name: 'Первый', user_ids: [c.acc.id] });
    const b = await as(c.bk).post('/api/chats', { type: 'group', name: 'Второй', user_ids: [c.acc.id] });
    await as(c.bk).upload('/api/upload', 'file', Buffer.from('x'), 'doc.txt').field('chatId', String(b.body.id));
    expect((await as(c.bk).patch(`/api/chats/${a.body.id}/membership`, { pinned: true })).status).toBe(200);
    const list = (await as(c.bk).get('/api/chats')).body as any[];
    expect(list[0].id).toBe(a.body.id);
    const second = list.find((x) => x.id === b.body.id);
    expect(second.last_message.media_kind).toBe('file');
    // У собеседника порядок свой.
    const other = (await as(c.acc).get('/api/chats')).body as any[];
    expect(other.find((x) => x.id === a.body.id).pinned_at).toBeNull();
  });
});

describe('жизненный цикл задачи', () => {
  it('сервер отдаёт доступные действия, полный цикл с возвратом на доработку', async () => {
    const t = (await as(c.mgr1).post('/api/tasks', { title: 'Цикл', assignee_ids: [c.mgr2.id] })).body;
    const actions = async (who: any) => ((await as(who).get(`/api/tasks/${t.id}`)).body.available_transitions as any[]).map((a) => a.to);
    expect(await actions(c.mgr2)).toEqual(expect.arrayContaining(['in_progress', 'on_review']));
    expect(await actions(c.mgr1)).toEqual([]);
    await as(c.mgr2).post(`/api/tasks/${t.id}/transition`, { to_status: 'in_progress' });
    await as(c.mgr2).post(`/api/tasks/${t.id}/transition`, { to_status: 'on_review' });
    expect(await actions(c.mgr2)).toEqual(['in_progress']); // отозвать с проверки
    expect(await actions(c.mgr1)).toEqual(expect.arrayContaining(['done', 'rejected']));
    expect((await as(c.mgr1).post(`/api/tasks/${t.id}/transition`, { to_status: 'done' })).status).toBe(200);
    // Вернуть принятую задачу можно только с комментарием.
    expect((await as(c.mgr1).post(`/api/tasks/${t.id}/transition`, { to_status: 'in_progress' })).status).toBe(400);
    const back = await as(c.mgr1).post(`/api/tasks/${t.id}/transition`, { to_status: 'in_progress', comment: 'Добавь итоги' });
    expect(back.body.status_new).toBe('in_progress');
  });

  it('задачу самому себе можно завершить без проверки, чужую — нет', async () => {
    const own = (await as(c.mgr1).post('/api/tasks', { title: 'Себе', assignee_ids: [c.mgr1.id] })).body;
    const acts = (await as(c.mgr1).get(`/api/tasks/${own.id}`)).body.available_transitions.map((a: any) => a.to);
    expect(acts).toContain('done');
    expect(acts).not.toContain('on_review');
    expect((await as(c.mgr1).post(`/api/tasks/${own.id}/transition`, { to_status: 'done' })).body.status_new).toBe('done');
    const other = (await as(c.mgr1).post('/api/tasks', { title: 'Чужая', assignee_ids: [c.mgr2.id] })).body;
    expect((await as(c.mgr2).post(`/api/tasks/${other.id}/transition`, { to_status: 'done' })).status).toBe(403);
  });
});

describe('задачи: архив и фильтры', () => {
  it('выполненная задача через 3 дня уходит в архив сама, в истории — «Автоматически»', async () => {
    const t = (await as(c.mgr1).post('/api/tasks', { title: 'Старая выполненная', assignee_ids: [c.mgr1.id] })).body;
    expect((await as(c.mgr1).post(`/api/tasks/${t.id}/transition`, { to_status: 'done' })).status).toBe(200);
    const fresh = (await as(c.mgr1).post('/api/tasks', { title: 'Свежая выполненная', assignee_ids: [c.mgr1.id] })).body;
    await as(c.mgr1).post(`/api/tasks/${fresh.id}/transition`, { to_status: 'done' });
    // Выполнена 4 дня назад.
    await pool.query(`UPDATE task_status_history SET created_at = NOW() - INTERVAL '4 days' WHERE task_id = $1 AND to_status = 'done'`, [t.id]);

    const { archiveDoneTasks } = await import('../src/services/taskArchive');
    expect(await archiveDoneTasks()).toEqual([t.id]);
    expect(await archiveDoneTasks()).toEqual([]);
    const task = (await as(c.mgr1).get(`/api/tasks/${t.id}`)).body;
    expect(task).toMatchObject({ status_new: 'archived', archived_as: 'done' });
    expect((await as(c.mgr1).get(`/api/tasks/${fresh.id}`)).body.status_new).toBe('done');
    const history = (await as(c.mgr1).get(`/api/tasks/${t.id}/history`)).body;
    expect(history.at(-1)).toMatchObject({ from_status: 'done', to_status: 'archived', changed_by: null, changed_by_name: 'Автоматически' });
    // Из архива задачу можно вернуть.
    expect((await as(c.mgr1).post(`/api/tasks/${t.id}/unarchive`)).status).toBe(200);
  });

  it('«Команда» — все задачи подчинённых, и те, где руководитель тоже участник или наблюдатель', async () => {
    const watched = (await as(c.mgr1).post('/api/tasks', { title: 'Под наблюдением руководителя', assignee_ids: [c.mgr2.id], watcher_ids: [c.sales.id] })).body;
    const mine = (await as(c.sales).post('/api/tasks', { title: 'От руководителя', assignee_ids: [c.mgr1.id] })).body;
    const team = (await as(c.sales).get('/api/tasks?filter=team')).body.map((x: any) => x.id);
    expect(team).toEqual(expect.arrayContaining([watched.id, mine.id]));
    const watching = (await as(c.sales).get('/api/tasks?filter=watching')).body.map((x: any) => x.id);
    expect(watching).toContain(watched.id);
    // Создатель по умолчанию — наблюдатель: такие задачи тоже в «Наблюдаю».
    expect(watching).toContain(mine.id);
  });
});

describe('стартовая страница', () => {
  it('приветствие, напутствие без повтора, квадратики, KPI и задачи на сегодня', async () => {
    const today = await as(c.sales).post('/api/tasks', {
      title: 'Позвонить клиенту',
      assignee_ids: [c.mgr2.id],
      executor_deadline: new Date(Date.now() + 3600_000).toISOString(),
    });
    expect(today.status).toBe(201);
    const later = await as(c.sales).post('/api/tasks', {
      title: 'Через неделю',
      assignee_ids: [c.mgr2.id],
      executor_deadline: new Date(Date.now() + 7 * 86400_000).toISOString(),
    });
    // Часовой пояс, в котором сейчас около полудня: задача «через час» — сегодня
    // в любое время запуска теста (с фиксированным UTC+7 тест падал вечером по UTC).
    const now = new Date();
    const tzOffset = (now.getUTCHours() - 12) * 60 + now.getUTCMinutes();
    const r = await as(c.mgr2).get(`/api/home?tz_offset=${tzOffset}&prev=3`);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.greeting).toMatch(/^(Доброе утро|Добрый день|Добрый вечер|Доброй ночи)$/);
    expect(r.body.name).toBe('MGR2');
    expect(r.body.phrase.text).toBeTruthy();
    expect(r.body.phrase.id).not.toBe(3);
    expect(r.body.stats).toBeNull();
    expect(r.body.kpi).toMatchObject({ count: 0, focus: [] });
    const ids = r.body.tasks.map((t: any) => t.id);
    expect(ids).toContain(today.body.id);
    expect(ids).not.toContain(later.body.id);
    expect((await as().get('/api/home')).status).toBe(401);
    expect((await as(c.mgr2).get('/api/home?tz_offset=abc')).status).toBe(400);
  });

  it('напутствие каждый раз другое', async () => {
    const { pickPhrase, PHRASES } = await import('../src/routes/home');
    expect(PHRASES.length).toBeGreaterThan(20);
    for (let prev = 0; prev < PHRASES.length; prev++) expect(pickPhrase(prev, () => prev / PHRASES.length)).not.toBe(prev);
  });
});

describe('дымовой тест: экраны не падают с ошибкой сервера', () => {
  const GETS = [
    '/api/auth/me',
    '/api/users',
    '/api/users/assignable',
    '/api/chats',
    '/api/tasks',
    '/api/tasks?filter=team',
    '/api/tasks?overdue=true',
    '/api/notes',
    '/api/notes/favorites',
    `/api/notes/days?month=${new Date().toISOString().slice(0, 7)}`,
    '/api/role-tree',
    '/api/role-tree/subtree-users',
    '/api/kpi/sales/targets',
    '/api/kpi/sales/targets/my-monthly',
    '/api/kpi/sales/targets/subordinates',
    '/api/kpi/sales/transactions',
    '/api/kpi/sales/summary',
    '/api/kpi/sales/subordinates',
    '/api/kpi/sales/import/history',
    '/api/knowledge/documents',
    '/api/knowledge/sessions',
  ];
  it.each(GETS)('GET %s', async (url) => {
    for (const who of [c.dir, c.mgr1]) {
      const r = await as(who).get(url);
      expect(r.status, `${url} → ${JSON.stringify(r.body).slice(0, 200)}`).toBeLessThan(500);
    }
  });

  it('KPI: план от руководителя сотрудник не может уменьшить или удалить', async () => {
    const assign = await as(c.sales).post('/api/kpi/sales/targets/personal-monthly', { user_id: c.mgr1.id, target_value: 100000 });
    expect(assign.status, JSON.stringify(assign.body)).toBeLessThan(300);
    const mine = await as(c.mgr1).get('/api/kpi/sales/targets/my-monthly');
    expect(mine.status).toBe(200);
    const id = (mine.body?.id ?? mine.body?.target?.id) as number;
    expect(id).toBeTruthy();
    expect((await as(c.mgr1).patch(`/api/kpi/sales/targets/${id}`, { target_value: 1 })).status).toBe(403);
    expect((await as(c.mgr1).delete(`/api/kpi/sales/targets/${id}`)).status).toBe(403);
    expect((await as(c.sales).patch(`/api/kpi/sales/targets/${id}`, { target_value: 120000 })).status).toBe(200);
  });

  it('KPI: цель ставит руководитель, продажи только положительные, понятные ошибки', async () => {
    // Сотрудник сам себе KPI не создаёт.
    expect((await as(c.mgr1).post('/api/kpi/sales/targets', { product_name: 'Ноутбук', target_value: 10 })).status).toBe(403);
    const t = await as(c.sales).post('/api/kpi/sales/targets/assign', { user_id: c.mgr1.id, product_name: 'Ноутбук', target_value: 10 });
    expect(t.status, JSON.stringify(t.body)).toBe(201);
    expect((await as(c.sales).post('/api/kpi/sales/targets/assign', { user_id: c.mgr1.id, product_name: 'X', target_value: 'abc' })).status).toBe(400);
    expect((await as(c.mgr1).post('/api/kpi/sales/transactions', { product_name: 'Ноутбук', quantity: -5, target_id: t.body.id })).status).toBe(400);
    const ok = await as(c.mgr1).post('/api/kpi/sales/transactions', { product_name: 'Ноутбук', quantity: 2, target_id: t.body.id });
    expect(ok.status).toBe(201);
    // Продажа вручную идёт в цель, которую сотрудник ведёт сам.
    const after = (await as(c.mgr1).get('/api/kpi/sales/targets')).body.find((x: any) => x.id === t.body.id);
    expect(after.current_value).toBe('2.00');
    expect((await as(c.mgr1).patch('/api/kpi/sales/targets/abc', { target_value: 5 })).status).toBe(400);
    // План меняет и удаляет руководитель, не сотрудник.
    expect((await as(c.mgr1).patch(`/api/kpi/sales/targets/${t.body.id}`, { target_value: 4 })).status).toBe(403);
    expect((await as(c.mgr1).delete(`/api/kpi/sales/targets/${t.body.id}`)).status).toBe(403);
    expect((await as(c.sales).patch(`/api/kpi/sales/targets/${t.body.id}`, { target_value: 4 })).status).toBe(200);
    // Все три типа показателя из приложения принимаются; директор может завести KPI себе.
    const contracts = await as(c.dir).post('/api/kpi/sales/targets', { product_name: 'Договоры', metric_type: 'contracts', target_value: 3 });
    expect(contracts.status).toBe(201);
    expect((await as(c.dir).patch(`/api/kpi/sales/targets/${contracts.body.id}`, { target_value: 4 })).status).toBe(200);
    expect((await as(c.dir).delete(`/api/kpi/sales/targets/${contracts.body.id}`)).status).toBe(200);
    expect((await as(c.sales).delete(`/api/kpi/sales/targets/${t.body.id}`)).status).toBe(200);
  });

  it('KPI: мусор в датах и фильтрах — 400, а не 500', async () => {
    const bad = await as(c.dir).post('/api/kpi/sales/targets', { product_name: 'Y', target_value: 5, period_start: 'вчера' });
    expect(bad.status).toBe(400);
    const reversed = await as(c.dir).post('/api/kpi/sales/targets', {
      product_name: 'Y', target_value: 5, period_start: '2030-02-01', period_end: '2030-01-01',
    });
    expect(reversed.status).toBe(400);
    expect((await as(c.mgr1).get('/api/kpi/sales/transactions?target_id=abc')).status).toBe(400);
    const assign = await as(c.sales).post('/api/kpi/sales/targets/assign', {
      user_id: c.mgr1.id, product_name: 'Z', target_value: 5, period_end: 'never',
    });
    expect(assign.status).toBe(400);
  });

  it('KPI: карточка сотрудника считает период так же, как список команды', async () => {
    const sale = await as(c.mgr1).post('/api/kpi/sales/transactions', { product_name: 'Сверка', quantity: 1, amount: 777 });
    expect(sale.status).toBe(201);
    const team = await as(c.sales).get('/api/kpi/sales/subordinates?period=month');
    const row = team.body.find((r: any) => r.user_id === c.mgr1.id);
    const card = await as(c.sales).get(`/api/kpi/sales/employee/${c.mgr1.id}/stats?period=month`);
    expect(card.status).toBe(200);
    expect(Number(card.body.summary.total_amount)).toBe(Number(row.total_amount));
    const s = card.body.taskStats;
    expect(s.total).toBe(s.completed + s.in_progress + s.overdue);
    // Чужую карточку сотрудник смотреть не может.
    expect((await as(c.mgr1).get(`/api/kpi/sales/employee/${c.sales.id}/stats`)).status).toBe(403);
  });

  it('База знаний: при недоступном ИИ вопрос не остаётся в истории, чужие диалоги не видны', async () => {
    const before = (await as(c.mgr1).get('/api/knowledge/sessions')).body.length;
    const r = await as(c.mgr1).post('/api/knowledge/chat', { message: 'Сколько дней отпуска?' });
    // В тестах нейросети нет: понятная ошибка вместо 500 и без «висящего» диалога.
    expect(r.status, JSON.stringify(r.body)).toBe(503);
    expect((await as(c.mgr1).get('/api/knowledge/sessions')).body.length).toBe(before);
    expect((await as(c.mgr1).get('/api/knowledge/sessions/abc/messages')).status).toBe(400);
    expect((await as(c.mgr1).post('/api/knowledge/messages/abc/feedback', { feedback: 'positive' })).status).toBe(400);
    expect((await as(c.mgr1).get('/api/knowledge/sessions/999999/messages')).status).toBe(404);
    expect((await as(c.mgr1).post('/api/knowledge/chat', { session_id: 999999, message: 'x' })).status).toBe(404);
    expect((await as(c.dir).post('/api/knowledge/documents/999999/reprocess')).status).toBe(404);
  });

  it('KPI: страница ручного импорта работает со строгой политикой скриптов', async () => {
    const r = await as().get('/api/kpi/upload');
    expect(r.status).toBe(200);
    const csp = String(r.headers['content-security-policy']);
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    expect(nonce).toBeTruthy();
    expect(r.text).toContain(`<script nonce="${nonce}">`);
    expect(r.text).not.toMatch(/\son(click|change)=/);
  });
});
