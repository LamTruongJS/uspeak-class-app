import { useQuery } from '@tanstack/react-query';

import { API_ORIGIN } from '@/config/env';
import { api } from '@/lib/api/client';

/**
 * Link file của class-be có dạng ổn định `/api/uploads/file?key=...` và CẦN đăng nhập
 * (MediaAccessGuard). Ảnh/audio trên app không gắn được header ở mọi chỗ, nên làm như app Task:
 * xin "media token" chỉ-đọc (`POST /uploads/media-token`, hạn ~2h) rồi nối `&mt=` vào link.
 * Token này bị JwtAuthGuard từ chối ở mọi API khác → lộ ra cũng chỉ đọc được file.
 */
export function useMediaToken() {
  return useQuery({
    queryKey: ['media-token'],
    queryFn: async () => (await api.post<{ media_token: string; expires_at: string }>('/uploads/media-token')).data,
    // Token sống 2 giờ. Xin lại sau 1 giờ: app bị treo nền lâu thì `refetchInterval` không chạy,
    // nhưng hễ mở lại màn nào là react-query thấy dữ liệu cũ và tự xin token mới trước khi hết hạn.
    staleTime: 60 * 60_000,
    refetchInterval: 60 * 60_000,
    retry: 3,
  });
}

/** Ghép link đầy đủ có token. Link ngoài (S3 presigned, Tenor/Giphy, YouTube) giữ nguyên. */
export function resolveMediaUrl(url: string | null | undefined, token?: string): string | undefined {
  if (!url) return undefined;
  if (/^(https?:|file:|data:|blob:)/.test(url) && !url.includes('/uploads/file?')) return url;

  const absolute = url.startsWith('http') ? url : `${API_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`;
  if (!absolute.includes('/uploads/file?')) return absolute;
  // Link của class-be bắt buộc có media token. CHƯA có token thì trả về undefined thay vì link
  // trần: gọi lúc đó chỉ nhận 401 rồi ảnh trắng (avatar biến mất), trong khi trả undefined thì
  // chỗ hiển thị dùng ảnh dự phòng (chữ cái tên) và tự load lại khi token về.
  if (!token) return undefined;
  return `${absolute}${absolute.includes('?') ? '&' : '?'}mt=${encodeURIComponent(token)}`;
}

/**
 * Như `resolveMediaUrl` nhưng xin bản THU NHỎ: thêm `&w=<px>` cho link proxy `/uploads/file?key=`
 * — class-be resize ra webp vài chục KB (và cache bản đó trên S3) thay vì stream ảnh gốc vài MB.
 * Ô lưới / ảnh trong bong bóng / avatar đều phải dùng cái này: tải ảnh gốc cho từng ô vừa tốn 3G
 * của học viên, vừa giữ socket S3 của BE lâu → đúng nút thắt từng gây lỗi 502 bên web.
 * Link ngoài (S3 presigned, Tenor/Giphy) giữ nguyên vì BE không resize hộ được.
 */
export function thumbMediaUrl(url: string | null | undefined, token: string | undefined, width: number) {
  const full = resolveMediaUrl(url, token);
  if (!full || !width || !full.includes('/uploads/file?')) return full;
  if (/[?&]w=/.test(full)) return full;
  return `${full}&w=${Math.round(width)}`;
}

/** Key cache ổn định cho expo-image: token đổi mỗi 2h nhưng ảnh không đổi → không tải lại. */
export function mediaCacheKey(url: string | null | undefined) {
  if (!url) return undefined;
  const m = url.match(/[?&]key=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : url;
}

/**
 * Key cache cho bản THU NHỎ. Phải kèm bề rộng: cùng một ảnh nhưng xin `w=120` và `w=600` là hai
 * tệp khác nhau — dùng chung một key thì ô to sẽ lấy đúng bản nhỏ đã cache và hiện ra mờ nhoè.
 */
export function thumbCacheKey(url: string | null | undefined, width: number) {
  const key = mediaCacheKey(url);
  return key ? `${key}@${Math.round(width)}` : undefined;
}

export function useMediaUrl(url: string | null | undefined) {
  const { data } = useMediaToken();
  return resolveMediaUrl(url, data?.media_token);
}
