import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, Switch, Text, TextInput, View } from 'react-native';

import { useThemeColor } from '@/theme/use-theme-color';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Khung 1 phần của form (thẻ trắng bo tròn + tiêu đề có icon). */
export function Section({ icon, title, right, children }: { icon: IconName; title: string; right?: ReactNode; children: ReactNode }) {
  const brand = useThemeColor('brand');
  return (
    <View className="gap-3.5 rounded-3xl bg-surface p-4">
      <View className="flex-row items-center gap-2">
        <Ionicons name={icon} size={18} color={brand} />
        <Text className="flex-1 text-[16px] font-extrabold text-foreground">{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <View className="gap-1.5">
      <Text className="text-[13px] font-semibold text-muted">{label}</Text>
      {children}
      {error ? <Text className="text-[12px] font-semibold text-danger">{error}</Text> : hint ? <Text className="text-[12px] text-muted">{hint}</Text> : null}
    </View>
  );
}

export function Input({
  value,
  onChange,
  placeholder,
  multiline,
  numeric,
  minHeight,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  numeric?: boolean;
  minHeight?: number;
  autoFocus?: boolean;
}) {
  const muted = useThemeColor('muted');
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={muted}
      multiline={multiline}
      autoFocus={autoFocus}
      textAlignVertical={multiline ? 'top' : 'center'}
      keyboardType={numeric ? 'number-pad' : 'default'}
      style={multiline ? { minHeight: minHeight ?? 96 } : undefined}
      className={`rounded-2xl border border-border bg-background px-4 text-[15px] text-foreground ${multiline ? 'py-3 leading-6' : 'h-12'}`}
    />
  );
}

export function ToggleRow({ title, hint, value, onChange, disabled }: { title: string; hint?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const brand = useThemeColor('brand');
  return (
    <View className={`flex-row items-center gap-3 ${disabled ? 'opacity-60' : ''}`}>
      <View className="flex-1">
        <Text className="text-[14.5px] font-semibold text-foreground">{title}</Text>
        {hint ? <Text className="text-[12.5px] text-muted">{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: brand }} />
    </View>
  );
}

/** Nhóm nút chọn 1 (độ khó, loại câu hỏi…). */
export function Choice<T extends string>({ items, value, onChange }: { items: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View className="flex-row gap-1 rounded-2xl bg-surface-muted p-1">
      {items.map((it) => {
        const on = it.value === value;
        return (
          <Pressable key={it.value} onPress={() => onChange(it.value)} className={`flex-1 items-center rounded-xl py-2 ${on ? 'bg-surface' : ''}`}>
            <Text className={`text-[13px] font-bold ${on ? 'text-brand' : 'text-muted'}`} numberOfLines={1}>
              {it.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SmallButton({ icon, label, onPress, tone = 'brand' }: { icon: IconName; label: string; onPress: () => void; tone?: 'brand' | 'muted' | 'danger' }) {
  const color = tone === 'danger' ? '#dc2626' : tone === 'muted' ? '#6b7280' : '#b62025';
  const bg = tone === 'danger' ? 'bg-danger-soft' : tone === 'muted' ? 'bg-surface-muted' : 'bg-brand-soft';
  return (
    <Pressable onPress={onPress} hitSlop={4} className={`flex-row items-center gap-1.5 self-start rounded-full px-3 py-2 active:opacity-70 ${bg}`}>
      <Ionicons name={icon} size={15} color={color} />
      <Text className="text-[13px] font-bold" style={{ color }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function IconButton({ icon, onPress, disabled, label }: { icon: IconName; onPress: () => void; disabled?: boolean; label: string }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityLabel={label}
      className={`h-8 w-8 items-center justify-center rounded-full bg-surface-muted active:opacity-70 ${disabled ? 'opacity-30' : ''}`}>
      <Ionicons name={icon} size={15} color="#6b7280" />
    </Pressable>
  );
}
