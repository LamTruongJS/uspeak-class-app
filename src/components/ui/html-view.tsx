import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { createContext, memo, useContext, useMemo, useState } from 'react';
import { Linking, Pressable, Text, View, useWindowDimensions } from 'react-native';

import { mediaCacheKey, resolveMediaUrl, useMediaToken } from '@/lib/media';

/**
 * Hiện nội dung soạn bằng editor rich-text bên web (Tiptap → HTML) dưới dạng component native:
 * tiêu đề, đoạn, danh sách, trích dẫn, bảng (đổ về từng dòng), ảnh, liên kết, in đậm/nghiêng/gạch.
 *
 * Vì sao tự viết thay vì dùng react-native-webview / react-native-render-html:
 * - webview là module native, Expo Go không chắc có → thêm vào là phải làm development build mới test được.
 * - Nội dung của Uspeak (wiki, thông báo, mô tả bài tập) chỉ dùng vài thẻ cơ bản, không cần cả engine HTML.
 * Thẻ lạ thì vẫn lấy chữ bên trong nên không bao giờ mất nội dung, chỉ mất định dạng.
 */

interface ElementNode {
  type: 'el';
  tag: string;
  attrs: Record<string, string>;
  children: HtmlNode[];
}
interface TextNode {
  type: 'text';
  text: string;
}
type HtmlNode = ElementNode | TextNode;

const VOID_TAGS = new Set(['br', 'img', 'hr', 'input', 'source', 'col']);
const DROP_TAGS = new Set(['script', 'style', 'head', 'meta', 'link', 'iframe']);

const ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  '#39': "'",
  apos: "'",
  hellip: '…',
  ndash: '–',
  mdash: '—',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
};

function decode(text: string) {
  return text.replace(/&(#?\w+);/g, (full, name: string) => {
    if (ENTITIES[name]) return ENTITIES[name];
    if (/^#\d+$/.test(name)) return String.fromCharCode(Number(name.slice(1)));
    return full;
  });
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of raw.matchAll(/([a-zA-Z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
    attrs[m[1].toLowerCase()] = decode(m[3] ?? m[4] ?? '');
  }
  return attrs;
}

/** Bộ phân tích HTML tối giản: đủ cho HTML do editor sinh ra, không xử lý thẻ tự đóng kiểu lạ. */
function parseHtml(html: string): HtmlNode[] {
  const root: ElementNode = { type: 'el', tag: 'root', attrs: {}, children: [] };
  const stack: ElementNode[] = [root];
  const tagRe = /<\/?([a-zA-Z][\w-]*)([^>]*?)\/?>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const pushText = (raw: string) => {
    if (!raw) return;
    const text = decode(raw);
    if (!text.trim() && !text.includes(' ')) return;
    stack[stack.length - 1].children.push({ type: 'text', text });
  };

  while ((match = tagRe.exec(html))) {
    pushText(html.slice(lastIndex, match.index));
    lastIndex = tagRe.lastIndex;

    const tag = match[1].toLowerCase();
    const closing = match[0].startsWith('</');
    const selfClosing = match[0].endsWith('/>') || VOID_TAGS.has(tag);

    if (DROP_TAGS.has(tag)) {
      // Bỏ hẳn cả phần ruột của thẻ (script/style…)
      const end = html.indexOf(`</${tag}>`, tagRe.lastIndex);
      if (!closing && end >= 0) {
        tagRe.lastIndex = end + tag.length + 3;
        lastIndex = tagRe.lastIndex;
      }
      continue;
    }

    if (closing) {
      // Đóng tới thẻ mở gần nhất cùng tên (HTML thiếu thẻ đóng thì bỏ qua)
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === tag) {
          stack.length = i;
          break;
        }
      }
      continue;
    }

    const node: ElementNode = { type: 'el', tag, attrs: parseAttrs(match[2] ?? ''), children: [] };
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) stack.push(node);
  }
  pushText(html.slice(lastIndex));

  return root.children;
}

const HEADING_CLASS: Record<string, string> = {
  h1: 'pt-2 text-[21px] font-extrabold leading-7',
  h2: 'pt-2 text-[19px] font-extrabold leading-7',
  h3: 'pt-1 text-[17px] font-bold leading-6',
  h4: 'text-base font-bold leading-6',
  h5: 'text-[15px] font-bold leading-6',
  h6: 'text-sm font-bold leading-5',
};

const BLOCK_TAGS = new Set([
  'p',
  'div',
  'section',
  'article',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'table',
  'thead',
  'tbody',
  'tr',
  'td',
  'th',
  'hr',
  'img',
  'figure',
  'figcaption',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
]);

