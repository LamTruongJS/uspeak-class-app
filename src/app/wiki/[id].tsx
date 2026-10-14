import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { HtmlView } from '@/components/ui/html-view';
import { LoadingView, StateView } from '@/components/ui/state-view';
import { useIncrementWikiView, useWikiDoc, type WikiAttachment } from '@/features/wiki/api';
import { getErrorMessage } from '@/lib/api/client';
import { formatDate } from '@/lib/format';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

const formatSize = (bytes?: number) => {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

/** Xem một bài Wiki / Hướng dẫn: nội dung (hoặc mục lục có cấu trúc) + đính kèm. */
export default function WikiDocScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const doc = useWikiDoc(id);
  const increment = useIncrementWikiView();
  const pull = usePullRefresh(() => doc.refetch());
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');

  // Lượt xem tăng đúng 1 lần khi mở bài (class-be không tự tăng trong GET /wiki/:id).
  useEffect(() => {
    if (id) increment.mutate(id);
    // mutation object đổi mỗi render → chỉ phụ thuộc id
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const data = doc.data;
  const sections = data?.sections?.filter((s) => s.tieu_de?.trim() || s.noi_dung?.trim()) ?? [];

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: data?.tieu_de ? '' : 'Bài viết' }} />
      {doc.isLoading ? (
        <LoadingView />
      ) : doc.isError || !data ? (
        <StateView
          icon="cloud-offline-outline"
          title="Không mở được bài viết"
          description={getErrorMessage(doc.error)}
          actionLabel="Thử lại"
          onAction={() => doc.refetch()}
        />
      ) : (
        <ScrollView
          contentContainerClassName="gap-4 p-4 pb-12"
          refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}>
          <View className="gap-2">
            <Text className="text-[22px] font-extrabold leading-7 text-foreground">{data.tieu_de}</Text>
            <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
              {data.category_id?.ten ? (
                <View className="rounded-full bg-brand-soft px-2 py-0.5">
                  <Text className="text-[11px] font-semibold text-brand">{data.category_id.ten}</Text>
                </View>
              ) : null}
              {data.nguoi_tao_id?.ho_ten ? (
                <View className="flex-row items-center gap-1.5">
                  <Avatar name={data.nguoi_tao_id.ho_ten} size={18} />
                  <Text className="text-[11px] text-muted">{data.nguoi_tao_id.ho_ten}</Text>
                </View>
              ) : null}
              <View className="flex-row items-center gap-1">
                <Ionicons name="eye-outline" size={12} color={muted} />
                <Text className="text-[11px] text-muted">{data.luot_xem ?? 0}</Text>
              </View>
              <Text className="text-[11px] text-muted">{formatDate(data.updated_at || data.created_at)}</Text>
            </View>
            {data.tom_tat ? <Text className="text-[15px] leading-6 text-muted">{data.tom_tat}</Text> : null}
          </View>

          <View className="h-px bg-border" />

          {sections.length ? (
            sections.map((section) => (
              <View key={section.key} className="gap-2">
                {section.tieu_de ? (
                  <Text
                    className={`text-foreground ${section.level <= 1 ? 'text-xl font-extrabold' : section.level === 2 ? 'text-[17px] font-bold' : 'text-base font-bold'}`}>
                    {section.tieu_de}
                  </Text>
                ) : null}
                <HtmlView html={section.noi_dung} />
              </View>
            ))
          ) : (
            <HtmlView html={data.noi_dung} />
          )}

          {data.dinh_kem?.length ? (
            <View className="gap-2">
              <Text className="text-xs font-semibold uppercase tracking-wide text-muted">Đính kèm · {data.dinh_kem.length}</Text>
              {data.dinh_kem.map((file) => (
                <AttachmentRow key={file.key} file={file} />
              ))}
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

function AttachmentRow({ file }: { file: WikiAttachment }) {
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');
  return (
    <Pressable
      onPress={() => file.url && Linking.openURL(file.url)}
      className="flex-row items-center gap-2.5 rounded-xl border border-border bg-surface p-3 active:bg-surface-muted">
      <Ionicons name="document-attach-outline" size={20} color={brand} />
      <View className="flex-1">
        <Text className="text-[13px] font-semibold text-foreground" numberOfLines={1}>
          {file.name}
        </Text>
        {formatSize(file.size) ? <Text className="text-[11px] text-muted">{formatSize(file.size)}</Text> : null}
      </View>
      <Ionicons name="download-outline" size={16} color={muted} />
    </Pressable>
  );
}
