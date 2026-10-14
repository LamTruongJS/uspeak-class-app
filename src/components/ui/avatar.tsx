import { Image } from 'expo-image';
import { useState } from 'react';
import { Text, View } from 'react-native';

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
 * Ảnh đại diện. Tải ảnh hỏng (token hết hạn, mất mạng, file đã xoá) thì quay về chữ cái tên —
 * KHÔNG để ô trống: trước đây ảnh lỗi là avatar biến mất hẳn, nhìn như app bị thiếu icon.
 */
export function Avatar({ name, uri, size = 40, cacheKey }: AvatarProps) {
  const style = { width: size, height: size, borderRadius: size / 2 };
  // Nhớ ĐÚNG link bị lỗi, không nhớ cờ true/false: link đổi (vd media token mới về) là tự thử lại,
  // khỏi phải setState trong useEffect (React Compiler cấm).
  const [failedUri, setFailedUri] = useState<string | null>(null);

  if (uri && failedUri !== uri) {
    return (
      <Image
        source={{ uri, cacheKey }}
        style={style}
        contentFit="cover"
        transition={150}
        recyclingKey={cacheKey ?? uri}
        onError={() => setFailedUri(uri)}
      />
    );
  }

  return (
    <View style={style} className="items-center justify-center bg-brand-soft">
      <Text className="font-semibold text-brand" style={{ fontSize: size * 0.38 }}>
        {initials(name)}
      </Text>
    </View>
  );
}
