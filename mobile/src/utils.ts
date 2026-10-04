/**
 * Старая точка входа для адреса сервера и токена. Оставлена, чтобы не
 * трогать все экраны разом; новый код импортирует из ./config и ./services/http.
 */
export { SERVER_URL } from './config';
export { getToken } from './services/http';
