import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { z } from 'zod';
import pool from '../db/pool';
import { corsOrigins } from '../config/env';
import { logger } from '../lib/logger';
import { checkSession, verifyUserToken } from '../middleware/auth';
import { isChatMember } from '../services/access';
import { createMessage } from '../services/messages';

let io: Server | null = null;

/** Комната чата. Всегда строка, чтобы число и строка не давали две разные комнаты. */
export const chatRoom = (chatId: number | string) => `chat:${chatId}`;
/** Личная комната пользователя — для событий, которые касаются только его. */
export const userRoom = (userId: number) => `user:${userId}`;

export function getIO(): Server {
  if (!io) throw new Error('Socket.IO ещё не инициализирован');
  return io;
}

/** Безопасная рассылка: в тестах и скриптах сокета может не быть. */
export function emitToChat(chatId: number | string, event: string, payload: unknown) {
  io?.to(chatRoom(chatId)).emit(event, payload);
}

/** Разрывает все соединения пользователя (после отзыва сессий). */
export function disconnectUser(userId: number) {
  io?.in(userRoom(userId)).disconnectSockets(true);
}

export function emitToUser(userId: number, event: string, payload: unknown) {
  io?.to(userRoom(userId)).emit(event, payload);
}

const sendSchema = z.object({
  chatId: z.coerce.number().int().positive(),
  text: z.string().trim().min(1, 'Пустое сообщение').max(4000, 'Сообщение длиннее 4000 символов'),
  reply_to_message_id: z.coerce.number().int().positive().nullish(),
  topic_id: z.coerce.number().int().positive().nullish(),
  client_id: z.string().max(64).nullish(),
});

type Ack = (res: { ok: true; message: unknown } | { ok: false; error: string }) => void;

/** Онлайн-присутствие: userId -> количество открытых соединений. */
const connections = new Map<number, number>();

export function initSocket(server: HttpServer): Server {
  io = new Server(server, {
    cors: { origin: corsOrigins.length ? corsOrigins : false },
  });

  // Аутентификация при подключении: токен передаётся в handshake.auth.token.
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== 'string') return next(new Error('unauthorized'));
      const payload = verifyUserToken(token);
      const { userId } = payload;
      if (await checkSession(payload)) return next(new Error('unauthorized'));
      socket.data.userId = userId;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId: number = socket.data.userId;
    socket.join(userRoom(userId));
    connections.set(userId, (connections.get(userId) || 0) + 1);
    logger.debug({ userId, socket: socket.id }, 'socket connected');

    socket.on('join_chat', async (chatId: unknown, ack?: (r: { ok: boolean }) => void) => {
      const id = Number(chatId);
      if (!Number.isInteger(id) || !(await isChatMember(id, userId))) return ack?.({ ok: false });
      socket.join(chatRoom(id));
      ack?.({ ok: true });
      emitOnline(id);
    });

    socket.on('leave_chat', (chatId: unknown) => {
      socket.leave(chatRoom(String(Number(chatId))));
    });

    socket.on('send_message', async (data: unknown, ack?: Ack) => {
      try {
        const input = sendSchema.parse(data);
        const message = await createMessage({
          chatId: input.chatId,
          senderId: userId,
          text: input.text,
          replyToMessageId: input.reply_to_message_id ?? null,
          topicId: input.topic_id ?? null,
          clientId: input.client_id ?? null,
        });
        ack?.({ ok: true, message });
      } catch (err: any) {
        const msg = err instanceof z.ZodError ? err.issues[0].message : err?.status ? err.message : 'Не удалось отправить';
        if (!err?.status && !(err instanceof z.ZodError)) logger.error({ err, userId }, 'send_message failed');
        ack?.({ ok: false, error: msg });
      }
    });

    socket.on('typing', async ({ chatId }: { chatId?: unknown } = {}) => {
      const id = Number(chatId);
      if (!socket.rooms.has(chatRoom(id))) return;
      const { rows } = await pool.query('SELECT username, display_name FROM users WHERE id = $1', [userId]);
      socket.to(chatRoom(id)).emit('user_typing', {
        chatId: String(id),
        userId,
        userName: rows[0]?.display_name || rows[0]?.username || '',
      });
    });

    socket.on('stop_typing', ({ chatId }: { chatId?: unknown } = {}) => {
      const id = Number(chatId);
      if (!socket.rooms.has(chatRoom(id))) return;
      socket.to(chatRoom(id)).emit('user_stop_typing', { chatId: String(id), userId });
    });

    socket.on('disconnecting', () => {
      const left = (connections.get(userId) || 1) - 1;
      if (left <= 0) connections.delete(userId);
      else connections.set(userId, left);
      for (const room of socket.rooms) {
        if (room.startsWith('chat:')) setImmediate(() => emitOnline(room.slice(5)));
      }
    });
  });

  return io;
}

/** Рассылает в чат список участников, которые сейчас онлайн. */
async function emitOnline(chatId: number | string) {
  if (!io) return;
  const { rows } = await pool.query('SELECT user_id FROM chat_members WHERE chat_id = $1', [chatId]);
  const online = rows.map((r) => r.user_id).filter((id: number) => connections.has(id));
  io.to(chatRoom(chatId)).emit('online_users', online);
}
