import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, type ComponentProps, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { avatarColor } from '@/features/chat/room-avatar';
import { mediaCacheKey, resolveMediaUrl } from '@/lib/media';

import type { StudentClassItem } from './api';
import type { TeachingGroupItem } from './teach-api';
import { COURSE_TYPE_LABEL, STATUS_META, type StaffClassItem } from './staff-api';

type IconName = ComponentProps<typeof Ionicons>['name'];

const COVER_H = 104;

/**
 * Ảnh bìa lớp: ảnh lớp nếu có, không thì dải màu theo lớp (cùng màu với avatar phòng chat của lớp)
 * + mã lớp to. Phủ gradient tối ở đáy để chữ trắng đọc rõ trên mọi ảnh.
 */
export function Cover({
  id,
  code,
  image,
  token,
  height = COVER_H,
  children,
}: {
  id: string;
  code: string;
  image?: string | null;
  token?: string;
  /** Mặc định 104 (thẻ lớp ngoài danh sách); màn chi tiết dùng bản thấp hơn cho gọn. */
  height?: number;
  children?: ReactNode;
}) {
  const uri = resolveMediaUrl(image, token);
  const color = avatarColor(id);
  return (
    <View style={{ height, backgroundColor: color }}>
      {uri ? (
        <Image
          source={{ uri, cacheKey: mediaCacheKey(image) }}
          recyclingKey={id}
          style={{ position: 'absolute', inset: 0 }}
          contentFit="cover"
        />
      ) : (
        <>
          <View className="absolute -right-6 -top-10 h-36 w-36 rounded-full bg-white/10" />
          <View className="absolute -bottom-12 right-16 h-24 w-24 rounded-full bg-white/10" />
          <Text
            className="absolute bottom-2 left-4 font-black tracking-tight text-white/90"
            style={{ fontSize: Math.round(height / 3) }}>
            {code}
          </Text>
        </>
      )}
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.35)']}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 56 }}
      />
      <View className="absolute left-3 right-3 top-3 flex-row flex-wrap gap-1.5">{children}</View>
    </View>
  );
}

export function Pill({ label, icon, tone = 'light' }: { label: string; icon?: IconName; tone?: 'light' | 'dark' | 'danger' | 'success' }) {
  const bg = tone === 'dark' ? 'bg-black/45' : tone === 'danger' ? 'bg-danger' : tone === 'success' ? 'bg-success' : 'bg-white/90';
  const fg = tone === 'light' ? '#111827' : '#ffffff';
  return (
    <View className={`flex-row items-center gap-1 rounded-full px-2.5 py-1 ${bg}`}>
      {icon ? <Ionicons name={icon} size={11} color={fg} /> : null}
      <Text className="text-[11px] font-bold" style={{ color: fg }}>
        {label}
      </Text>
    </View>
  );
}

