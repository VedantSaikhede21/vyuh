import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Markdown } from '@/lib/markdown';

const html = (md: string) => renderToStaticMarkup(createElement(Markdown, { source: md }));

describe('Markdown', () => {
  it('renders headings, paragraphs and inline marks', () => {
    const out = html('# Title\n\nSome **bold**, *it*, `code` and [a link](https://x.org).');
    expect(out).toContain('<h1 class="text-h1">Title</h1>');
    expect(out).toContain('<strong>bold</strong>');
    expect(out).toContain('<em>it</em>');
    expect(out).toContain('>code</code>');
    expect(out).toContain('href="https://x.org"');
  });

  it('nests indented bullets and joins continuation lines', () => {
    const out = html('- one\n  - child\n- two\n  continued');
    expect(out).toMatch(/<li[^>]*>one<ul[^>]*><li[^>]*>child<\/li><\/ul><\/li>/);
    expect(out).toContain('two continued');
  });

  it('renders pipe tables and never passes raw HTML through', () => {
    const out = html('| A | B |\n|---|---|\n| 1 | <script>x</script> |');
    expect(out).toContain('<th');
    expect(out).toContain('&lt;script&gt;');
    expect(out).not.toContain('<script>');
  });
});
