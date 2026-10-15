import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { StateView } from '@/components/ui/state-view';
import { CLASS_CONTENT_3D_ICONS, ELEARNING_NODE_3D_ICONS } from '@/constants/three-d-icons';
import { getErrorMessage } from '@/lib/api/client';
import { useThemeColor } from '@/theme/use-theme-color';

import {
  buildNodeTree,
  flattenContentNodes,
  NODE_ICON,
  NODE_LABEL,
  nodeTitle,
  useStudentTree,
  type ElearningNode,
} from './api';
import { openAssignmentById } from './open-assignment';

/**
 * Mục lục E-Learning của lớp: thẻ "Học tiếp" (mục chưa học đầu tiên) + các phần học, mỗi phần là
 * một khối liền có vạch ngăn kiểu danh sách iOS (không lồng thẻ trong thẻ như bản web).
 * Dùng chung cho tab "E-Learning" trong chi tiết lớp và màn E-Learning riêng — component này
 * KHÔNG tự cuộn, màn ngoài lo phần cuộn.
 */
export function ElearningOutline({ classId }: { classId: string }) {
  const brand = useThemeColor('brand');
  const tree = useStudentTree(classId);

  const roots = useMemo(() => buildNodeTree(tree.data ?? []), [tree.data]);
  const contentNodes = useMemo(() => flattenContentNodes(roots), [roots]);
  const done = contentNodes.filter((n) => n.is_completed).length;
  const percent = contentNodes.length ? Math.round((done / contentNodes.length) * 100) : 0;
  const next = contentNodes.find((n) => !n.is_completed);

  if (tree.isLoading) return <ActivityIndicator className="py-8" color={brand} />;

  if (tree.isError) {
    return (
      <StateView
        icon="cloud-offline-outline"
        title="Không tải được nội dung E-Learning"
        description={getErrorMessage(tree.error)}
        actionLabel="Thử lại"
        onAction={() => tree.refetch()}
      />
    );
  }

  if (contentNodes.length === 0) {
    return <StateView icon="play-circle-outline" title="Lớp chưa có nội dung E-Learning" />;
  }

  return (
    <View className="gap-5">
      <ContinueCard next={next} classId={classId} done={done} total={contentNodes.length} percent={percent} />
      {roots.map((node) =>
        node.type === 'section' ? (
          <SectionGroup key={node._id} node={node} classId={classId} />
        ) : (
          <View key={node._id} className="overflow-hidden rounded-3xl border border-border bg-surface">
            <LeafRow node={node} classId={classId} last />
          </View>
        ),
      )}
    </View>
  );
}

function openNode(node: ElearningNode, classId: string) {
  // Bài tập đã có màn làm bài / kết quả riêng trong app — không mở lại trong E-Learning.
  if (node.type === 'assignment') {
    openAssignmentById(node.ref_id || node._id);
    return;
  }
  router.push({ pathname: '/elearning/item/[nodeId]', params: { nodeId: node._id, classId } });
}

/** Thẻ "Học tiếp": mục chưa học đầu tiên theo đúng thứ tự giáo trình — 1 chạm là học tiếp. */
function ContinueCard({
  next,
  classId,
  done,
  total,
  percent,
}: {
  next?: ElearningNode;
  classId: string;
  done: number;
  total: number;
  percent: number;
}) {
  const success = useThemeColor('success');

  return (
    <Pressable
      disabled={!next}
      onPress={() => next && openNode(next, classId)}
      className="gap-3 rounded-3xl border border-border bg-surface p-4 active:opacity-90">
      {next ? (
        <View className="flex-row items-center gap-3.5">
          <View className="flex-1 gap-1">
            <Text className="text-[12px] font-bold uppercase tracking-wide text-brand">{done ? 'Học tiếp' : 'Bắt đầu học'}</Text>
            <Text className="text-[15.5px] font-bold leading-5 text-foreground" numberOfLines={2}>
              {nodeTitle(next)}
            </Text>
            <Text className="text-[12px] text-muted">{NODE_LABEL[next.type] ?? 'Nội dung'}</Text>
          </View>
          <Image source={CLASS_CONTENT_3D_ICONS.elearning} style={{ width: 52, height: 52 }} contentFit="contain" accessible={false} />
        </View>
      ) : (
        <View className="flex-row items-center gap-3">
          <Ionicons name="trophy" size={26} color={success} />
          <Text className="flex-1 text-[15px] font-bold text-foreground">Bạn đã học hết nội dung E-Learning của lớp</Text>
        </View>
      )}

      <View className="gap-1.5">
        <View className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
          <View className={`h-full rounded-full ${next ? 'bg-brand' : 'bg-success'}`} style={{ width: `${percent}%` }} />
        </View>
        <Text className="text-[11.5px] text-muted">
          Đã học {done}/{total} mục · {percent}%
        </Text>
      </View>
    </Pressable>
  );
}