function Meta({ icon, text, color }: { icon: IconName; text: string; color: string }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <Ionicons name={icon} size={14} color={color} />
      <Text className="flex-1 text-[13px] text-muted" numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

function progressTone(progress: number) {
  if (progress >= 80) return { bar: 'bg-success', text: 'text-success' };
  if (progress >= 50) return { bar: 'bg-info', text: 'text-info' };
  if (progress >= 20) return { bar: 'bg-warning', text: 'text-warning' };
  return { bar: 'bg-danger', text: 'text-danger' };
}

const formatMoney = (v: number) => `${v.toLocaleString('vi-VN')}đ`;

/** Thẻ lớp của học viên: ảnh bìa, giáo viên, lịch học, tiến độ, bài tập, còn nợ học phí / bị khoá. */
export const ClassCard = memo(function ClassCard({
  item,
  token,
  muted,
  danger,
  onPress,
}: {
  item: StudentClassItem;
  token?: string;
  muted: string;
  danger: string;
  onPress?: () => void;
}) {
  const progress = Math.max(0, Math.min(100, Math.round(item.progress ?? 0)));
  const tone = progressTone(progress);
  const done = progress >= 100;
  const debt = Number(item.remaining_debt || 0);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="overflow-hidden rounded-2xl border border-border bg-surface active:opacity-90">
      <Cover id={item._id} code={item.class_code} image={item.cover_image} token={token}>
        {item.access_locked ? <Pill label="Đã khoá" icon="lock-closed" tone="danger" /> : null}
        <Pill label={done ? 'Hoàn thành' : 'Đang học'} icon={done ? 'checkmark-circle' : 'play-circle'} tone={done ? 'success' : 'light'} />
        {item.course_type ? <Pill label={COURSE_TYPE_LABEL[item.course_type] ?? item.course_type} tone="dark" /> : null}
      </Cover>

      <View className="gap-2.5 p-4">
        <View className="gap-0.5">
          <Text className="text-[17px] font-bold leading-6 text-foreground" numberOfLines={2}>
            {item.display_name || item.class_name}
          </Text>
          <Text className="text-xs font-semibold text-muted">{item.class_code}</Text>
        </View>

        {item.teacher?.name ? (
          <View className="flex-row items-center gap-2">
            <Avatar name={item.teacher.name} uri={resolveMediaUrl(item.teacher.avatar, token)} size={22} />
            <Text className="text-[13px] text-muted" numberOfLines={1}>
              GV <Text className="font-semibold text-foreground">{item.teacher.name}</Text>
            </Text>
          </View>
        ) : null}
        {item.class_time || item.schedule ? (
          <Meta icon="time-outline" color={muted} text={[item.schedule, item.class_time].filter(Boolean).join(' · ')} />
        ) : null}

        <View className="gap-1.5 pt-0.5">
          <View className="flex-row justify-between">
            <Text className="text-[13px] text-muted">
              {/* Đã nộp = tổng − chưa nộp; completed_assignments của class-be gần như luôn 0 (chỉ đếm status 'graded') */}
              Đã nộp{' '}
              <Text className="font-semibold text-foreground">
                {Math.max(0, item.total_assignments - (item.pending_assignments ?? 0))}/{item.total_assignments}
              </Text>
              {item.pending_assignments > 0 ? (
                <Text className="font-semibold text-warning"> · {item.pending_assignments} chưa làm</Text>
              ) : null}
            </Text>
            <Text className={`text-[13px] font-bold ${tone.text}`}>{progress}%</Text>
          </View>
          <View className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
            <View className={`h-full rounded-full ${tone.bar}`} style={{ width: `${progress}%` }} />
          </View>
        </View>

        {debt > 0 ? (
          <View className="flex-row items-center gap-1.5 self-start rounded-lg bg-danger-soft px-2.5 py-1.5">
            <Ionicons name="wallet-outline" size={13} color={danger} />
            <Text className="text-xs font-semibold text-danger">Còn nợ học phí {formatMoney(debt)}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
});

/** Thẻ lớp dạy (giáo viên / trợ giảng / quản trị): trạng thái, hình thức, sĩ số, số bài tập. */
export const StaffClassCard = memo(function StaffClassCard({
  item,
  token,
  muted,
  mine,
  onPress,
}: {
  item: StaffClassItem;
  token?: string;
  muted: string;
  mine: boolean;
  onPress?: () => void;
}) {
  const status = STATUS_META[item.status_class] ?? STATUS_META.ENDED;
  const fmt = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
  const dates = [fmt(item.start_date), fmt(item.end_date)].filter(Boolean).join(' → ');
  const statusTone = status.tone === 'success' ? 'success' : status.tone === 'neutral' ? 'dark' : 'light';
  const max = item.max_students && item.max_students < 10000 ? item.max_students : null;
  const fill = max ? Math.round((item.active_students / max) * 100) : 0;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="overflow-hidden rounded-2xl border border-border bg-surface active:opacity-90">
      <Cover id={item._id} code={item.class_code} image={item.class_image} token={token}>
        <Pill label={status.label} tone={statusTone} />
        <Pill label={COURSE_TYPE_LABEL[item.course_type] ?? item.course_type} tone="dark" />
        {mine ? <Pill label="Lớp của tôi" icon="star" tone="danger" /> : null}
      </Cover>

      <View className="gap-2.5 p-4">
        <View className="gap-0.5">
          <Text className="text-[17px] font-bold leading-6 text-foreground" numberOfLines={2}>
            {item.display_name || item.class_name}
          </Text>
          <Text className="text-xs font-semibold text-muted">{item.class_code}</Text>
        </View>
        {item.teacher?.name ? (
          <View className="flex-row items-center gap-2">
            <Avatar name={item.teacher.name} uri={resolveMediaUrl(item.teacher.avatar, token)} size={22} />
            <Text className="text-[13px] text-muted" numberOfLines={1}>
              GV <Text className="font-semibold text-foreground">{item.teacher.name}</Text>
            </Text>
          </View>
        ) : null}
        {item.class_time ? <Meta icon="time-outline" color={muted} text={item.class_time} /> : null}
        {dates ? <Meta icon="calendar-outline" color={muted} text={dates} /> : null}

        {/* Sĩ số dạng thanh như thanh tiến độ ở thẻ lớp học viên (sĩ số tối đa ≥10.000 = không giới hạn) */}
        <View className="gap-1.5 pt-0.5">
          <View className="flex-row justify-between">
            <Text className="text-[13px] text-muted">
              Học viên <Text className="font-semibold text-foreground">{item.active_students}</Text>
              {max ? <Text className="text-muted">/{max}</Text> : null}
              <Text className="text-muted"> · {item.assignment_count ?? 0} bài tập</Text>
            </Text>
            {max ? <Text className={`text-[13px] font-bold ${fill >= 90 ? 'text-warning' : 'text-info'}`}>{fill}%</Text> : null}
          </View>
          {max ? (
            <View className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
              <View className={`h-full rounded-full ${fill >= 90 ? 'bg-warning' : 'bg-info'}`} style={{ width: `${Math.min(100, fill)}%` }} />
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
});


/** "TYV95 - 20h30 T357 - 020426" (tên nội bộ CRM) → "T357 · 20h30"; tên đặt riêng thì không có lịch. */
function scheduleFromClassName(name: string, code: string) {
  const parts = name.split(' - ').map((p) => p.trim());
  if (parts[0] !== code || !parts[1]) return null;
  const m = parts[1].match(/(\d{1,2}h\d{2})\s+(T[\dCN]+)/);
  return m ? `${m[2]} · ${m[1]}` : null;
}

/**
 * Thẻ nhóm giảng dạy — CÙNG kiểu với thẻ lớp (StaffClassCard): ảnh bìa theo lớp (các nhóm cùng lớp
 * cùng màu), chip trạng thái, tên nhóm, trợ giảng, giáo viên, lịch, sĩ số dạng thanh.
 */
export const TeachingGroupCard = memo(function TeachingGroupCard({
  item,
  token,
  muted,
  onPress,
}: {
  item: TeachingGroupItem;
  token?: string;
  muted: string;
  onPress?: () => void;
}) {
  const status = STATUS_META[item.status_class] ?? STATUS_META.ENDED;
  const fmt = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
  const dates = [fmt(item.start_date), fmt(item.end_date)].filter(Boolean).join(' → ');
  const statusTone = status.tone === 'success' ? 'success' : status.tone === 'neutral' ? 'dark' : 'light';
  const count = item.student_ids?.length ?? 0;
  const max = item.max_students && item.max_students < 10000 ? item.max_students : null;
  const fill = max ? Math.round((count / max) * 100) : 0;
  const schedule = scheduleFromClassName(item.class_name, item.class_code);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="overflow-hidden rounded-2xl border border-border bg-surface active:opacity-90">
      <Cover id={item.class_id || item._id} code={item.class_code} image={item.cover_image} token={token}>
        <Pill label={status.label} tone={statusTone} />
        {item.course_type ? <Pill label={COURSE_TYPE_LABEL[item.course_type] ?? item.course_type} tone="dark" /> : null}
      </Cover>

      <View className="gap-2.5 p-4">
        <View className="gap-0.5">
          <Text className="text-[17px] font-bold leading-6 text-foreground" numberOfLines={2}>
            {item.group_name}
          </Text>
          <Text className="text-xs font-semibold text-muted">{item.class_code}</Text>
        </View>
        <View className="flex-row items-center gap-2">
          <Avatar name={item.assistant?.name || '?'} uri={resolveMediaUrl(item.assistant?.avatar, token)} size={22} />
          <Text className="flex-1 text-[13px] text-muted" numberOfLines={1}>
            TG <Text className="font-semibold text-foreground">{item.assistant?.name || 'Chưa có trợ giảng'}</Text>
            {item.teacher?.name ? <Text className="text-muted"> · GV {item.teacher.name}</Text> : null}
          </Text>
        </View>
        {schedule ? <Meta icon="time-outline" color={muted} text={schedule} /> : null}
        {dates ? <Meta icon="calendar-outline" color={muted} text={dates} /> : null}

        <View className="gap-1.5 pt-0.5">
          <View className="flex-row justify-between">
            <Text className="text-[13px] text-muted">
              Học viên <Text className="font-semibold text-foreground">{count}</Text>
              {max ? <Text className="text-muted">/{max}</Text> : null}
            </Text>
            {max ? <Text className={`text-[13px] font-bold ${fill >= 90 ? 'text-warning' : 'text-info'}`}>{fill}%</Text> : null}
          </View>
          {max ? (
            <View className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
              <View className={`h-full rounded-full ${fill >= 90 ? 'bg-warning' : 'bg-info'}`} style={{ width: `${Math.min(100, fill)}%` }} />
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
});
