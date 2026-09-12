import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import {
  FileSpreadsheet,
  TreePine,
  UserPlus,
  LogOut,
  ChevronRight,
  Crown,
  Shield,
  Settings as SettingsIcon,
} from 'lucide-react';
import { api } from '../services/api';

const AVATAR_COLORS = [
  '#1F7A52', '#3B82F6', '#8B5CF6', '#EC4899',
  '#F59E0B', '#0EA5E9', '#14B8A6', '#EF4444',
];

const hashColor = (s: string) => {
  const sum = (s || '?').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
};

const initials = (name: string) =>
  (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

const SettingsScreen: React.FC = () => {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    api.getCurrentUser().then(setCurrentUser).catch(console.error);
  }, []);

  const handleLogout = () => {
    if (window.confirm('Выйти из аккаунта? Потребуется повторный вход')) {
      localStorage.removeItem('token');
      navigate('/login');
    }
  };

  const goToProfile = () => {
    navigate('/profile');
  };

  const adminActions = [
    {
      id: 'import-excel',
      icon: FileSpreadsheet,
      title: 'Импорт из Excel',
      description: 'Загрузка KPI и отчётов продаж',
      color: '#3B82F6',
      bg: '#DBEAFE',
      path: '/import',
    },
    {
      id: 'role-tree',
      icon: TreePine,
      title: 'Дерево ролей',
      description: 'Иерархия и управление правами',
      color: '#8B5CF6',
      bg: '#EDE9FE',
      path: '/roles',
    },
    {
      id: 'create-user',
      icon: UserPlus,
      title: 'Новый сотрудник',
      description: 'Добавить пользователя в систему',
      color: '#F59E0B',
      bg: '#FEF3C7',
      path: '/create-user',
    },
  ];

  const name = currentUser?.display_name || currentUser?.username || '';
  const roleName = currentUser?.role_name || 'Сотрудник';
  const isAdmin =
    roleName === 'director' ||
    roleName === 'admin' ||
    (roleName || '').toLowerCase().includes('руководитель');

  return (
    <Container>
      <Content>
        {/* HERO HEADER */}
        <HeroSection>
          <BigTitle>НАСТРОЙКИ</BigTitle>
          <BigSubtitle>Управление системой и аккаунтом</BigSubtitle>
        </HeroSection>

        {/* PROFILE CARD */}
        {currentUser && (
          <ProfileCard onClick={goToProfile}>
            <ProfileRow>
              <ProfileAvatar bgColor={currentUser.avatar_url ? '#ECECE8' : hashColor(name)}>
                {currentUser.avatar_url ? (
                  <ProfileAvatarImg src={`https://offixcrm.ru${currentUser.avatar_url}`} alt={name} />
                ) : (
                  <ProfileAvatarText>{initials(name)}</ProfileAvatarText>
                )}
              </ProfileAvatar>
              <ProfileInfo>
                <ProfileName>{name}</ProfileName>
                <RoleRow>
                  <RoleBadge bgColor="#ECFDF5">
                    {isAdmin ? (
                      <Crown size={10} color="#1F7A52" strokeWidth={2.5} />
                    ) : (
                      <Shield size={10} color="#1F7A52" strokeWidth={2.5} />
                    )}
                    <RoleBadgeText color="#1F7A52">
                      {roleName === 'director' ? 'Директор' : roleName === 'admin' ? 'Администратор' : roleName}
                    </RoleBadgeText>
                  </RoleBadge>
                </RoleRow>
                {currentUser.email && <ProfileEmail>{currentUser.email}</ProfileEmail>}
              </ProfileInfo>
              <ChevronRight size={18} color="#BDBDBD" strokeWidth={2} />
            </ProfileRow>
          </ProfileCard>
        )}

        {/* ADMIN SECTION */}
        {isAdmin && (
          <>
            <SectionTitle>АДМИНИСТРИРОВАНИЕ</SectionTitle>
            <Card>
              {adminActions.map((a, i) => {
                const Icon = a.icon;
                return (
                  <ActionRow key={a.id} isFirst={i === 0} onClick={() => navigate(a.path)}>
                    <ActionIconWrap bgColor={a.bg}>
                      <Icon size={20} color={a.color} strokeWidth={2} />
                    </ActionIconWrap>
                    <ActionInfo>
                      <ActionTitle>{a.title}</ActionTitle>
                      <ActionSub>{a.description}</ActionSub>
                    </ActionInfo>
                    <ChevronRight size={18} color="#BDBDBD" strokeWidth={2} />
                  </ActionRow>
                );
              })}
            </Card>
          </>
        )}

        {/* ACCOUNT SECTION */}
        <SectionTitle>АККАУНТ</SectionTitle>
        <DangerCard>
          <DangerRow onClick={handleLogout}>
            <ActionIconWrap bgColor="#FEE2E2">
              <LogOut size={20} color="#DC2626" strokeWidth={2} />
            </ActionIconWrap>
            <ActionInfo>
              <DangerTitle>Выйти из аккаунта</DangerTitle>
              <DangerSub>Потребуется повторный вход</DangerSub>
            </ActionInfo>
            <ChevronRight size={18} color="#BDBDBD" strokeWidth={2} />
          </DangerRow>
        </DangerCard>

        {/* FOOTER */}
        <Footer>
          <SettingsIcon size={14} color="#BDBDBD" strokeWidth={2} />
          <FooterText>коммуникационный шлюз Dixit</FooterText>
        </Footer>
      </Content>
    </Container>
  );
};

