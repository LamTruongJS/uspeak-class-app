import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface AvatarProps {
  name?: string;
  uri?: string | null;
  size?: number;
  /** Key cache ổn định (S3 key) — link có media token đổi mỗi 2h nhưng ảnh không đổi */
  cacheKey?: string;
}

function initials(name?: string) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  // Tên Việt: lấy chữ cái của tên (cuối) + họ (đầu) — "Nguyễn Văn An" → "AN"
  const last = parts[parts.length - 1]?.[0] ?? '';
  const first = parts.length > 1 ? (parts[0]?.[0] ?? '') : '';
  return (last + first).toUpperCase();
}

/**
 * Ảnh đại diện. Chữ cái tên luôn được vẽ SẴN ở dưới, ảnh tải xong mới đè lên trên:
 * - ảnh hỏng (token hết hạn, mất mạng, file đã xoá) → vẫn còn chữ cái, không thành ô trống;
 * - ảnh đang tải (lần đầu vào phòng chat, vài chục avatar cùng tải) → thấy chữ cái ngay thay vì
 *   một loạt ô trắng như thể app bị thiếu icon (lỗi thấy 15/10/2026 ở màn chat).
 */
export function Avatar({ name, uri, size = 40, cacheKey }: AvatarProps) {
  const style = { width: size, height: size, borderRadius: size / 2 };
  // Nhớ ĐÚNG link bị lỗi, không nhớ cờ true/false: link đổi (vd media token mới về) là tự thử lại,
  // khỏi phải setState trong useEffect (React Compiler cấm).
  const [failedUri, setFailedUri] = useState<string | null>(null);

  return (
    <View style={style} className="items-center justify-center overflow-hidden bg-brand-soft">
      <Text className="font-semibold text-brand" style={{ fontSize: size * 0.38 }}>
        {initials(name)}
      </Text>
      {uri && failedUri !== uri ? (
        <Image
          source={{ uri, cacheKey }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
          recyclingKey={cacheKey ?? uri}
          onError={() => setFailedUri(uri)}
        />
      ) : null}
    </View>
  );
}
