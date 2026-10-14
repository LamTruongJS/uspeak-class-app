import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { LoadingView, StateView } from '@/components/ui/state-view';
import { ImageViewer } from '@/features/chat/message-content';
import { api, getErrorMessage } from '@/lib/api/client';
import { formatDate } from '@/lib/format';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

/**
 * Chứng chỉ học tập của học viên — GET `/students/me/certificates` (giống web my-certificates):
 * gom theo lớp, mỗi chứng chỉ là 1 ảnh đã render sẵn kèm link presigned.
 * Link hết hạn thì kéo để làm mới là có link mới (web cũng làm vậy).
 */
interface StudentCertificate {
  id: string;
  templateSlug: string;
  values: Record<string, string>;
  presignedUrl: string;
  createdAt: string;
}

interface CertificateGroup {
  classId: string;
  className: string;
  certificates: StudentCertificate[];
}

function certificateTitle(cert: StudentCertificate) {
  const raw = cert.values.content || cert.values.courseName || 'Chứng chỉ học tập';
  return raw.split(/\r?\n/).filter(Boolean)[0] ?? 'Chứng chỉ học tập';
}

export default function CertificatesScreen() {
  const brand = useThemeColor('brand');
  const [viewer, setViewer] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['certificates', 'mine'],
    queryFn: async () => (await api.get<{ data: CertificateGroup[] }>('/students/me/certificates')).data.data ?? [],
  });
  const pull = usePullRefresh(() => query.refetch());
  const groups = query.data ?? [];
  const total = groups.reduce((sum, g) => sum + g.certificates.length, 0);

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: 'Chứng chỉ học tập' }} />
      {query.isLoading ? (
        <LoadingView />
      ) : query.isError ? (
        <StateView
          icon="cloud-offline-outline"
          title="Không tải được chứng chỉ"
          description={getErrorMessage(query.error)}
          actionLabel="Thử lại"
          onAction={() => query.refetch()}
        />
      ) : total === 0 ? (
        <ScrollView
          contentContainerClassName="flex-1"
          refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}>
          <StateView
            icon="ribbon-outline"
            title="Chưa có chứng chỉ nào"
            description="Hoàn thành khoá học và đạt điều kiện của lớp, chứng chỉ sẽ xuất hiện tại đây."
          />
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerClassName="gap-5 p-4 pb-10"
          refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}>
          {groups.map((group) => (
            <View key={group.classId} className="gap-2.5">
              <Text className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">{group.className}</Text>
              {group.certificates.map((cert) => (
                <View key={cert.id} className="overflow-hidden rounded-2xl border border-border bg-surface">
                  <Pressable onPress={() => setViewer(cert.presignedUrl)} className="active:opacity-80">
                    <Image
                      source={{ uri: cert.presignedUrl, cacheKey: cert.id }}
                      style={{ width: '100%', aspectRatio: 1.414 }}
                      contentFit="cover"
                      transition={150}
                    />
                  </Pressable>
                  <View className="gap-2 p-3.5">
                    <Text className="text-[15px] font-bold text-foreground" numberOfLines={2}>
                      {certificateTitle(cert)}
                    </Text>
                    <Text className="text-[11px] text-muted">Cấp ngày {formatDate(cert.createdAt)}</Text>
                    <View className="flex-row gap-2 pt-0.5">
                      <Action icon="eye-outline" label="Xem" onPress={() => setViewer(cert.presignedUrl)} />
                      <Action icon="download-outline" label="Tải xuống" onPress={() => void Linking.openURL(cert.presignedUrl)} />
                    </View>
                  </View>
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      )}
      <ImageViewer uri={viewer} onClose={() => setViewer(null)} />
    </View>
  );
}

function Action({ icon, label, onPress }: { icon: 'eye-outline' | 'download-outline'; label: string; onPress: () => void }) {
  const brand = useThemeColor('brand');
  return (
    <Pressable
      onPress={onPress}
      className="flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-border bg-surface py-2.5 active:bg-surface-muted">
      <Ionicons name={icon} size={16} color={brand} />
      <Text className="text-[13px] font-semibold text-foreground">{label}</Text>
    </Pressable>
  );
}
