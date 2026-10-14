import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, Text, useWindowDimensions, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { WEB_URL } from '@/config/env';
import { plainText } from '@/features/assignments/api';
import { useJoinRoom } from '@/features/classes/use-join-room';
import { getErrorMessage } from '@/lib/api/client';
import { formatDate, formatTime } from '@/lib/format';
import { mediaCacheKey, resolveMediaUrl, useMediaToken } from '@/lib/media';
import { useThemeColor, type ThemeColor } from '@/theme/use-theme-color';

import { chatApi, patchMessage } from './api';
import { TextContent } from './message-content';
import type { ChatMessage } from './types';

/**
 * Thẻ tin của Uspeak Bot / hệ thống — bản mobile của các card bên web
 * (uspeak-class-fe/src/components/chat: AssignmentCardBubble, ClassReminderCardBubble,
 * AnnouncementCard, ActivityCardBubble + notification-variants.ts). Căn giữa luồng chat,
 * không kèm avatar/tên người gửi. Đổi màu/nhãn ở web thì đổi theo ở đây.
 */

type IconName = ComponentProps<typeof Ionicons>['name'];

// Viết đủ tên class để Tailwind quét được
const SOFT_BG: Record<string, string> = {
  navy: 'bg-navy-soft',
  brand: 'bg-brand-soft',
  info: 'bg-info-soft',
  violet: 'bg-violet-soft',
  warning: 'bg-warning-soft',
  success: 'bg-success-soft',
  muted: 'bg-surface-muted',
};
const TEXT: Record<string, string> = {
  navy: 'text-navy',
  brand: 'text-brand',
  info: 'text-info',
  violet: 'text-violet',
  warning: 'text-warning',
  success: 'text-success',
  muted: 'text-muted',
};
type Tone = 'navy' | 'brand' | 'info' | 'violet' | 'warning' | 'success' | 'muted';

const pad = (n: number) => String(n).padStart(2, '0');
/** "09:00 14/10/2026" — như toLocaleString vi-VN của web */
const fullMoment = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};
const shortMoment = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${formatTime(d)} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
};

/** Chiều rộng thẻ: gần hết màn hình, tối đa 400 (web 420). */
export function useCardWidth() {
  const { width } = useWindowDimensions();
  return Math.min(width - 40, 400);
}

function Shell({ children, borderClass = 'border border-border', width }: { children: ReactNode; borderClass?: string; width: number }) {
  return (
    <View
      className={`overflow-hidden rounded-2xl bg-surface ${borderClass}`}
      style={{ width, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 }}>
      {children}
    </View>
  );
}