/** Link web mở bằng trình duyệt TRONG app (không văng sang Chrome/Safari); tel:/mailto: giao cho hệ thống. */
function openHref(href: string) {
  if (/^https?:\/\//i.test(href)) void WebBrowser.openBrowserAsync(href);
  else void Linking.openURL(href);
}

/** Bấm ảnh để xem to — màn cha truyền vào (HtmlView không tự kéo trình xem ảnh để khỏi phụ thuộc feature). */
const ImagePressContext = createContext<((uri: string) => void) | undefined>(undefined);

/** Ảnh trong bài: chưa biết kích thước thì đo khi tải xong (ảnh chụp màn hình dọc bị ép 16:9 sẽ bé xíu). */
function HtmlImage({ uri, cacheKey, width, w, h }: { uri: string; cacheKey?: string; width: number; w: number; h: number }) {
  const onPress = useContext(ImagePressContext);
  const [measured, setMeasured] = useState<number | null>(null);
  const ratio = w > 0 && h > 0 ? w / h : (measured ?? 16 / 9);
  // Ảnh dọc (chụp màn hình điện thoại) không cho cao quá 1.4 lần bề ngang
  const height = Math.min(width / ratio, width * 1.4);
  return (
    <Pressable onPress={onPress ? () => onPress(uri) : undefined} className="items-center overflow-hidden rounded-2xl bg-surface-muted">
      <Image
        source={{ uri, cacheKey }}
        style={{ width, height }}
        contentFit="contain"
        transition={120}
        onLoad={(e) => {
          if (!(w > 0 && h > 0) && e.source.width && e.source.height) setMeasured(e.source.width / e.source.height);
        }}
      />
    </Pressable>
  );
}

/** Đoạn chỉ chứa đúng 1 liên kết (kiểu mục lục "HƯỚNG DẪN …") → hàng bấm được thay vì chữ xanh gạch chân. */
function soleLink(nodes: HtmlNode[]): ElementNode | null {
  const meaningful = nodes.filter((n) => n.type === 'el' || n.text.trim());
  if (meaningful.length !== 1) return null;
  let n = meaningful[0];
  while (n.type === 'el' && n.tag !== 'a') {
    const inner = n.children.filter((c) => c.type === 'el' || c.text.trim());
    if (inner.length !== 1 || !['strong', 'b', 'em', 'i', 'u', 'span'].includes(n.tag)) return null;
    n = inner[0];
  }
  return n.type === 'el' && n.tag === 'a' && n.attrs.href ? n : null;
}

function LinkRow({ node }: { node: ElementNode }) {
  const href = node.attrs.href;
  const internal = href.startsWith('#');
  return (
    <Pressable
      onPress={internal ? undefined : () => openHref(href)}
      className="flex-row items-center gap-3 rounded-2xl bg-info-soft px-3.5 py-3 active:opacity-80">
      <Ionicons name={internal ? 'bookmark' : 'link'} size={16} color="#2563eb" />
      <Text className="flex-1 text-[14.5px] font-semibold leading-5 text-info">{nodeText(node.children).trim()}</Text>
      {internal ? null : <Ionicons name="chevron-forward" size={15} color="#2563eb" />}
    </Pressable>
  );
}

const hasBlockChild = (nodes: HtmlNode[]): boolean =>
  nodes.some((n) => n.type === 'el' && (BLOCK_TAGS.has(n.tag) || hasBlockChild(n.children)));

function nodeText(nodes: HtmlNode[]): string {
  return nodes
    .map((n) => (n.type === 'text' ? n.text : n.tag === 'br' ? '\n' : nodeText(n.children)))
    .join('');
}

/** Chữ có định dạng (đậm / nghiêng / gạch chân / link / code) — gom vào 1 <Text>. */
function Inline({ nodes, bold, italic }: { nodes: HtmlNode[]; bold?: boolean; italic?: boolean }) {
  return (
    <>
      {nodes.map((node, i) => {
        if (node.type === 'text') return <Text key={i}>{node.text}</Text>;
        switch (node.tag) {
          case 'br':
            return <Text key={i}>{'\n'}</Text>;
          case 'b':
          case 'strong':
            return (
              <Text key={i} className="font-bold">
                <Inline nodes={node.children} bold italic={italic} />
              </Text>
            );
          case 'i':
          case 'em':
            return (
              <Text key={i} className="italic">
                <Inline nodes={node.children} bold={bold} italic />
              </Text>
            );
          case 'u':
            return (
              <Text key={i} className="underline">
                <Inline nodes={node.children} bold={bold} italic={italic} />
              </Text>
            );
          case 's':
          case 'del':
            return (
              <Text key={i} className="line-through">
                <Inline nodes={node.children} bold={bold} italic={italic} />
              </Text>
            );
          case 'code':
            return (
              <Text key={i} className="rounded bg-surface-muted px-1 font-mono text-[13px]">
                {nodeText(node.children)}
              </Text>
            );
          case 'a': {
            const href = node.attrs.href;
            return (
              <Text
                key={i}
                className="text-info underline"
                onPress={href && !href.startsWith('#') ? () => openHref(href) : undefined}>
                <Inline nodes={node.children} bold={bold} italic={italic} />
              </Text>
            );
          }
          default:
            return <Inline key={i} nodes={node.children} bold={bold} italic={italic} />;
        }
      })}
    </>
  );
}

function Block({ node, token, width }: { node: HtmlNode; token?: string; width: number }) {
  if (node.type === 'text') {
    if (!node.text.trim()) return null;
    return <Text className="text-[15px] leading-6 text-foreground">{node.text}</Text>;
  }

  const { tag, attrs, children } = node;

  if (HEADING_CLASS[tag]) {
    return (
      <Text className={`${HEADING_CLASS[tag]} text-foreground`}>
        <Inline nodes={children} />
      </Text>
    );
  }

  switch (tag) {
    case 'hr':
      return <View className="h-px bg-border" />;

    case 'img': {
      const uri = resolveMediaUrl(attrs.src, token);
      if (!uri) return null;
      return <HtmlImage uri={uri} cacheKey={mediaCacheKey(attrs.src)} width={width} w={Number(attrs.width) || 0} h={Number(attrs.height) || 0} />;
    }

    case 'ul':
    case 'ol':
      return (
        <View className="gap-2">
          {children
            .filter((c): c is ElementNode => c.type === 'el' && c.tag === 'li')
            .map((li, i) => (
              <View key={i} className="flex-row gap-2.5">
                {tag === 'ol' ? (
                  <View className="mt-0.5 h-5 min-w-5 items-center justify-center rounded-full bg-brand-soft px-1">
                    <Text className="text-[11.5px] font-bold text-brand">{i + 1}</Text>
                  </View>
                ) : (
                  <View className="mt-[9px] h-1.5 w-1.5 rounded-full bg-brand" />
                )}
                <View className="flex-1 gap-1.5">
                  <Blocks nodes={li.children} token={token} width={width - 22} />
                </View>
              </View>
            ))}
        </View>
      );

    case 'blockquote':
      return (
        <View className="gap-1.5 rounded-2xl border-l-4 border-brand bg-brand-soft px-3.5 py-3">
          <Blocks nodes={children} token={token} width={width - 32} />
        </View>
      );

    case 'pre':
      return (
        <View className="rounded-xl bg-surface-muted p-3">
          <Text className="font-mono text-[13px] text-foreground">{nodeText(children).trim()}</Text>
        </View>
      );

    case 'table':
      // Bảng rộng không vừa điện thoại → đổ về từng dòng, mỗi ô một dòng chữ.
      return (
        <View className="gap-2 rounded-xl border border-border p-3">
          {children
            .flatMap((c) => (c.type === 'el' && ['thead', 'tbody'].includes(c.tag) ? c.children : [c]))
            .filter((c): c is ElementNode => c.type === 'el' && c.tag === 'tr')
            .map((tr, i) => (
              <View key={i} className="gap-0.5">
                {tr.children
                  .filter((c): c is ElementNode => c.type === 'el' && (c.tag === 'td' || c.tag === 'th'))
                  .map((cell, j) => (
                    <Text key={j} className={`text-[14px] leading-5 ${cell.tag === 'th' ? 'font-bold text-foreground' : 'text-foreground'}`}>
                      <Inline nodes={cell.children} />
                    </Text>
                  ))}
              </View>
            ))}
        </View>
      );

    case 'figure':
    case 'div':
    case 'section':
    case 'article':
    case 'li':
      return <Blocks nodes={children} token={token} width={width} />;

    default: {
      // p, figcaption và mọi thẻ còn lại: nếu bên trong có thẻ khối thì đi tiếp, không thì in chữ.
      if (hasBlockChild(children)) return <Blocks nodes={children} token={token} width={width} />;
      const link = tag === 'p' ? soleLink(children) : null;
      if (link) return <LinkRow node={link} />;
      const text = nodeText(children);
      if (!text.trim()) return null;
      return (
        <Text className={`text-[15.5px] leading-[25px] ${tag === 'figcaption' ? 'text-center text-[13px] text-muted' : 'text-foreground'}`}>
          <Inline nodes={children} />
        </Text>
      );
    }
  }
}

function Blocks({ nodes, token, width }: { nodes: HtmlNode[]; token?: string; width: number }) {
  return (
    <>
      {nodes.map((node, i) => (
        <Block key={i} node={node} token={token} width={width} />
      ))}
    </>
  );
}

export const HtmlView = memo(function HtmlView({
  html,
  width,
  onImagePress,
}: {
  html?: string | null;
  width?: number;
  onImagePress?: (uri: string) => void;
}) {
  const { width: screenWidth } = useWindowDimensions();
  const { data } = useMediaToken();
  const nodes = useMemo(() => parseHtml(html || ''), [html]);
  if (!html?.trim()) return null;
  return (
    <ImagePressContext.Provider value={onImagePress}>
      <View className="gap-3">
        <Blocks nodes={nodes} token={data?.media_token} width={width ?? screenWidth - 64} />
      </View>
    </ImagePressContext.Provider>
  );
});
