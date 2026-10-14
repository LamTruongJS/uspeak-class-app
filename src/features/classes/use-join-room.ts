import { useRef, useState } from 'react';
import { Alert, Linking } from 'react-native';

import { api, getErrorMessage } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth.store';

interface JoinRoomResponse {
  found: boolean;
  message?: string;
  zoomJoinUrl?: string | null;
  student?: { name?: string } | null;
}

/**
 * Vào phòng Zoom của lớp — port từ uspeak-class-fe/src/hooks/useJoinRoom.ts.
 * class-be xác minh học viên (theo SĐT, không có thì email) rồi trả link riêng của buổi.
 * Mở link https của Zoom: máy có app Zoom thì iOS/Android tự chuyển sang app (universal link),
 * không có thì mở trình duyệt. Không nhúng Zoom SDK vào app.
 */
export function useJoinRoom() {
  const user = useAuthStore((s) => s.user);
  const [joiningCode, setJoiningCode] = useState<string | null>(null);
  const busy = useRef(false);

  async function join(classCode: string, fallbackUrl?: string | null) {
    if (busy.current || !classCode) return;
    const phone = user?.phone || '';
    const email = user?.email || '';
    if (!phone && !email) {
      Alert.alert('Thiếu thông tin', 'Không tìm thấy số điện thoại hoặc email. Vui lòng cập nhật thông tin cá nhân.');
      return;
    }

    busy.current = true;
    setJoiningCode(classCode);
    try {
      const { data } = await api.post<JoinRoomResponse>('/classes/join-room/verify', {
        classCode,
        ...(phone ? { phone } : { email }),
      });

      let url = data.found ? data.zoomJoinUrl : null;
      if (url) {
        const name = data.student?.name || user?.name;
        if (name) url = `${url}${url.includes('?') ? '&' : '?'}uname=${encodeURIComponent(name)}`;
      } else {
        url = fallbackUrl?.trim() || null;
      }

      if (!url) {
        Alert.alert(
          'Chưa vào được phòng học',
          data.message ||
            (data.found
              ? 'Buổi học hiện chưa có link Zoom. Vui lòng thử lại gần giờ học.'
              : 'Không tìm thấy thông tin học viên trong lớp học này.'),
        );
        return;
      }
      await Linking.openURL(url);
    } catch (err) {
      Alert.alert('Không vào được phòng học', getErrorMessage(err));
    } finally {
      busy.current = false;
      setJoiningCode(null);
    }
  }

  return { join, joiningCode };
}
