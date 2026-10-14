/**
 * Bộ đọc HTML rất nhỏ cho nội dung soạn bằng editor bên web (Tiptap).
 *
 * Vì sao tự viết thay vì kéo `react-native-render-html`: thư viện đó nặng, lâu rồi không cập nhật
 * và kéo theo cảnh báo trên React 19; còn nội dung của Uspeak chỉ dùng một nhúm thẻ (đoạn văn,
 * tiêu đề, đậm/nghiêng, danh sách, liên kết, ảnh, trích dẫn, bảng đơn giản). Đọc đúng nhúm đó là đủ.
 *
 * Tách riêng khỏi phần vẽ để chạy thử được bằng node (xem docs/HANDOFF.md mục 8).
 */

export type InlineStyle = 'bold' | 'italic' | 'underline' | 'strike' | 'code';

export interface InlineText {
  kind: 'text';
  text: string;
  styles: InlineStyle[];
  /** Có href = đoạn chữ này là liên kết bấm được */
  href?: string;
}

export type Block =
  | { kind: 'para'; children: InlineText[] }
  | { kind: 'heading'; level: number; children: InlineText[] }
  | { kind: 'quote'; children: InlineText[] }
  | { kind: 'code'; text: string }
  | { kind: 'list'; ordered: boolean; items: InlineText[][] }
  | { kind: 'image'; src: string; alt?: string }
  | { kind: 'rule' };

const VOID_TAGS = new Set(['br', 'img', 'hr', 'input', 'meta', 'link']);
const BLOCK_TAGS = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'tr', 'section', 'article']);

/**
 * Tên thực thể HTML cho dải Latin-1 (160–255) theo đúng thứ tự chuẩn — nội dung chép từ web/WP cũ
 * hay có `&agrave;` `&ecirc;`… Không dịch thì chữ tiếng Việt hiện ra nguyên mã, rất khó đọc.
 */
const LATIN1 =
  'nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml'.split(
    ' ',
  );

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  hellip: '…',
  ndash: '–',
  mdash: '—',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
  bull: '•',
  middot: '·',
  // `&nbsp;` thành khoảng trắng THƯỜNG: giữ U+00A0 thì dòng không ngắt được, chữ tràn ra ngoài thẻ.
  nbsp: ' ',
};
LATIN1.forEach((name, i) => {
  if (!ENTITIES[name]) ENTITIES[name] = String.fromCharCode(160 + i);
});

export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, (full, name: string) => {
    // Tên thực thể PHÂN BIỆT hoa thường (&Agrave; ≠ &agrave;) nên tra đúng chữ trước khi hạ về thường
    if (ENTITIES[name]) return ENTITIES[name];
    const lower = name.toLowerCase();
    if (lower.startsWith('#x')) return String.fromCodePoint(parseInt(lower.slice(2), 16) || 32);
    if (lower.startsWith('#')) return String.fromCodePoint(parseInt(lower.slice(1), 10) || 32);
    return ENTITIES[lower] ?? full;
  });
}

const attr = (raw: string, name: string): string | undefined => {
  const m = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(raw);
  const value = m?.[2] ?? m?.[3];
  return value ? decodeEntities(value) : undefined;
};

/** Gom chữ liền nhau cùng kiểu lại cho đỡ số phần tử phải vẽ. */
function pushText(out: InlineText[], text: string, styles: InlineStyle[], href?: string) {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && last.href === href && last.styles.length === styles.length && last.styles.every((s, i) => s === styles[i])) {
    last.text += text;
    return;
  }
  out.push({ kind: 'text', text, styles: [...styles], href });
}

/**
 * Đọc HTML thành danh sách khối. Thẻ lạ bị bỏ qua nhưng CHỮ bên trong vẫn giữ — thà hiện thừa
 * một dòng chữ còn hơn nuốt mất nội dung giáo viên viết.
 */
