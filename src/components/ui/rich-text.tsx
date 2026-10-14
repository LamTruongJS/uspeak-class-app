import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Linking, Text, View, type TextStyle } from 'react-native';

import { useMediaUrl } from '@/lib/media';

import { blocksToPlain, parseHtml, type Block, type InlineText } from './html-parse';

/**
 * Hiện nội dung soạn bằng editor rich-text bên web (Tiptap → HTML).
 *
 * Trước đây chỗ này chỉ lọc bỏ thẻ rồi in ra chữ thường, nên **mất hết đậm / tiêu đề / liên kết /
 * ảnh** — giáo viên bôi đậm "Yêu cầu:" hay chèn link thì học viên không thấy gì khác biệt. Giờ đọc
 * HTML thành khối (`html-parse.ts`) rồi vẽ bằng Text/View lồng nhau.
 *
 * `numberOfLines` (dòng xem trước, VD thẻ thông báo lớp lúc chưa mở) vẫn rút về chữ thường một
 * khối — cắt dòng chỉ làm được trên MỘT thẻ Text.
 */
export function RichText({
  html,
  className = 'text-base text-foreground',
  numberOfLines,
}: {
  html?: string | null;
  className?: string;
  numberOfLines?: number;
}) {
  const blocks = useMemo(() => parseHtml(html), [html]);
  if (!blocks.length) return null;

  if (numberOfLines) {
    return (
      <Text className={`leading-6 ${className}`} numberOfLines={numberOfLines}>
        {blocksToPlain(blocks)}
      </Text>
    );
  }

  return (
    <View className="gap-2">
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} className={className} />
      ))}
    </View>
  );
}

/** Toàn bộ nội dung dưới dạng chữ thường — dùng cho dòng xem trước, tìm kiếm, đo độ dài. */
export function htmlToPlain(html?: string | null): string {
  return blocksToPlain(parseHtml(html));
}

const HEADING_CLASS: Record<number, string> = {
  1: 'text-[19px] font-extrabold',
  2: 'text-[17px] font-bold',
  3: 'text-[16px] font-bold',
  4: 'text-[15px] font-bold',
  5: 'text-[15px] font-bold',
  6: 'text-[15px] font-bold',
};

function BlockView({ block, className }: { block: Block; className: string }) {
  switch (block.kind) {
    case 'heading':
      return (
        <Text className={`pt-1 leading-6 text-foreground ${HEADING_CLASS[block.level] ?? HEADING_CLASS[3]}`}>
          <Inline parts={block.children} />
        </Text>
      );

    case 'quote':
      return (
        <View className="rounded-r-lg border-l-[3px] border-border bg-surface-muted px-3 py-2">
          <Text className={`italic leading-6 ${className}`} selectable>
            <Inline parts={block.children} />
          </Text>
        </View>
      );

    case 'code':
      return (
        <View className="rounded-lg bg-surface-muted px-3 py-2">
          <Text className="text-[13px] text-foreground" style={{ fontFamily: MONO }} selectable>
            {block.text}
          </Text>
        </View>
      );

    case 'list':
      return (
        <View className="gap-1">
          {block.items.map((item, i) => (
            <View key={i} className="flex-row gap-2">
              <Text className={`leading-6 ${className}`}>{block.ordered ? `${i + 1}.` : '•'}</Text>
              <Text className={`flex-1 leading-6 ${className}`} selectable>
                <Inline parts={item} />
              </Text>
            </View>
          ))}
        </View>
      );

    case 'image':
      return <HtmlImage src={block.src} alt={block.alt} />;

    case 'rule':
      return <View className="h-px bg-border" />;

    default:
      return (
        <Text className={`leading-6 ${className}`} selectable>
          <Inline parts={block.children} />
        </Text>
      );
  }
}

/** Android không có 'Menlo'; 'monospace' là tên font hệ thống dùng được ở cả hai nền tảng. */
const MONO = 'monospace';

function Inline({ parts }: { parts: InlineText[] }) {
  return (
    <>
      {parts.map((p, i) => {
        const style: TextStyle = {};
        if (p.styles.includes('bold')) style.fontWeight = '700';
        if (p.styles.includes('italic')) style.fontStyle = 'italic';
        if (p.styles.includes('code')) style.fontFamily = MONO;
        const line = [p.styles.includes('underline') && 'underline', p.styles.includes('strike') && 'line-through'].filter(Boolean);
        if (line.length) style.textDecorationLine = line.join(' ') as TextStyle['textDecorationLine'];

        if (p.href) {
          return (
            <Text key={i} className="text-info underline" style={style} onPress={() => void Linking.openURL(p.href!)}>
              {p.text}
            </Text>
          );
        }
        return (
          <Text key={i} style={style}>
            {p.text}
          </Text>
        );
      })}
    </>
  );
}

/**
 * Ảnh trong nội dung: giữ đúng tỉ lệ thật (đo lúc tải xong) để khung không nhảy, và đi qua
 * `useMediaUrl` vì ảnh của class-be là link `/uploads/file?key=` cần media token.
 */
function HtmlImage({ src, alt }: { src: string; alt?: string }) {
  const [ratio, setRatio] = useState(16 / 9);
  const uri = useMediaUrl(src);
  if (!uri) return null;
  return (
    <Image
      source={{ uri }}
      accessibilityLabel={alt}
      style={{ width: '100%', aspectRatio: ratio, borderRadius: 12 }}
      contentFit="contain"
      transition={120}
      onLoad={(e) => {
        const { width, height } = e.source;
        if (width && height) setRatio(width / height);
      }}
    />
  );
}