function Header({
  icon,
  tone,
  label,
  sub,
  subClass,
}: {
  icon: IconName;
  tone: Tone;
  label: string;
  sub?: string | null;
  subClass?: string;
}) {
  const color = useThemeColor(tone === 'muted' ? 'muted' : (tone as ThemeColor));
  return (
    // Không kẻ vạch ngăn đầu thẻ như web — trên điện thoại thẻ liền một khối trông gọn hơn
    <View className="flex-row items-center gap-2.5 px-4 pb-0.5 pt-3">
      <View className={`h-8 w-8 items-center justify-center rounded-lg ${SOFT_BG[tone]}`}>
        <Ionicons name={icon} size={17} color={color} />
      </View>
      <View className="flex-1">
        <Text className={`text-[11px] font-bold uppercase tracking-wide ${TEXT[tone]}`} numberOfLines={1}>
          {label}
        </Text>
        {sub ? (
          <Text className={subClass ?? 'text-[11.5px] text-muted'} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function Chip({ icon, tone, children }: { icon?: IconName; tone: Tone | 'danger'; children: ReactNode }) {
  const color = useThemeColor(tone === 'muted' ? 'muted' : (tone as ThemeColor));
  const bg = tone === 'danger' ? 'bg-danger-soft' : SOFT_BG[tone];
  const text = tone === 'danger' ? 'text-danger' : TEXT[tone];
  return (
    <View className={`flex-row items-center gap-1 self-start rounded-full px-2.5 py-1 ${bg}`}>
      {icon ? <Ionicons name={icon} size={13} color={color} /> : null}
      <Text className={`text-[12px] font-medium ${text}`}>{children}</Text>
    </View>
  );
}

function FooterButton({
  label,
  icon,
  onPress,
  loading,
  bg,
  textColor = '#ffffff',
}: {
  label: string;
  icon: IconName;
  onPress: () => void;
  loading?: boolean;
  bg: string;
  textColor?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      // Nút bo tròn nằm TRONG thẻ (kiểu nút của app) thay cho thanh màu tràn viền chân thẻ của web
      className="mx-3 mb-3 h-11 flex-row items-center justify-center gap-1.5 rounded-xl px-4 active:opacity-80"
      style={{ backgroundColor: bg }}>
      {loading ? <ActivityIndicator size="small" color={textColor} /> : <Ionicons name={icon} size={16} color={textColor} />}
      <Text className="text-[14px] font-semibold" style={{ color: textColor }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Link nút hành động: "/..." là trang nội bộ của web class → mở bản web; còn lại mở trình duyệt. */
function openActionUrl(url: string) {
  if (url.startsWith('/') && !url.startsWith('//')) void WebBrowser.openBrowserAsync(`${WEB_URL}${url}`);
  else void Linking.openURL(url);
}

// ─── Bài tập mới ────────────────────────────────────────────────────────────

function deadlineStatus(iso: string, now: number) {
  const diff = new Date(iso).getTime() - now;
  if (diff <= 0) return { text: 'Đã quá hạn nộp', overdue: true };
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days >= 1) return { text: `Còn ${days} ngày`, overdue: false };
  if (hours >= 1) return { text: `Còn ${hours} giờ`, overdue: false };
  return { text: `Còn ${Math.max(mins, 1)} phút`, overdue: false };
}

export function AssignmentCard({ message }: { message: ChatMessage }) {
  const a = message.assignment_card!;
  const width = useCardWidth();
  const muted = useThemeColor('muted');
  const [now] = useState(() => Date.now());
  const navy = useThemeColor('navy');
  const navySoft = useThemeColor('navy-soft');
  const desc = plainText(a.description);
  const status = a.submission_deadline ? deadlineStatus(a.submission_deadline, now) : null;
  return (
    <Shell width={width}>
      <Header icon="clipboard-outline" tone="navy" label="Bài tập mới" sub={a.type_label} />
      <View className="gap-1 px-4 py-3">
        <Text className="text-[15px] font-semibold leading-5 text-foreground">{a.title}</Text>
        {desc ? (
          <Text className="text-[13px] leading-[19px] text-muted" numberOfLines={2}>
            {desc}
          </Text>
        ) : null}
        <View className="mt-1.5 flex-row flex-wrap items-center gap-x-3 gap-y-1.5">
          <View className="flex-row items-center gap-1.5">
            <Ionicons name="calendar-outline" size={14} color={muted} />
            {a.submission_deadline ? (
              <Text className="text-[12.5px] text-muted">
                Hạn nộp: <Text className="font-semibold text-foreground">{fullMoment(a.submission_deadline)}</Text>
              </Text>
            ) : (
              <Text className="text-[12.5px] text-muted">Không có hạn nộp</Text>
            )}
          </View>
          {status ? <Chip tone={status.overdue ? 'danger' : 'success'}>{status.text}</Chip> : null}
        </View>
      </View>
      {/* Nút nền nhạt cùng tông thẻ: vài thẻ bài tập liền nhau mà nút đỏ đặc thì cả màn đỏ rực */}
      <FooterButton
        label="Làm bài"
        icon="arrow-forward"
        bg={navySoft}
        textColor={navy}
        onPress={() => router.push({ pathname: '/assignment/[id]', params: { id: a.assignment_id } })}
      />
    </Shell>
  );
}

// ─── Nhắc giờ học / thông báo thủ công (class_reminder) ────────────────────

const REMINDER_VARIANTS: Record<string, { icon: IconName; tone: Tone; title: string; action: string }> = {
  reminder: { icon: 'notifications', tone: 'brand', title: 'Nhắc giờ học', action: 'Vào Zoom' },
  announcement: { icon: 'megaphone', tone: 'info', title: 'Thông báo', action: 'Xem chi tiết' },
  event: { icon: 'calendar', tone: 'violet', title: 'Sự kiện', action: 'Đăng ký ngay' },
  important: { icon: 'alert-circle', tone: 'warning', title: 'Thông báo quan trọng', action: 'Xem chi tiết' },
};

export function ReminderCard({ message }: { message: ChatMessage }) {
  const r = message.class_reminder!;
  const width = useCardWidth();
  const { join, joiningCode } = useJoinRoom();
  const v = REMINDER_VARIANTS[r.variant ?? 'reminder'] ?? REMINDER_VARIANTS.reminder;
  const isReminder = !r.variant || r.variant === 'reminder';
  const softTone = useThemeColor(v.tone as ThemeColor);
  const zoom = useThemeColor('zoom');

  const classCode = (r.class_code || '').trim();
  const zoomUrl = (r.zoom_url || '').trim();
  const actionUrl = (r.action_url || '').trim();
  const showTime = typeof r.show_time === 'boolean' ? r.show_time : true;
  const showAction = typeof r.show_action === 'boolean' ? r.show_action : !!(classCode || zoomUrl);
  const body =
    message.content?.trim() ||
    `🔔 Cả nhà ơi, đừng quên buổi học ${r.is_tomorrow ? 'ngày mai' : 'hôm nay'} lúc ${r.time_label || ''} nhé! 💙`;
  const label = r.action_label?.trim() || v.action;
  // Nhắc giờ học: nút xanh Zoom chữ trắng; mẫu khác: nền nhạt cùng tông
  const bg = isReminder ? zoom : 'transparent';
  const fg = isReminder ? '#ffffff' : softTone;

  let onAction: (() => void) | null = null;
  if (showAction && actionUrl) onAction = () => openActionUrl(actionUrl);
  else if (showAction && classCode) onAction = () => void join(classCode, zoomUrl || null);
  else if (showAction && zoomUrl) onAction = () => void Linking.openURL(zoomUrl);

  return (
    <Shell width={width}>
      <Header
        icon={v.icon}
        tone={v.tone}
        label={r.title?.trim() || v.title}
        sub={r.topic}
        subClass={isReminder ? 'text-[13px] font-black text-brand' : undefined}
      />
      <View className="gap-2.5 px-4 py-3">
        <Text className="text-[14px] leading-[21px] text-foreground">{body}</Text>
        {showTime && r.time_label ? (
          <Chip icon="time-outline" tone="navy">
            {r.is_tomorrow ? 'Ngày mai' : 'Hôm nay'} · {r.time_label}
          </Chip>
        ) : null}
      </View>
      {onAction ? (
        <View className={isReminder ? '' : SOFT_BG[v.tone]}>
          <FooterButton
            label={label}
            icon="videocam"
            bg={bg}
            textColor={fg}
            loading={!!classCode && joiningCode === classCode}
            onPress={onAction}
          />
        </View>
      ) : null}
    </Shell>
  );
}

// ─── Thông báo phòng (announcement) ─────────────────────────────────────────

export function AnnouncementCard({ message, myId }: { message: ChatMessage; myId?: string }) {
  const a = message.announcement!;
  const width = useCardWidth();
  const { data: token } = useMediaToken();
  const [acking, setAcking] = useState(false);
  const important = a.level === 'important';
  const accent = useThemeColor(important ? 'danger' : 'orange');
  const success = useThemeColor('success');
  const onBrand = useThemeColor('on-brand');
  const sender = message.sender;
  const isAuthor = !!sender && sender._id === myId;
  const body = message.content && message.content !== a.title ? message.content : '';
  const ackCount = a.ack_count ?? 0;
  const memberCount = a.member_count ?? 0;

  async function ack() {
    setAcking(true);
    try {
      await chatApi.ackAnnouncement(message._id);
      if (message.room_id) {
        patchMessage(message.room_id, message._id, (m) => ({
          ...m,
          announcement: { ...m.announcement!, acked_by_me: true, ack_count: (m.announcement?.ack_count ?? 0) + 1 },
        }));
      }
    } catch (err) {
      Alert.alert('Chưa xác nhận được', getErrorMessage(err));
    } finally {
      setAcking(false);
    }
  }

  return (
    <Shell width={width} borderClass={`border-2 ${important ? 'border-danger' : 'border-orange'} ${a.expired ? 'opacity-80' : ''}`}>
      <View className="flex-row items-center gap-2 border-b border-border bg-surface-muted px-3 py-1.5">
        <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
        <Ionicons name="megaphone" size={13} color={accent} />
        <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted">Thông báo</Text>
        {important ? (
          <View className="rounded-full bg-danger-soft px-2 py-0.5">
            <Text className="text-[10px] font-bold text-danger">Quan trọng</Text>
          </View>
        ) : null}
        {a.expired ? (
          <View className="rounded-full bg-surface px-2 py-0.5">
            <Text className="text-[10px] font-semibold text-muted">Hết hạn</Text>
          </View>
        ) : null}
      </View>
      <View className="gap-1.5 px-3.5 py-3">
        <Text className="text-[15px] font-bold leading-5 text-foreground">{a.title}</Text>
        {body ? <TextContent content={body} mine={false} /> : null}
        <View className="mt-0.5 flex-row flex-wrap items-center gap-x-2.5 gap-y-1">
          {sender ? (
            <View className="flex-row items-center gap-1.5">
              <Avatar
                name={sender.full_name}
                uri={resolveMediaUrl(sender.avatar_url, token?.media_token)}
                cacheKey={mediaCacheKey(sender.avatar_url)}
                size={16}
              />
              <Text className="text-[11.5px] text-foreground">{sender.full_name}</Text>
            </View>
          ) : null}
          <Text className="text-[11.5px] text-muted">{shortMoment(message.created_at)}</Text>
          {a.edited_at ? <Text className="text-[11.5px] text-muted">(đã sửa)</Text> : null}
          {a.expires_at ? (
            <Text className="text-[11.5px] text-muted">
              {a.expired ? 'Đã hết hạn' : 'Đến'} {shortMoment(a.expires_at)}
            </Text>
          ) : null}
        </View>
      </View>
      {a.require_ack ? (
        <View className="mx-3.5 flex-row items-center justify-between gap-2 border-t border-border py-2.5">
          <Text className="text-[12px] text-muted">
            {memberCount ? (
              <>
                <Text className="font-bold text-foreground">{ackCount}</Text>/{memberCount} đã xem
              </>
            ) : (
              'Cần xác nhận đã xem'
            )}
          </Text>
          {isAuthor || a.expired ? null : a.acked_by_me ? (
            <View className="flex-row items-center gap-1">
              <Ionicons name="checkmark-circle" size={15} color={success} />
              <Text className="text-[12px] font-semibold text-success">Đã xem</Text>
            </View>
          ) : (
            <Pressable
              onPress={ack}
              disabled={acking}
              className="flex-row items-center gap-1 rounded-lg bg-brand px-2.5 py-1.5 active:opacity-80">
              {acking ? <ActivityIndicator size="small" color={onBrand} /> : <Ionicons name="checkmark" size={14} color={onBrand} />}
              <Text className="text-[12px] font-semibold text-on-brand">Đánh dấu đã xem</Text>
            </Pressable>
          )}
        </View>
      ) : null}
    </Shell>
  );
}

// ─── Nhóm hoạt động (activity) ──────────────────────────────────────────────

const ACTIVITY_VARIANTS: Record<string, { icon: IconName; tone: Tone; label: string }> = {
  opened: { icon: 'locate', tone: 'navy', label: 'Nhóm hoạt động' },
  summary: { icon: 'people', tone: 'violet', label: 'Đã chia nhóm hoạt động' },
  due_soon: { icon: 'timer-outline', tone: 'warning', label: 'Sắp tới hạn nộp' },
  closing: { icon: 'trash-outline', tone: 'muted', label: 'Phòng sắp đóng' },
  reported: { icon: 'checkmark-circle', tone: 'success', label: 'Đã nhận kết quả' },
};

/** Câu tóm tắt thay cho khối chữ dài của bot — giữ nguyên giọng của web. */
function activityBody(c: NonNullable<ChatMessage['activity_card']>) {
  switch (c.variant) {
    case 'summary':
      return `Lớp đã được chia thành ${c.groups?.length || 0} nhóm. Mỗi bạn vào phòng nhóm của mình trong danh sách chat để trao đổi và nộp kết quả nhé!`;
    case 'due_soon':
      return 'Nhóm mình chưa nộp kết quả — hoàn thành xong nhớ bấm Nộp kết quả để gửi ảnh/video nha! 💪';
    case 'closing':
      return 'Nội dung cần lưu lại thì các bạn tải về trước giờ này nhé.';
    case 'reported':
      return `Đã nhận kết quả từ ${c.actor_name || 'học viên'} và gửi tới nhóm lớp cùng nhóm hỗ trợ.`;
    default:
      return (
        c.description ||
        'Xong rồi thì bấm Nộp kết quả ngay trong phòng này để gửi ảnh/video nha — kết quả sẽ được gửi tới lớp và nhóm hỗ trợ.'
      );
  }
}

export function ActivityCard({ message }: { message: ChatMessage }) {
  const c = message.activity_card!;
  const width = useCardWidth();
  const v = ACTIVITY_VARIANTS[c.variant ?? 'opened'] ?? ACTIVITY_VARIANTS.opened;
  const moment = c.variant === 'closing' ? shortMoment(c.purge_at) : shortMoment(c.due_at);
  return (
    <Shell width={width}>
      <Header icon={v.icon} tone={v.tone} label={v.label} sub={c.group_label} />
      <View className="gap-2 px-4 py-3">
        <Text className="text-[15px] font-semibold leading-5 text-foreground">{c.title}</Text>
        <Text className="text-[13px] leading-[19px] text-muted">{activityBody(c)}</Text>
        {moment ? (
          <Chip icon={c.variant === 'closing' ? 'trash-outline' : 'time-outline'} tone={v.tone}>
            {c.variant === 'closing' ? `Đóng lúc ${moment}` : `Hạn nộp ${moment}`}
          </Chip>
        ) : null}
        {c.variant === 'summary' && c.groups?.length ? (
          <View className="gap-1.5 rounded-xl bg-surface-muted p-2.5">
            {c.groups.map((g) => (
              <Text key={g.label} className="text-[12.5px] leading-[18px] text-foreground">
                <Text className="font-semibold">{g.label}: </Text>
                {g.members.join(', ')}
              </Text>
            ))}
          </View>
        ) : null}
      </View>
    </Shell>
  );
}

/** Dòng nhỏ trên thẻ bình chọn: "Lan đã tạo một cuộc bình chọn" (web PollCreatedNotice). */
export function PollCreatedNotice({ message }: { message: ChatMessage }) {
  return (
    <Text className="pb-1.5 text-center text-[12.5px] italic text-muted">
      <Text className="font-semibold not-italic text-foreground">{message.sender?.full_name || 'Ai đó'}</Text> đã tạo một cuộc bình chọn ·{' '}
      {formatTime(new Date(message.created_at))} {formatDate(new Date(message.created_at)).slice(0, 5)}
    </Text>
  );
}
