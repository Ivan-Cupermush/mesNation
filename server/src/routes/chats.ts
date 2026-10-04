import { Router, Response } from 'express';
import path from 'path';
import sharp from 'sharp';
import { z } from 'zod';
import pool, { withTransaction } from '../db/pool';
import { AuthRequest } from '../middleware/auth';
import { id, paramId, validate } from '../lib/validate';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { UPLOAD_DIRS, makeUploader, removeFile, urlToDiskPath } from '../lib/uploads';
import { assertChatMember, assertChatPermission, getChatRights } from '../services/access';
import { MESSAGE_SELECT, createServiceMessage, serializeMessage, userName } from '../services/messages';
import { emitToChat, emitToUser } from '../realtime/socket';

/** Монтируется на /api/chats (после authenticate). */
const router = Router();

const ADMIN_PERMISSIONS = ['change_info', 'delete_messages', 'ban_users', 'add_users', 'pin_messages', 'add_admins'] as const;
const DEFAULT_ADMIN_PERMISSIONS = ['change_info', 'delete_messages', 'ban_users', 'add_users', 'pin_messages'];

/** Участники чата. Деактивированные сотрудники не показываются. */
async function loadMembers(chatId: number) {
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.display_name, u.avatar_url,
            CASE WHEN c.created_by = u.id THEN 'creator'
                 WHEN ca.user_id IS NOT NULL THEN 'admin'
                 ELSE 'member' END AS role,
            ca.permissions, cm.joined_at
     FROM chat_members cm
     JOIN users u ON u.id = cm.user_id
     JOIN chats c ON c.id = cm.chat_id
     LEFT JOIN chat_admins ca ON ca.chat_id = cm.chat_id AND ca.user_id = u.id
     WHERE cm.chat_id = $1 AND u.is_active = TRUE
     ORDER BY (c.created_by = u.id) DESC, (ca.user_id IS NOT NULL) DESC, COALESCE(u.display_name, u.username)`,
    [chatId],
  );
  return rows;
}

/**
 * Карточка чата для конкретного пользователя: для личного чата имя и
 * аватар берутся у собеседника.
 */
function presentChat(chat: any, members: any[], userId: number) {
  const out = { ...chat, members, members_count: members.length };
  if (chat.type === 'private') {
    const peer = members.find((m) => m.id !== userId);
    out.peer = peer || null;
    out.name = peer ? peer.display_name || peer.username : chat.name || 'Удалённый пользователь';
    out.avatar_url = peer?.avatar_url ?? null;
  }
  return out;
}

// ---------- Создание и список ----------

const createSchema = z.object({
  type: z.enum(['private', 'group'], { error: 'Тип чата: private или group' }),
  name: z.string().trim().max(255).optional(),
  user_ids: z.array(id).min(1, 'Список участников обязателен').max(1000),
  is_supergroup: z.boolean().optional(),
});

router.post('/', validate(createSchema), async (req: AuthRequest, res: Response) => {
  const { type, name, user_ids, is_supergroup } = req.body as z.infer<typeof createSchema>;
  const me = req.userId!;
  const others = Array.from(new Set(user_ids.filter((u) => u !== me)));

  if (type === 'group' && !name) throw badRequest('Название группы обязательно');
  if (type === 'private' && others.length !== 1) throw badRequest('В личном чате ровно один собеседник');
  if (others.length === 0) throw badRequest('Добавьте хотя бы одного участника');

  const active = await pool.query('SELECT id FROM users WHERE id = ANY($1::int[]) AND is_active', [others]);
  if (active.rows.length !== others.length) throw badRequest('Некоторые пользователи не найдены или деактивированы');

  if (type === 'private') {
    const existing = await pool.query(
      `SELECT c.id FROM chats c
       JOIN chat_members m1 ON m1.chat_id = c.id AND m1.user_id = $1
       JOIN chat_members m2 ON m2.chat_id = c.id AND m2.user_id = $2
       WHERE c.type = 'private' AND c.deleted_at IS NULL
       LIMIT 1`,
      [me, others[0]],
    );
    if (existing.rows.length) {
      await pool.query('UPDATE chat_members SET hidden_at = NULL WHERE chat_id = $1 AND user_id = $2', [existing.rows[0].id, me]);
      const chat = (await pool.query('SELECT * FROM chats WHERE id = $1', [existing.rows[0].id])).rows[0];
      return res.json(presentChat(chat, await loadMembers(chat.id), me));
    }
  }

  const chat = await withTransaction(async (client) => {
    const c = (
      await client.query(
        'INSERT INTO chats (name, type, created_by, is_supergroup) VALUES ($1, $2, $3, $4) RETURNING *',
        [type === 'group' ? name : null, type, me, type === 'group' ? !!is_supergroup : false],
      )
    ).rows[0];
    await client.query(
      `INSERT INTO chat_members (chat_id, user_id) SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING`,
      [c.id, [me, ...others]],
    );
    return c;
  });
  if (type === 'group') {
    await createServiceMessage(chat.id, me, `${await userName(me)} создаёт группу «${name}»`);
  }
  const result = presentChat(chat, await loadMembers(chat.id), me);
  for (const uid of others) emitToUser(uid, 'chat_created', result);
  res.status(201).json(result);
});

router.get('/', async (req: AuthRequest, res: Response) => {
  const me = req.userId!;
  // Один запрос вместо 2N: участники и последнее сообщение собираются сразу.
  const { rows } = await pool.query(
    `SELECT c.id, c.name, c.type, c.is_supergroup, c.created_by, c.created_at, c.avatar_url,
            COALESCE((
              SELECT json_agg(json_build_object(
                       'id', u.id, 'username', u.username, 'display_name', u.display_name,
                       'avatar_url', u.avatar_url,
                       'role', CASE WHEN c.created_by = u.id THEN 'creator'
                                    WHEN ca.user_id IS NOT NULL THEN 'admin' ELSE 'member' END))
              FROM chat_members cm2
              JOIN users u ON u.id = cm2.user_id AND u.is_active
              LEFT JOIN chat_admins ca ON ca.chat_id = c.id AND ca.user_id = u.id
              WHERE cm2.chat_id = c.id), '[]') AS members,
            (SELECT row_to_json(lm) FROM (
               SELECT m.id, m.text, m.sender_id, m.created_at, m.file_name, m.content_type,
                      m.media_kind, m.thumb_url, m.file_url, m.poll_id, m.note_share_id,
                      (SELECT p.question FROM polls p WHERE p.id = m.poll_id) AS poll_question,
                      COALESCE(u.display_name, u.username) AS sender_name
               FROM messages m LEFT JOIN users u ON u.id = m.sender_id
               WHERE m.chat_id = c.id::text AND m.deleted_for_all IS NOT TRUE
                 AND NOT ($1::int = ANY(COALESCE(m.deleted_for_user_ids, '{}')))
                 AND (m.topic_id IS NULL OR c.is_supergroup)
               ORDER BY m.created_at DESC LIMIT 1) lm) AS last_message,
            (SELECT COUNT(*)::int FROM messages m
             WHERE m.chat_id = c.id::text AND m.id > cm.last_read_message_id AND m.sender_id <> $1
               AND m.deleted_for_all IS NOT TRUE AND NOT ($1::int = ANY(COALESCE(m.deleted_for_user_ids, '{}')))) AS unread_count,
            cm.last_read_message_id AS my_last_read_id,
            cm.pinned_at,
            (SELECT COALESCE(MAX(o.last_read_message_id), 0) FROM chat_members o
             WHERE o.chat_id = c.id AND o.user_id <> $1) AS peer_last_read_id
     FROM chats c
     JOIN chat_members cm ON cm.chat_id = c.id AND cm.user_id = $1
     WHERE c.deleted_at IS NULL AND cm.hidden_at IS NULL
     ORDER BY cm.pinned_at DESC NULLS LAST, COALESCE((SELECT MAX(created_at) FROM messages WHERE chat_id = c.id::text), c.created_at) DESC`,
    [me],
  );
  res.json(rows.map((c) => presentChat(c, c.members, me)));
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  const chatId = paramId(req);
  await assertChatMember(chatId, req.userId!);
  const chat = (await pool.query('SELECT * FROM chats WHERE id = $1', [chatId])).rows[0];
  const rights = await getChatRights(chatId, req.userId!);
  const my_rights = {
    is_creator: rights.isCreator,
    is_admin: rights.isAdmin,
    can_change_info: rights.can('change_info'),
    can_add_users: rights.can('add_users'),
    can_ban_users: rights.can('ban_users'),
    can_delete_messages: rights.can('delete_messages'),
    can_pin_messages: rights.can('pin_messages'),
    can_add_admins: rights.can('add_admins'),
  };
  res.json({ ...presentChat(chat, await loadMembers(chatId), req.userId!), ...(await readMarks(chatId, req.userId!)), my_rights });
});

async function readMarks(chatId: number, userId: number) {
  const { rows } = await pool.query(
    `SELECT
       (SELECT last_read_message_id FROM chat_members WHERE chat_id = $1 AND user_id = $2) AS my_last_read_id,
       (SELECT COALESCE(MAX(last_read_message_id), 0) FROM chat_members WHERE chat_id = $1 AND user_id <> $2) AS peer_last_read_id`,
    [chatId, userId],
  );
  return rows[0];
}

const membershipSchema = z.object({ pinned: z.boolean() });

/** Личные настройки чата у участника: закрепить в списке. */
router.patch('/:id/membership', validate(membershipSchema), async (req: AuthRequest, res: Response) => {
  const chatId = paramId(req);
  await assertChatMember(chatId, req.userId!);
  const { pinned } = req.body as z.infer<typeof membershipSchema>;
  if (pinned) {
    const count = await pool.query('SELECT COUNT(*)::int AS n FROM chat_members WHERE user_id = $1 AND pinned_at IS NOT NULL', [req.userId]);
    if (count.rows[0].n >= 10) throw badRequest('Можно закрепить не больше 10 чатов');
  }
  await pool.query('UPDATE chat_members SET pinned_at = CASE WHEN $1 THEN NOW() ELSE NULL END WHERE chat_id = $2 AND user_id = $3', [
    pinned,
    chatId,
    req.userId,
  ]);
  res.json({ success: true, pinned });
});

const readSchema = z.object({ message_id: id });

/** Отметить чат прочитанным до сообщения message_id (включительно). */
router.post('/:id/read', validate(readSchema), async (req: AuthRequest, res: Response) => {
  const chatId = paramId(req);
  await assertChatMember(chatId, req.userId!);
  const { message_id } = req.body as z.infer<typeof readSchema>;
  const { rows } = await pool.query(
    `UPDATE chat_members SET last_read_message_id = GREATEST(last_read_message_id,
        LEAST($1, (SELECT COALESCE(MAX(id), 0) FROM messages WHERE chat_id = $2::text)))
     WHERE chat_id = $2 AND user_id = $3 RETURNING last_read_message_id`,
    [message_id, chatId, req.userId],
  );
  const last = rows[0].last_read_message_id;
  emitToChat(chatId, 'messages_read', { chat_id: chatId, user_id: req.userId, message_id: last });
  emitToUser(req.userId!, 'chat_activity', { chat_id: chatId });
  res.json({ last_read_message_id: last });
});

// ---------- Участники ----------

router.get('/:id/members', async (req: AuthRequest, res: Response) => {
  const chatId = paramId(req);
  await assertChatMember(chatId, req.userId!);
  res.json(await loadMembers(chatId));
});

const membersSchema = z.object({ user_ids: z.array(id).min(1, 'Список участников обязателен').max(1000) });

router.post('/:id/members', validate(membersSchema), async (req: AuthRequest, res: Response) => {
  const chatId = paramId(req);
  const rights = await assertChatPermission(chatId, req.userId!, 'add_users', 'Нет прав на добавление участников');
  if (rights.type !== 'group') throw badRequest('В личный чат нельзя добавлять участников');
  const { user_ids } = req.body as z.infer<typeof membersSchema>;
  const active = await pool.query('SELECT id FROM users WHERE id = ANY($1::int[]) AND is_active', [user_ids]);
  const added = await pool.query(
    `INSERT INTO chat_members (chat_id, user_id, last_read_message_id)
     SELECT $1, uid, (SELECT COALESCE(MAX(id), 0) FROM messages WHERE chat_id = $3) FROM unnest($2::int[]) AS uid
     ON CONFLICT DO NOTHING RETURNING user_id`,
    [chatId, active.rows.map((r) => r.id), String(chatId)],
  );
  if (added.rows.length) {
    const names = await Promise.all(added.rows.map((r) => userName(r.user_id)));
    await createServiceMessage(chatId, req.userId!, `${await userName(req.userId!)} добавляет: ${names.join(', ')}`);
    const chat = (await pool.query('SELECT * FROM chats WHERE id = $1', [chatId])).rows[0];
    const members = await loadMembers(chatId);
    for (const r of added.rows) emitToUser(r.user_id, 'chat_created', presentChat(chat, members, r.user_id));
  }
  const members = await loadMembers(chatId);
  emitToChat(chatId, 'members_changed', { chatId, members });
  res.json(members);
});

router.delete('/:id/members/:userId', async (req: AuthRequest, res: Response) => {
  const chatId = paramId(req);
  const memberId = paramId(req, 'userId');
  if (memberId === req.userId) throw badRequest('Чтобы выйти из чата, используйте «Покинуть чат»');
  const rights = await assertChatPermission(chatId, req.userId!, 'ban_users', 'Нет прав на удаление участников');
  if (memberId === rights.createdBy) throw forbidden('Создателя чата удалить нельзя');
  // Админ не может исключить другого админа — только владелец.
  const isAdminTarget = await pool.query('SELECT 1 FROM chat_admins WHERE chat_id = $1 AND user_id = $2', [chatId, memberId]);
  if (isAdminTarget.rows.length && !rights.isCreator) throw forbidden('Администратора может исключить только владелец группы');
  const inChat = await pool.query('SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2', [chatId, memberId]);
  if (!inChat.rows.length) throw notFound('Участник не найден');
  await createServiceMessage(chatId, req.userId!, `${await userName(req.userId!)} исключает ${await userName(memberId)}`);
  await pool.query('DELETE FROM chat_admins WHERE chat_id = $1 AND user_id = $2', [chatId, memberId]);
  await pool.query('DELETE FROM chat_members WHERE chat_id = $1 AND user_id = $2', [chatId, memberId]);
  emitToChat(chatId, 'members_changed', { chatId, members: await loadMembers(chatId) });
  emitToUser(memberId, 'removed_from_chat', { chatId });
  res.json({ success: true });
});

// ---------- Изменение, выход, удаление ----------

const patchSchema = z.object({
  name: z.string().trim().min(1, 'Название не может быть пустым').max(255).optional(),
  is_supergroup: z.boolean().optional(),
  keep_topic_id: id.nullish(),
  merge: z.boolean().optional(),
});

router.patch('/:id', validate(patchSchema), async (req: AuthRequest, res: Response) => {
  const chatId = paramId(req);
  const rights = await assertChatPermission(chatId, req.userId!, 'change_info', 'Нет прав на изменение чата');
  const { name, is_supergroup, keep_topic_id, merge } = req.body as z.infer<typeof patchSchema>;
  if (rights.type !== 'group' && (name !== undefined || is_supergroup !== undefined)) {
    throw badRequest('Личный чат нельзя переименовать или сделать супергруппой');
  }

  await withTransaction(async (client) => {
    if (name !== undefined) await client.query('UPDATE chats SET name = $1 WHERE id = $2', [name, chatId]);
    if (is_supergroup === true) {
      await client.query('UPDATE chats SET is_supergroup = TRUE WHERE id = $1', [chatId]);
    } else if (is_supergroup === false) {
      // Сообщения топиков НЕ удаляются: они остаются в базе и снова станут
      // видны, если группу опять сделать супергруппой. Выбранный топик
      // (keep_topic_id + merge) переносится в общий чат.
      if (keep_topic_id && merge !== false) {
        await client.query('UPDATE messages SET topic_id = NULL WHERE chat_id = $1 AND topic_id = $2', [
          String(chatId),
          keep_topic_id,
        ]);
      }
      await client.query('UPDATE chats SET is_supergroup = FALSE WHERE id = $1', [chatId]);
    }
  });
  const actor = await userName(req.userId!);
  if (name !== undefined && name !== rights.name) await createServiceMessage(chatId, req.userId!, `${actor} меняет название группы на «${name}»`);
  if (is_supergroup === true && !rights.isSupergroup) await createServiceMessage(chatId, req.userId!, `${actor} включает темы — группа стала супергруппой`);
  if (is_supergroup === false && rights.isSupergroup) await createServiceMessage(chatId, req.userId!, `${actor} выключает темы`);
  const chat = (await pool.query('SELECT * FROM chats WHERE id = $1', [chatId])).rows[0];
  const result = presentChat(chat, await loadMembers(chatId), req.userId!);
  emitToChat(chatId, 'chat_updated', result);
  res.json(result);
});

/**
 * Выход из чата или удаление группы её создателем.
 * Удаление мягкое: чат пропадает у всех, но переписка остаётся в базе.
 */
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const chatId = paramId(req);
  const rights = await getChatRights(chatId, req.userId!);
  if (!rights.isMember) throw forbidden('Вы не участник этого чата');
  if (rights.type === 'private') {
    // Личная переписка не удаляется у собеседника — чат скрывается только у себя.
    await pool.query('UPDATE chat_members SET hidden_at = NOW() WHERE chat_id = $1 AND user_id = $2', [chatId, req.userId]);
    return res.json({ success: true, action: 'hidden' });
  }
  if (rights.isCreator && req.query.leave !== 'true') {
    await pool.query('UPDATE chats SET deleted_at = NOW() WHERE id = $1', [chatId]);
    emitToChat(chatId, 'chat_deleted', { chatId });
    return res.json({ success: true, action: 'deleted' });
  }
  await createServiceMessage(chatId, req.userId!, `${await userName(req.userId!)} покидает группу`);
  await pool.query('DELETE FROM chat_admins WHERE chat_id = $1 AND user_id = $2', [chatId, req.userId]);
  await pool.query('DELETE FROM chat_members WHERE chat_id = $1 AND user_id = $2', [chatId, req.userId]);
  if (rights.isCreator) {
    // Владелец уходит: права переходят старшему администратору, иначе самому давнему участнику.
    const heir = await pool.query(
      `SELECT cm.user_id FROM chat_members cm JOIN users u ON u.id = cm.user_id AND u.is_active
       LEFT JOIN chat_admins ca ON ca.chat_id = cm.chat_id AND ca.user_id = cm.user_id
       WHERE cm.chat_id = $1 ORDER BY (ca.user_id IS NULL), ca.promoted_at, cm.joined_at LIMIT 1`,
      [chatId],
    );
    if (heir.rows.length) {
      const heirId = heir.rows[0].user_id;
      await pool.query('UPDATE chats SET created_by = $1 WHERE id = $2', [heirId, chatId]);
      await pool.query('DELETE FROM chat_admins WHERE chat_id = $1 AND user_id = $2', [chatId, heirId]);
      await createServiceMessage(chatId, heirId, `${await userName(heirId)} теперь владелец группы`);
    } else {
      await pool.query('UPDATE chats SET deleted_at = NOW() WHERE id = $1', [chatId]);
    }
  }
  emitToChat(chatId, 'members_changed', { chatId, members: await loadMembers(chatId) });
  res.json({ success: true, action: 'left' });
});

// ---------- Администраторы ----------

router.get('/:id/admins', async (req: AuthRequest, res: Response) => {
  const chatId = paramId(req);
  await assertChatMember(chatId, req.userId!);
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.display_name, u.avatar_url, ca.promoted_at, ca.permissions
     FROM chat_admins ca JOIN users u ON u.id = ca.user_id
     WHERE ca.chat_id = $1 AND u.is_active ORDER BY ca.promoted_at`,
    [chatId],
  );
  res.json(rows);
});

