/**
 * Kiểu dữ liệu chat — copy từ uspeak-class-fe/src/stores/chat/types.ts, rút gọn phần app dùng.
 * Giữ nguyên tên field của class-be; sửa bên này nhớ đối chiếu lại bên web.
 */

export type ChatRoomType = 'class' | 'group' | 'group_support' | 'direct' | 'custom' | 'sub_room' | 'activity';

export interface ChatRoomItem {
  _id: string;
  name: string;
  type: ChatRoomType;
  class_id?: string;
  class_code?: string | null;
  /** Phòng bị khoá chat (chỉ quản trị gửi được) */
  is_muted: boolean;
  is_active: boolean;
  avatar_url?: string;
  direct_recipient?: {
    _id: string;
    full_name: string;
    avatar_url: string | null;
    is_online?: boolean;
    is_multi?: boolean;
  } | null;
  member_count: number;
  my_role: 'owner' | 'admin' | 'member';
  /** Mình bị tắt chat trong phòng này */
  my_is_muted: boolean;
  notifications_muted?: boolean;
  is_pinned?: boolean;
  last_message: {
    content: string;
    message_type: string;
    created_at: string;
    sender_id: string;
    sender_name?: string;
  } | null;
  last_message_at: string | null;
  unread_count?: number;
  has_unread_mention?: boolean;
  activity?: { title: string; group_label: string; due_at: string | null } | null;
}

export interface ChatMessageImage {
  file_url?: string | null;
  file_key?: string | null;
  thumbnail_url?: string | null;
  thumbnail_key?: string | null;
  width?: number | null;
  height?: number | null;
}

export interface ChatPoll {
  question: string;
  allow_multiple: boolean;
  allow_add_option: boolean;
  is_closed: boolean;
  deadline?: string | null;
  options: { _id: string; text: string; voter_ids: string[]; vote_count: number }[];
  total_voter_count: number;
}

export type ChatMessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'file'
  | 'poll'
  | 'assignment'
  | 'class_reminder'
  | 'activity'
  | 'sticker'
  | 'voice'
  | 'announcement'
  | 'system';

export interface ChatMessage {
  _id: string;
  room_id?: string;
  content: string;
  mentions?: string[];
  message_type: ChatMessageType;
  file_url?: string;
  file_key?: string;
  file_name?: string;
  file_size?: number;
  mime_type?: string;
  duration?: number;
  /** Dải sóng tin thoại 0..100 (đo lúc ghi) */
  waveform?: number[];
  sticker?: { source: string; key?: string | null; url?: string | null; mime: string; w?: number; h?: number } | null;
  thumbnail_url?: string;
  width?: number;
  height?: number;
  images?: ChatMessageImage[];
  created_at: string;
  is_deleted?: boolean;
  is_pinned?: boolean;
  pinned_at?: string | null;
  recalled_by?: string;
  deleted_by?: string;
  is_edited?: boolean;
  sender: { _id: string; full_name: string; avatar_url: string | null; role: string };
  reply_to_message?: {
    _id: string;
    content: string;
    message_type: string;
    sender: { _id: string; full_name: string };
    is_deleted?: boolean;
    recalled_by?: string;
    deleted_by?: string;
  } | null;
  forward_from?: { sender: { full_name: string } } | null;
  reactions?: { user_id: string; emoji: string }[];
  poll?: ChatPoll;
  announcement?: {
    title: string;
    level: 'normal' | 'important';
    require_ack: boolean;
    acked_by_me?: boolean;
    expired?: boolean;
    expires_at?: string | null;
    edited_at?: string | null;
    /** Không tính người đăng và vai trò AD */
    ack_count?: number;
    member_count?: number;
  };
  assignment_card?: {
    assignment_id: string;
    title: string;
    description?: string;
    type_label?: string;
    submission_deadline?: string | null;
  };
  class_reminder?: {
    title?: string;
    /** Mẫu màu/icon (web notification-variants.ts); tin cũ không có = reminder */
    variant?: 'reminder' | 'announcement' | 'event' | 'important';
    class_code?: string;
    time_label?: string;
    show_time?: boolean;
    is_tomorrow?: boolean;
    zoom_url?: string | null;
    topic?: string | null;
    action_url?: string | null;
    action_label?: string | null;
    show_action?: boolean;
  };
  activity_card?: {
    title: string;
    variant?: 'opened' | 'summary' | 'due_soon' | 'closing' | 'reported';
    description?: string;
    group_label?: string;
    due_at?: string | null;
    purge_at?: string | null;
    groups?: { label: string; members: string[] }[];
    actor_name?: string;
  };

  // ── Chỉ có ở client ──
  /** Tin đang gửi (chưa có xác nhận server) */
  pending?: boolean;
  /** % đã tải lên (0..100) của tin đang gửi — chỉ sống ở client. */
  upload_progress?: number;
  /** Gửi lỗi → bấm để gửi lại */
  failed?: boolean;
  /** Ảnh trên máy của tin ảnh đang gửi */
  local_images?: string[];
  /** _id tin mới nhất của server lúc tạo tin tạm — chỉ tin server MỚI HƠN mốc này mới là bản dội lại */
  echo_after?: string;
}

export interface ChatMember {
  _id: string;
  full_name: string;
  avatar_url: string | null;
  system_role: string;
  chat_role: 'owner' | 'admin' | 'member';
}

export interface ChatRoomDetail {
  room: { _id: string; name: string; type: string; class_id?: string; is_muted: boolean };
  members: ChatMember[];
}

export interface ChatMessagesPage {
  data: ChatMessage[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}
