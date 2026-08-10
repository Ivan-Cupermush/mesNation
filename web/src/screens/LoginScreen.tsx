import React, { useState } from 'react';
import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { LogIn, User, Lock, Loader2 } from 'lucide-react';
import { api } from '../services/api';
import { setToken, setCurrentUser } from '../utils';
import { theme } from '../styles/theme';

const LoginScreen: React.FC = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Введите логин и пароль');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await api.login(username, password);
      setToken(response.token);
      setCurrentUser(response.user);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Неверный логин или пароль');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container>
      <Card>
        <HeroHeader>
          <BrandMark>MN</BrandMark>
          <BigTitle>ВХОД</BigTitle>
          <Subtitle>в CRM-систему</Subtitle>
        </HeroHeader>

        {error && (
          <ErrorBox>
            <span>⚠</span>
            <span>{error}</span>
          </ErrorBox>
        )}

        <Form onSubmit={handleLogin}>
          <InputGroup>
            <InputIconWrap>
              <User size={18} color={theme.colors.primary} strokeWidth={2.2} />
            </InputIconWrap>
            <Input
              type="text"
              placeholder="Логин"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </InputGroup>

          <InputGroup>
            <InputIconWrap>
              <Lock size={18} color={theme.colors.primary} strokeWidth={2.2} />
            </InputIconWrap>
            <Input
              type="password"
              placeholder="Пароль"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </InputGroup>

          <Button type="submit" disabled={loading}>
            {loading ? (
              <Loader2 size={20} color="#fff" style={{ animation: 'spin 1s linear infinite' }} />
            ) : (
              <>
                <LogIn size={18} color="#fff" strokeWidth={2.5} />
                <span>Войти</span>
              </>
            )}
          </Button>
        </Form>

        <Footer>
          mesNation CRM · {new Date().getFullYear()}
        </Footer>
      </Card>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </Container>
  );
};

export default LoginScreen;

// ===== STYLED COMPONENTS =====
const Container = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: ${theme.colors.background};
`;

const Card = styled.div`
  width: 100%;
  max-width: 440px;
  background: ${theme.colors.surface};
  border-radius: ${theme.radius.lg};
  padding: 48px 40px;
  box-shadow: ${theme.shadows.card};
`;

const HeroHeader = styled.div`
  text-align: center;
  margin-bottom: 36px;
`;

const BrandMark = styled.div`
  width: 64px;
  height: 64px;
  margin: 0 auto 20px;
  border-radius: 18px;
  background: ${theme.colors.primary};
  color: #fff;
  font-family: ${theme.fonts.display};
  font-size: 28px;
  font-weight: 900;
  letter-spacing: 1px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: ${theme.shadows.button};
`;

const BigTitle = styled.h1`
  font-family: ${theme.fonts.display};
  font-size: 56px;
  font-weight: 900;
  letter-spacing: -0.5px;
  line-height: 1;
  color: ${theme.colors.textPrimary};
  margin-bottom: 8px;
`;

const Subtitle = styled.p`
  font-family: ${theme.fonts.serif};
  font-style: italic;
  font-size: 18px;
  color: ${theme.colors.textSecondary};
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const InputGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  background: ${theme.colors.background};
  border: 1px solid ${theme.colors.borderLight};
  border-radius: ${theme.radius.md};
  padding: 4px 16px 4px 4px;
  transition: border-color 0.2s;

  &:focus-within {
    border-color: ${theme.colors.primary};
  }
`;

const InputIconWrap = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: ${theme.colors.primaryLight};
  display: flex;
  align-items: center;
  justify-content: center;
`;

const Input = styled.input`
  flex: 1;
  padding: 14px 0;
  font-size: 15px;
  font-weight: 500;
  color: ${theme.colors.textPrimary};

  &::placeholder {
    color: ${theme.colors.textMuted};
  }
`;

const Button = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  padding: 16px;
  margin-top: 8px;
  background: ${theme.colors.primary};
  color: #fff;
  border-radius: ${theme.radius.md};
  font-size: 15px;
  font-weight: 700;
  box-shadow: ${theme.shadows.button};
  transition: transform 0.15s, box-shadow 0.15s;

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 10px 20px rgba(31, 122, 82, 0.35);
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }

  &:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
`;

const ErrorBox = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  background: ${theme.colors.dangerLight};
  color: #991B1B;
  padding: 12px 16px;
  border-radius: ${theme.radius.sm};
  margin-bottom: 20px;
  font-size: 13px;
  font-weight: 500;
`;

const Footer = styled.div`
  text-align: center;
  margin-top: 28px;
  font-size: 12px;
  color: ${theme.colors.textMuted};
  font-weight: 500;
`;
