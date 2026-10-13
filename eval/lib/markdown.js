// Minimal Markdown -> plain text for the Open Terms Archive snapshots.
// Keeps paragraph boundaries (blank lines) because they become clauses.

export function mdToPlain(md) {
  return String(md)
    .replace(/\r\n?/g, '\n')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[\]\([^)]*\)/g, '')                           // empty anchors []()
    .replace(/\[([^\]]+)\]\((?:[^()]|\([^)]*\))*\)/g, '$1')        // [text](url)
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
    .replace(/^\s*[=-]{3,}\s*$/gm, '')                             // setext underlines
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')                        // headings
    .replace(/^\s*>\s?/gm, '')                                 // blockquotes
    .replace(/^\s*[-*+]\s+/gm, '')                             // bullets
    .replace(/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/gm, '') // table separators
    .replace(/\s*\|\s*/g, (m, off, s) => (s[off - 1] === '\n' || off === 0 ? '' : ' — '))
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[^\w*])\*(?!\s)([^*\n]+?)\*(?!\w)/g, '$1$2')
    .replace(/(^|[^\w_])_(?!\s)([^_\n]+?)_(?!\w)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\\([\\`*_{}\[\]()#+\-.!|>])/g, '$1')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim() + '\n';
}
