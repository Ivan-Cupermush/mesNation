import request from 'supertest';
import type { Express } from 'express';
import pool from '../src/db/pool';
import { migrate } from '../src/db/migrate';

/** Полностью пересоздаёт схему тестовой БД и накатывает миграции с нуля. */
export async function resetDatabase() {
  if (!/test|ci/.test(process.env.DB_NAME || '')) {
    throw new Error(`Тесты стирают базу. DB_NAME должен содержать "test" или "ci", сейчас: ${process.env.DB_NAME}`);
  }
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate();
}

export interface Actor {
  id: number;
  token: string;
  username: string;
}

export function client(app: Express, actor?: Actor) {
  const auth = (r: request.Test) => (actor ? r.set('Authorization', `Bearer ${actor.token}`) : r);
  return {
    get: (url: string) => auth(request(app).get(url)),
    post: (url: string, body?: object) => auth(request(app).post(url)).send(body ?? {}),
    patch: (url: string, body?: object) => auth(request(app).patch(url)).send(body ?? {}),
    put: (url: string, body?: object) => auth(request(app).put(url)).send(body ?? {}),
    delete: (url: string) => auth(request(app).delete(url)),
    upload: (url: string, field: string, data: Buffer, name: string) => auth(request(app).post(url)).attach(field, data, name),
  };
}

export async function login(app: Express, username: string, password: string): Promise<Actor> {
  const res = await request(app).post('/api/auth/login').send({ username, password });
  if (res.status !== 200) throw new Error(`login ${username}: ${res.status} ${JSON.stringify(res.body)}`);
  return { id: res.body.user.id, token: res.body.token, username };
}

/**
 * Тестовая компания:
 *
 *   Директор (dir)
 *   ├── Руководитель продаж (sales)
 *   │   └── Менеджер (mgr1, mgr2 — одна должность)
 *   └── Главбух (acc)
 *       └── Менеджер (bk) — то же название, другой отдел
 */
export async function seedCompany(app: Express) {
  const setup = await request(app).post('/api/auth/setup-company').send({
    company_name: 'ООО Тест',
    username: 'dir',
    email: 'dir@test.ru',
    password: 'director-pass',
    display_name: 'Директор Тестов',
  });
  if (setup.status !== 201) throw new Error(`setup: ${setup.status} ${JSON.stringify(setup.body)}`);
  const dir: Actor = { id: setup.body.user.id, token: setup.body.token, username: 'dir' };
  const api = client(app, dir);

  const root = (await api.get('/api/role-tree')).body.find((n: any) => n.is_root);
  const node = async (name: string, parent_id: number) => {
    const r = await api.post('/api/role-tree', { name, parent_id });
    if (r.status !== 201) throw new Error(`node ${name}: ${r.status} ${JSON.stringify(r.body)}`);
    return r.body.id as number;
  };
  const salesNode = await node('Руководитель продаж', root.id);
  const mgrNode = await node('Менеджер', salesNode);
  const accNode = await node('Главбух', root.id);
  const bkNode = await node('Менеджер', accNode);

  const user = async (username: string, role_node_id: number) => {
    const r = await api.post('/api/role-tree/users', {
      username,
      email: `${username}@test.ru`,
      password: 'secret-pass',
      display_name: username.toUpperCase(),
      role_node_id,
    });
    if (r.status !== 201) throw new Error(`user ${username}: ${r.status} ${JSON.stringify(r.body)}`);
    return login(app, username, 'secret-pass');
  };

  return {
    dir,
    sales: await user('sales', salesNode),
    mgr1: await user('mgr1', mgrNode),
    mgr2: await user('mgr2', mgrNode),
    acc: await user('acc', accNode),
    bk: await user('bk', bkNode),
    nodes: { root: root.id as number, salesNode, mgrNode, accNode, bkNode },
  };
}
