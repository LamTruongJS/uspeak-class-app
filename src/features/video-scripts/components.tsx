import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Badge } from '@/components/ui/badge';
import { fold } from '@/features/chat/mentions';
import { useThemeColor } from '@/theme/use-theme-color';

import { PROVIDER_LABEL, transcriptPercent, type TranscriptSummary } from './api';

/** Thanh tiến độ mảnh — tối thiểu 4% cho người xem biết là đang chạy. */
export function ProgressBar({ percent }: { percent: number }) {
  return (
    <View className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
      <View className="h-full rounded-full bg-brand" style={{ width: `${Math.max(percent, 4)}%` }} />
    </View>
  );
}

/** Ô "Script" của bảng web: Chưa có / Đã có · N đoạn / Lỗi / Chờ / Đang chạy + tiến độ. */
export function TranscriptStatusView({ transcript }: { transcript: TranscriptSummary | null }) {
  const t = transcript;
  if (!t) return <Badge label="Chưa có script" tone="neutral" />;
  if (t.status === 'done') {
    return (
      <View className="flex-row items-center gap-1.5">
        <Badge label={`Đã có · ${t.segment_count} đoạn`} tone="success" />
        <Text className="text-[11.5px] text-muted">{PROVIDER_LABEL[t.provider] ?? t.provider}</Text>
      </View>
    );
  }
  if (t.status === 'failed') {
    return (
      <View className="gap-1">
        <Badge label="Lỗi" tone="danger" />
        {t.error ? (
          <Text className="text-[12px] text-danger" numberOfLines={2}>
            {t.error}
          </Text>
        ) : null}
      </View>
    );
  }
  if (t.status === 'queued') return <Badge label="Chờ tới lượt" tone="warning" />;
  return (
    <View className="gap-1.5">
      <Badge label={t.stage === 'transcribe' ? `Chép lời ${t.chunks_done}/${t.chunks_total}` : 'Đang tải audio'} tone="info" />
      <ProgressBar percent={transcriptPercent(t)} />
    </View>
  );
}

export interface PickerOption {
  value: string;
  label: string;
  sublabel?: string;
  keywords?: string;
}

/**
 * Bảng chọn có ô tìm (khoá / lớp) — thay SelectComponent searchable của web; danh sách lớp có thể
 * vài trăm dòng nên không dùng action-sheet (không có ô tìm).
 */
export function PickerSheet({
  visible,
  title,
  options,
  value,
  searchPlaceholder,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: PickerOption[];
  value: string;
  searchPlaceholder: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const muted = useThemeColor('muted');
  const brand = useThemeColor('brand');
  const [search, setSearch] = useState('');

  const list = useMemo(() => {
    const q = fold(search.trim());
    if (!q) return options;
    return options.filter((o) => fold(`${o.label} ${o.sublabel ?? ''} ${o.keywords ?? ''}`).includes(q));
  }, [options, search]);

  const close = () => {
    setSearch('');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close} presentationStyle="pageSheet">
      <View className="flex-1 bg-background" style={{ paddingBottom: insets.bottom }}>
        <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
          <Pressable onPress={close} hitSlop={8}>
            <Text className="text-base text-brand">Đóng</Text>
          </Pressable>
          <Text className="text-base font-semibold text-foreground">{title}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View className="mx-4 my-3 h-11 flex-row items-center gap-2 rounded-xl bg-surface-muted px-3">
          <Ionicons name="search" size={18} color={muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={searchPlaceholder}
            placeholderTextColor={muted}
            autoCorrect={false}
            className="flex-1 text-base text-foreground"
          />
        </View>
        <FlatList
          data={list}
          keyExtractor={(o) => o.value || '__all'}
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="px-4 pb-4"
          ListEmptyComponent={<Text className="py-8 text-center text-[13px] text-muted">Không có mục nào khớp</Text>}
          renderItem={({ item }) => {
            const on = item.value === value;
            return (
              <Pressable
                onPress={() => {
                  onSelect(item.value);
                  close();
                }}
                className="flex-row items-center gap-3 border-b border-border py-3 active:opacity-70">
                <View className="shrink gap-0.5">
                  <Text className={`text-[15px] ${on ? 'font-semibold text-brand' : 'text-foreground'}`} numberOfLines={2}>
                    {item.label}
                  </Text>
                  {item.sublabel ? (
                    <Text className="text-[12px] text-muted" numberOfLines={1}>
                      {item.sublabel}
                    </Text>
                  ) : null}
                </View>
                <View className="flex-1" />
                {on ? <Ionicons name="checkmark" size={20} color={brand} /> : null}
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
}
