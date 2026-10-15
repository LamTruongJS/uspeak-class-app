import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { thumbCacheKey, thumbMediaUrl } from '@/lib/media';

import type { ChatRoomItem } from './types';

/** Phòng gắn với lớp học (lớp, nhóm con, nhóm hoạt động) — có huy hiệu mũ tốt nghiệp. */
export const CLASS_ROOM_TYPES = new Set(['class', 'sub_room', 'activity']);

/** Màu thương hiệu cố định — chữ trắng đọc rõ trên cả nền sáng lẫn tối. */
const AVATAR_COLORS = ['#b62025', '#2563eb', '#059669', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#4f46e5'];

/** Màu theo id phòng — cùng một phòng luôn cùng màu ở danh sách chat lẫn màn thông tin. */
export function avatarColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

/** Chữ trên avatar phòng: mã lớp (AT03) nếu có, không thì 2 chữ cái đầu của tên. */
export function roomInitials(r: Pick<ChatRoomItem, 'name' | 'class_code'>) {
  // Thử lần lượt: mã lớp, từ đầu của mã lớp, phần đầu tên phòng ("TYV105 - Trợ giảng", gạch ngắn hoặc dài)
  const candidates = [r.class_code, r.class_code?.split(/[\s\-–—_|:]+/)[0], r.name.split(/\s*[-–—|:]\s*/)[0]];
  const code = candidates.map((c) => (c ?? '').trim()).find((c) => c && c.length <= 6 && !/\s/.test(c));
  if (code) return code.toUpperCase();
  // Chỉ lấy từ có chữ/số (bỏ "-", "&"…)
  const words = r.name.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || '?';
}

/**
 * Avatar phòng: ảnh phòng nếu có; chat 1-1 là ảnh người kia (+ chấm xanh đang hoạt động);
 * còn lại là mã lớp trên nền màu theo phòng. KHÔNG gọi hook (dùng trong danh sách dài) —
 * màu + media token do màn cha truyền vào.
 */
export function RoomAvatar({
  room,
  token,
  size = 52,
  brand,
  success,
}: {
  room: ChatRoomItem;
  token?: string;
  size?: number;
  brand: string;
  success: string;
}) {
  const direct = room.type === 'direct' && room.direct_recipient && !room.direct_recipient.is_multi ? room.direct_recipient : null;
  const raw = direct ? direct.avatar_url : room.avatar_url;
  const uri = thumbMediaUrl(raw, token, Math.round(size * 2));
  const key = thumbCacheKey(raw, size * 2);
  const k = size / 52;

  if (direct) {
    return (
      <View>
        <Avatar name={direct.full_name} uri={uri} cacheKey={key} size={size} />
        {direct.is_online ? (
          <View
            className="absolute bottom-0 right-0 rounded-full border-2 border-background"
            style={{ width: 14 * k, height: 14 * k, backgroundColor: success }}
          />
        ) : null}
      </View>
    );
  }
  const initials = roomInitials(room);
  // Ảnh phòng (nếu có) ĐÈ LÊN mã lớp chứ không thay chỗ: `<Image>` lúc chưa tải xong không vẽ gì,
  // nên sau mỗi lần dựng lại danh sách (đổi bộ lọc) avatar biến mất một nhịp, dòng trông như lỗi.
  return (
    // Hai lớp: vòng tròn tự cắt ảnh (overflow-hidden), huy hiệu mũ tốt nghiệp nằm NGOÀI vòng tròn
    // nên không bị cắt mất một nửa.
    <View style={{ width: size, height: size }}>
      <View
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: avatarColor(room._id) }}
        className="items-center justify-center overflow-hidden">
        <Text
          className="font-bold text-white"
          style={{ fontSize: (initials.length > 5 ? 11.5 : initials.length > 3 ? 13.5 : 17) * k }}
          numberOfLines={1}>
          {initials}
        </Text>
        {uri ? (
          <Image source={{ uri, cacheKey: key }} recyclingKey={key} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : null}
      </View>
      {CLASS_ROOM_TYPES.has(room.type) ? (
        <View
          className="absolute -bottom-0.5 -right-0.5 items-center justify-center rounded-full border-2 border-background bg-surface"
          style={{ width: 20 * k, height: 20 * k }}>
          <Ionicons name={room.type === 'activity' ? 'flag' : 'school'} size={10 * k} color={brand} />
        </View>
      ) : null}
    </View>
  );
}
