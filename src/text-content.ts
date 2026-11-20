const prefixPattern = /^(#{1,3}|[-*•]|\d+[.)])\s+/;
const inlinePattern = /(\*\*\*|\*\*|\*)(\S(?:[^\n]*?\S)?)\1/g;

export type FormattedPart = { text: string; bold: boolean; italic: boolean };

export function formattedLines(text: string) {
  let number: number | undefined;
  return text.split('\n').map(line => {
    const prefix = prefixPattern.exec(line);
    const content = prefix ? line.slice(prefix[0].length) : line;
    const kind = !prefix ? 'paragraph' : prefix[1][0] === '#' ? 'heading' : /^\d/.test(prefix[1]) ? 'number' : 'bullet';
    number = kind === 'number' ? number === undefined ? Number.parseInt(prefix![1], 10) : number + 1 : undefined;
    const parts: FormattedPart[] = [];
    let index = 0;
    for (const match of content.matchAll(inlinePattern)) {
      const start = match.index!;
      if (start > index) parts.push({ text: content.slice(index, start), bold: false, italic: false });
      parts.push({ text: match[2], bold: match[1].length >= 2, italic: match[1].length % 2 === 1 });
      index = start + match[0].length;
    }
    if (index < content.length) parts.push({ text: content.slice(index), bold: false, italic: false });
    return { kind, number, parts };
  });
}

export function textLinks(text: string) {
  const pattern = /https?:\/\/[^\s<>"'`*。，、！？；：]+/gi;
  return [...text.matchAll(pattern)].flatMap(match => {
    const url = match[0].replace(/[),.!?;:，。！？]+$/u, '');
    try {
      const parsed = new URL(url);
      return [{ label: url, url: parsed.href, start: match.index! }];
    } catch { return []; }
  });
}