/** Phần học cấp 1: tiêu đề nằm ngoài, các mục bên trong xếp liền một khối có vạch ngăn. */
function SectionGroup({ node, classId }: { node: ElearningNode; classId: string }) {
  const muted = useThemeColor('muted');
  const [open, setOpen] = useState(true);
  const leaves = flattenContentNodes([node]);
  const done = leaves.filter((n) => n.is_completed).length;
  const children = node.children ?? [];
  const complete = leaves.length > 0 && done === leaves.length;

  return (
    <View className="gap-2">
      <Pressable onPress={() => setOpen((v) => !v)} hitSlop={6} className="flex-row items-center gap-2 px-1 active:opacity-60">
        <Text className="flex-1 text-[15px] font-bold text-foreground" numberOfLines={2}>
          {node.section_name || 'Phần học'}
        </Text>
        {leaves.length ? (
          <Text className={`text-[12px] font-semibold ${complete ? 'text-success' : 'text-muted'}`}>
            {done}/{leaves.length}
          </Text>
        ) : null}
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={muted} />
      </Pressable>

      {open ? (
        <View className="overflow-hidden rounded-3xl border border-border bg-surface">
          {children.length === 0 ? <Text className="p-4 text-[13px] text-muted">Phần này chưa có nội dung.</Text> : null}
          {children.map((child, i) => (
            <NodeRows key={child._id} node={child} classId={classId} depth={1} last={i === children.length - 1} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Mục con: nội dung → 1 dòng; phần học lồng → dòng tiêu đề phụ (thu gọn được) + các dòng con thụt vào. */
function NodeRows({ node, classId, depth, last }: { node: ElearningNode; classId: string; depth: number; last: boolean }) {
  const muted = useThemeColor('muted');
  const [open, setOpen] = useState(true);
  if (node.type !== 'section') return <LeafRow node={node} classId={classId} last={last} indent={depth - 1} />;

  const children = node.children ?? [];
  const leaves = flattenContentNodes([node]);
  const done = leaves.filter((n) => n.is_completed).length;
  return (
    <View>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        className="flex-row items-center gap-2 bg-surface-muted py-2.5 pr-4 active:opacity-70"
        style={{ paddingLeft: 16 + (depth - 1) * 14 }}>
        <Ionicons name={open ? 'folder-open' : 'folder'} size={15} color={muted} />
        <Text className="flex-1 text-[13px] font-bold text-foreground" numberOfLines={2}>
          {node.section_name || 'Phần học'}
        </Text>
        {leaves.length ? (
          <Text className="text-[11.5px] text-muted">
            {done}/{leaves.length}
          </Text>
        ) : null}
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={muted} />
      </Pressable>
      {open
        ? children.map((child, i) => (
            <NodeRows key={child._id} node={child} classId={classId} depth={depth + 1} last={last && i === children.length - 1} />
          ))
        : null}
    </View>
  );
}

// Viết đủ tên class (không ghép chuỗi) để Tailwind quét được.
const TYPE_TONE: Record<string, { box: string; color: 'brand' | 'info' | 'violet' | 'warning' }> = {
  video: { box: 'bg-brand-soft', color: 'brand' },
  lesson_content: { box: 'bg-info-soft', color: 'info' },
  practice: { box: 'bg-violet-soft', color: 'violet' },
  assignment: { box: 'bg-warning-soft', color: 'warning' },
};

function LeafRow({ node, classId, last, indent = 0 }: { node: ElearningNode; classId: string; last: boolean; indent?: number }) {
  const muted = useThemeColor('muted');
  const success = useThemeColor('success');
  const tone = TYPE_TONE[node.type] ?? TYPE_TONE.lesson_content;
  const tint = useThemeColor(tone.color);
  const icon = NODE_ICON[node.type] ?? 'document-text';
  const icon3d = ELEARNING_NODE_3D_ICONS[node.type];
  const left = 16 + indent * 14;

  return (
    <Pressable
      onPress={() => openNode(node, classId)}
      className="flex-row items-center gap-3 py-3 pr-4 active:bg-surface-muted"
      style={{ paddingLeft: left }}>
      <View
        className={`h-10 w-10 items-center justify-center rounded-xl ${
          node.is_completed ? 'bg-success-soft' : icon3d ? '' : tone.box
        }`}>
        {node.is_completed ? (
          <Ionicons name="checkmark" size={20} color={success} />
        ) : icon3d ? (
          <Image source={icon3d} style={{ width: 40, height: 40 }} contentFit="contain" accessible={false} />
        ) : (
          <Ionicons name={icon} size={18} color={tint} />
        )}
      </View>
      <View className="flex-1 gap-0.5">
        <Text
          className={`text-[14.5px] font-medium leading-5 ${node.is_completed ? 'text-muted' : 'text-foreground'}`}
          numberOfLines={2}>
          {nodeTitle(node)}
        </Text>
        <Text className="text-[12px] text-muted">
          {NODE_LABEL[node.type] ?? 'Nội dung'}
          {node.is_completed ? ' · Đã học' : ''}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={15} color={muted} />
      {!last ? <View className="absolute bottom-0 right-0 h-px bg-border" style={{ left: left + 52 }} /> : null}
    </Pressable>
  );
}
