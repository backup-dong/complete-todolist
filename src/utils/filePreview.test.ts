import { describe, it, expect } from 'vitest';
import { getPreviewKind } from './filePreview';

describe('getPreviewKind', () => {
  it('识别常见图片类型', () => {
    expect(getPreviewKind('image/png', 'a.png')).toBe('image');
    expect(getPreviewKind('image/jpeg', 'photo.jpg')).toBe('image');
    expect(getPreviewKind('image/webp', 'b.webp')).toBe('image');
  });

  it('不支持 SVG 预览（XSS 风险）', () => {
    expect(getPreviewKind('image/svg+xml', 'icon.svg')).toBeNull();
  });

  it('识别 PDF', () => {
    expect(getPreviewKind('application/pdf', 'doc.pdf')).toBe('pdf');
  });

  it('按扩展名识别 Markdown', () => {
    expect(getPreviewKind('', 'note.md')).toBe('markdown');
    expect(getPreviewKind('', 'note.markdown')).toBe('markdown');
  });

  it('text/* mime 识别为文本', () => {
    expect(getPreviewKind('text/plain', 'a.txt')).toBe('text');
    expect(getPreviewKind('text/csv', 'data.csv')).toBe('text');
  });

  it('按扩展名兜底识别文本类文件', () => {
    expect(getPreviewKind('application/octet-stream', 'main.ts')).toBe('text');
    expect(getPreviewKind('', 'config.json')).toBe('text');
    expect(getPreviewKind('', 'run.py')).toBe('text');
    expect(getPreviewKind('', 'Dockerfile')).toBeNull();
  });

  it('不可预览的格式返回 null', () => {
    expect(getPreviewKind('application/zip', 'archive.zip')).toBeNull();
    expect(getPreviewKind(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'doc.docx',
    )).toBeNull();
  });
});
