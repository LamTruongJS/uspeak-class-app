import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { formatDate, formatTime } from '@/lib/format';

/**
 * Ô chọn ngày + giờ dùng chung. Android: 2 hộp thoại hệ thống (ngày rồi giờ). iOS: lịch inline mở ngay
 * dưới ô. `clearable` → có nút xoá (giá trị null = "không đặt").
 */
export function DateTimeField({
  value,
  onChange,
  placeholder = 'Chưa đặt',
  clearable,
  defaultValue,
  minimumDate,
}: {
  value: Date | null;
  onChange: (d: Date | null) => void;
  placeholder?: string;
  clearable?: boolean;
  /** Mốc mở lịch khi chưa có giá trị */
  defaultValue?: () => Date;
  minimumDate?: Date;
}) {
  const [iosOpen, setIosOpen] = useState(false);

  const open = () => {
    const base = value ?? defaultValue?.() ?? new Date();
    if (Platform.OS === 'ios') {
      if (!value) onChange(base);
      setIosOpen((v) => !v);
      return;
    }
    DateTimePickerAndroid.open({
      value: base,
      mode: 'date',
      minimumDate,
      onChange: (e, d) => {
        if (e.type !== 'set' || !d) return;
        DateTimePickerAndroid.open({
          value: d,
          mode: 'time',
          is24Hour: true,
          onChange: (e2, t) => e2.type === 'set' && t && onChange(t),
        });
      },
    });
  };

  return (
    <View>
      <Pressable onPress={open} className="h-12 flex-row items-center gap-2.5 rounded-2xl border border-border bg-background px-4 active:opacity-80">
        <Ionicons name="calendar-outline" size={18} color="#6b7280" />
        <Text className={`flex-1 text-[15px] ${value ? 'font-semibold text-foreground' : 'text-muted'}`}>
          {value ? `${formatDate(value)} · ${formatTime(value)}` : placeholder}
        </Text>
        {clearable && value ? (
          <Pressable
            hitSlop={8}
            onPress={() => {
              setIosOpen(false);
              onChange(null);
            }}>
            <Ionicons name="close-circle" size={18} color="#9ca3af" />
          </Pressable>
        ) : (
          <Ionicons name="chevron-down" size={16} color="#9ca3af" />
        )}
      </Pressable>
      {Platform.OS === 'ios' && iosOpen && value ? (
        <DateTimePicker value={value} mode="datetime" display="inline" minimumDate={minimumDate} onChange={(_e, d) => d && onChange(d)} />
      ) : null}
    </View>
  );
}
