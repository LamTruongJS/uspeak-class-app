import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState, type ComponentProps } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { ProgressRing } from '@/components/ui/progress-ring';
import { CLASS_QUICK_ACTION_3D_ICONS } from '@/constants/three-d-icons';
import { avatarColor } from '@/features/chat/room-avatar';
import { formatDate, formatVnd, WEEKDAY_SHORT } from '@/lib/format';
import { mediaCacheKey, resolveMediaUrl } from '@/lib/media';
import { useThemeColor, type ThemeColor } from '@/theme/use-theme-color';

import type { StudentClassItem } from './api';
import { countdownLabel, nextSession, scheduleParts, sessionDayLabel } from './next-session';
import { COURSE_TYPE_LABEL } from './staff-api';

/**
 * Phần đầu màn chi tiết lớp của học viên — làm theo kiểu app (ảnh bìa tràn viền, tấm nội dung bo góc
 * đè lên ảnh, thẻ buổi học kế tiếp + nút vào lớp, lối tắt dạng icon, vòng tiến độ) thay cho khối
 * thông tin "nhãn: giá trị" chép từ web.
 */

type IconName = ComponentProps<typeof Ionicons>['name'];

export const HERO_COVER_H = 184;

export interface CoverChip {
  label: string;
  icon?: ComponentProps<typeof Ionicons>['name'];
  /** light = nền trắng chữ đen · dark = nền tối mờ · success = nền xanh */
  tone: 'light' | 'dark' | 'success';
}

/**
 * Ảnh bìa tràn lên thanh trạng thái, dùng chung cho chi tiết lớp học viên và lớp dạy: ảnh lớp nếu có,
 * không thì nền màu theo lớp (cùng màu avatar phòng chat) + mã lớp mờ; tên lớp chữ trắng ở đáy.
 */
export function ClassCover({
  id,
  image,
  title,
  code,
  chips,
  token,
  topInset,
}: {
  id: string;
  image?: string | null;
  title: string;
  code: string;
  chips: CoverChip[];
  token?: string;
  topInset: number;
}) {
  const uri = resolveMediaUrl(image, token);
  return (
    <View style={{ height: topInset + HERO_COVER_H, backgroundColor: avatarColor(id) }} className="overflow-hidden">
      {uri ? (
        <Image
          source={{ uri, cacheKey: mediaCacheKey(image) }}
          style={{ position: 'absolute', inset: 0 }}
          contentFit="cover"
          transition={150}
        />
      ) : (
        <>
          <View className="absolute -right-10 -top-6 h-48 w-48 rounded-full bg-white/10" />
          <View className="absolute -left-8 bottom-6 h-28 w-28 rounded-full bg-white/5" />
          <Text
            className="absolute right-4 font-black tracking-tighter text-white/15"
            style={{ top: topInset + 40, fontSize: 64 }}
            numberOfLines={1}>
            {code}
          </Text>
        </>
      )}
      {/* Tối dần xuống đáy để chữ trắng đọc được trên mọi ảnh bìa */}
      <LinearGradient
        colors={['rgba(0,0,0,0.25)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.6)']}
        locations={[0, 0.35, 1]}
        style={{ position: 'absolute', inset: 0 }}
      />

      <View className="absolute bottom-0 left-0 right-0 gap-1.5 px-5 pb-9">
        <View className="flex-row flex-wrap gap-1.5">
          {chips.map((c) => {
            const bg = c.tone === 'success' ? 'bg-success' : c.tone === 'light' ? 'bg-white/90' : 'bg-black/40';
            const fg = c.tone === 'light' ? '#111827' : '#ffffff';
            return (
              <View key={c.label} className={`flex-row items-center gap-1 rounded-full px-2.5 py-1 ${bg}`}>
                {c.icon ? <Ionicons name={c.icon} size={11} color={fg} /> : null}
                <Text className="text-[11px] font-bold" style={{ color: fg }}>
                  {c.label}
                </Text>
              </View>
            );
          })}
        </View>
        <Text className="text-[23px] font-extrabold leading-7 text-white" numberOfLines={2}>
          {title}
        </Text>
        <Text className="text-[13px] font-semibold text-white/80">{code}</Text>
      </View>
    </View>
  );
}

