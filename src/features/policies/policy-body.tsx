import { Ionicons } from '@expo/vector-icons';
import { Fragment, type ReactNode } from 'react';
import { Linking, Text, View } from 'react-native';

import { useThemeColor } from '@/theme/use-theme-color';

import type { PolicyNode } from './api';

type El = Exclude<PolicyNode, string>;

const INLINE = new Set(['strong', 'b', 'em', 'i', 'a', 'span', 'br', 'code']);
const isInline = (n: PolicyNode) => typeof n === 'string' || (INLINE.has(n.t) && n.cls !== 'section-id');
const textOf = (n: PolicyNode): string => (typeof n === 'string' ? n : (n.c ?? []).map(textOf).join(''));

/**
 * Vẽ native cây nội dung chính sách (sinh từ JSX của web — xem scripts/sync-policies.cjs).
 * Các class của web được dịch sang khối mobile: `content-card` = thẻ 1 Điều, `info-item` /
 * `contact-box` = dòng nhãn–giá trị, `highlight` / `note-box` / `warning-box` = hộp lưu ý.
 * `onSection` báo toạ độ của từng Điều (theo id) để màn chi tiết cuộn tới khi chọn mục lục.
 */
export function PolicyBody({ nodes, onSection }: { nodes: PolicyNode[]; onSection?: (id: string, y: number) => void }) {
  return (
    <View className="gap-3">
      {nodes.map((n, i) =>
        typeof n === 'object' && (n.cls === 'content-card' || n.cls === 'contact-card') ? (
          <View key={i} onLayout={n.id ? (e) => onSection?.(n.id!, e.nativeEvent.layout.y) : undefined}>
            <Card node={n} />
          </View>
        ) : (
          <Blocks key={i} nodes={[n]} />
        ),
      )}
    </View>
  );
}

function Card({ node }: { node: El }) {
  const contact = node.cls === 'contact-card';
  const label = node.c?.find((x) => typeof x === 'object' && x.cls === 'section-id');
  const title = node.c?.find((x) => typeof x === 'object' && x.t === 'h2');
  const rest = (node.c ?? []).filter((x) => x !== label && x !== title);
  return (
    <View className={`gap-3 rounded-3xl p-4 ${contact ? 'bg-brand-soft' : 'bg-surface'}`}>
      <View className="gap-1">
        {label ? <Text className="text-[12px] font-bold uppercase tracking-wider text-brand">{textOf(label)}</Text> : null}
        {title ? <Text className="text-[17px] font-extrabold leading-6 text-foreground">{textOf(title)}</Text> : null}
      </View>
      <Blocks nodes={rest} />
    </View>
  );
}

/** Danh sách con: gom các nút chữ/inline liền nhau thành 1 <Text>, khối thì vẽ riêng. */
function Blocks({ nodes }: { nodes: PolicyNode[] }) {
  const out: ReactNode[] = [];
  let run: PolicyNode[] = [];
  const flush = () => {
    if (run.length && run.some((x) => textOf(x).trim())) {
      out.push(
        <Text key={`t${out.length}`} className="text-[15px] leading-6 text-foreground">
          <Inline nodes={trimRun(run)} />
        </Text>,
      );
    }
    run = [];
  };
  for (const n of nodes) {
    if (isInline(n)) run.push(n);
    else {
      flush();
      out.push(<Block key={`b${out.length}`} node={n as El} />);
    }
  }
  flush();
  return <View className="gap-2.5">{out}</View>;
}

