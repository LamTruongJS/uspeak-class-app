import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { useColorScheme } from 'react-native';
import { Uniwind } from 'uniwind';

/** Giao diện người dùng chọn ở màn Tài khoản: theo máy / luôn sáng / luôn tối. */
export type ThemePreference = 'system' | 'light' | 'dark';

const KEY = 'uspeak.themePreference';
let current: ThemePreference = 'system';
const listeners = new Set<() => void>();

function apply(pref: ThemePreference) {
  current = pref;
  Uniwind.setTheme(pref);
  listeners.forEach((l) => l());
}

/** Gọi 1 lần lúc mở app (root layout) — đọc lựa chọn đã lưu rồi áp dụng. */
export async function loadThemePreference() {
  try {
    const saved = (await AsyncStorage.getItem(KEY)) as ThemePreference | null;
    if (saved === 'light' || saved === 'dark' || saved === 'system') apply(saved);
  } catch {
    // Không đọc được thì giữ theo máy
  }
}

export function setThemePreference(pref: ThemePreference) {
  apply(pref);
  void AsyncStorage.setItem(KEY, pref).catch(() => undefined);
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}

/** Đang hiện giao diện tối hay không (lựa chọn ở Tài khoản đè lên cài đặt của máy) — cho StatusBar. */
export function useIsDark(): boolean {
  const pref = useThemePreference();
  const scheme = useColorScheme();
  return (pref === 'system' ? scheme : pref) === 'dark';
}