export function HeroCover({ info, token, topInset }: { info: StudentClassItem; token?: string; topInset: number }) {
  const done = Math.round(info.progress ?? 0) >= 100;
  const room = info.course_type === 'zoom' ? 'Zoom Online' : (COURSE_TYPE_LABEL[info.course_type ?? ''] ?? info.course_type);
  return (
    <ClassCover
      id={info._id}
      image={info.cover_image}
      title={info.display_name || info.class_name}
      code={info.class_code}
      token={token}
      topInset={topInset}
      chips={[
        { label: done ? 'Hoàn thành' : 'Đang học', icon: done ? 'checkmark-circle' : 'play-circle', tone: done ? 'success' : 'light' },
        ...(room ? [{ label: room, tone: 'dark' as const }] : []),
      ]}
    />
  );
}

/** Giảng viên + (lớp không có thẻ buổi học) lịch cố định. */
export function TeacherRow({ info, token, showSchedule }: { info: StudentClassItem; token?: string; showSchedule: boolean }) {
  const parts = scheduleParts(info.class_time || info.schedule);
  const schedule = parts ? `${parts.days.join(' · ')}, ${parts.time}` : info.schedule || info.class_time;
  if (!info.teacher?.name && !(showSchedule && schedule)) return null;
  return (
    <View className="flex-row items-center gap-3">
      <Avatar name={info.teacher?.name || '?'} uri={resolveMediaUrl(info.teacher?.avatar, token)} size={44} />
      <View className="flex-1">
        <Text className="text-[16px] font-bold text-foreground" numberOfLines={1}>
          {info.teacher?.name || 'Chưa có giảng viên'}
        </Text>
        <Text className="text-[13px] text-muted" numberOfLines={1}>
          Giảng viên{showSchedule && schedule ? ` · ${schedule}` : ''}
        </Text>
      </View>
    </View>
  );
}

/**
 * Buổi học kế tiếp + nút vào Zoom. Tự đếm ngược (cập nhật mỗi 30 giây) và đổi sang "Đang diễn ra"
 * khi tới giờ — học viên mở app lúc sắp học là thấy ngay nút vào lớp, không phải tìm.
 */
