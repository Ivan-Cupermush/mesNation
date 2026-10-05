import { useNavigate } from 'react-router-dom';
import { Bell, Building2, ChevronRight, FileSpreadsheet, LogOut, Network, Palette, Pencil, Target, UserPlus, Users } from 'lucide-react';
import { useAuth, useMe } from '../auth/AuthProvider';
import { isManager } from '../auth/roles';
import { api } from '../../lib/http';
import { displayName } from '../../lib/format';
import { Avatar } from '../../ui/Avatar';
import { IconButton } from '../../ui/Button';
import { Page, PageBody, PageHeader } from '../../ui/Page';
import { SettingsRow, SettingsSection } from '../../ui/SettingsList';
import { useFeedback } from '../../ui/feedback';
import s from './account.module.css';

/**
 * Настройки — как в приложении: профиль, компания (директор может
 * переименовать), администрирование для руководителей, оформление,
 * уведомления, выход.
 */
export default function SettingsPage() {
  const me = useMe();
  const { logout, patchUser } = useAuth();
  const navigate = useNavigate();
  const { toast, confirm, prompt } = useFeedback();
  const manager = isManager(me);

  const rename = async () => {
    const value = await prompt({ title: 'Название компании', initialValue: me.company_name || '', required: true, maxLength: 255, confirmText: 'Сохранить' });
    if (!value || value === me.company_name) return;
    try {
      const r = await api.patch<{ company_name: string }>('/api/company', { company_name: value });
      patchUser({ company_name: r.company_name });
      toast.success('Название сохранено');
    } catch (e) {
      toast.error(e, 'Не удалось переименовать компанию');
    }
  };

  return (
    <Page>
      <PageHeader title="Настройки" large />
      <PageBody narrow>
        <button type="button" className={s.profileCard} onClick={() => navigate('/profile')}>
          <Avatar name={displayName(me)} src={me.avatar_url} size={56} />
          <span className={s.profileBody}>
            <b>{displayName(me)}</b>
            <small>{me.is_director ? 'Директор' : me.role_name || 'Сотрудник'} · @{me.username}</small>
          </span>
          <ChevronRight size={18} className={s.muted} />
        </button>

        {me.company_name && (
          <SettingsSection title="Компания">
            <SettingsRow
              icon={<Building2 size={18} />}
              title={me.company_name}
              hint={me.is_director ? 'Название видят все сотрудники' : undefined}
              right={
                me.is_director ? (
                  <IconButton label="Переименовать компанию" size={34} onClick={rename}>
                    <Pencil size={16} />
                  </IconButton>
                ) : undefined
              }
            />
          </SettingsSection>
        )}

        {manager && (
          <SettingsSection title="Администрирование">
            <SettingsRow icon={<Users size={18} />} tone="info" title="Сотрудники" hint="Все сотрудники компании" onClick={() => navigate('/employees')} />
            <SettingsRow icon={<UserPlus size={18} />} tone="warning" title="Новый сотрудник" hint="Добавить пользователя в систему" onClick={() => navigate('/create-user')} />
            <SettingsRow icon={<Network size={18} />} tone="violet" title="Дерево ролей" hint="Иерархия и управление правами" onClick={() => navigate('/roles')} />
            <SettingsRow icon={<Target size={18} />} title="Назначить KPI" hint="План продаж для сотрудника" onClick={() => navigate('/stats')} />
            <SettingsRow icon={<FileSpreadsheet size={18} />} tone="info" title="Импорт из Excel" hint="Загрузка KPI и отчётов продаж" onClick={() => navigate('/import')} />
          </SettingsSection>
        )}

        <SettingsSection title="Приложение">
          <SettingsRow icon={<Palette size={18} />} title="Оформление" hint="Тема, цвет, размер текста" onClick={() => navigate('/settings/appearance')} />
          <SettingsRow icon={<Bell size={18} />} tone="danger" title="Уведомления" hint="Сообщения и задачи на этом компьютере" onClick={() => navigate('/settings/notifications')} />
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
        <p className={s.footer}>Offix · веб-версия</p>
      </PageBody>
    </Page>
  );
}
