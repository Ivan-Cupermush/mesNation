import React from 'react';
import styled from 'styled-components';
import { Settings, Shield, Bell, Database, AlertTriangle } from 'lucide-react';

const SettingsScreen: React.FC = () => (
  <Container>
    <Header><Title><Settings size={32} color="#1F7A52" /> Настройки</Title></Header>
    <Content>
      <Card><CardIcon><Shield size={20} color="#1F7A52" /></CardIcon><CardTitle>Безопасность</CardTitle><CardText>Пароль, двухфакторная аутентификация</CardText><Badge>Скоро</Badge></Card>
      <Card><CardIcon><Bell size={20} color="#1F7A52" /></CardIcon><CardTitle>Уведомления</CardTitle><CardText>Email и push-уведомления</CardText><Badge>Скоро</Badge></Card>
      <Card><CardIcon><Database size={20} color="#1F7A52" /></CardIcon><CardTitle>База знаний</CardTitle><CardText>Управление документами AI-ассистента</CardText><Badge>Скоро</Badge></Card>
      <DangerZone>
        <DangerHeader><AlertTriangle size={18} color="#DC2626" /><span>Опасная зона</span></DangerHeader>
        <DangerText>Удаление аккаунта и данных компании</DangerText>
        <DangerButton>Удалить аккаунт</DangerButton>
      </DangerZone>
    </Content>
  </Container>
);

export default SettingsScreen;

const Container = styled.div`max-width: 960px; margin: 0 auto;`;
const Header = styled.div`padding: 32px 24px 24px; border-bottom: 1px solid #E5E5E5;`;
const Title = styled.h1`font-family: 'Bebas Neue', sans-serif; font-size: 40px; color: #141414; display: flex; align-items: center; gap: 12px; margin: 0;`;
const Content = styled.div`padding: 24px; display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px;`;
const Card = styled.div`background: #fff; border: 1px solid #E5E5E5; border-radius: 16px; padding: 24px; position: relative;`;
const CardIcon = styled.div`width: 44px; height: 44px; border-radius: 12px; background: #E8F3EE; display: flex; align-items: center; justify-content: center; margin-bottom: 16px;`;
const CardTitle = styled.h3`font-size: 18px; color: #141414; margin: 0 0 4px; font-weight: 700;`;
const CardText = styled.p`font-size: 14px; color: #6F6F73; margin: 0;`;
const Badge = styled.span`position: absolute; top: 16px; right: 16px; padding: 4px 10px; background: #FFF4E5; color: #D97706; border-radius: 8px; font-size: 11px; font-weight: 600;`;
const DangerZone = styled.div`grid-column: 1 / -1; background: #FEF2F2; border: 1px solid #FECACA; border-radius: 16px; padding: 24px; margin-top: 16px;`;
const DangerHeader = styled.div`display: flex; align-items: center; gap: 8px; font-weight: 700; color: #DC2626; margin-bottom: 8px;`;
const DangerText = styled.p`font-size: 14px; color: #7F1D1D; margin: 0 0 16px;`;
const DangerButton = styled.button`padding: 10px 20px; background: #DC2626; color: #fff; border: none; border-radius: 10px; font-weight: 600; cursor: pointer; &:hover { background: #991B1B; }`;
