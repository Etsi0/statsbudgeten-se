/**
 * A small Markdown subset for the site's prose pages (content/*.md):
 * headings (#, ##, ###), paragraphs, bullet lists, links, bold and inline
 * code, plus a `[sources]` line that the page replaces with its download
 * list. The result is plain JSON so it can be produced at build time (see
 * src/web/content.macro.ts) and rendered with React without innerHTML.
 */

export type Inline =
  | { t: "text"; s: string }
  | { t: "link"; s: string; href: string }
  | { t: "strong"; s: string }
  | { t: "code"; s: string };

export type Block =
  | { t: "h"; level: 1 | 2 | 3; inlines: Inline[] }
  | { t: "p"; inlines: Inline[] }
  | { t: "ul"; items: Inline[][] }
  | { t: "sources" };

const INLINE = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;

export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of s.matchAll(INLINE)) {
    if (m.index! > last) out.push({ t: "text", s: s.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ t: "link", s: m[1], href: m[2]! });
    else if (m[3] !== undefined) out.push({ t: "strong", s: m[3] });
    else out.push({ t: "code", s: m[4]! });
    last = m.index! + m[0].length;
  }
  if (last < s.length) out.push({ t: "text", s: s.slice(last) });
  return out;
}

export function parseMarkdown(text: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: Inline[][] | null = null;

  const flush = () => {
    if (para.length) blocks.push({ t: "p", inlines: parseInline(para.join(" ")) });
    para = [];
    if (list) blocks.push({ t: "ul", items: list });
    list = null;
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const heading = line.match(/^(#{1,3}) +(.*)$/);
    if (heading) {
      flush();
      blocks.push({ t: "h", level: heading[1]!.length as 1 | 2 | 3, inlines: parseInline(heading[2]!) });
    } else if (line.trim() === "[sources]") {
      flush();
      blocks.push({ t: "sources" });
    } else if (/^[-*] /.test(line)) {
      if (para.length) flush();
      (list ??= []).push(parseInline(line.slice(2).trim()));
    } else if (line.trim() === "") {
      flush();
    } else {
      if (list) flush();
      para.push(line.trim());
    }
  }
  flush();
  return blocks;
}
