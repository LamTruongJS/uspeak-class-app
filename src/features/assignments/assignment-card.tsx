import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { memo, useState, type ComponentProps } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ASSIGNMENT_3D_ICONS } from '@/constants/three-d-icons';
import { formatTime, isSameDay, addDays, startOfDay } from '@/lib/format';
import { useThemeColor, type ThemeColor } from '@/theme/use-theme-color';

import { getAssignmentScore, getAssignmentStatusView, type StudentAssignmentItem } from './api';

/**
 * `session_number` lúc là số ("11"), lúc là cả tên buổi ("Buổi 11: bài tập tự hỏi…") — ghép thẳng
 * "Buổi " vào thì ra "Buổi Buổi 11: …" lặp lại tiêu đề. Chỉ lấy phần "Buổi N".
 */
export function sessionLabel(raw?: string) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return `Buổi ${s}`;
  const m = s.match(/buổi\s*(\d+)/i);
  return m ? `Buổi ${m[1]}` : null;
}

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Icon + màu theo loại bài (đoán theo mã / nhãn loại bài của web). */
export function assignmentKind(a: Pick<StudentAssignmentItem, 'assignment_type' | 'shadowing'>): {
  icon: IconName;
  icon3d?: number;
  color: ThemeColor;
  box: string;
} {
  const t = `${a.assignment_type?.code ?? ''} ${a.assignment_type?.label ?? ''}`.toLowerCase();
  if (a.shadowing || t.includes('shadow') || t.includes('dictation'))
    return { icon: 'headset', icon3d: ASSIGNMENT_3D_ICONS.shadowing, color: 'violet', box: 'bg-violet-soft' };
  if (t.includes('quiz') || t.includes('trắc nghiệm') || t.includes('test'))
    return { icon: 'help-circle', icon3d: ASSIGNMENT_3D_ICONS.quiz, color: 'warning', box: 'bg-warning-soft' };
  if (t.includes('ảnh') || t.includes('image') || t.includes('viết') || t.includes('writing'))
    return { icon: 'image', icon3d: ASSIGNMENT_3D_ICONS.imageUpload, color: 'success', box: 'bg-success-soft' };
  if (t.includes('video') || t.includes('speaking') || t.includes('nói'))
    return { icon: 'videocam', icon3d: ASSIGNMENT_3D_ICONS.videoSpeaking, color: 'brand', box: 'bg-brand-soft' };
  return { icon: 'document-text', icon3d: ASSIGNMENT_3D_ICONS.generic, color: 'info', box: 'bg-info-soft' };
}

/** "Hết hạn hôm nay 23:00" / "Còn 3 ngày" / "Quá hạn 2 ngày" — hạn nộp theo kiểu đọc nhanh trên điện thoại. */
export function deadlineText(deadline: Date, now: number): { text: string; tone: 'danger' | 'warning' | 'muted' } {
  const diff = deadline.getTime() - now;
  const today = new Date(now);
  if (diff < 0) {
    const days = Math.floor(-diff / 86_400_000);
    return { text: days >= 1 ? `Quá hạn ${days} ngày` : 'Đã quá hạn', tone: 'danger' };
  }
  if (isSameDay(deadline, today)) return { text: `Hết hạn hôm nay ${formatTime(deadline)}`, tone: 'danger' };
  if (isSameDay(deadline, addDays(startOfDay(today), 1))) return { text: `Hạn ngày mai ${formatTime(deadline)}`, tone: 'warning' };
  const days = Math.ceil((startOfDay(deadline).getTime() - startOfDay(today).getTime()) / 86_400_000);
  return { text: `Còn ${days} ngày`, tone: days <= 3 ? 'warning' : 'muted' };
}

const PILL: Record<string, { box: string; text: string }> = {
  neutral: { box: 'bg-surface-muted', text: 'text-muted' },
  info: { box: 'bg-info-soft', text: 'text-info' },
  success: { box: 'bg-success-soft', text: 'text-success' },
  warning: { box: 'bg-warning-soft', text: 'text-warning' },
  danger: { box: 'bg-danger-soft', text: 'text-danger' },
  violet: { box: 'bg-violet-soft', text: 'text-violet' },
  brand: { box: 'bg-brand-soft', text: 'text-brand' },
};

/**
 * Thẻ 1 bài tập của học viên (tab Bài tập + chi tiết lớp): icon theo loại bài, tên bài, "Lớp · Buổi · Loại",
 * dưới cùng là trạng thái + hạn nộp kiểu "Còn 3 ngày" (hoặc điểm khi đã chấm). Không còn viền màu trái và
 * đoạn mô tả 2 dòng như bản web — mô tả xem trong màn bài tập.
 */
