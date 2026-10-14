import { Fragment, type ReactNode } from 'react';

// Minimal Markdown → React for docs/realism-sources.md (headings, paragraphs,
// nested lists, tables, **bold**, *italic*, `code`, [links](url) and bare
// URLs). React nodes only, never raw HTML.

const INLINE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|https?:\/\/[^\s)]+)/g;

export function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const tok = m[0];
    const i = m.index;
    if (i > last) out.push(text.slice(last, i));
    const key = `${i}`;
    if (tok.startsWith('**')) out.push(<strong key={key}>{inline(tok.slice(2, -2))}</strong>);
    else if (tok.startsWith('`'))
      out.push(
        <code key={key} className="bg-bg-2 px-1 font-mono">
          {tok.slice(1, -1)}
        </code>,
      );
    else if (tok.startsWith('[')) {
      const close = tok.indexOf('](');
      const href = tok.slice(close + 2, -1);
      out.push(
        <a
          key={key}
          href={href}
          className="text-text-1 underline underline-offset-2"
          rel="noreferrer"
        >
          {inline(tok.slice(1, close))}
        </a>,
      );
    } else if (tok.startsWith('http'))
      out.push(
        <a
          key={key}
          href={tok}
          className="break-all text-text-1 underline underline-offset-2"
          rel="noreferrer"
        >
          {tok}
        </a>,
      );
    else out.push(<em key={key}>{inline(tok.slice(1, -1))}</em>);
    last = i + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

interface ListItem {
  text: string;
  children: ListItem[];
}

function renderList(items: ListItem[], depth: number): ReactNode {
  return (
    <ul className={depth === 0 ? 'list-disc space-y-2 pl-5' : 'mt-1 list-[circle] space-y-1 pl-5'}>
      {items.map((it, i) => (
        <li key={i} className="text-body text-text-2">
          {inline(it.text)}
          {it.children.length > 0 && renderList(it.children, depth + 1)}
        </li>
      ))}
    </ul>
  );
}

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());

/** Render a Markdown document as a list of blocks. */
export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1]!.length;
      const cls = level === 1 ? 'text-h1' : level === 2 ? 'text-h2 pt-4' : 'text-panel-title pt-2';
      const Tag = (['h1', 'h2', 'h3'] as const)[level - 1]!;
      blocks.push(
        <Tag key={i} className={cls}>
          {inline(h[2]!)}
        </Tag>,
      );
      i++;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const root: ListItem[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]!)) {
        const m = /^(\s*)[-*]\s+(.*)$/.exec(lines[i]!)!;
        const item = { text: m[2]!, children: [] };
        if (m[1]!.length >= 2 && root.length > 0) root.at(-1)!.children.push(item);
        else root.push(item);
        i++;
        // Continuation lines (indented, not a new bullet) join the previous item.
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]!) && !/^\s*[-*]\s+/.test(lines[i]!)) {
          const target = root.at(-1)!.children.at(-1) ?? root.at(-1)!;
          target.text += ` ${lines[i]!.trim()}`;
          i++;
        }
      }
      blocks.push(<Fragment key={i}>{renderList(root, 0)}</Fragment>);
      continue;
    }
    if (line.trim().startsWith('|')) {
      const rows: string[] = [];
      while (i < lines.length && lines[i]!.trim().startsWith('|')) rows.push(lines[i++]!);
      const [head, , ...body] = rows;
      blocks.push(
        <table key={i} className="w-full border-collapse text-body">
          <thead>
            <tr>
              {cells(head ?? '').map((c, k) => (
                <th key={k} className="h-7 bg-bg-2 px-2 text-left text-label font-medium">
                  {inline(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((r, k) => (
              <tr key={k} className="border-t border-line-1">
                {cells(r).map((c, j) => (
                  <td key={j} className="px-2 py-1 align-top text-text-2">
                    {inline(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      );
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^(#|\s*[-*]\s|\|)/.test(lines[i]!)) {
      para.push(lines[i++]!.trim());
    }
    blocks.push(
      <p key={i} className="text-body text-text-2">
        {inline(para.join(' '))}
      </p>,
    );
  }
  return <div className="space-y-3">{blocks}</div>;
}