export function parseHtml(html?: string | null): Block[] {
  const src = (html || '').replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, '');
  if (!src.trim()) return [];

  const blocks: Block[] = [];
  let current: InlineText[] = [];
  const styles: InlineStyle[] = [];
  let href: string | undefined;

  // Trạng thái danh sách đang mở (hỗ trợ lồng 1 cấp là đủ cho nội dung của Uspeak)
  let list: { ordered: boolean; items: InlineText[][] } | null = null;
  let heading: number | null = null;
  let quote = false;
  let pre = false;

  const flush = () => {
    const children = current.filter((c) => c.text.trim() !== '' || c.text === ' ');
    current = [];
    if (!children.length) return;
    if (list) {
      list.items.push(children);
      return;
    }
    if (heading) blocks.push({ kind: 'heading', level: heading, children });
    else if (quote) blocks.push({ kind: 'quote', children });
    else if (pre) blocks.push({ kind: 'code', text: children.map((c) => c.text).join('') });
    else blocks.push({ kind: 'para', children });
  };

  const closeList = () => {
    if (!list) return;
    if (list.items.length) blocks.push({ kind: 'list', ordered: list.ordered, items: list.items });
    list = null;
  };

  const re = /<\/?([a-z][a-z0-9]*)\b([^>]*)>/gi;
  let lastIndex = 0;
  let m: RegExpExecArray | null;

  const addText = (raw: string) => {
    if (!raw) return;
    const text = pre ? decodeEntities(raw) : decodeEntities(raw).replace(/\s+/g, ' ');
    if (!text || (!pre && !text.trim() && !current.length)) return;
    pushText(current, text, styles, href);
  };

  while ((m = re.exec(src))) {
    addText(src.slice(lastIndex, m.index));
    lastIndex = re.lastIndex;

    const closing = m[0][1] === '/';
    const tag = m[1].toLowerCase();
    const raw = m[2] || '';

    if (VOID_TAGS.has(tag)) {
      if (tag === 'br') pushText(current, '\n', styles, href);
      if (tag === 'hr') {
        flush();
        blocks.push({ kind: 'rule' });
      }
      if (tag === 'img') {
        const src2 = attr(raw, 'src');
        if (src2) {
          flush();
          blocks.push({ kind: 'image', src: src2, alt: attr(raw, 'alt') });
        }
      }
      continue;
    }

    switch (tag) {
      case 'strong':
      case 'b':
        if (closing) styles.splice(styles.lastIndexOf('bold'), 1);
        else styles.push('bold');
        break;
      case 'em':
      case 'i':
        if (closing) styles.splice(styles.lastIndexOf('italic'), 1);
        else styles.push('italic');
        break;
      case 'u':
        if (closing) styles.splice(styles.lastIndexOf('underline'), 1);
        else styles.push('underline');
        break;
      case 's':
      case 'del':
      case 'strike':
        if (closing) styles.splice(styles.lastIndexOf('strike'), 1);
        else styles.push('strike');
        break;
      case 'code':
        if (closing) styles.splice(styles.lastIndexOf('code'), 1);
        else styles.push('code');
        break;
      case 'a':
        href = closing ? undefined : attr(raw, 'href');
        break;
      case 'ul':
      case 'ol':
        if (closing) closeList();
        else {
          flush();
          closeList();
          list = { ordered: tag === 'ol', items: [] };
        }
        break;
      case 'li':
        if (closing) flush();
        else if (current.length) flush();
        break;
      case 'pre':
        if (closing) {
          flush();
          pre = false;
        } else {
          flush();
          pre = true;
        }
        break;
      case 'blockquote':
        if (closing) {
          flush();
          quote = false;
        } else {
          flush();
          quote = true;
        }
        break;
      default:
        if (/^h[1-6]$/.test(tag)) {
          if (closing) {
            flush();
            heading = null;
          } else {
            flush();
            heading = Number(tag[1]);
          }
        } else if (BLOCK_TAGS.has(tag)) {
          flush();
          if (!closing && (tag === 'tr' || tag === 'div') && list) closeList();
        } else if ((tag === 'td' || tag === 'th') && !closing && current.length) {
          // Ô bảng kế tiếp: ngăn cách bằng khoảng trắng cho khỏi dính chữ
          pushText(current, '  ', styles, href);
        }
        break;
    }
  }

  addText(src.slice(lastIndex));
  flush();
  closeList();
  return blocks;
}

/** Toàn bộ nội dung dưới dạng chữ thường — dùng cho dòng xem trước, tìm kiếm, đo độ dài. */
export function blocksToPlain(blocks: Block[]): string {
  return blocks
    .map((b) => {
      switch (b.kind) {
        case 'list':
          return b.items.map((it, i) => `${b.ordered ? `${i + 1}.` : '•'} ${it.map((c) => c.text).join('')}`).join('\n');
        case 'code':
          return b.text;
        case 'image':
          return b.alt ? `[${b.alt}]` : '';
        case 'rule':
          return '';
        default:
          return b.children.map((c) => c.text).join('');
      }
    })
    .filter((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
