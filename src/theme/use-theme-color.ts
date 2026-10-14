import { useCSSVariable } from 'uniwind';

/** Tên token màu khai trong src/global.css (bỏ tiền tố `--color-`). */
export type ThemeColor =
  | 'background'
  | 'surface'
  | 'surface-muted'
  | 'foreground'
  | 'muted'
  | 'border'
  | 'brand'
  | 'brand-soft'
  | 'brand-strong'
  | 'on-brand'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'violet'
  | 'navy'
  | 'navy-soft'
  | 'zoom'
  | 'orange';

/**
 * Lấy giá trị màu (theo sáng/tối) cho các prop native không nhận className:
 * màu icon, ActivityIndicator, placeholderTextColor, RefreshControl…
 * Nguồn duy nhất vẫn là global.css — đừng hard-code mã màu trong component.
 */
export function useThemeColor(name: ThemeColor): string {
  return String(useCSSVariable(`--color-${name}`) ?? '#888888');
}
