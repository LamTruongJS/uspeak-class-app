import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { formatTime, isSameDay } from '@/lib/format';
import { thumbCacheKey, thumbMediaUrl } from '@/lib/media';

import { dayLabel, plainContent } from './format';
import { ActivityCard, AnnouncementCard, AssignmentCard, PollCreatedNotice, ReminderCard } from './cards';
import {
  BUBBLE_MAX,
  FileContent,
  firstLink,
  ImageAlbum,
  LinkPreviewCard,
  PollContent,
  StickerContent,
  TextContent,
  VideoContent,
  VoiceContent,
} from './message-content';
import { SwipeToReply } from './swipe-to-reply';
import type { ChatMessage } from './types';
import { AppIcon } from '@/components/ui/app-icon';

const GROUP_GAP_MS = 5 * 60_000;

interface Props {
  message: ChatMessage;
  /** Tin liền trước (cũ hơn) — để gom nhóm & chèn mốc ngày */
  older?: ChatMessage;
  /** Tin liền sau (mới hơn) — để biết có phải tin cuối cụm (hiện giờ) */
  newer?: ChatMessage;
  myId?: string;
  isDirect: boolean;
  onLongPress: (m: ChatMessage) => void;
  onRetry: (m: ChatMessage) => void;
  /** Huỷ tin đang tải lên (ảnh/video/tệp) */
  onCancelUpload: (m: ChatMessage) => void;
  onToggleReaction: (m: ChatMessage, emoji: string) => void;
  /** Vuốt sang phải để trả lời tin này */
  onReply: (m: ChatMessage) => void;
  /** Tin chưa đọc CŨ NHẤT lúc mở phòng → kẻ vạch "Tin chưa đọc" ngay trên nó */
  unreadDivider?: number;
  /** Bấm trích dẫn trả lời → nhảy tới tin gốc */
  onJumpTo: (messageId: string) => void;
  /** Tin vừa được nhảy tới → nháy nền để mắt bắt được */
  highlighted?: boolean;
  /** "Đã xem" / "Đã xem bởi 3" dưới tin cuối của mình */
  seenLabel?: string;
  /**
   * Màu + media token do màn phòng truyền xuống (đã memo) — mỗi bong bóng tự gọi useThemeColor /
   * useMediaToken thì danh sách vài trăm tin có vài nghìn subscription.
   */
  palette: MessagePalette;
  mediaToken?: string;
}

export interface MessagePalette {
  muted: string;
  danger: string;
  brand: string;
}

const sameCluster = (a?: ChatMessage, b?: ChatMessage) =>
  !!a &&
  !!b &&
  a.message_type !== 'system' &&
  b.message_type !== 'system' &&
  a.sender?._id === b.sender?._id &&
  Math.abs(new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) < GROUP_GAP_MS;

/** Loại tin hiện dạng thẻ (không bọc trong bong bóng màu). */
const CARD_TYPES = new Set(['poll', 'announcement', 'assignment', 'class_reminder', 'activity']);

