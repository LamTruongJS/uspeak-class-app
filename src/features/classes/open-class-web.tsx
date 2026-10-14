import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { Pressable } from 'react-native';

import { WEB_URL } from '@/config/env';
import { useThemeColor } from '@/theme/use-theme-color';

/** Tab bên bản web của màn lớp (uspeak-class-fe /classes/[id]?tab=…). */
export type ClassWebTab = 'students' | 'assignments' | 'attendance' | 'notifications';

export function openClassWeb(classId: string, tab: ClassWebTab) {
  void WebBrowser.openBrowserAsync(`${WEB_URL}/classes/${classId}?tab=${tab}`);
}

/**
 * Nút mở đúng tab bên bản web, đặt ở góc phải header các màn lớp của giáo viên.
 * App mới chỉ XEM: tạo/sửa bài tập, điểm danh, thông báo vẫn phải làm trên web.
 */
export function ClassWebButton({ classId, tab }: { classId: string; tab: ClassWebTab }) {
  const fg = useThemeColor('foreground');
  return (
    <Pressable onPress={() => openClassWeb(classId, tab)} hitSlop={10} accessibilityLabel="Mở bản web" className="active:opacity-60">
      <Ionicons name="desktop-outline" size={20} color={fg} />
    </Pressable>
  );
}
