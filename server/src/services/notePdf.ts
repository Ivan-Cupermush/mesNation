import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';

/**
 * Экспорт заметки в PDF. Встроенные шрифты PDF не содержат кириллицы,
 * поэтому используем DejaVu Sans из server/assets/fonts.
 */

function findFontsDir(): string {
  // Работает и из src/ (ts-node), и из dist/src/ (сборка).
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, 'assets', 'fonts');
    if (fs.existsSync(path.join(candidate, 'DejaVuSans.ttf'))) return candidate;
    dir = path.dirname(dir);
  }
  throw new Error('Не найдены шрифты для PDF (server/assets/fonts)');
}

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

function formatDay(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export interface NoteForPdf {
  title: string;
  content: string;
  note_date: string;
  author: string;
  company?: string | null;
  files: { file_name: string }[];
}

export function renderNotePdf(note: NoteForPdf): Promise<Buffer> {
  const fonts = findFontsDir();
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 56, info: { Title: note.title || 'Заметка', Author: note.author } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.registerFont('regular', path.join(fonts, 'DejaVuSans.ttf'));
    doc.registerFont('bold', path.join(fonts, 'DejaVuSans-Bold.ttf'));

    const meta = [formatDay(note.note_date), note.author, note.company].filter(Boolean).join(' · ');
    doc.font('regular').fontSize(10).fillColor('#6F6F73').text(meta);
    doc.moveDown(0.6);
    doc.font('bold').fontSize(22).fillColor('#141414').text(note.title || 'Без названия');
    doc.moveDown(0.4);
    doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor('#ECECE8').stroke();
    doc.moveDown(0.8);
    doc.font('regular').fontSize(12).fillColor('#141414').text(note.content || '', { lineGap: 4 });

    if (note.files.length) {
      doc.moveDown(1.2);
      doc.font('bold').fontSize(12).text('Вложения');
      doc.moveDown(0.3);
      doc.font('regular').fontSize(11).fillColor('#444444');
      for (const f of note.files) doc.text(`• ${f.file_name}`);
    }
    doc.end();
  });
}
