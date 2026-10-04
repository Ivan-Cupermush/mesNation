import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { ChevronLeft, X, CheckCircle } from 'lucide-react';
import { getRoleTree, createUserWithRole } from '../services/api';

const CreateUserScreen: React.FC = () => {
  const navigate = useNavigate();
  const [nodes, setNodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const loadTree = async () => {
    try {
      const data = await getRoleTree();
      setNodes(Array.isArray(data) ? data : []);
    } catch (e: any) {
      alert('Ошибка: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTree(); }, []);

  const handleNodeClick = (node: any) => {
    setSelectedNode(node);
    setUsername('');
    setEmail('');
    setDisplayName('');
    setPassword('');
    setShowForm(true);
  };

  const handleCreate = async () => {
    if (!username.trim() || !email.trim() || !password) {
      alert('Заполните логин, email и пароль');
      return;
    }
    setSaving(true);
    try {
      await createUserWithRole({
        username: username.trim(),
        email: email.trim(),
        password,
        display_name: displayName.trim() || username.trim(),
        role_node_id: selectedNode.id,
      });
      alert(`✅ Пользователь "${username}" добавлен с ролью "${selectedNode.name}"`);
      setShowForm(false);
      navigate('/settings');
    } catch (e: any) {
      alert('Ошибка: ' + (e.message || 'Не удалось создать'));
    } finally {
      setSaving(false);
    }
  };

  const buildTree = () => {
    const map = new Map<number, any>();
    const roots: any[] = [];
    nodes.forEach(n => map.set(n.id, { ...n, children: [] }));
    nodes.forEach(n => {
      const node = map.get(n.id)!;
      if (n.parent_id && map.has(n.parent_id)) {
        map.get(n.parent_id)!.children.push(node);
      } else if (!n.parent_id) {
        roots.push(node);
      }
    });
    return roots;
  };

  const renderNode = (node: any, depth: number = 0) => (
    <NodeWrap key={node.id} style={{ marginLeft: depth * 24 }}>
      <NodeCard 
        onClick={() => handleNodeClick(node)}
        selected={selectedNode?.id === node.id}
      >
        <NodeIcon bgColor={node.color || '#6366F1'}>
          {node.icon || '👤'}
        </NodeIcon>
        <NodeInfo>
          <NodeName>{node.name}</NodeName>
          {node.users_count > 0 && <NodeMeta>👥 {node.users_count}</NodeMeta>}
        </NodeInfo>
        {selectedNode?.id === node.id && (
          <CheckCircle size={20} color="#1F7A52" />
        )}
      </NodeCard>
      {node.children && node.children.map((child: any) => renderNode(child, depth + 1))}
    </NodeWrap>
  );

  if (loading) return <Loading>Загрузка дерева...</Loading>;

  const tree = buildTree();

  return (
    <Container>
      <Header>
        <BackBtn onClick={() => navigate('/settings')}>
          <ChevronLeft size={22} color="#1F7A52" strokeWidth={2.5} />
        </BackBtn>
        <HeaderInfo>
          <HeaderTitle>НОВЫЙ СОТРУДНИК</HeaderTitle>
          <HeaderSubtitle>Выберите роль для нового пользователя</HeaderSubtitle>
        </HeaderInfo>
      </Header>

      <Hint>
        <span>👆 Нажми на роль в дереве, чтобы назначить её новому пользователю</span>
      </Hint>

      <TreeWrap>
        {tree.length === 0 ? (
          <Empty>Дерево ролей пусто</Empty>
        ) : (
          tree.map(n => renderNode(n, 0))
        )}
      </TreeWrap>

      {showForm && (
        <ModalOverlay onClick={() => setShowForm(false)}>
          <ModalContent onClick={e => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>Новый пользователь</ModalTitle>
              <CloseBtn onClick={() => setShowForm(false)}><X size={20} /></CloseBtn>
            </ModalHeader>

            <RoleBadge bgColor={selectedNode?.color || '#6366F1'}>
              <span>{selectedNode?.icon} {selectedNode?.name}</span>
            </RoleBadge>

            <Label>Логин *</Label>
            <Input value={username} onChange={e => setUsername(e.target.value)} placeholder="ivan" autoFocus />

            <Label>Отображаемое имя</Label>
            <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Иван Иванов" />

            <Label>Email *</Label>
            <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="ivan@test.com" type="email" />

            <Label>Пароль *</Label>
            <Input value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••" type="password" />

            <ModalBtns>
              <BtnSecondary onClick={() => setShowForm(false)}>Отмена</BtnSecondary>
              <BtnPrimary onClick={handleCreate} disabled={saving}>
                {saving ? 'Создаём...' : 'Создать'}
              </BtnPrimary>
            </ModalBtns>
          </ModalContent>
        </ModalOverlay>
      )}
    </Container>
  );
};

export default CreateUserScreen;

// ===== STYLED COMPONENTS =====
const Container = styled.div`
  min-height: 100vh;
  background: #FAFAF8;
  font-family: system-ui, -apple-system, sans-serif;
`;

const Header = styled.div`
  display: flex; align-items: center; gap: 14px;
  padding: 20px;
  background: #fff; border-bottom: 1px solid #F4F4F5;
`;

const BackBtn = styled.button`
  width: 40px; height: 40px; border-radius: 20px;
  background: #fff; border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  &:hover { background: #F9FAFB; }
`;

const HeaderInfo = styled.div`flex: 1;`;
const HeaderTitle = styled.h1`
  font-size: 24px; font-weight: 900; color: #141414; margin: 0;
`;
const HeaderSubtitle = styled.p`
  font-size: 13px; font-style: italic; color: #6F6F73; margin: 2px 0 0;
`;

const Hint = styled.div`
  padding: 8px 20px;
  background: rgba(99, 102, 241, 0.08);
  font-size: 13px; color: #6F6F73;
`;

const TreeWrap = styled.div`
  padding: 20px;
  max-width: 900px;
  margin: 0 auto;
`;

const Loading = styled.div`
  display: flex; align-items: center; justify-content: center;
  height: 100vh; font-size: 16px; color: #6F6F73;
`;

const Empty = styled.div`
  text-align: center; padding: 60px 20px;
  color: #6F6F73; font-size: 16px;
`;

const NodeWrap = styled.div`margin-bottom: 8px;`;

const NodeCard = styled.div<{ selected?: boolean }>`
  display: flex; align-items: center; gap: 14px;
  padding: 14px 16px;
  background: ${p => p.selected ? '#ECFDF5' : '#fff'};
  border-radius: 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
  border: ${p => p.selected ? '2px solid #1F7A52' : '2px solid transparent'};
  cursor: pointer; transition: all 0.2s;
  &:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
`;

const NodeIcon = styled.div<{ bgColor: string }>`
  width: 44px; height: 44px; border-radius: 14px;
  background: ${p => p.bgColor};
  display: flex; align-items: center; justify-content: center;
  font-size: 22px;
`;

const NodeInfo = styled.div`flex: 1;`;
const NodeName = styled.div`
  font-size: 16px; font-weight: 700; color: #141414;
  margin-bottom: 2px;
`;
const NodeMeta = styled.div`
  font-size: 12px; color: #6F6F73; font-weight: 500;
`;

// ===== MODAL =====
const ModalOverlay = styled.div`
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000; padding: 20px;
`;

const ModalContent = styled.div`
  background: #fff; border-radius: 24px;
  padding: 24px; width: 100%; max-width: 500px;
  max-height: 85vh; overflow-y: auto;
`;

const ModalHeader = styled.div`
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 20px;
`;

const ModalTitle = styled.h2`
  font-size: 20px; font-weight: 700; color: #141414; margin: 0;
`;

const CloseBtn = styled.button`
  width: 36px; height: 36px; border-radius: 18px;
  background: #F4F4F5; border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  &:hover { background: #E4E4E7; }
`;

const RoleBadge = styled.div<{ bgColor: string }>`
  display: inline-flex; align-items: center;
  padding: 8px 16px; border-radius: 20px;
  background: ${p => p.bgColor};
  color: #fff; font-weight: 600; font-size: 14px;
  margin-bottom: 16px;
`;

const Label = styled.div`
  font-size: 13px; font-weight: 600; color: #6F6F73;
  margin: 12px 0 6px;
`;

const Input = styled.input`
  width: 100%; padding: 14px; border-radius: 10px;
  border: 1px solid #E4E4E7; font-size: 16px;
  outline: none;
  &:focus { border-color: #1F7A52; }
`;

const ModalBtns = styled.div`
  display: flex; gap: 12px; margin-top: 24px;
`;

const BtnBase = styled.button`
  flex: 1; padding: 14px; border-radius: 12px;
  font-size: 15px; font-weight: 600; cursor: pointer;
  border: none; transition: opacity 0.2s;
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const BtnSecondary = styled(BtnBase)`
  background: #F4F4F5; color: #141414;
  &:hover:not(:disabled) { background: #E4E4E7; }
`;

const BtnPrimary = styled(BtnBase)`
  background: #1F7A52; color: #fff;
  &:hover:not(:disabled) { background: #176343; }
`;