export const AssignmentCard = memo(function AssignmentCard({
  item,
  onPress,
  showClass,
}: {
  item: StudentAssignmentItem;
  onPress?: () => void;
  /** Danh sách gộp nhiều lớp → hiện mã lớp */
  showClass?: boolean;
}) {
  const muted = useThemeColor('muted');
  const success = useThemeColor('success');
  const kind = assignmentKind(item);
  const tint = useThemeColor(kind.color);
  const status = getAssignmentStatusView(item);
  const score = getAssignmentScore(item);

  // Mốc "bây giờ" chốt lúc thẻ mount (React Compiler cấm gọi Date.now() trong render).
  const [now] = useState(Date.now);
  const deadline = item.submission_deadline ? new Date(item.submission_deadline) : null;
  const notDone = !item.submission;
  const due = deadline && notDone ? deadlineText(deadline, now) : null;
  // Quá hạn + chưa nộp + không cho nộp trễ → không làm được nữa (web cũng làm mờ).
  const locked = !!due && due.tone === 'danger' && deadline!.getTime() < now && item.allow_late_submission === false;
  const redo = item.submission?.status === 'redo_requested';
  const meta = [showClass ? item.class_code : null, sessionLabel(item.session_number), item.assignment_type?.label]
    .filter(Boolean)
    .join(' · ');
  const sh = item.shadowing;
  const shPct = sh && sh.parts_total ? Math.round(((sh.progress?.parts_completed ?? 0) / sh.parts_total) * 100) : null;

  return (
    <Pressable
      onPress={locked ? undefined : onPress}
      accessibilityRole="button"
      className={`flex-row gap-3 rounded-3xl bg-surface p-3.5 ${locked ? 'opacity-50' : 'active:opacity-80'}`}>
      <View className={`h-11 w-11 items-center justify-center overflow-hidden rounded-2xl ${kind.icon3d ? '' : kind.box}`}>
        {kind.icon3d ? (
          <Image source={kind.icon3d} style={{ width: 42, height: 42 }} contentFit="contain" />
        ) : (
          <Ionicons name={kind.icon} size={20} color={tint} />
        )}
      </View>
      <View className="flex-1 gap-1">
        <Text className="text-[15px] font-semibold leading-5 text-foreground" numberOfLines={2}>
          {item.title}
        </Text>
        {meta ? (
          <Text className="text-[12.5px] text-muted" numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
        {shPct !== null && notDone ? (
          <View className="flex-row items-center gap-2 pt-0.5">
            <View className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
              <View className="h-full rounded-full bg-violet" style={{ width: `${shPct}%` }} />
            </View>
            <Text className="text-[11.5px] font-semibold text-violet">
              {sh!.progress?.parts_completed ?? 0}/{sh!.parts_total} phần
            </Text>
          </View>
        ) : null}
        <View className="flex-row flex-wrap items-center gap-1.5 pt-1">
          {redo ? <Pill text="Cần làm lại" tone="violet" /> : notDone ? null : <Pill text={status.label} tone={status.tone} />}
          {item.submission?.is_late && !redo ? <Pill text="Trễ hạn" tone="warning" /> : null}
          {score ? (
            <View className="flex-row items-center gap-1 rounded-full bg-success-soft px-2 py-0.5">
              <Ionicons name="star" size={11} color={success} />
              <Text className="text-[12px] font-bold text-success">{score}</Text>
            </View>
          ) : null}
          {due ? (
            <View
              className={`flex-row items-center gap-1 rounded-full px-2 py-0.5 ${PILL[due.tone === 'muted' ? 'neutral' : due.tone].box}`}>
              <Ionicons
                name="time-outline"
                size={12}
                color={due.tone === 'muted' ? muted : due.tone === 'danger' ? '#dc2626' : '#d97706'}
              />
              <Text className={`text-[12px] font-semibold ${PILL[due.tone === 'muted' ? 'neutral' : due.tone].text}`}>
                {locked ? 'Đã đóng nộp bài' : due.text}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      {!locked ? <Ionicons name="chevron-forward" size={16} color={muted} style={{ alignSelf: 'center' }} /> : null}
    </Pressable>
  );
});

function Pill({ text, tone }: { text: string; tone: string }) {
  const p = PILL[tone] ?? PILL.neutral;
  return (
    <View className={`rounded-full px-2 py-0.5 ${p.box}`}>
      <Text className={`text-[12px] font-semibold ${p.text}`}>{text}</Text>
    </View>
  );
}
