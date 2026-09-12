import React, { useState } from 'react';
import styled from 'styled-components';
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { api } from '../services/api';

const ImportExcelScreen: React.FC = () => {
  const [preview, setPreview] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setLoading(true);
    try {
      const p = await api.previewImport(f);
      setPreview(p); setResult(null);
    } catch (err: any) { alert('Ошибка чтения файла: ' + err.message); } finally { setLoading(false); }
  };

  const handleConfirm = async () => {
    if (!preview) return;
    setLoading(true);
    try {
      const r = await api.confirmImport(preview.importId, preview.suggestedMapping || {});
      setResult(r); setPreview(null);
    } catch (err: any) { alert('Ошибка импорта: ' + err.message); } finally { setLoading(false); }
  };

  return (
    <Container>
      <Header>
        <Title><FileSpreadsheet size={32} color="#1F7A52" /> Импорт KPI из Excel</Title>
        <Subtitle>Загрузите файл с планами продаж</Subtitle>
      </Header>
      <Content>
        {!preview && !result && (
          <DropZone>
            <Upload size={40} color="#1F7A52" />
            <DropText>Выберите Excel-файл (.xlsx)</DropText>
            <input type="file" accept=".xlsx,.xls" onChange={handleFileChange} style={{ display: 'none' }} id="file-input" />
            <UploadBtn as="label" htmlFor="file-input">Выбрать файл</UploadBtn>
          </DropZone>
        )}
        {loading && <Loader><Loader2 size={32} color="#1F7A52" /> Загрузка...</Loader>}
        {preview && (
          <PreviewCard>
            <PreviewTitle>Предпросмотр: {preview.fileName}</PreviewTitle>
            <PreviewInfo>Найдено строк: {preview.rowsCount}</PreviewInfo>
            <Actions>
              <ConfirmBtn onClick={handleConfirm} disabled={loading}><CheckCircle2 size={16} /> Подтвердить импорт</ConfirmBtn>
              <CancelBtn onClick={() => setPreview(null)}><XCircle size={16} /> Отмена</CancelBtn>
            </Actions>
          </PreviewCard>
        )}
        {result && (
          <ResultCard>
            <CheckCircle2 size={48} color="#1F7A52" />
            <ResultTitle>Импорт завершён успешно!</ResultTitle>
            <ResultText>Импортировано записей: {result.importedCount || 0}</ResultText>
            <ResetBtn onClick={() => setResult(null)}>Загрузить ещё</ResetBtn>
          </ResultCard>
        )}
      </Content>
    </Container>
  );
};

export default ImportExcelScreen;

const Container = styled.div`max-width: 960px; margin: 0 auto;`;
const Header = styled.div`padding: 32px 24px 24px; border-bottom: 1px solid #E5E5E5;`;
const Title = styled.h1`font-family: 'Bebas Neue', sans-serif; font-size: 40px; color: #141414; display: flex; align-items: center; gap: 12px; margin: 0;`;
const Subtitle = styled.p`font-size: 14px; color: #6F6F73; margin: 4px 0 0 44px;`;
const Content = styled.div`padding: 24px;`;
const DropZone = styled.div`background: #fff; border: 2px dashed #E5E5E5; border-radius: 16px; padding: 48px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 16px;`;
const DropText = styled.p`font-size: 16px; color: #6F6F73; margin: 0;`;
const UploadBtn = styled.div`padding: 10px 20px; background: #1F7A52; color: #fff; border-radius: 10px; font-weight: 600; cursor: pointer; &:hover { background: #185f40; }`;
const Loader = styled.div`display: flex; align-items: center; justify-content: center; gap: 12px; padding: 48px; color: #6F6F73;`;
const PreviewCard = styled.div`background: #fff; border: 1px solid #E5E5E5; border-radius: 16px; padding: 32px;`;
const PreviewTitle = styled.h3`font-size: 20px; color: #141414; margin: 0 0 8px;`;
const PreviewInfo = styled.p`font-size: 14px; color: #6F6F73; margin: 0 0 24px;`;
const Actions = styled.div`display: flex; gap: 12px;`;
const ConfirmBtn = styled.button`padding: 10px 20px; background: #1F7A52; color: #fff; border: none; border-radius: 10px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; &:hover { background: #185f40; } &:disabled { opacity: 0.6; }`;
const CancelBtn = styled.button`padding: 10px 20px; background: #fff; color: #141414; border: 1px solid #E5E5E5; border-radius: 10px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; &:hover { background: #F5F5F5; }`;
const ResultCard = styled.div`background: #E8F3EE; border: 1px solid #1F7A52; border-radius: 16px; padding: 48px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 12px;`;
const ResultTitle = styled.h3`font-size: 24px; color: #1F7A52; margin: 0;`;
const ResultText = styled.p`font-size: 14px; color: #141414; margin: 0;`;
const ResetBtn = styled.button`padding: 10px 20px; background: #fff; color: #1F7A52; border: 1px solid #1F7A52; border-radius: 10px; font-weight: 600; cursor: pointer; margin-top: 16px; &:hover { background: #1F7A52; color: #fff; }`;
