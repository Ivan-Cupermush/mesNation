import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AtSign, Bell, Building2, Camera, Crown, KeyRound, LogOut, Mail, MonitorSmartphone, Palette, Pencil, Shield, UserRound } from 'lucide-react';
import { useAuth, useMe } from '../auth/AuthProvider';
import { isManager } from '../auth/roles';
import { api, uploadFile } from '../../lib/http';
import { displayName } from '../../lib/format';
import { Avatar } from '../../ui/Avatar';
import { Button, IconButton } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { TextField } from '../../ui/Field';
import { Page, PageBody, PageHeader } from '../../ui/Page';
import { Spinner } from '../../ui/Spinner';
import { SettingsRow, SettingsSection } from '../../ui/SettingsList';
import { useFeedback } from '../../ui/feedback';
import { ChangePasswordDialog } from './ChangePasswordDialog';
import s from './account.module.css';

/** Мой профиль — как в приложении: фото, имя и почта, оформление, уведомления, безопасность, выход. */
export default function ProfilePage() {
  const me = useMe();
  const { logout, refreshUser, patchUser } = useAuth();
  const navigate = useNavigate();
  const { toast, confirm } = useFeedback();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const photo = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    setName(me.display_name || '');
    setEmail(me.email || '');
    setEditing(true);
  };

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await api.patch('/api/auth/profile', { display_name: name.trim(), ...(email.trim() ? { email: email.trim() } : {}) });
      patchUser({ display_name: name.trim(), email: email.trim() || me.email });
      setEditing(false);
      toast.success('Профиль обновлён');
    } catch (e) {
      toast.error(e, 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  const changePhoto = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Выберите изображение');
      return;
    }
    setUploading(true);
    try {
      await uploadFile('/api/auth/avatar', 'avatar', file);
      await refreshUser();
      toast.success('Фото обновлено');
    } catch (e) {
      toast.error(e, 'Не удалось загрузить фото');
    } finally {
      setUploading(false);
    }
  };

  const logoutAll = async () => {
    const ok = await confirm({
      title: 'Выйти на всех устройствах?',
      text: 'Сессии на всех телефонах и компьютерах будут завершены, включая это устройство. Используйте, если потеряли телефон или подозреваете, что кто-то знает ваш пароль.',
      confirmText: 'Выйти везде',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.post('/api/auth/logout-all');
    } catch {
      // токен уже недействителен — всё равно выходим
    }
    logout();
  };

  const role = me.is_director ? 'Директор' : me.role_name || 'Сотрудник';

  return (
    <Page>
      <PageHeader
        title="Профиль"
        back={true}
        actions={
          <IconButton label="Изменить имя и почту" onClick={startEdit}>
            <Pencil size={19} />
          </IconButton>
        }
      />
      <PageBody narrow>
        <section className={s.hero}>
          <div className={s.avatarWrap}>
            <Avatar name={displayName(me)} src={me.avatar_url} size={112} />
            <button type="button" className={s.camera} onClick={() => photo.current?.click()} disabled={uploading} aria-label="Сменить фото">
              {uploading ? <Spinner size={16} inherit /> : <Camera size={17} />}
            </button>
            <input
              ref={photo}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.currentTarget.files?.[0];
                e.currentTarget.value = '';
                if (f) changePhoto(f);
              }}
            />
          </div>
          <h1 className={s.name}>{displayName(me)}</h1>
          <span className={s.role} style={me.role_color ? { color: me.role_color } : undefined}>
            {me.is_director ? <Crown size={12} /> : <Shield size={12} />}
            {role}
          </span>
        </section>

        <SettingsSection title="Контакты">
          <SettingsRow icon={<UserRound size={18} />} tone="muted" title={`@${me.username}`} hint="Логин — не меняется" />
          <SettingsRow icon={<UserRound size={18} />} title={me.display_name || 'Не указано'} hint="Имя" onClick={startEdit} />
          <SettingsRow icon={<Mail size={18} />} tone="info" title={me.email || 'Не указан'} hint="Почта — для входа и восстановления" onClick={startEdit} />
        </SettingsSection>

        {me.company_name && (
          <SettingsSection title="Компания">
            <SettingsRow icon={<Building2 size={18} />} title={me.company_name} hint={isManager(me) ? 'Управление — в разделе «Настройки»' : undefined} onClick={isManager(me) ? () => navigate('/settings') : undefined} />
          </SettingsSection>
        )}

        <SettingsSection title="Приложение">
          <SettingsRow icon={<Palette size={18} />} title="Оформление" hint="Тема, цвет, размер текста" onClick={() => navigate('/settings/appearance')} />
          <SettingsRow icon={<Bell size={18} />} tone="danger" title="Уведомления" hint="Сообщения и задачи на этом компьютере" onClick={() => navigate('/settings/notifications')} />
        </SettingsSection>

        <SettingsSection title="Безопасность">
          <SettingsRow icon={<KeyRound size={18} />} tone="warning" title="Сменить пароль" onClick={() => setPasswordOpen(true)} />
          <SettingsRow icon={<MonitorSmartphone size={18} />} tone="danger" title="Выйти на всех устройствах" hint="Если потеряли телефон или пароль мог узнать кто-то ещё" onClick={logoutAll} />
        </SettingsSection>

        <SettingsSection>
          <SettingsRow
            icon={<LogOut size={18} />}
            tone="danger"
            danger
            title="Выйти из аккаунта"
            onClick={async () => {
              if (await confirm({ title: 'Выйти из аккаунта?', text: 'Нужно будет войти заново.', confirmText: 'Выйти', danger: true })) logout();
            }}
          />
        </SettingsSection>
      </PageBody>

      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        persistent={saving}
        title="Имя и почта"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(false)} disabled={saving}>
              Отмена
            </Button>
            <Button onClick={save} loading={saving} disabled={!name.trim()}>
              Сохранить
            </Button>
          </>
        }
      >
        <form
          className={s.form}
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <TextField label="Имя" value={name} onChange={(e) => setName(e.target.value)} maxLength={255} autoFocus error={!name.trim() ? 'Имя не может быть пустым' : null} />
          <TextField label="Почта" type="email" icon={<AtSign size={16} />} value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255} />
          <button type="submit" hidden />
        </form>
      </Modal>
      <ChangePasswordDialog open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </Page>
  );
}
