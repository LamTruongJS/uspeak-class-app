import type { ReactNode } from 'react';
import { ScopedVariables, useUniwind } from 'uniwind';

/**
 * Bảng màu của KHUNG HỘI THOẠI chat — bản app của `.uspeak-chat` trong class-fe globals.css (web đổi
 * 04/11/2026, chép từ chat-task): xanh navy thay đỏ thương hiệu, viền / chữ / nền theo chat-task.
 * Chỉ bọc màn phòng chat; danh sách phòng, thông tin phòng… vẫn giữ đỏ như web (cột Bộ lọc/Kênh chat).
 *
 * Đổi giá trị biến màu trong phạm vi (ScopedVariables của Uniwind) → mọi `bg-brand`, `text-brand`,
 * `useThemeColor('brand')` bên trong tự ra màu chat, không phải sửa từng chỗ. Bảng chọn / Modal render
 * qua portal ra ngoài phạm vi vẫn màu gốc (web cũng vậy). Giá trị trùng global.css của app Task.
 */
const LIGHT = {
  '--color-background': '#f5f6f7',
  '--color-surface': '#ffffff',
  '--color-surface-muted': '#f2f3f5',
  '--color-foreground': '#1f2329',
  '--color-muted': '#646a73',
  '--color-border': '#e5e6eb',
  '--color-brand': '#273880',
  '--color-brand-soft': '#e9ecf6',
  '--color-brand-strong': '#1d2c6b',
};

const DARK = {
  '--color-background': '#161a1d',
  '--color-surface': '#22272b',
  '--color-surface-muted': '#2c333a',
  '--color-foreground': '#dee4ea',
  '--color-muted': '#9fadbc',
  '--color-border': '#2c333a',
  '--color-brand': '#579dff',
  '--color-brand-soft': '#1c2b41',
  '--color-brand-strong': '#85b5ff',
};

export function ChatTheme({ children }: { children: ReactNode }) {
  const { theme } = useUniwind();
  return <ScopedVariables variables={theme === 'dark' ? DARK : LIGHT}>{children}</ScopedVariables>;
}
