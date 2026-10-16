import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, TextInput, View } from 'react-native';

import { useThemeColor } from '@/theme/use-theme-color';

/**
 * Ô tìm + hàng chip lọc của các màn danh sách (Lớp học, Lớp dạy, Nhóm giảng dạy…) — dùng chung để
 * các màn cùng một kiểu (tách từ app/(tabs)/classes.tsx 16/10/2026).
 */

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const muted = useThemeColor('muted');
  return (
    <View className="h-11 flex-row items-center gap-2 rounded-xl bg-surface-muted px-3">
      <Ionicons name="search" size={18} color={muted} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={muted}
        autoCorrect={false}
        className="flex-1 text-base text-foreground"
      />
      {value ? (
        <Pressable hitSlop={8} onPress={() => onChange('')} accessibilityLabel="Xoá ô tìm">
          <Ionicons name="close-circle" size={18} color={muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function FilterChips<T extends string>({
  items,
  value,
  onChange,
}: {
  items: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
}) {
  // XUỐNG DÒNG chứ không cuộn ngang: cuộn thì mấy bộ lọc cuối luôn khuất ngoài mép màn hình,
  // người dùng không biết là còn nữa.
  return (
    <View className="flex-row flex-wrap gap-2">
      {items.map((it) => {
        const on = it.value === value;
        return (
          <Pressable
            key={it.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(it.value)}
            className={`h-8 flex-row items-center gap-1.5 rounded-full px-3 ${on ? 'bg-brand' : 'bg-surface-muted'}`}>
            <Text className={`text-[13px] font-semibold ${on ? 'text-on-brand' : 'text-foreground'}`}>{it.label}</Text>
            {it.count !== undefined ? (
              <View className={`rounded-full px-1.5 ${on ? 'bg-white/25' : 'bg-background'}`}>
                <Text className={`text-[11px] font-bold ${on ? 'text-on-brand' : 'text-muted'}`}>{it.count}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
