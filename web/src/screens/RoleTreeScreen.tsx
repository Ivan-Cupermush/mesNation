import React from 'react';
import styled from 'styled-components';
import { TreePine } from 'lucide-react';

const RoleTreeScreen: React.FC = () => (
  <Container>
    <Header>
      <TreePine size={48} color="#8B5CF6" strokeWidth={1.5} />
      <Title>Дерево ролей</Title>
      <Subtitle>Управление иерархией и правами сотрудников</Subtitle>
      <ComingSoon>Функция в разработке</ComingSoon>
      <BackLink href="/settings">← Вернуться к настройкам</BackLink>
    </Header>
  </Container>
);

export default RoleTreeScreen;

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
  background: #EDE9FE;
  color: #8B5CF6;
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
