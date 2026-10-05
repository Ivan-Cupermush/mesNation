import { useEffect, useState } from 'react';
import { BellOff, BellRing, Eye, ListTodo, MessageCircle, ShieldAlert } from 'lucide-react';
import { notificationsSupported, requestNotifications } from '../chats/notifications';
import { Button } from '../../ui/Button';
import { Switch } from '../../ui/Field';
import { Page, PageBody, PageHeader } from '../../ui/Page';
import { SettingsRow, SettingsSection } from '../../ui/SettingsList';
import { useFeedback } from '../../ui/feedback';
import { setNotifySettings, useNotifySettings } from './notifySettings';
import s from './account.module.css';

type Permission = NotificationPermission | 'unsupported';
const currentPermission = (): Permission => (notificationsSupported() ? Notification.permission : 'unsupported');

/**
 * Уведомления на этом компьютере — как «Уведомления» в приложении:
 * разрешение браузера, что присылать, показывать ли текст, проверка.
 */
export default function NotificationsPage() {
  const settings = useNotifySettings();
  const { toast } = useFeedback();
  const [permission, setPermission] = useState<Permission>(currentPermission);

  // Разрешение могли поменять в настройках браузера, пока страница открыта.
  useEffect(() => {
    const onFocus = () => setPermission(currentPermission());
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const enable = async () => {
    await requestNotifications();
    setPermission(currentPermission());
  };

  const test = (kind: 'message' | 'task') => {
    if (permission !== 'granted') {
      toast('Сначала разрешите уведомления');
      return;
    }
    try {
      if (kind === 'message') {
        new Notification('Отдел продаж · Анна', { body: settings.preview ? 'Отчёт за квартал готов, посмотрите, пожалуйста' : 'Новое сообщение', icon: '/favicon.svg', tag: 'preview-message' });
      } else {
        new Notification('Новая задача', { body: 'Подготовить коммерческое предложение', icon: '/favicon.svg', tag: 'preview-task' });
      }
    } catch (e) {
      toast.error(e, 'Браузер не показал уведомление');
    }
  };

  return (
    <Page>
      <PageHeader title="Уведомления" back={true} />
      <PageBody narrow>
        <SettingsSection
          title="Разрешение браузера"
          footer={
            permission === 'denied'
              ? 'Уведомления запрещены в настройках браузера для этого сайта. Нажмите на значок замка слева от адреса и разрешите уведомления.'
              : permission === 'unsupported'
                ? 'Этот браузер не поддерживает уведомления (или сайт открыт не по защищённому адресу https).'
                : 'Уведомления приходят, когда сайт открыт во вкладке (можно свернуть). Чат, открытый на экране, не уведомляет.'
          }
        >
          <SettingsRow
            icon={permission === 'granted' ? <BellRing size={18} /> : permission === 'denied' ? <ShieldAlert size={18} /> : <BellOff size={18} />}
            tone={permission === 'granted' ? 'accent' : permission === 'denied' ? 'danger' : 'muted'}
            title={permission === 'granted' ? 'Разрешены' : permission === 'denied' ? 'Запрещены в браузере' : permission === 'unsupported' ? 'Недоступны' : 'Не включены'}
            right={permission === 'default' ? <Button size="sm" onClick={enable}>Включить</Button> : undefined}
          />
        </SettingsSection>

        <SettingsSection title="Что присылать">
          <SettingsRow icon={<MessageCircle size={18} />} title="Сообщения" hint="Личные чаты и группы (кроме «без звука»)" right={<Switch checked={settings.messages} onChange={(v) => setNotifySettings({ messages: v })} label="Сообщения" />} />
          <SettingsRow icon={<ListTodo size={18} />} tone="warning" title="Задачи" hint="Назначения, проверка и её итоги" right={<Switch checked={settings.tasks} onChange={(v) => setNotifySettings({ tasks: v })} label="Задачи" />} />
          <SettingsRow icon={<Eye size={18} />} tone="info" title="Показывать текст" hint="Иначе — просто «Новое сообщение»" right={<Switch checked={settings.preview} onChange={(v) => setNotifySettings({ preview: v })} label="Показывать текст" />} />
        </SettingsSection>

        <SettingsSection title="Проверка">
          <SettingsRow icon={<BellRing size={18} />} title="Показать уведомление о сообщении" onClick={() => test('message')} />
          <SettingsRow icon={<BellRing size={18} />} tone="danger" title="Показать уведомление о задаче" onClick={() => test('task')} />
        </SettingsSection>
        <p className={s.footer}>Настройки звука — в настройках браузера и системы.</p>
      </PageBody>
    </Page>
  );
}
