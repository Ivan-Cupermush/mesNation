import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import styled from 'styled-components';
import { BarChart3, ListTodo, BookOpen, Sparkles, Settings, LogOut, User, Menu, X } from 'lucide-react';
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
  const location = useLocation();
  const user = getCurrentUser();
  const [menuOpen, setMenuOpen] = useState(false);

  // Закрываем меню при смене роута
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Блокируем скролл body когда меню открыто
  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  const handleLogout = () => {
    clearToken();
    navigate('/login');
  };

  return (
    <Wrapper>
      <Burger onClick={() => setMenuOpen(v => !v)} aria-label="Меню">
        {menuOpen ? <X size={22} /> : <Menu size={22} />}
      </Burger>

      {menuOpen && <Overlay onClick={() => setMenuOpen(false)} />}

      <Sidebar $open={menuOpen}>
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
              <NavItem key={item.to} to={item.to} end={item.end} onClick={() => setMenuOpen(false)}>
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

const Burger = styled.button`
  display: none;

  @media (max-width: 768px) {
    display: flex;
    position: fixed;
    top: 12px;
    left: 12px;
    z-index: 1100;
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: ${theme.colors.surface};
    border: 1px solid ${theme.colors.border};
    color: ${theme.colors.textPrimary};
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    cursor: pointer;
  }
`;

const Overlay = styled.div`
  display: none;

  @media (max-width: 768px) {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 999;
    backdrop-filter: blur(2px);
  }
`;

const Sidebar = styled.aside<{ $open: boolean }>`
  width: 260px;
  background: ${theme.colors.surface};
  border-right: 1px solid ${theme.colors.border};
  display: flex;
  flex-direction: column;
  padding: 24px 16px;
  position: sticky;
  top: 0;
  height: 100vh;

  @media (max-width: 768px) {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    height: 100vh;
    z-index: 1000;
    transform: translateX(${p => (p.$open ? '0' : '-100%')});
    transition: transform 0.25s ease;
    box-shadow: ${p => (p.$open ? '8px 0 24px rgba(0, 0, 0, 0.15)' : 'none')};
    border-right: none;
  }
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
  flex-shrink: 0;
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
  overflow-y: auto;
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

  @media (max-width: 768px) {
    padding: 14px 16px;
    font-size: 15px;
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
  flex-shrink: 0;
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
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
  flex-shrink: 0;

  &:hover {
    background: ${theme.colors.dangerLight};
    color: ${theme.colors.danger};
  }
`;

const Main = styled.main`
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 24px;

  @media (max-width: 768px) {
    padding: 72px 12px 12px;
  }
`;