const adminSchema = z.object({
  user_id: id,
  permissions: z.array(z.enum(ADMIN_PERMISSIONS)).optional(),
});

router.post('/:id/admins', validate(adminSchema), async (req: AuthRequest, res: Response) => {
  const chatId = paramId(req);
  const { user_id, permissions } = req.body as z.infer<typeof adminSchema>;
  const rights = await assertChatPermission(chatId, req.userId!, 'add_admins', 'Назначать администраторов может создатель или администратор с этим правом');
  if (rights.type !== 'group') throw badRequest('В личном чате нет администраторов');
  const member = await pool.query('SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2', [chatId, user_id]);
  if (!member.rows.length) throw badRequest('Пользователь не является участником');
  await pool.query(
    `INSERT INTO chat_admins (chat_id, user_id, promoted_by, permissions) VALUES ($1, $2, $3, $4)
     ON CONFLICT (chat_id, user_id) DO UPDATE SET permissions = $4, promoted_by = $3`,
    [chatId, user_id, req.userId, permissions || DEFAULT_ADMIN_PERMISSIONS],
  );
  res.status(201).json({ success: true });
});

const adminPermsSchema = z.object({ permissions: z.array(z.enum(ADMIN_PERMISSIONS)) });

router.patch('/:id/admins/:userId', validate(adminPermsSchema), async (req: AuthRequest, res: Response) => {
  const chatId = paramId(req);
  const adminId = paramId(req, 'userId');
  await assertChatPermission(chatId, req.userId!, 'add_admins', 'Нет прав на изменение прав администраторов');
  const { rowCount } = await pool.query(
    'UPDATE chat_admins SET permissions = $1 WHERE chat_id = $2 AND user_id = $3',
    [req.body.permissions, chatId, adminId],
  );
  if (!rowCount) throw notFound('Администратор не найден');
  res.json({ success: true });
});