export function NextSessionCard({ info, joining, onJoin }: { info: StudentClassItem; joining: boolean; onJoin: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const onBrand = useThemeColor('on-brand');

  const classTime = info.class_time || info.schedule;
  const session = nextSession(classTime, now);
  const parts = scheduleParts(classTime);
  const countdown = session ? countdownLabel(session, now) : null;
  const hot = !!session && (session.live || session.soon);

  return (
    <View className="gap-3.5 rounded-3xl border border-border bg-surface p-4">
      {session ? (
        <View className="flex-row items-center gap-3.5">
          <View className={`h-14 w-14 items-center justify-center rounded-2xl ${hot ? 'bg-success-soft' : 'bg-brand-soft'}`}>
            <Text className={`text-[11px] font-bold ${hot ? 'text-success' : 'text-brand'}`}>{WEEKDAY_SHORT[session.start.getDay()]}</Text>
            <Text className={`text-[21px] font-extrabold leading-6 ${hot ? 'text-success' : 'text-brand'}`}>{session.start.getDate()}</Text>
          </View>
          <View className="flex-1 gap-0.5">
            <Text className="text-[12px] font-semibold text-muted">Buổi học tiếp theo</Text>
            <Text className="text-[16px] font-bold text-foreground" numberOfLines={1}>
              {sessionDayLabel(session.start, now)} · {parts?.time}
            </Text>
            {countdown ? (
              <View className="flex-row items-center gap-1.5">
                {hot ? <View className="h-2 w-2 rounded-full bg-success" /> : null}
                <Text className={`text-[12.5px] font-semibold ${hot ? 'text-success' : 'text-muted'}`}>{countdown}</Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : (
        <View className="gap-0.5">
          <Text className="text-[12px] font-semibold text-muted">Lịch học</Text>
          <Text className="text-[15px] font-bold text-foreground">{classTime || 'Chưa có lịch'}</Text>
        </View>
      )}

      <Pressable
        accessibilityRole="button"
        onPress={onJoin}
        disabled={joining}
        className={`h-12 flex-row items-center justify-center gap-2 rounded-2xl active:opacity-85 ${hot ? 'bg-success' : 'bg-brand'}`}>
        {joining ? (
          <ActivityIndicator color={onBrand} />
        ) : (
          <>
            <Ionicons name="videocam" size={19} color={onBrand} />
            <Text className="text-[15.5px] font-bold text-on-brand">{session?.live ? 'Vào lớp ngay' : 'Vào phòng học'}</Text>
          </>
        )}
      </Pressable>

      {session && parts ? (
        <Text className="-mt-1 text-center text-[11.5px] text-muted">
          Lịch cố định: {parts.days.join(' · ')}, {parts.time}
        </Text>
      ) : null}
    </View>
  );
}

export function DebtAlert({
  info,
  onPay,
}: {
  info: StudentClassItem;
  /** Có mã QR thì mở mã, không thì gọi hotline */
  onPay: () => void;
}) {
  const debt = Number(info.remaining_debt || 0);
  if (debt <= 0) return null;
  return (
    <Pressable onPress={onPay} className="flex-row items-center gap-3 rounded-2xl bg-danger-soft p-3.5 active:opacity-80">
      <View className="h-10 w-10 items-center justify-center rounded-full bg-danger">
        <Ionicons name="wallet" size={19} color="#ffffff" />
      </View>
      <View className="flex-1">
        <Text className="text-[12px] font-semibold text-danger">Học phí cần thanh toán</Text>
        <Text className="text-[17px] font-extrabold text-danger">{formatVnd(debt)}</Text>
        {info.tuition_deadline ? <Text className="text-[11.5px] text-danger">Hạn đóng {formatDate(info.tuition_deadline)}</Text> : null}
      </View>
      <View className="flex-row items-center gap-1 rounded-full bg-danger px-3 py-2">
        <Ionicons name={info.qr_code ? 'qr-code' : 'call'} size={13} color="#ffffff" />
        <Text className="text-[12.5px] font-bold text-white">{info.qr_code ? 'Thanh toán' : 'Gọi hỗ trợ'}</Text>
      </View>
    </Pressable>
  );
}

export interface QuickAction {
  key: string;
  icon: IconName;
  icon3d?: number;
  label: string;
  tone: 'brand' | 'info' | 'violet' | 'success' | 'warning';
  badge?: number;
  disabled?: boolean;
  onPress: () => void;
}

const TONE_BG: Record<QuickAction['tone'], string> = {
  brand: 'bg-brand-soft',
  info: 'bg-info-soft',
  violet: 'bg-violet-soft',
  success: 'bg-success-soft',
  warning: 'bg-warning-soft',
};

/** Hàng lối tắt dạng icon tròn như app ngân hàng / app học — mỗi ô 1 việc hay làm trong lớp. */
export function QuickActions({ actions }: { actions: QuickAction[] }) {
  return (
    <View className="flex-row rounded-3xl border border-border bg-surface px-1 py-3.5">
      {actions.map((a) => (
        <ActionTile key={a.key} action={a} />
      ))}
    </View>
  );
}

function ActionTile({ action }: { action: QuickAction }) {
  const color = useThemeColor(action.tone as ThemeColor);
  const icon3d = action.icon3d ?? CLASS_QUICK_ACTION_3D_ICONS[action.key];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action.label}
      onPress={action.onPress}
      disabled={action.disabled}
      className={`flex-1 items-center gap-1.5 active:opacity-70 ${action.disabled ? 'opacity-40' : ''}`}>
      <View
        className={`h-12 w-12 items-center justify-center overflow-hidden rounded-2xl ${icon3d ? '' : TONE_BG[action.tone]}`}>
        {icon3d ? (
          <Image source={icon3d} style={{ width: 46, height: 46 }} contentFit="contain" />
        ) : (
          <Ionicons name={action.icon} size={22} color={color} />
        )}
        {action.badge ? (
          <View className="absolute -right-1.5 -top-1.5 min-w-[18px] items-center rounded-full border-2 border-surface bg-danger px-1">
            <Text className="text-[10px] font-bold text-white">{action.badge > 99 ? '99+' : action.badge}</Text>
          </View>
        ) : null}
      </View>
      <Text className="text-[12px] font-medium text-foreground" numberOfLines={1}>
        {action.label}
      </Text>
    </Pressable>
  );
}

/** 3 vòng tiến độ + lời nhắc bài chưa nộp (bấm là nhảy sang tab Bài tập, lọc sẵn "Chưa nộp"). */
export function ProgressCard({
  info,
  onOpenReport,
  onOpenPending,
}: {
  info: StudentClassItem;
  onOpenReport: () => void;
  onOpenPending: () => void;
}) {
  const brand = useThemeColor('brand');
  const warning = useThemeColor('warning');
  const progress = Math.max(0, Math.min(100, Math.round(info.progress ?? 0)));
  // "Đã nộp" = tổng − chưa nộp (pending = bài chưa có bài nộp nào). KHÔNG dùng completed_assignments: class-be chỉ
  // đếm submission status === 'graded' (status thật là 'completed'…) nên gần như luôn 0 — Trang chủ cũng đếm theo "đã nộp".
  const submitted = Math.max(0, info.total_assignments - (info.pending_assignments ?? 0));
  const assignmentRate = info.total_assignments > 0 ? Math.round((submitted / info.total_assignments) * 100) : 0;
  const att = info.attendance_stats;
  const attRate = att ? Math.round(att.attendance_rate) : null;
  const pending = info.pending_assignments ?? 0;

  return (
    <View className="rounded-3xl border border-border bg-surface">
      <View className="flex-row items-center justify-between px-4 pt-3.5">
        <Text className="text-[15px] font-bold text-foreground">Kết quả học tập</Text>
        <Pressable onPress={onOpenReport} hitSlop={8} className="flex-row items-center gap-0.5 active:opacity-60">
          <Text className="text-[13px] font-semibold text-brand">Báo cáo</Text>
          <Ionicons name="chevron-forward" size={14} color={brand} />
        </Pressable>
      </View>

      <View className="flex-row px-2 pb-4 pt-3">
        <RingStat percent={progress} color="brand" value={`${progress}%`} label="Tiến độ" />
        <RingStat
          percent={assignmentRate}
          color="info"
          value={`${assignmentRate}%`}
          label="Bài tập"
          sub={`${submitted}/${info.total_assignments} đã nộp`}
        />
        <RingStat
          percent={attRate ?? 0}
          color={attRate !== null && attRate < 75 ? 'warning' : 'success'}
          value={attRate === null ? '—' : `${attRate}%`}
          label="Chuyên cần"
          sub={att && att.total_sessions ? `${att.attended_sessions}/${att.total_sessions} buổi` : undefined}
        />
      </View>

      {pending > 0 ? (
        <Pressable
          onPress={onOpenPending}
          className="flex-row items-center gap-2.5 border-t border-border px-4 py-3 active:bg-surface-muted">
          <Ionicons name="alert-circle" size={18} color={warning} />
          <Text className="flex-1 text-[13.5px] text-foreground">
            Còn <Text className="font-bold text-warning">{pending} bài tập</Text> chưa nộp
          </Text>
          <Text className="text-[13px] font-bold text-brand">Làm ngay</Text>
          <Ionicons name="chevron-forward" size={14} color={brand} />
        </Pressable>
      ) : null}
    </View>
  );
}

function RingStat({
  percent,
  color,
  value,
  label,
  sub,
}: {
  percent: number;
  color: ThemeColor;
  value: string;
  label: string;
  sub?: string;
}) {
  return (
    <View className="flex-1 items-center gap-1.5">
      <ProgressRing percent={percent} size={62} stroke={6} color={color}>
        <Text className="text-[14px] font-extrabold text-foreground">{value}</Text>
      </ProgressRing>
      <View className="items-center">
        <Text className="text-[12.5px] font-semibold text-foreground">{label}</Text>
        {sub ? <Text className="text-[11px] text-muted">{sub}</Text> : null}
      </View>
    </View>
  );
}
