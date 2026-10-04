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
  app = createApp();
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
      executor_deadline: new Date(Date.now() - 3600_000).toISOString(),
      reviewer_deadline: new Date(Date.now() + 86400_000).toISOString(),
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
  it('участник группы не может исключать и переименовывать, админ — может', async () => {
    const g = await as(c.mgr1).post('/api/chats', { type: 'group', name: 'Права', user_ids: [c.mgr2.id, c.bk.id] });
    const gid = g.body.id;
    expect((await as(c.mgr2).delete(`/api/chats/${gid}/members/${c.bk.id}`)).status).toBe(403);
    expect((await as(c.mgr2).patch(`/api/chats/${gid}`, { name: 'Хаос' })).status).toBe(403);
    expect((await as(c.mgr2).post(`/api/chats/${gid}/members`, { user_ids: [c.acc.id] })).status).toBe(200);
    const info = await as(c.mgr2).get(`/api/chats/${gid}`);
    expect(info.body.my_rights).toMatchObject({ can_add_users: true, can_ban_users: false, can_change_info: false });
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
