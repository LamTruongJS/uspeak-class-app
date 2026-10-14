import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { formatTime, isSameDay } from '@/lib/format';
import { useThemeColor, type ThemeColor } from '@/theme/use-theme-color';

import { shortClassName, type ScheduleEvent } from './api';

/** Tên hiển thị của lớp (display_name) — tra từ danh sách lớp của học viên. */
export interface ClassLabel {
  name: string;
  code: string;
}

const KIND: Record<ScheduleEvent['type'], { icon: ComponentProps<typeof Ionicons>['name']; box: string; color: ThemeColor }> = {
  class: { icon: 'videocam', box: 'bg-info-soft', color: 'info' },
  deadline: { icon: 'document-text', box: 'bg-danger-soft', color: 'danger' },
  redo: { icon: 'refresh', box: 'bg-violet-soft', color: 'violet' },
};

interface EventRowProps {
  event: ScheduleEvent;
  label?: ClassLabel;
  now: number;
  onPress?: () => void;
  /** Buổi học: bấm nút "Vào lớp" (tách khỏi thân thẻ — bấm thẻ là MỞ LỚP, không phải vào Zoom) */
  onJoin?: () => void;
  /** Buổi học: đang mở Zoom */
  joining?: boolean;
}

/**
 * 1 sự kiện trong lịch: cột giờ bên trái + thẻ bên phải (kiểu agenda của app lịch).
 * Buổi học đang diễn ra / sắp bắt đầu thì nút "Vào lớp" to, xanh lá; hạn nộp đã nộp thì mờ + "Đã nộp".
 */
export function EventRow({ event, label, now, onPress, onJoin, joining }: EventRowProps) {
  const kind = KIND[event.type];
  const tint = useThemeColor(kind.color);
  const onBrand = useThemeColor('on-brand');
  const muted = useThemeColor('muted');
  const success = useThemeColor('success');
  const isClass = event.type === 'class';
  const live = isLive(event, now);
  const ongoing = isClass && !!event.end && now >= event.start.getTime() && now <= event.end.getTime();
  const ended = isClass && !!event.end && now > event.end.getTime();
  const overdue = !isClass && !event.done && event.start.getTime() < now;

  const title = isClass ? (label?.name ?? shortClassName(event.title, event.classCode)) : event.title;
  const code = label?.code ?? event.classCode;
  const meta = isClass
    ? [code !== title ? code : null, event.subtitle].filter(Boolean).join(' · ')
    : [event.type === 'redo' ? 'Hạn làm lại' : 'Hạn nộp', label?.code ?? event.subtitle].filter(Boolean).join(' · ');

  return (
    <View className="flex-row gap-3">
      <View className="w-12 items-end pt-3.5">
        <Text className={`text-[15px] font-bold ${ended || event.done ? 'text-muted' : 'text-foreground'}`}>{formatTime(event.start)}</Text>
        {event.end ? <Text className="text-[12px] text-muted">{formatTime(event.end)}</Text> : null}
      </View>

      <Pressable
        onPress={onPress}
        className={`flex-1 gap-3 rounded-2xl border bg-surface p-3.5 active:opacity-80 ${live ? 'border-success' : 'border-border'} ${
          ended || event.done ? 'opacity-60' : ''
        }`}>
        <View className="flex-row items-center gap-3">
          <View className={`h-10 w-10 items-center justify-center rounded-xl ${event.done ? 'bg-success-soft' : kind.box}`}>
            <Ionicons name={event.done ? 'checkmark' : kind.icon} size={19} color={event.done ? success : tint} />
          </View>
          <View className="flex-1 gap-0.5">
            <Text className="text-[15px] font-bold leading-5 text-foreground" numberOfLines={2}>
              {title}
            </Text>
            {meta ? (
              <Text className="text-[12.5px] text-muted" numberOfLines={1}>
                {meta}
              </Text>
            ) : null}
          </View>
          {!isClass ? (
            <StatusPill
              text={event.done ? 'Đã nộp' : overdue ? 'Quá hạn' : event.type === 'redo' ? 'Làm lại' : 'Chưa nộp'}
              tone={event.done ? 'success' : overdue ? 'danger' : event.type === 'redo' ? 'violet' : 'warning'}
            />
          ) : ongoing ? (
            <StatusPill text="Đang học" tone="success" />
          ) : ended ? (
            <StatusPill text="Đã xong" tone="muted" />
          ) : isSameDay(event.start, new Date(now)) ? null : (
            <Ionicons name="videocam-outline" size={18} color={muted} />
          )}
        </View>

        {/*
          Nút Vào lớp là NÚT RIÊNG, chỉ hiện cho buổi trong hôm nay. Trước đây bấm vào bất kỳ chỗ nào
          của thẻ cũng mở Zoom — kể cả buổi 3 ngày nữa, vào một phòng chưa mở. Giờ bấm thẻ là mở
          chi tiết lớp, muốn vào học thì bấm đúng nút này.
        */}
        {isClass && !ended && isSameDay(event.start, new Date(now)) ? (
          <Pressable
            onPress={onJoin}
            accessibilityRole="button"
            accessibilityLabel={live ? 'Vào lớp ngay' : 'Vào lớp'}
            className={`h-10 flex-row items-center justify-center gap-1.5 rounded-xl active:opacity-80 ${live ? 'bg-success' : 'bg-info-soft'}`}>
            {joining ? (
              <ActivityIndicator size="small" color={live ? onBrand : tint} />
            ) : (
              <Ionicons name="videocam" size={17} color={live ? onBrand : tint} />
            )}
            <Text className={`text-[14px] font-bold ${live ? 'text-on-brand' : 'text-info'}`}>{live ? 'Vào lớp ngay' : 'Vào lớp'}</Text>
          </Pressable>
        ) : null}
      </Pressable>
    </View>
  );
}

const PILL: Record<'success' | 'danger' | 'warning' | 'violet' | 'muted', { box: string; text: string }> = {
  success: { box: 'bg-success-soft', text: 'text-success' },
  danger: { box: 'bg-danger-soft', text: 'text-danger' },
  warning: { box: 'bg-warning-soft', text: 'text-warning' },
  violet: { box: 'bg-violet-soft', text: 'text-violet' },
  muted: { box: 'bg-surface-muted', text: 'text-muted' },
};

function StatusPill({ text, tone }: { text: string; tone: keyof typeof PILL }) {
  return (
    <View className={`rounded-full px-2 py-1 ${PILL[tone].box}`}>
      <Text className={`text-[11px] font-bold ${PILL[tone].text}`}>{text}</Text>
    </View>
  );
}

/** Buổi học đang diễn ra hoặc còn ≤ 15 phút nữa bắt đầu. */
export function isLive(event: ScheduleEvent, now: number) {
  if (event.type !== 'class' || !event.end) return false;
  return now >= event.start.getTime() - 15 * 60_000 && now <= event.end.getTime();
}
