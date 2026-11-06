import { AppState } from 'react-native';

/**
 * Chạy lại `fn` khi app ở foreground (người dùng đã mở khoá máy và mở app). Đang foreground sẵn
 * (hiếm: đọc Keychain lỗi thoáng qua) thì thử lại sau 1 giây. Chỉ giữ 1 lần chờ cùng lúc.
 */
let waiting = false;

export function retryWhenActive(fn: () => void) {
  if (waiting) return;
  waiting = true;
  const run = () => {
    waiting = false;
    fn();
  };
  if (AppState.currentState === 'active') {
    setTimeout(run, 1000);
    return;
  }
  const sub = AppState.addEventListener('change', (s) => {
    if (s !== 'active') return;
    sub.remove();
    run();
  });
}
