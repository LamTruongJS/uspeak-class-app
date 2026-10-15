import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';

import { showToast } from '@/components/ui/toast';
import { useActionSheet } from '@/components/ui/action-sheet';
import { Segmented } from '@/components/ui/segmented';
import { StateView } from '@/components/ui/state-view';
import { API_URL } from '@/config/env';
import {
  certificateStatus,
  defaultCertificateContent,
  useCertificateData,
  useGenerateCertificates,
  type CertificateStudent,
} from '@/features/classes/class-admin-api';
import { useStaffClasses } from '@/features/classes/staff-api';
import { getErrorMessage } from '@/lib/api/client';
import { tokenStorage } from '@/lib/auth/token-storage';
import { formatDate } from '@/lib/format';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

/**
 * Gửi chứng chỉ học tập (CertificateManagementTab web, bản điện thoại): chọn mẫu → sửa nội dung → tick học viên
 * (mặc định chọn học viên đủ điều kiện; học viên chưa đủ hiện lý do, vẫn tick được như kéo-thả ở web) → gửi.
 * Tab Lịch sử: trạng thái tạo / gửi email từng chứng chỉ, bấm để xem file.
 */
export default function ClassCertificatesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');
  const cls = useStaffClasses().data?.find((c) => c._id === id);
  const data = useCertificateData(id);
  const generate = useGenerateCertificates(id);
  const pull = usePullRefresh(() => data.refetch());
  const [tab, setTab] = useState<'send' | 'history'>('send');
  const sheet = useActionSheet();
  const [slug, setSlug] = useState('');
  const [content, setContent] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string> | null>(null);
  // Ảnh xem trước mẫu cần đăng nhập → gửi kèm token trong header của expo-image
  const auth = useQuery({ queryKey: ['auth', 'access-token'], staleTime: 60_000, queryFn: async () => (await tokenStorage.get())?.accessToken ?? null }).data;

  const templates = useMemo(() => data.data?.templates ?? [], [data.data]);
  const students = useMemo(() => data.data?.students ?? [], [data.data]);
  const effSlug = slug || templates[0]?.slug || '';
  const effContent = content ?? defaultCertificateContent(cls?.display_name || cls?.class_name, cls?.end_date || cls?.start_date);
  // Mặc định: chọn học viên đủ điều kiện
  const effPicked = picked ?? new Set(students.filter((s) => s.eligible).map((s) => s.studentId));
  const eligible = students.filter((s) => s.eligible);

  const toggle = (sid: string) =>
    setPicked(() => {
      const next = new Set(effPicked);
      if (next.has(sid)) next.delete(sid);
      else next.add(sid);
      return next;
    });

  const send = () => {
    const chosen = students.filter((s) => effPicked.has(s.studentId));
    if (!effSlug) return showToast('warning', 'Chưa chọn mẫu chứng chỉ');
    if (!effContent.trim()) return showToast('warning', 'Chưa có nội dung chứng chỉ');
    if (!chosen.length) return showToast('warning', 'Chưa chọn học viên');
    sheet.confirm({
      title: `Gửi chứng chỉ cho ${chosen.length} học viên?`,
      message: 'Hệ thống tạo file chứng chỉ và gửi email cho từng học viên.',
      label: 'Gửi',
      icon: 'send-outline',
      danger: false,
      onConfirm: () =>
          generate.mutate(
            { templateSlug: effSlug, content: effContent.trim(), students: chosen.map((s) => ({ studentId: s.studentId, studentName: s.studentName.trim() })) },
            {
              onSuccess: async (r) => {
                const st = await certificateStatus(id, effSlug, r.batchId).catch(() => null);
                showToast('success', `Đã đưa ${r.queued} chứng chỉ vào hàng đợi`, st ? `Đã tạo ${st.generated} · đang chờ ${st.pending} · lỗi ${st.failed}` : 'Xem tiến độ ở tab Lịch sử.');
                setTab('history');
              },
              onError: (e) => showToast('error', 'Không gửi được chứng chỉ', getErrorMessage(e)),
          },
        ),
    });
  };

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: cls?.class_code ? `Chứng chỉ · ${cls.class_code}` : 'Chứng chỉ', headerShown: true }} />
      {data.isLoading ? (
        <ActivityIndicator className="py-12" color={brand} />
      ) : data.isError ? (
        <StateView icon="cloud-offline-outline" title="Không tải được dữ liệu chứng chỉ" description={getErrorMessage(data.error)} actionLabel="Thử lại" onAction={() => data.refetch()} />
      ) : (
        <ScrollView
          contentContainerClassName="gap-3 p-4"
          contentContainerStyle={{ paddingBottom: tab === 'send' ? 110 : 40 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}>
          <Segmented
            items={[
              { value: 'send', label: 'Gửi chứng chỉ' },
              { value: 'history', label: 'Lịch sử', count: data.data?.history.length ?? 0 },
            ]}
            value={tab}
            onChange={setTab}
          />

          {tab === 'send' ? (
            <>
              <Text className="px-1 text-[13px] font-bold uppercase tracking-wide text-muted">Mẫu chứng chỉ</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2.5">
                {templates.map((t) => {
                  const on = t.slug === effSlug;
                  return (
                    <Pressable key={t.slug} onPress={() => setSlug(t.slug)} className={`w-[200px] overflow-hidden rounded-2xl border-2 bg-surface ${on ? 'border-brand' : 'border-transparent'}`}>
                      {auth ? (
                        <Image
                          source={{ uri: `${API_URL}/certificate-templates/${t.slug}/preview?w=400`, headers: { Authorization: `Bearer ${auth}` } }}
                          style={{ width: 196, height: 138 }}
                          contentFit="cover"
                        />
                      ) : (
                        <View style={{ width: 196, height: 138 }} className="bg-surface-muted" />
                      )}
                      <Text className={`px-3 py-2 text-[13px] font-bold ${on ? 'text-brand' : 'text-foreground'}`} numberOfLines={1}>
                        {t.config?.name || t.slug}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <Text className="px-1 pt-1 text-[13px] font-bold uppercase tracking-wide text-muted">Nội dung trên chứng chỉ</Text>
              <TextInput
                value={effContent}
                onChangeText={setContent}
                multiline
                textAlignVertical="top"
                placeholder="Has successfully completed the course…"
                placeholderTextColor={muted}
                className="min-h-[110px] rounded-2xl border border-border bg-surface p-3.5 text-[14.5px] leading-6 text-foreground"
              />

              <View className="flex-row items-center justify-between px-1 pt-1">
                <Text className="text-[13px] font-bold uppercase tracking-wide text-muted">
                  Học viên · {eligible.length}/{students.length} đủ điều kiện
                </Text>
                <Pressable onPress={() => setPicked(new Set(effPicked.size ? [] : eligible.map((s) => s.studentId)))} hitSlop={6}>
                  <Text className="text-[13px] font-semibold text-brand">{effPicked.size ? 'Bỏ chọn hết' : 'Chọn đủ ĐK'}</Text>
                </Pressable>
              </View>
              {students.map((s) => (
                <StudentPick key={s.studentId} s={s} on={effPicked.has(s.studentId)} onPress={() => toggle(s.studentId)} />
              ))}
            </>
          ) : (data.data?.history ?? []).length ? (
            data.data!.history.map((h) => (
              <Pressable
                key={h.id}
                onPress={() => h.presignedUrl && void WebBrowser.openBrowserAsync(h.presignedUrl)}
                className="flex-row items-center gap-3 rounded-3xl bg-surface p-3.5 active:opacity-90">
                <Ionicons name="ribbon" size={22} color={h.status === 'generated' ? '#059669' : h.status === 'failed' ? '#dc2626' : '#d97706'} />
                <View className="flex-1">
                  <Text className="text-[14.5px] font-bold text-foreground" numberOfLines={1}>
                    {h.studentName}
                  </Text>
                  <Text className="text-[12px] text-muted" numberOfLines={1}>
                    {h.status === 'generated' ? 'Đã tạo' : h.status === 'failed' ? 'Lỗi tạo file' : 'Đang tạo'} · email{' '}
                    {{ none: 'chưa gửi', queued: 'đang gửi', sent: 'đã gửi', failed: 'gửi lỗi' }[h.emailStatus]} · {formatDate(h.updatedAt)}
                    {h.sendCount > 1 ? ` · gửi ${h.sendCount} lần` : ''}
                  </Text>
                </View>
                {h.presignedUrl ? <Ionicons name="open-outline" size={16} color="#9ca3af" /> : null}
              </Pressable>
            ))
          ) : (
            <StateView icon="ribbon-outline" title="Chưa gửi chứng chỉ nào" />
          )}
        </ScrollView>
      )}

      {tab === 'send' && !data.isLoading ? (
        <View className="absolute bottom-0 left-0 right-0 border-t border-border bg-surface px-4 pb-8 pt-3">
          <Pressable onPress={send} disabled={generate.isPending} className="h-12 flex-row items-center justify-center gap-2 rounded-2xl bg-brand active:opacity-85">
            <Ionicons name="send" size={17} color="#fff" />
            <Text className="text-[15px] font-bold text-white">{generate.isPending ? 'Đang gửi…' : `Gửi chứng chỉ (${effPicked.size})`}</Text>
          </Pressable>
        </View>
      ) : null}
      {sheet.sheet}
    </View>
  );
}

function StudentPick({ s, on, onPress }: { s: CertificateStudent; on: boolean; onPress: () => void }) {
  const brand = useThemeColor('brand');
  const m = s.metrics;
  return (
    <Pressable onPress={onPress} className={`gap-1.5 rounded-3xl border-2 bg-surface p-3.5 active:opacity-90 ${on ? 'border-brand' : 'border-transparent'}`}>
      <View className="flex-row items-center gap-2.5">
        <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? brand : '#9ca3af'} />
        <Text className="flex-1 text-[14.5px] font-bold text-foreground" numberOfLines={1}>
          {s.studentName}
        </Text>
        {s.certificate?.status === 'generated' ? (
          <View className="rounded-full bg-success-soft px-2 py-0.5">
            <Text className="text-[11px] font-bold text-success">Đã có CC</Text>
          </View>
        ) : null}
        <View className={`rounded-full px-2 py-0.5 ${s.eligible ? 'bg-success-soft' : 'bg-warning-soft'}`}>
          <Text className={`text-[11px] font-bold ${s.eligible ? 'text-success' : 'text-warning'}`}>{s.eligible ? 'Đủ ĐK' : 'Chưa đủ'}</Text>
        </View>
      </View>
      <Text className="pl-8 text-[12px] text-muted">
        Vắng {m.absentCount} · nộp {m.submittedCount} · thiếu {m.missingCount} · TB {m.scoreCriteriaWaived ? 'không xét' : (m.averageScore?.toFixed(1) ?? '—')}
      </Text>
      {!s.eligible && s.ineligibleReasons.length ? <Text className="pl-8 text-[12px] text-warning">{s.ineligibleReasons.join(' · ')}</Text> : null}
    </Pressable>
  );
}
