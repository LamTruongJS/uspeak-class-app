import { Pressable, ScrollView, Text, View } from 'react-native';

export interface SegmentItem<T extends string> {
  value: T;
  label: string;
  count?: number;
  /** Chấm đỏ "có cái mới" (VD thông báo lớp chưa xem). */
  dot?: boolean;
}

interface SegmentedProps<T extends string> {
  items: SegmentItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /**
   * chip: hàng chip cuộn ngang (bộ lọc) · tabs: thanh tab chia đều (2–3 tab)
   * · underline: tab gạch chân cuộn ngang — dùng khi có 4 tab trở lên, nhãn dài không bị cắt chữ.
   */
  variant?: 'tabs' | 'chip' | 'underline';
}

export function Segmented<T extends string>({ items, value, onChange, variant = 'tabs' }: SegmentedProps<T>) {
  if (variant === 'underline') {
    return (
      <View className="border-b border-border">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-1">
          {items.map((item) => {
            const active = item.value === value;
            return (
              <Pressable
                key={item.value}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => onChange(item.value)}
                className="items-center px-3 pt-1.5 active:opacity-70">
                <View className="flex-row items-center gap-1.5 pb-2">
                  <Text className={`text-[15px] font-semibold ${active ? 'text-brand' : 'text-muted'}`}>{item.label}</Text>
                  {item.count != null ? (
                    <View className={`rounded-full px-1.5 py-0.5 ${active ? 'bg-brand-soft' : 'bg-surface-muted'}`}>
                      <Text className={`text-[11px] font-bold ${active ? 'text-brand' : 'text-muted'}`}>{item.count}</Text>
                    </View>
                  ) : null}
                  {item.dot ? <View className="h-1.5 w-1.5 rounded-full bg-danger" /> : null}
                </View>
                <View className={`h-0.5 self-stretch rounded-full ${active ? 'bg-brand' : 'bg-transparent'}`} />
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    );
  }

  if (variant === 'chip') {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 py-1">
        {items.map((item) => {
          const active = item.value === value;
          return (
            <Pressable
              key={item.value}
              onPress={() => onChange(item.value)}
              className={`rounded-full border px-3.5 py-1.5 ${active ? 'border-brand bg-brand' : 'border-border bg-surface'}`}>
              <Text className={`text-sm font-medium ${active ? 'text-on-brand' : 'text-foreground'}`}>
                {item.label}
                {item.count != null ? ` · ${item.count}` : ''}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    );
  }

  return (
    <View className="flex-row rounded-xl bg-surface-muted p-1">
      {items.map((item) => {
        const active = item.value === value;
        return (
          <Pressable
            key={item.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(item.value)}
            className={`flex-1 items-center rounded-lg py-2 ${active ? 'bg-surface' : ''}`}>
            <Text className={`text-sm font-semibold ${active ? 'text-foreground' : 'text-muted'}`}>
              {item.label}
              {item.count ? ` (${item.count})` : ''}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
