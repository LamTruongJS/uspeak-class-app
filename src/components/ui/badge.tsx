import { Text, View } from 'react-native';

export type BadgeTone = 'neutral' | 'brand' | 'info' | 'success' | 'warning' | 'danger' | 'violet';

// Viết đủ tên class (không ghép chuỗi `bg-${tone}`) để Tailwind quét được.
const TONE: Record<BadgeTone, { box: string; text: string; dot: string }> = {
  neutral: { box: 'bg-surface-muted', text: 'text-muted', dot: 'bg-muted' },
  brand: { box: 'bg-brand-soft', text: 'text-brand', dot: 'bg-brand' },
  info: { box: 'bg-info-soft', text: 'text-info', dot: 'bg-info' },
  success: { box: 'bg-success-soft', text: 'text-success', dot: 'bg-success' },
  warning: { box: 'bg-warning-soft', text: 'text-warning', dot: 'bg-warning' },
  danger: { box: 'bg-danger-soft', text: 'text-danger', dot: 'bg-danger' },
  violet: { box: 'bg-violet-soft', text: 'text-violet', dot: 'bg-violet' },
};

export function Badge({ label, tone = 'neutral', dot }: { label: string; tone?: BadgeTone; dot?: boolean }) {
  const t = TONE[tone];
  return (
    <View className={`flex-row items-center gap-1 self-start rounded-full px-2 py-0.5 ${t.box}`}>
      {dot ? <View className={`h-1.5 w-1.5 rounded-full ${t.dot}`} /> : null}
      <Text className={`text-xs font-semibold ${t.text}`}>{label}</Text>
    </View>
  );
}

/** Lớp nền chấm màu theo tone — dùng cho viền trái / chấm lịch. */
export function toneDotClass(tone: BadgeTone) {
  return TONE[tone].dot;
}
