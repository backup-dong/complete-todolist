import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TagPill } from './TagPill';

describe('TagPill', () => {
  it('renders the label inside the badge', () => {
    const html = renderToStaticMarkup(<TagPill label="工作" />);
    expect(html).toContain('badge');
    expect(html).toContain('工作');
  });

  it('renders a remove button when onRemove is provided', () => {
    const onRemove = vi.fn();
    const html = renderToStaticMarkup(<TagPill label="紧急" onRemove={onRemove} />);
    expect(html).toContain('移除标签 紧急');
    expect(html).toContain('</button>');
  });

  it('omits the remove button when onRemove is absent', () => {
    const html = renderToStaticMarkup(<TagPill label="紧急" />);
    expect(html).not.toContain('移除标签');
    expect(html).not.toContain('</button>');
  });
});
