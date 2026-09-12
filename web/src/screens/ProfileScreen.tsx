import React, { useState } from 'react';
import styled from 'styled-components';
import { User, Edit2, Save, X } from 'lucide-react';
import { api } from '../services/api';
import { getCurrentUser, setCurrentUser } from '../utils';

const ProfileScreen: React.FC = () => {
  const user = getCurrentUser();
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await api.updateProfile({ display_name: displayName, email });
      setCurrentUser({ ...user, ...updated });
      setEditing(false);
    } catch (e: any) { alert('Ошибка: ' + e.message); } finally { setSaving(false); }
  };

  return (
    <Container>
      <Header><Title><User size={32} color="#1F7A52" /> Профиль</Title></Header>
      <Content>
        <Card>
          <AvatarBox>
            <AvatarBig>{(user?.display_name || user?.username || '?').charAt(0).toUpperCase()}</AvatarBig>
            <RoleBadge>{user?.role_name || 'Сотрудник'}</RoleBadge>
          </AvatarBox>
          <InfoRow><Label>Имя</Label>{editing ? <Input value={displayName} onChange={e => setDisplayName(e.target.value)} /> : <Value>{user?.display_name || user?.username}</Value>}</InfoRow>
          <InfoRow><Label>Email</Label>{editing ? <Input value={email} onChange={e => setEmail(e.target.value)} /> : <Value>{user?.email || '—'}</Value>}</InfoRow>
          <InfoRow><Label>Логин</Label><Value>{user?.username}</Value></InfoRow>
          <Actions>
            {editing ? (
              <>
                <Button $primary onClick={handleSave} disabled={saving}><Save size={16} /> {saving ? 'Сохранение...' : 'Сохранить'}</Button>
                <Button onClick={() => setEditing(false)}><X size={16} /> Отмена</Button>
              </>
            ) : (
              <Button onClick={() => setEditing(true)}><Edit2 size={16} /> Редактировать</Button>
            )}
          </Actions>
        </Card>
      </Content>
    </Container>
  );
};

export default ProfileScreen;

const Container = styled.div`max-width: 960px; margin: 0 auto;`;
const Header = styled.div`padding: 32px 24px 24px; border-bottom: 1px solid #E5E5E5;`;
const Title = styled.h1`font-family: 'Bebas Neue', sans-serif; font-size: 40px; color: #141414; display: flex; align-items: center; gap: 12px; margin: 0;`;
const Content = styled.div`padding: 24px;`;
const Card = styled.div`background: #fff; border: 1px solid #E5E5E5; border-radius: 16px; padding: 32px; max-width: 600px;`;
const AvatarBox = styled.div`display: flex; flex-direction: column; align-items: center; margin-bottom: 32px;`;
const AvatarBig = styled.div`width: 96px; height: 96px; border-radius: 50%; background: #E8F3EE; display: flex; align-items: center; justify-content: center; font-size: 40px; font-weight: 700; color: #1F7A52; margin-bottom: 12px;`;
const RoleBadge = styled.span`padding: 4px 12px; background: #E8F3EE; color: #1F7A52; border-radius: 12px; font-size: 12px; font-weight: 600;`;
const InfoRow = styled.div`padding: 16px 0; border-bottom: 1px solid #F0F0F0; &:last-of-type { border-bottom: none; }`;
const Label = styled.div`font-size: 12px; color: #6F6F73; margin-bottom: 4px; font-weight: 600;`;
const Value = styled.div`font-size: 16px; color: #141414;`;
const Input = styled.input`width: 100%; padding: 8px 12px; border: 1px solid #E5E5E5; border-radius: 8px; font-size: 16px; color: #141414; &:focus { outline: none; border-color: #1F7A52; }`;
const Actions = styled.div`display: flex; gap: 12px; margin-top: 24px;`;
const Button = styled.button<{ $primary?: boolean }>`padding: 10px 20px; border-radius: 10px; border: 1px solid #E5E5E5; background: ${p => (p.$primary ? '#1F7A52' : '#fff')}; color: ${p => (p.$primary ? '#fff' : '#141414')}; font-size: 14px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; &:hover { background: ${p => (p.$primary ? '#185f40' : '#F5F5F5')}; } &:disabled { opacity: 0.6; cursor: not-allowed; }`;