export default SettingsScreen;

// ===== STYLED COMPONENTS =====

const Container = styled.div`
  min-height: 100vh;
  background: #FAFAF8;
  padding: 20px;
`;

const Content = styled.div`
  max-width: 800px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

// HERO
const HeroSection = styled.div`
  margin-bottom: 8px;
  padding-top: 8px;
`;

const BigTitle = styled.h1`
  font-size: 40px;
  font-weight: 900;
  color: #141414;
  letter-spacing: -0.5px;
  line-height: 44px;
  margin: 0;
`;

const BigSubtitle = styled.p`
  font-size: 16px;
  font-style: italic;
  color: #6F6F73;
  margin: 4px 0 0 0;
`;

// PROFILE CARD
const ProfileCard = styled.div`
  background: #FFFFFF;
  border-radius: 22px;
  padding: 20px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
  cursor: pointer;
  transition: transform 0.2s;

  &:hover {
    transform: translateY(-2px);
  }
`;

const ProfileRow = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
`;

const ProfileAvatar = styled.div<{ bgColor: string }>`
  width: 56px;
  height: 56px;
  border-radius: 28px;
  background: ${(p) => p.bgColor};
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
`;

const ProfileAvatarImg = styled.img`
  width: 56px;
  height: 56px;
  border-radius: 28px;
`;

const ProfileAvatarText = styled.span`
  color: #FFFFFF;
  font-weight: 700;
  font-size: 18px;
`;

const ProfileInfo = styled.div`
  flex: 1;
`;

const ProfileName = styled.div`
  font-size: 18px;
  font-weight: 700;
  color: #141414;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const RoleRow = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 4px;
`;

const RoleBadge = styled.div<{ bgColor: string }>`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 999px;
  background: ${(p) => p.bgColor};
`;

const RoleBadgeText = styled.span<{ color: string }>`
  font-size: 11px;
  font-weight: 700;
  color: ${(p) => p.color};
`;

const ProfileEmail = styled.div`
  font-size: 13px;
  color: #6F6F73;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

// SECTIONS
const SectionTitle = styled.h2`
  font-size: 20px;
  font-weight: 900;
  color: #141414;
  letter-spacing: 1px;
  margin: 8px 0 4px 0;
`;

// CARD
const Card = styled.div`
  background: #FFFFFF;
  border-radius: 22px;
  padding: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
`;

// ACTION ROW
const ActionRow = styled.div<{ isFirst: boolean }>`
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 12px;
  border-radius: 16px;
  cursor: pointer;
  transition: background 0.2s;
  border-top: ${(p) => (p.isFirst ? 'none' : '1px solid #F4F4F5')};

  &:hover {
    background: #F9FAFB;
  }
`;

const ActionIconWrap = styled.div<{ bgColor: string }>`
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: ${(p) => p.bgColor};
  display: flex;
  align-items: center;
  justify-content: center;
`;

const ActionInfo = styled.div`
  flex: 1;
`;

const ActionTitle = styled.div`
  font-size: 15px;
  font-weight: 700;
  color: #141414;
  margin-bottom: 2px;
`;

const ActionSub = styled.div`
  font-size: 12px;
  color: #6F6F73;
  font-weight: 500;
`;

// DANGER CARD
const DangerCard = styled.div`
  background: #FFFFFF;
  border-radius: 22px;
  padding: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
`;

const DangerRow = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 12px;
  border-radius: 16px;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: #F9FAFB;
  }
`;

const DangerTitle = styled.div`
  font-size: 15px;
  font-weight: 700;
  color: #DC2626;
  margin-bottom: 2px;
`;

const DangerSub = styled.div`
  font-size: 12px;
  color: #6F6F73;
  font-weight: 500;
`;

// FOOTER
const Footer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 24px;
`;

const FooterText = styled.span`
  font-size: 12px;
  color: #BDBDBD;
  font-weight: 500;
`;