function MessageItemBase({
  message: m,
  older,
  newer,
  myId,
  isDirect,
  onLongPress,
  onRetry,
  onCancelUpload,
  onToggleReaction,
  onReply,
  unreadDivider,
  onJumpTo,
  highlighted,
  seenLabel,
  palette,
  mediaToken,
}: Props) {
  const { muted, danger, brand: brandColor } = palette;
  const created = new Date(m.created_at);
  const showDay = !older || !isSameDay(new Date(older.created_at), created);
  const dayHeader = showDay ? (
    <View className="items-center py-3">
      <Text className="rounded-full bg-surface-muted px-3 py-1 text-xs font-medium text-muted">{dayLabel(created)}</Text>
    </View>
  ) : null;
  const divider = unreadDivider ? (
    <View className="flex-row items-center gap-2 py-3">
      <View className="h-px flex-1 bg-brand opacity-40" />
      <Text className="text-xs font-semibold text-brand">{unreadDivider} tin chưa đọc</Text>
      <View className="h-px flex-1 bg-brand opacity-40" />
    </View>
  ) : null;

  if (m.message_type === 'system') {
    return (
      <View>
        {dayHeader}
        {divider}
        <Text className="px-8 py-1.5 text-center text-xs text-muted">{plainContent(m.content)}</Text>
      </View>
    );
  }

  const mine = m.sender?._id === myId;
  const firstOfCluster = showDay || !sameCluster(older, m);
  const lastOfCluster = !sameCluster(m, newer) || (!!newer && !isSameDay(new Date(newer.created_at), created));
  const showSender = !mine && !isDirect && firstOfCluster;
  const removed = !!(m.recalled_by || m.deleted_by || m.is_deleted);
  const isCard =
    !removed && CARD_TYPES.has(m.message_type) && !!(m.poll || m.announcement || m.assignment_card || m.class_reminder || m.activity_card);
  const isMedia = !removed && (m.message_type === 'image' || m.message_type === 'sticker' || m.message_type === 'video');
  const jumbo = !removed && m.message_type === 'text' && !m.reply_to_message && !m.forward_from && isJumboEmoji(m.content);

  // Thẻ của bot / hệ thống (bài tập, nhắc giờ học, thông báo, bình chọn, nhóm hoạt động): căn giữa
  // luồng chat, không kèm avatar / tên người gửi — giống web (chat/page.tsx nhánh card).
  if (isCard) {
    return (
      <View className={`pt-3.5 ${highlighted ? 'rounded-xl bg-brand-soft' : ''}`}>
        {dayHeader}
        {divider}
        <View className="items-center gap-1">
          {m.message_type === 'poll' ? <PollCreatedNotice message={m} /> : null}
          <Pressable
            onLongPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onLongPress(m);
            }}
            delayLongPress={300}>
            <CardBody key={m._id} m={m} myId={myId} />
          </Pressable>
          <Reactions m={m} myId={myId} mine={false} onToggle={(e) => onToggleReaction(m, e)} />
          <View className="flex-row items-center gap-1">
            {m.is_pinned ? <AppIcon name="pushpin" size={11} color={muted} /> : null}
            <Text className="text-[11px] text-muted">{formatTime(created)}</Text>
          </View>
        </View>
      </View>
    );
  }

  // Bo góc theo cụm kiểu Messenger: tin giữa cụm bo nhỏ phía người gửi, đầu/cuối cụm bo tròn
  const R = 20;
  const r = 6;
  const radius = mine
    ? { borderRadius: R, borderTopRightRadius: firstOfCluster ? R : r, borderBottomRightRadius: lastOfCluster ? R : r }
    : { borderRadius: R, borderTopLeftRadius: firstOfCluster ? R : r, borderBottomLeftRadius: lastOfCluster ? R : r };
  const time = m.pending ? 'Đang gửi…' : formatTime(created);
  const hasReactions = !!m.reactions?.length;
  // Giờ gửi ở MỌI tin, nằm gọn trong góc cuối bong bóng (yêu cầu 15/10/2026 — trước chỉ tin cuối cụm)
  const showMeta = !m.failed;

  return (
    <View className={`${firstOfCluster ? 'pt-4' : 'pt-[5px]'} ${highlighted ? 'rounded-xl bg-brand-soft' : ''}`}>
      {dayHeader}
      {divider}
      <SwipeToReply enabled={!removed && !m.pending && !m.failed} onReply={onReply} message={m} brand={brandColor}>
        <View className={`flex-row items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
          {!mine && !isDirect ? (
            <View style={{ width: 28, marginBottom: hasReactions ? 14 : 0 }}>
              {lastOfCluster ? <SenderAvatar message={m} token={mediaToken} /> : null}
            </View>
          ) : null}

          <View className={mine ? 'items-end' : 'items-start'} style={{ maxWidth: `${BUBBLE_MAX * 100}%` }}>
            {showSender ? <Text className="pb-1 pl-3 text-[12px] font-medium text-muted">{m.sender?.full_name}</Text> : null}

            <Pressable
              onLongPress={() => {
                if (m.pending || removed) return;
                // Rung nhẹ khi mở menu — phản hồi xúc giác chuẩn của app chat trên điện thoại
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onLongPress(m);
              }}
              onPress={() => m.failed && onRetry(m)}
              delayLongPress={300}>
              {removed ? (
                <View className="border border-dashed border-border px-3.5 py-2" style={radius}>
                  <Text className="text-sm italic text-muted">{m.recalled_by ? 'Tin nhắn đã được thu hồi' : 'Tin nhắn đã bị xoá'}</Text>
                </View>
              ) : jumbo ? (
                // Chỉ có 1–3 emoji → hiện to, không bọc bong bóng (giống 👍 của Messenger)
                <View className={`px-1 ${m.pending ? 'opacity-60' : ''}`}>
                  <Text style={{ fontSize: 44, lineHeight: 54 }}>{m.content.trim()}</Text>
                  {showMeta ? (
                    <Text className={`text-[10.5px] text-muted ${mine ? 'text-right' : ''}`}>{time}</Text>
                  ) : null}
                </View>
              ) : isMedia ? (
                <View className={m.pending ? 'opacity-60' : ''}>
                  {m.reply_to_message ? <ReplyQuote m={m} mine={false} onPress={onJumpTo} /> : null}
                  {m.message_type === 'sticker' ? (
                    <StickerContent message={m} />
                  ) : m.message_type === 'video' ? (
                    <VideoContent key={m._id} message={m} onCancelUpload={() => onCancelUpload(m)} />
                  ) : (
                    <ImageAlbum key={m._id} message={m} onCancelUpload={() => onCancelUpload(m)} />
                  )}
                  {showMeta && m.message_type !== 'sticker' ? (
                    <View className="absolute bottom-1.5 right-1.5 flex-row items-center gap-1 rounded-full bg-black/45 px-2 py-0.5">
                      <Text className="text-[10.5px] font-medium text-white">{time}</Text>
                      {mine && !m.pending ? <Ionicons name="checkmark-done" size={12} color="#ffffff" /> : null}
                    </View>
                  ) : null}
                </View>
              ) : (
                <View className={`gap-1.5 px-3.5 py-2 ${mine ? 'bg-brand' : 'bg-surface'} ${m.pending ? 'opacity-70' : ''}`} style={radius}>
                  {m.forward_from ? (
                    <View className="flex-row items-center gap-1">
                      <Ionicons name="arrow-redo" size={11} color={mine ? '#ffffffcc' : muted} />
                      <Text className={`text-[11.5px] italic ${mine ? 'text-on-brand opacity-80' : 'text-muted'}`}>
                        Chuyển tiếp từ {m.forward_from.sender?.full_name}
                      </Text>
                    </View>
                  ) : null}
                  {m.reply_to_message ? <ReplyQuote m={m} mine={mine} onPress={onJumpTo} /> : null}
                  <BubbleBody
                    m={m}
                    mine={mine}
                    onCancelUpload={() => onCancelUpload(m)}
                    reserveMeta={showMeta ? metaSpacer(time, mine, m.is_edited, m.is_pinned) : undefined}
                  />
                  {showMeta ? (
                    <View className="absolute bottom-1.5 right-2.5 flex-row items-center gap-1">
                      {m.is_pinned ? <AppIcon name="pushpin" size={10} color={mine ? '#ffffffb3' : muted} /> : null}
                      <Text className={`text-[10.5px] ${mine ? 'text-on-brand opacity-75' : 'text-muted'}`}>
                        {m.is_edited ? 'Đã sửa · ' : ''}
                        {time}
                      </Text>
                      {mine && !m.pending ? <Ionicons name="checkmark-done" size={13} color={seenLabel ? '#ffffff' : '#ffffffa6'} /> : null}
                    </View>
                  ) : m.is_edited ? (
                    <Text className={`text-[10.5px] ${mine ? 'text-on-brand opacity-70' : 'text-muted'}`}>Đã sửa</Text>
                  ) : null}
                </View>
              )}
            </Pressable>

            <Reactions m={m} myId={myId} mine={mine} onToggle={(e) => onToggleReaction(m, e)} />

            {m.failed ? (
              <Pressable onPress={() => onRetry(m)} className="flex-row items-center gap-1 pt-1">
                <Ionicons name="alert-circle" size={13} color={danger} />
                <Text className="text-xs text-danger">Gửi lỗi · Bấm để gửi lại</Text>
              </Pressable>
            ) : seenLabel ? (
              <Text className="px-1 pt-1 text-[11px] font-medium text-muted">{seenLabel}</Text>
            ) : null}
          </View>
        </View>
      </SwipeToReply>
    </View>
  );
}

/**
 * Danh sách tin là FlashList (tái sử dụng ô): 1 ô vừa vẽ tin A có thể được đem đi vẽ tin B. Phần nào giữ
 * state riêng (album đang mở, tin thoại đang phát, video, thẻ bình chọn / thông báo…) phải có
 * `key={m._id}` để React dựng lại khi đổi tin — không thì tin B hiện trạng thái của tin A.
 */
export const MessageItem = memo(MessageItemBase);

// Emoji (kể cả có tông da / ghép ZWJ / biến thể FE0F); khoảng trắng được bỏ qua.
// Tạo bằng new RegExp trong try: engine JS không hỗ trợ \p{…} thì chỉ tắt emoji to, không làm sập màn chat.
const EMOJI_RE = (() => {
  try {
    return {
      only: new RegExp('^(?:\\p{Extended_Pictographic}|\\p{Emoji_Modifier}|\\u200d|\\ufe0f|\\s)+$', 'u'),
      unit: new RegExp('\\p{Extended_Pictographic}', 'gu'),
    };
  } catch {
    return null;
  }
})();

function isJumboEmoji(content?: string) {
  const s = (content ?? '').trim();
  if (!EMOJI_RE || !s || s.length > 24 || !EMOJI_RE.only.test(s)) return false;
  return (s.match(EMOJI_RE.unit)?.length ?? 0) <= 3;
}

/**
 * Chữ TRONG SUỐT nối vào cuối dòng chữ cuối để giờ gửi (đặt tuyệt đối ở góc dưới phải) không đè lên
 * chữ — cách WhatsApp/Zalo làm. Phải là ký tự THẬT (chính chuỗi giờ, cùng cỡ chữ với giờ): toàn khoảng
 * trắng thì dòng gần đầy sẽ cho khoảng trắng tràn ra ngoài thay vì xuống dòng → giờ đè lên chữ.
 * "MM" chừa chỗ cho icon (ghim / đã xem). Dấu cách thường ở đầu để được ngắt dòng trước phần chừa chỗ.
 */
function metaSpacer(time: string, mine: boolean, edited?: boolean, pinned?: boolean) {
  return ` \u00A0${pinned ? 'MM' : ''}${edited ? 'Đã sửa · ' : ''}${time}${mine ? 'MM' : ''}`;
}

function SenderAvatar({ message, token }: { message: ChatMessage; token?: string }) {
  const raw = message.sender?.avatar_url;
  // Ô 28px → xin bản thu nhỏ 64px, đừng kéo ảnh gốc vài MB cho mỗi cụm tin (xem thumbMediaUrl)
  return <Avatar name={message.sender?.full_name} uri={thumbMediaUrl(raw, token, 64)} cacheKey={thumbCacheKey(raw, 64)} size={28} />;
}

function BubbleBody({
  m,
  mine,
  reserveMeta,
  onCancelUpload,
}: {
  m: ChatMessage;
  mine: boolean;
  reserveMeta?: string;
  onCancelUpload: () => void;
}) {
  // Tệp / tin thoại / thẻ link không chèn được khoảng trống cuối dòng → chừa 1 dòng thấp cho giờ gửi
  const metaRow = reserveMeta ? <View className="h-3" /> : null;
  switch (m.message_type) {
    case 'file':
      // Dòng "128 KB · Bấm để mở" ngắn, góc phải còn trống → giờ gửi nằm luôn trên dòng đó, không
      // chừa thêm 1 dòng (bong bóng tệp cao lênh khênh). Lúc đang gửi chữ dài ("Đang tải lên… 45%")
      // thì vẫn chừa dòng riêng.
      return (
        <>
          <FileContent message={m} mine={mine} onCancelUpload={onCancelUpload} />
          {m.pending ? metaRow : null}
        </>
      );
    case 'voice':
      return (
        <>
          <VoiceContent key={m._id} message={m} mine={mine} />
          {metaRow}
        </>
      );
    default: {
      const link = m.message_type === 'text' ? firstLink(m.content) : null;
      return (
        <>
          <TextContent content={m.content} mine={mine} trailing={link ? undefined : reserveMeta} />
          {link ? <LinkPreviewCard url={link} mine={mine} /> : null}
          {link ? metaRow : null}
        </>
      );
    }
  }
}

function CardBody({ m, myId }: { m: ChatMessage; myId?: string }) {
  if (m.poll) return <PollContent message={m} myId={myId} />;
  if (m.announcement) return <AnnouncementCard message={m} myId={myId} />;
  if (m.assignment_card) return <AssignmentCard message={m} />;
  if (m.class_reminder) return <ReminderCard message={m} />;
  if (m.activity_card) return <ActivityCard message={m} />;
  return null;
}

function ReplyQuote({ m, mine, onPress }: { m: ChatMessage; mine: boolean; onPress: (id: string) => void }) {
  const r = m.reply_to_message!;
  const gone = r.is_deleted || r.recalled_by || r.deleted_by;
  const preview = gone ? 'Tin nhắn đã bị gỡ' : r.message_type === 'image' ? '[Hình ảnh]' : plainContent(r.content);
  return (
    <Pressable
      onPress={() => onPress(r._id)}
      className={`rounded-lg border-l-2 px-2 py-1 active:opacity-70 ${mine ? 'border-white/70 bg-white/15' : 'border-brand bg-surface-muted'}`}>
      <Text className={`text-xs font-semibold ${mine ? 'text-on-brand' : 'text-brand'}`}>{r.sender?.full_name}</Text>
      <Text className={`text-xs ${mine ? 'text-on-brand opacity-85' : 'text-muted'}`} numberOfLines={2}>
        {preview}
      </Text>
    </Pressable>
  );
}

/**
 * Cảm xúc dạng viên nhỏ ĐÈ lên mép dưới bong bóng (kiểu Messenger) thay vì một hàng riêng bên dưới.
 * Viền màu nền tạo khe tách viên khỏi bong bóng; bấm 1 viên là bật/tắt đúng cảm xúc đó.
 */
function Reactions({ m, myId, mine, onToggle }: { m: ChatMessage; myId?: string; mine: boolean; onToggle: (emoji: string) => void }) {
  if (!m.reactions?.length) return null;
  const groups = new Map<string, { count: number; mineReacted: boolean }>();
  for (const r of m.reactions) {
    const g = groups.get(r.emoji) ?? { count: 0, mineReacted: false };
    g.count += 1;
    if (r.user_id === myId) g.mineReacted = true;
    groups.set(r.emoji, g);
  }
  return (
    <View className={`-mt-2 flex-row flex-wrap gap-1 px-2 ${mine ? 'self-start' : 'self-end'}`}>
      {[...groups.entries()].map(([emoji, g]) => (
        <Pressable
          key={emoji}
          onPress={() => onToggle(emoji)}
          hitSlop={4}
          className={`flex-row items-center gap-0.5 rounded-full border-2 border-background px-1.5 py-px ${g.mineReacted ? 'bg-brand-soft' : 'bg-surface'}`}>
          <Text className="text-[13px]">{emoji}</Text>
          {g.count > 1 ? <Text className={`text-[11px] font-bold ${g.mineReacted ? 'text-brand' : 'text-muted'}`}>{g.count}</Text> : null}
        </Pressable>
      ))}
    </View>
  );
}
