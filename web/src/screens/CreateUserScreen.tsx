import React from 'react';
import styled from 'styled-components';
import { UserPlus } from 'lucide-react';

const CreateUserScreen: React.FC = () => (
  <Container>
    <Header>
      <UserPlus size={48} color="#F59E0B" strokeWidth={1.5} />
      <Title>Новый сотрудник</Title>
      <Subtitle>Добавление пользователя в систему</Subtitle>
      <ComingSoon>Функция в разработке</ComingSoon>
      <BackLink href="/settings">← Вернуться к настройкам</BackLink>
    </Header>
  </Container>
);

export default CreateUserScreen;

const Container = styled.div`
  min-height: 100vh;
  background: #FAFAF8;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
`;

const Header = styled.div`
  text-align: center;
  max-width: 500px;
`;

const Title = styled.h1`
  font-size: 32px;
  font-weight: 900;
  color: #141414;
  margin: 16px 0 8px;
`;

const Subtitle = styled.p`
  font-size: 16px;
  color: #6F6F73;
  margin-bottom: 24px;
`;

const ComingSoon = styled.div`
  display: inline-block;
  padding: 8px 20px;
  background: #FEF3C7;
  color: #F59E0B;
  border-radius: 999px;
  font-weight: 700;
  font-size: 14px;
  margin-bottom: 24px;
`;

const BackLink = styled.a`
  color: #1F7A52;
  text-decoration: none;
  font-weight: 600;
  
  &:hover {
    text-decoration: underline;
  }
`;