router.delete('/:id/admins/:userId', async (req: AuthRequest, res: Response) => {
  const chatId = paramId(req);
  const adminId = paramId(req, 'userId');
  if (adminId !== req.userId) {
    await assertChatPermission(chatId, req.userId!, 'add_admins', 'Нет прав на снятие администратора');
  } else {
    await assertChatMember(chatId, req.userId!);
  }
  await pool.query('DELETE FROM chat_admins WHERE chat_id = $1 AND user_id = $2', [chatId, adminId]);
  res.json({ success: true });
});

// ---------- Медиа и статистика всего чата ----------

const MEDIA_FILTERS: Record<string, string> = {
  media: "(m.media_kind IN ('photo', 'video') OR (m.media_kind IS NULL AND m.thumb_url IS NOT NULL))",
  images: "(m.media_kind = 'photo' OR (m.media_kind IS NULL AND m.thumb_url IS NOT NULL))",
  files: "m.file_url IS NOT NULL AND (m.media_kind = 'file' OR (m.media_kind IS NULL AND m.thumb_url IS NULL))",
  links: "m.text ~* 'https?://'",
  polls: 'm.poll_id IS NOT NULL',
};

router.get('/:id/stats', async (req: AuthRequest, res: Response) => {
  const chatId = paramId(req);
  await assertChatMember(chatId, req.userId!);
  const { rows } = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE ${MEDIA_FILTERS.media})::int AS media,
            COUNT(*) FILTER (WHERE ${MEDIA_FILTERS.files})::int AS files,
            COUNT(*) FILTER (WHERE ${MEDIA_FILTERS.links})::int AS links,
            COUNT(*) FILTER (WHERE ${MEDIA_FILTERS.polls})::int AS polls,
            COUNT(*)::int AS messages
     FROM messages m WHERE m.chat_id = $1 AND m.deleted_for_all IS NOT TRUE`,
    [String(chatId)],
  );
  const s = rows[0];
  res.json({ ...s, total_images: s.media, total_files: s.files + s.media, members: (await loadMembers(chatId)).length });
});

const mediaQuery = z.object({
  type: z.enum(['media', 'images', 'files', 'links', 'polls']).default('media'),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  before: id.optional(),
  topic_id: id.optional(),
});

/** Медиа, файлы, ссылки и опросы чата — постранично (для экрана «Медиа»). */
router.get('/:id/messages', async (req: AuthRequest, res: Response) => {
  const chatId = paramId(req);
  await assertChatMember(chatId, req.userId!);
  const q = mediaQuery.parse(req.query);
  const params: unknown[] = [String(chatId), q.limit];
  let where = `m.chat_id = $1 AND m.deleted_for_all IS NOT TRUE AND ${MEDIA_FILTERS[q.type]}`;
  if (q.before) {
    params.push(q.before);
    where += ` AND m.id < $${params.length}`;
  }
  if (q.topic_id) {
    params.push(q.topic_id);
    where += ` AND m.topic_id = $${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT ${MESSAGE_SELECT} FROM messages m LEFT JOIN users u ON u.id = m.sender_id
     WHERE ${where} ORDER BY m.id DESC LIMIT $2`,
    params,
  );
  res.json(rows.map(serializeMessage));
});

// ---------- Аватар группы ----------

const chatAvatarUpload = makeUploader({ dir: UPLOAD_DIRS.avatars, maxSizeMb: 10, imagesOnly: true, prefix: 'chat_' });

router.post('/:id/avatar', chatAvatarUpload.single('avatar'), async (req: AuthRequest, res: Response) => {
  const file = req.file;
  if (!file) throw badRequest('Файл не получен');
  try {
    const chatId = paramId(req);
    const rights = await assertChatPermission(chatId, req.userId!, 'change_info', 'Нет прав на изменение группы');
    if (rights.type !== 'group') throw badRequest('Аватар можно задать только группе');
    const outName = path.basename(file.filename, path.extname(file.filename)) + '.jpg';
    await sharp(file.path).rotate().resize(512, 512, { fit: 'cover' }).jpeg({ quality: 85 }).toFile(path.join(UPLOAD_DIRS.avatars, outName));
    removeFile(file.path);
    const url = `/uploads/avatars/${outName}`;
    const prev = await pool.query('SELECT avatar_url FROM chats WHERE id = $1', [chatId]);
    await pool.query('UPDATE chats SET avatar_url = $1 WHERE id = $2', [url, chatId]);
    if (prev.rows[0]?.avatar_url) removeFile(urlToDiskPath(prev.rows[0].avatar_url));
    await createServiceMessage(chatId, req.userId!, `${await userName(req.userId!)} меняет фото группы`);
    emitToChat(chatId, 'chat_updated', { id: chatId, avatar_url: url });
    res.json({ success: true, avatar_url: url });
  } catch (err) {
    removeFile(file.path);
    throw err;
  }
});

export default router;
