import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MarkdownPreview } from './MarkdownPreview';

describe('MarkdownPreview', () => {
  const render = (content: string) => renderToStaticMarkup(<MarkdownPreview content={content} />);

  it('renders an unordered list as <ul><li>', () => {
    const html = render('- 苹果\n- 香蕉');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>苹果</li>');
    expect(html).toContain('<li>香蕉</li>');
  });

  it('renders a task todo as checkbox list item', () => {
    const html = render('- [ ] 未完成\n- [x] 已完成');
    expect(html).toContain('contains-task-list');
    expect(html).toContain('<input type="checkbox" disabled=""');
    expect(html).toContain('未完成');
    expect(html).toContain('checked=""');
    expect(html).toContain('已完成');
  });

  it('renders both unordered list and task todo together', () => {
    const html = render('背景说明\n\n- [ ] 待办 A\n- 无序 B');
    expect(html).toContain('<ul class="contains-task-list">');
    expect(html).toContain('<li class="task-list-item"><input type="checkbox" disabled=""');
    expect(html).toContain('<li>无序 B</li>');
  });

  it('renders a mermaid fenced block as MermaidDiagram container', () => {
    const html = render('```mermaid\nflowchart TD\n    A --> B\n```');
    expect(html).toContain('data-testid="mermaid-diagram"');
    expect(html).not.toContain('language-mermaid');
  });

  it('renders a plain code block as code, not a diagram', () => {
    const html = render('```js\nconst a = 1;\n```');
    expect(html).toContain('<code class="language-js">');
    expect(html).not.toContain('mermaid-diagram');
  });
});