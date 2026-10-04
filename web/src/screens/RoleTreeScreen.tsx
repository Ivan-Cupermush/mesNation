import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { ChevronLeft, Plus, X } from 'lucide-react';
import { getRoleTree, createRoleNode, updateRoleNode, deleteRoleNode } from '../services/api';

const COLORS = ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
const ICONS = ['👤', '💼', '🎯', '⭐', '🔧', '📊', '💻', '🏆', '🚀', '⚡', '🎨', '📈', '🛡️', '📦', '🔑', '🤝'];

const RoleTreeScreen: React.FC = () => {
  const navigate = useNavigate();
  const [nodes, setNodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedParent, setSelectedParent] = useState<any>(null);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(COLORS[0]);
  const [newIcon, setNewIcon] = useState(ICONS[0]);
  const [saving, setSaving] = useState(false);

  const [showEditModal, setShowEditModal] = useState(false);
  const [editingNode, setEditingNode] = useState<any>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState(COLORS[0]);
  const [editIcon, setEditIcon] = useState(ICONS[0]);

  const loadTree = async () => {
    try {
      const data = await getRoleTree();
      setNodes(Array.isArray(data) ? data : []);
    } catch (e: any) {
      alert('Ошибка: ' + (e.message || 'Неизвестно'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTree(); }, []);

  const handleAddChild = (parentNode: any) => {
    setSelectedParent(parentNode);
    setNewName('');
    setNewColor(COLORS[Math.floor(Math.random() * COLORS.length)]);
    setNewIcon(ICONS[Math.floor(Math.random() * ICONS.length)]);
    setShowAddModal(true);
  };

  const handleSaveNew = async () => {
    if (!newName.trim()) { alert('Введите название'); return; }
    setSaving(true);
    try {
      await createRoleNode({
        name: newName.trim(),
        parent_id: selectedParent.id,
        color: newColor,
        icon: newIcon,
      });
      setShowAddModal(false);
      loadTree();
    } catch (e: any) {
      alert('Ошибка: ' + (e.message || 'Неизвестно'));
    } finally {
      setSaving(false);
    }
  };

  const handleNodeClick = (node: any) => {
    setEditingNode(node);
    setEditName(node.name);
    setEditColor(node.color || COLORS[0]);
    setEditIcon(node.icon || ICONS[0]);
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!editName.trim()) { alert('Введите название'); return; }
    setSaving(true);
    try {
      await updateRoleNode(editingNode.id, {
        name: editName.trim(),
        color: editColor,
        icon: editIcon,
      });
      setShowEditModal(false);
      loadTree();
    } catch (e: any) {
      alert('Ошибка: ' + (e.message || 'Неизвестно'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingNode) return;
    if (editingNode.name === 'director' || editingNode.parent_id === null) {
      alert('Нельзя удалить корень дерева (директор)');
      return;
    }
    if (editingNode.users_count && editingNode.users_count > 0) {
      alert(`Нельзя удалить: к роли "${editingNode.name}" привязано пользователей: ${editingNode.users_count}. Сначала переназначьте их на другую роль.`);
      return;
    }
    if (!window.confirm(`Удалить роль "${editingNode.name}"? Дочерние роли будут перепривязаны к родителю.`)) return;

    setSaving(true);
    try {
      await deleteRoleNode(editingNode.id);
      alert(`Роль "${editingNode.name}" удалена`);
      setShowEditModal(false);
      loadTree();
    } catch (e: any) {
      alert('Ошибка: ' + (e.message || 'Не удалось удалить'));
    } finally {
      setSaving(false);
    }
  };

  // Построение дерева из плоского списка
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
    <NodeWrap key={node.id} style={{ marginLeft: depth * 32 }}>
      <NodeCard onClick={() => handleNodeClick(node)}>
        <NodeIcon bgColor={node.color || '#6366F1'}>
          {node.icon || '👤'}
        </NodeIcon>
        <NodeInfo>
          <NodeName>{node.name}</NodeName>
          <NodeMeta>
            {node.users_count > 0 && <span>👥 {node.users_count}</span>}
            {node.description && <span>{node.description}</span>}
          </NodeMeta>
        </NodeInfo>
        <AddChildBtn onClick={(e) => { e.stopPropagation(); handleAddChild(node); }}>
          <Plus size={16} color="#1F7A52" />
        </AddChildBtn>
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
          <HeaderTitle>ДЕРЕВО РОЛЕЙ</HeaderTitle>
          <HeaderSubtitle>Иерархия и управление правами</HeaderSubtitle>
        </HeaderInfo>
      </Header>

      <Hint>
        <span>👆 Узел — редактировать. <strong style={{ color: '#10B981' }}>+</strong> — добавить ребёнка.</span>
      </Hint>

      <TreeWrap>
        {tree.length === 0 ? (
          <Empty>Дерево ролей пусто</Empty>
        ) : (
          tree.map(n => renderNode(n, 0))
        )}
      </TreeWrap>

      {showAddModal && (
        <ModalOverlay onClick={() => setShowAddModal(false)}>
          <ModalContent onClick={e => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>Новая роль под "{selectedParent?.name}"</ModalTitle>
              <CloseBtn onClick={() => setShowAddModal(false)}><X size={20} /></CloseBtn>
            </ModalHeader>
            
            <Label>Название</Label>
            <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Например: Руководитель отдела" autoFocus />

            <Label>Цвет</Label>
            <PickerRow>
              {COLORS.map(c => (
                <ColorCircle key={c} bgColor={c} selected={newColor === c} onClick={() => setNewColor(c)} />
              ))}
            </PickerRow>

            <Label>Иконка</Label>
            <PickerRow>
              {ICONS.map((i, idx) => (
                <IconCircle key={idx} selected={newIcon === i} onClick={() => setNewIcon(i)}>
                  {i}
                </IconCircle>
              ))}
            </PickerRow>

            <ModalBtns>
              <BtnSecondary onClick={() => setShowAddModal(false)}>Отмена</BtnSecondary>
              <BtnPrimary onClick={handleSaveNew} disabled={saving}>
                {saving ? 'Создаём...' : 'Создать'}
              </BtnPrimary>
            </ModalBtns>
          </ModalContent>
        </ModalOverlay>
      )}

      {showEditModal && (
        <ModalOverlay onClick={() => setShowEditModal(false)}>
          <ModalContent onClick={e => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>Редактировать роль</ModalTitle>
              <CloseBtn onClick={() => setShowEditModal(false)}><X size={20} /></CloseBtn>
            </ModalHeader>

            <Label>Название</Label>
            <Input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Название роли" autoFocus />

            <Label>Цвет</Label>
            <PickerRow>
              {COLORS.map(c => (
                <ColorCircle key={c} bgColor={c} selected={editColor === c} onClick={() => setEditColor(c)} />
              ))}
            </PickerRow>

            <Label>Иконка</Label>
            <PickerRow>
              {ICONS.map((i, idx) => (
                <IconCircle key={idx} selected={editIcon === i} onClick={() => setEditIcon(i)}>
                  {i}
                </IconCircle>
              ))}
            </PickerRow>

            {editingNode?.users_count > 0 && (
              <InfoBox>
                ⚠️ К этой роли привязано пользователей: <strong>{editingNode.users_count}</strong>
              </InfoBox>
            )}

            <ModalBtns>
              <BtnSecondary onClick={() => setShowEditModal(false)}>Отмена</BtnSecondary>
              <BtnPrimary onClick={handleSaveEdit} disabled={saving}>
                {saving ? 'Сохраняем...' : 'Сохранить'}
              </BtnPrimary>
            </ModalBtns>

            {editingNode && editingNode.parent_id !== null && editingNode.name !== 'director' && (
              <BtnDanger onClick={handleDelete} disabled={saving}>
                🗑 Удалить роль
              </BtnDanger>
            )}
          </ModalContent>
        </ModalOverlay>
      )}
    </Container>
  );
};

export default RoleTreeScreen;

// ===== STYLED COMPONENTS =====
const Container = styled.div`
  min-height: 100vh;
  background: #FAFAF8;
  font-family: system-ui, -apple-system, sans-serif;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px;
  background: #fff;
  border-bottom: 1px solid #F4F4F5;
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
  font-size: 24px; font-weight: 900; color: #141414;
  letter-spacing: 0.3px; margin: 0;
`;
const HeaderSubtitle = styled.p`
  font-size: 13px; font-style: italic; color: #6F6F73;
  margin: 2px 0 0;
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

const NodeCard = styled.div`
  display: flex; align-items: center; gap: 14px;
  padding: 14px 16px;
  background: #fff; border-radius: 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
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
  display: flex; gap: 12px;
  font-size: 12px; color: #6F6F73; font-weight: 500;
`;

const AddChildBtn = styled.button`
  width: 36px; height: 36px; border-radius: 12px;
  background: #ECFDF5; border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.2s;
  &:hover { background: #D1FAE5; }
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

const Label = styled.div`
  font-size: 13px; font-weight: 600; color: #6F6F73;
  margin: 16px 0 6px;
`;

const Input = styled.input`
  width: 100%; padding: 14px; border-radius: 10px;
  border: 1px solid #E4E4E7; font-size: 16px;
  outline: none;
  &:focus { border-color: #1F7A52; }
`;

const PickerRow = styled.div`
  display: flex; gap: 8px; flex-wrap: wrap;
`;

const ColorCircle = styled.div<{ bgColor: string; selected: boolean }>`
  width: 40px; height: 40px; border-radius: 20px;
  background: ${p => p.bgColor};
  cursor: pointer; transition: transform 0.2s;
  ${p => p.selected && `border: 3px solid #141414;`}
  &:hover { transform: scale(1.1); }
`;

const IconCircle = styled.div<{ selected: boolean }>`
  width: 48px; height: 48px; border-radius: 24px;
  background: #F9FAFB; border: 1px solid #E4E4E7;
  display: flex; align-items: center; justify-content: center;
  font-size: 22px; cursor: pointer; transition: all 0.2s;
  ${p => p.selected && `border: 3px solid #1F7A52; background: #ECFDF5;`}
  &:hover { transform: scale(1.05); }
`;

const InfoBox = styled.div`
  padding: 12px; border-radius: 10px;
  background: #FEF3C7; border: 1px solid #F59E0B;
  color: #92400E; font-size: 13px; margin-top: 16px;
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

const BtnDanger = styled(BtnBase)`
  margin-top: 12px; background: #FEE2E2; color: #DC2626;
  &:hover:not(:disabled) { background: #FECACA; }
`;

