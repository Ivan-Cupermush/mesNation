import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Copy, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { useMe } from '../auth/AuthProvider';
import { api } from '../../lib/http';
import { Button, IconButton } from '../../ui/Button';
import { TextField } from '../../ui/Field';
import { Modal } from '../../ui/Modal';
import { EmptyState } from '../../ui/EmptyState';
import { Page, PageBody, PageHeader } from '../../ui/Page';
import { PageLoader } from '../../ui/Spinner';
import { useFeedback } from '../../ui/feedback';
import { RolePickerDialog } from '../roles/RoleDialogs';
import { roleKeys, useRoleTree } from '../roles/queries';
import { userKeys } from './queries';
import s from './CreateUserPage.module.css';

/** Надёжный и удобный для передачи пароль: без похожих символов (l/1, O/0). */
function generatePassword(length = 12): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

/**
 * Новый сотрудник — как в приложении: роль в дереве, логин, имя, почта,
 * пароль. После создания — логин и пароль для передачи сотруднику.
 */
export default function CreateUserPage() {
  const me = useMe();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useFeedback();
  const [params] = useSearchParams();
  const { data: nodes, isLoading } = useRoleTree();
  const [nodeId, setNodeId] = useState<number | null>(Number(params.get('node')) || null);
  const [picking, setPicking] = useState(false);
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(() => generatePassword());
  const [showPassword, setShowPassword] = useState(true);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ id: number; username: string; password: string; role: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const node = useMemo(() => nodes?.find((n) => n.id === nodeId) ?? null, [nodes, nodeId]);

  if (!me.is_director) {
    return <EmptyState title="Нет доступа" text="Добавлять сотрудников может только директор." action={<Button onClick={() => navigate(-1)}>Назад</Button>} />;
  }
  if (isLoading) return <PageLoader />;

  const validate = () => {
    const e: Record<string, string> = {};
    if (!node) e.role = 'Выберите роль';
    if (!/^[a-zA-Z0-9._-]{2,50}$/.test(username.trim())) e.username = 'Латиница, цифры, точка, дефис или подчёркивание; 2–50 символов';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = 'Введите корректную почту';
    if (password.length < 8) e.password = 'Не короче 8 символов';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const submit = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const u = await api.post<{ id: number }>('/api/role-tree/users', {
        username: username.trim(),
        email: email.trim(),
        password,
        display_name: name.trim() || username.trim(),
        role_node_id: node!.id,
      });
      qc.invalidateQueries({ queryKey: userKeys.all });
      qc.invalidateQueries({ queryKey: userKeys.withInactive });
      qc.invalidateQueries({ queryKey: roleKeys.tree });
      setCreated({ id: u.id, username: username.trim(), password, role: node!.name });
    } catch (e) {
      toast.error(e, 'Не удалось добавить сотрудника');
    } finally {
      setSaving(false);
    }
  };

  const credentials = created ? `Вход в Offix\nАдрес: ${window.location.origin}\nЛогин: ${created.username}\nПароль: ${created.password}` : '';

  const reset = () => {
    setCreated(null);
    setUsername('');
    setName('');
    setEmail('');
    setPassword(generatePassword());
  };

  return (
    <Page>
      <PageHeader title="Новый сотрудник" back={true} />
      <PageBody narrow>
        <form
          className={s.form}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className={s.field}>
            <span className={s.label}>Роль</span>
            <button type="button" className={[s.role, errors.role && s.invalid].filter(Boolean).join(' ')} onClick={() => setPicking(true)}>
              {node ? (
                <>
                  <span className={s.roleIcon} style={{ background: `color-mix(in srgb, ${node.color || '#6366F1'} 16%, transparent)` }}>
                    {node.icon || '👤'}
                  </span>
                  <b>{node.name}</b>
                </>
              ) : (
                <span className={s.placeholder}>Выберите роль в дереве</span>
              )}
              <ChevronRight size={18} className={s.chevron} />
            </button>
            {errors.role ? <span className={s.error}>{errors.role}</span> : <span className={s.hint}>От роли зависит, кому сотрудник ставит задачи и чьи задачи видит.</span>}
          </div>
          <TextField label="Логин" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="ivan" autoComplete="off" error={errors.username} maxLength={50} />
          <TextField label="Имя и фамилия" value={name} onChange={(e) => setName(e.target.value)} placeholder="Иван Иванов" maxLength={255} />
          <TextField label="Почта" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ivan@company.ru" error={errors.email} maxLength={255} />
          <TextField
            label="Пароль"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            error={errors.password}
            hint="Сгенерирован автоматически — можно задать свой. Сотрудник сменит его в профиле."
            right={
              <span className={s.pwActions}>
                <IconButton label={showPassword ? 'Скрыть' : 'Показать'} size={32} onClick={() => setShowPassword((v) => !v)}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </IconButton>
                <IconButton label="Сгенерировать новый" size={32} onClick={() => setPassword(generatePassword())}>
                  <RefreshCw size={16} />
                </IconButton>
              </span>
            }
          />
          <Button type="submit" loading={saving} block>
            Добавить сотрудника
          </Button>
        </form>
      </PageBody>

      <RolePickerDialog
        open={picking}
        title="Роль сотрудника"
        nodes={nodes || []}
        current={nodeId}
        onClose={() => setPicking(false)}
        onPick={(n) => {
          setNodeId(n.id);
          setPicking(false);
          setErrors((e) => ({ ...e, role: '' }));
        }}
      />

      <Modal
        open={!!created}
        onClose={() => navigate(`/users/${created!.id}`)}
        title="Сотрудник добавлен"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={reset}>
              Добавить ещё
            </Button>
            <Button onClick={() => navigate(`/users/${created!.id}`)}>Открыть профиль</Button>
          </>
        }
      >
        <p className={s.hint}>Передайте данные для входа сотруднику. Пароль больше не будет показан.</p>
        <pre className={s.credentials}>{credentials}</pre>
        <Button
          variant="soft"
          icon={<Copy size={16} />}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(credentials);
              toast.success('Скопировано');
            } catch {
              toast.error('Не удалось скопировать — выделите текст вручную');
            }
          }}
        >
          Скопировать
        </Button>
      </Modal>
    </Page>
  );
}
