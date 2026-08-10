import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { BarChart3, ListTodo, BookOpen, Sparkles, Settings, LogOut, User } from 'lucide-react';
import { theme } from '../styles/theme';
import { getCurrentUser, clearToken } from '../utils';

const navItems = [
  { to: '/', label: 'Статистика', icon: BarChart3, end: true },
  { to: '/tasks', label: 'Задачи', icon: ListTodo, end: false },
  { to: '/notes', label: 'Заметки', icon: BookOpen, end: false },
  { to: '/knowledge', label: 'База знаний', icon: Sparkles, end: false },
  { to: '/settings', label: 'Настройки', icon: Settings, end: false },
  { to: '/profile', label: 'Профиль', icon: User, end: false },
];

const Layout: React.FC = () => {
  const navigate = useNavigate();
  const user = getCurrentUser();

  const handleLogout = () => {
    clearToken();
    navigate('/login');
  };

  return (
    <Wrapper>
      <Sidebar>
        <Brand>
          <BrandMark>MN</BrandMark>
          <div>
            <BrandName>mesNation</BrandName>
            <BrandSub>CRM-система</BrandSub>
          </div>
        </Brand>

        <Nav>
          {navItems.map(item => {
            const Icon = item.icon;
            return (
              <NavItem key={item.to} to={item.to} end={item.end}>
                <Icon size={20} strokeWidth={2.2} />
                <span>{item.label}</span>
              </NavItem>
            );
          })}
        </Nav>

        <UserBox>
          <Avatar>{(user?.display_name || user?.username || '?').charAt(0).toUpperCase()}</Avatar>
          <UserInfo>
            <UserName>{user?.display_name || user?.username || 'Пользователь'}</UserName>
            <UserRole>{user?.role_name || 'Сотрудник'}</UserRole>
          </UserInfo>
          <LogoutBtn onClick={handleLogout} title="Выйти">
            <LogOut size={18} strokeWidth={2.2} />
          </LogoutBtn>
        </UserBox>
      </Sidebar>

      <Main>
        <Outlet />
      </Main>
    </Wrapper>
  );
};

export default Layout;

// ===== STYLED =====
const Wrapper = styled.div`
  display: flex;
  min-height: 100vh;
  background: ${theme.colors.background};
`;

const Sidebar = styled.aside`
  width: 260px;
  background: ${theme.colors.surface};
  border-right: 1px solid ${theme.colors.border};
  display: flex;
  flex-direction: column;
  padding: 24px 16px;
  position: sticky;
  top: 0;
  height: 100vh;
`;

const Brand = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 8px 24px;
  border-bottom: 1px solid ${theme.colors.borderLight};
  margin-bottom: 24px;
`;

const BrandMark = styled.div`
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: ${theme.colors.primary};
  color: #fff;
  font-family: ${theme.fonts.display};
  font-size: 20px;
  font-weight: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: ${theme.shadows.button};
`;

const BrandName = styled.div`
  font-weight: 800;
  font-size: 16px;
  color: ${theme.colors.textPrimary};
`;

const BrandSub = styled.div`
  font-size: 11px;
  color: ${theme.colors.textSecondary};
  font-weight: 500;
`;

const Nav = styled.nav`
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
`;

const NavItem = styled(NavLink)`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 14px;
  color: ${theme.colors.textSecondary};
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  transition: background 0.2s, color 0.2s;

  &:hover {
    background: ${theme.colors.borderLight};
    color: ${theme.colors.textPrimary};
  }

  &.active {
    background: ${theme.colors.primaryLight};
    color: ${theme.colors.primary};
  }
`;

const UserBox = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 8px 0;
  border-top: 1px solid ${theme.colors.borderLight};
`;

const Avatar = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 14px;
  background: ${theme.colors.primary};
  color: #fff;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const UserInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const UserName = styled.div`
  font-size: 13px;
  font-weight: 700;
  color: ${theme.colors.textPrimary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const UserRole = styled.div`
  font-size: 11px;
  color: ${theme.colors.textSecondary};
  font-weight: 500;
`;

const LogoutBtn = styled.button`
  width: 36px;
  height: 36px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${theme.colors.textSecondary};
  transition: background 0.2s, color 0.2s;

  &:hover {
    background: ${theme.colors.dangerLight};
    color: ${theme.colors.danger};
  }
`;

const Main = styled.main`
  flex: 1;
  min-width: 0;
  overflow-y: auto;
`;