function Block({ node }: { node: El }) {
  const brand = useThemeColor('brand');
  const children = node.c ?? [];
  switch (node.t) {
    case 'p':
      return <Blocks nodes={children} />;
    case 'h2':
      return <Text className="pt-1 text-[17px] font-extrabold leading-6 text-foreground">{textOf(node)}</Text>;
    case 'h3':
    case 'h4':
      return <Text className="pt-1 text-[15.5px] font-bold leading-6 text-foreground">{textOf(node)}</Text>;
    case 'ul':
    case 'ol':
      return (
        <View className="gap-2">
          {children
            .filter((li): li is El => typeof li === 'object')
            .map((li, i) => (
              <View key={i} className="flex-row gap-2.5">
                {node.t === 'ol' ? (
                  <Text className="min-w-[18px] text-[15px] font-bold leading-6 text-brand">{i + 1}.</Text>
                ) : (
                  <View className="mt-[9px] h-1.5 w-1.5 rounded-full" style={{ backgroundColor: brand }} />
                )}
                <View className="flex-1">
                  <Blocks nodes={li.c ?? []} />
                </View>
              </View>
            ))}
        </View>
      );
    case 'div':
      if (node.cls === 'info-grid' || node.cls === 'contact-grid')
        return (
          <View className={`overflow-hidden rounded-2xl ${node.cls === 'contact-grid' ? 'bg-surface' : 'bg-surface-muted'}`}>
            {children.map((item, i) => (typeof item === 'object' ? <LabelValue key={i} node={item} first={i === 0} /> : null))}
          </View>
        );
      if (node.cls === 'info-item' || node.cls === 'contact-box') return <LabelValue node={node} first />;
      if (node.cls === 'highlight' || node.cls === 'note-box' || node.cls === 'warning-box') return <Callout node={node} />;
      return <Blocks nodes={children} />;
    case 'li':
      return <Blocks nodes={children} />;
    default:
      return <Blocks nodes={children} />;
  }
}

/** `<strong>Nhãn</strong>Giá trị` → dòng nhãn nhỏ + giá trị (bấm được nếu là link). */
function LabelValue({ node, first }: { node: El; first?: boolean }) {
  const label = node.c?.find((x) => typeof x === 'object' && (x.t === 'strong' || x.t === 'b'));
  const rest = (node.c ?? []).filter((x) => x !== label);
  return (
    <View className={`gap-0.5 px-3.5 py-2.5 ${first ? '' : 'border-t border-border'}`}>
      {label ? <Text className="text-[12.5px] text-muted">{textOf(label)}</Text> : null}
      <Text className="text-[15px] font-semibold leading-6 text-foreground">
        <Inline nodes={trimRun(rest)} />
      </Text>
    </View>
  );
}

function Callout({ node }: { node: El }) {
  const warn = node.cls === 'warning-box';
  const color = useThemeColor(warn ? 'warning' : 'info');
  return (
    <View className={`flex-row gap-2.5 rounded-2xl p-3.5 ${warn ? 'bg-warning-soft' : 'bg-info-soft'}`}>
      <Ionicons name={warn ? 'warning' : 'information-circle'} size={18} color={color} style={{ marginTop: 2 }} />
      <View className="flex-1">
        <Blocks nodes={node.c ?? []} />
      </View>
    </View>
  );
}

function Inline({ nodes }: { nodes: PolicyNode[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        if (typeof n === 'string') return <Fragment key={i}>{n}</Fragment>;
        if (n.t === 'br') return <Fragment key={i}>{'\n'}</Fragment>;
        if (n.t === 'a' && n.href && !n.href.startsWith('#'))
          return (
            <Text key={i} className="font-semibold text-brand underline" onPress={() => void Linking.openURL(n.href!)}>
              <Inline nodes={n.c ?? []} />
            </Text>
          );
        if (n.t === 'strong' || n.t === 'b')
          return (
            <Text key={i} className="font-bold">
              <Inline nodes={n.c ?? []} />
            </Text>
          );
        if (n.t === 'em' || n.t === 'i')
          return (
            <Text key={i} className="italic">
              <Inline nodes={n.c ?? []} />
            </Text>
          );
        return <Inline key={i} nodes={n.c ?? []} />;
      })}
    </>
  );
}

/** Bỏ khoảng trắng thừa đầu/cuối đoạn (JSX để lại khi xuống dòng quanh thẻ). */
function trimRun(run: PolicyNode[]): PolicyNode[] {
  const out = [...run];
  if (typeof out[0] === 'string') out[0] = out[0].replace(/^\s+/, '');
  const last = out.length - 1;
  if (typeof out[last] === 'string') out[last] = (out[last] as string).replace(/\s+$/, '');
  return out;
}
