import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Segmented } from '@/components/ui/segmented';
import { StateView } from '@/components/ui/state-view';
import { GRADING_STATS_3D_ICONS } from '@/constants/three-d-icons';
import {
  useGradingStats,
  useGradingStatsDetail,
  useMyPaymentSummary,
  useXpHistory,
  useXpProfile,
  type StatsDetailType,
  type StatsMode,
} from '@/features/assignments/management-api';
import { useMyPermissionCodes } from '@/features/chat/api';
import { AreaChart } from '@/features/dashboard/area-chart';
import { formatMoney, useMyEarnings, usePaymentThreshold } from '@/features/payment/api';
import { getErrorMessage } from '@/lib/api/client';
import { formatDate, formatDateTime } from '@/lib/format';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

const COLORS = { graded: '#10b981', waitingReview: '#3b82f6', regrade: '#f59e0b', timeout: '#ef4444' };
const MODE_LABEL: Record<StatsMode, string> = { day: 'hôm nay', week: '7 ngày', month: '30 ngày', year: '12 tháng' };
const DETAIL_TITLE: Record<StatsDetailType, string> = {
  graded: 'Bài đã nhận xét',
  lateGraded: 'Bài nhận xét trễ hạn',
  timeout: 'Bài hết giờ / bỏ dở',
  regrade: 'Bài bị yêu cầu nhận xét lại',
};
const XP_EVENT: Record<string, string> = { graded: 'Nhận xét bài', timeout: 'Hết giờ / bỏ dở', regrade: 'Bị nhận xét lại', admin_adjust: 'Điều chỉnh' };
const XP_ICONS: Record<string, number> = {
  graded: GRADING_STATS_3D_ICONS.approved,
  timeout: GRADING_STATS_3D_ICONS.timeout,
  regrade: GRADING_STATS_3D_ICONS.regrade,
  admin_adjust: GRADING_STATS_3D_ICONS.level,
};

/**
 * Thống kê nhận xét (web /reports, bản điện thoại): cấp độ XP, thu nhập + tiến độ tới ngưỡng thanh toán,
 * số liệu theo kỳ (bấm để xem danh sách bài), biểu đồ hoạt động, XP gần đây.
 */
export default function GradingStatsScreen() {
  const brand = useThemeColor('brand');
  const [mode, setMode] = useState<StatsMode>('week');
  const [detail, setDetail] = useState<StatsDetailType | null>(null);
  const canMoney = (useMyPermissionCodes().data ?? []).includes('REPORT_STATISTICS_VIEW');
  const stats = useGradingStats(mode);
  const xp = useXpProfile();
  const history = useXpHistory();
  const earnings = useMyEarnings();
  const threshold = usePaymentThreshold();
  const paid = useMyPaymentSummary(canMoney);
  const pull = usePullRefresh(() => Promise.all([stats.refetch(), xp.refetch(), history.refetch(), earnings.refetch()]));

  const s = stats.data?.summary;
  const ts = useMemo(() => stats.data?.timeSeries ?? [], [stats.data]);
  const empty = ts.every((d) => !d.graded && !d.timeout && !d.regrade && !d.waitingReview);
  const e = earnings.data;
  const min = threshold.data ?? 0;

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: 'Thống kê nhận xét', headerShown: true }} />
      <ScrollView
        contentContainerClassName="gap-4 p-4 pb-32"
        refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}>
        {/* Cấp độ */}
        {xp.data ? (
          <View className="gap-4 overflow-hidden rounded-[28px] bg-brand p-5">
            <View className="absolute -right-10 -top-14 h-48 w-48 rounded-full bg-white/10" />
            <View className="absolute -bottom-20 -left-14 h-40 w-40 rounded-full bg-black/5" />

            <View className="flex-row items-center justify-between">
              <Text className="text-[11px] font-bold uppercase tracking-[1px] text-white/75">Hồ sơ nhận xét</Text>
              <View className="rounded-full bg-white/15 px-3 py-1">
                <Text className="text-[11.5px] font-bold text-white">Level {xp.data.level}</Text>
              </View>
            </View>

            <View className="flex-row items-center gap-3">
              <Image source={GRADING_STATS_3D_ICONS.level} style={{ width: 68, height: 68 }} contentFit="contain" accessible={false} />
              <View className="min-w-0 flex-1 gap-1">
                <Text className="text-[21px] font-extrabold text-white" numberOfLines={1}>
                  {xp.data.levelTitle}
                </Text>
                <Text className="text-[12.5px] text-white/80">Tiếp tục nhận xét để tăng hạng và mở cấp độ mới.</Text>
              </View>
            </View>

            <View className="flex-row gap-2">
              <HeroStat label="Xếp hạng" value={`${xp.data.rank}/${xp.data.totalGraders}`} />
              <HeroStat label="Tổng kinh nghiệm" value={`${xp.data.totalXP.toLocaleString('vi-VN')} XP`} />
            </View>

            <View className="gap-1.5">
              <View className="flex-row items-center justify-between">
                <Text className="text-[11.5px] font-semibold text-white/85">Tiến độ tới Level {xp.data.level + 1}</Text>
                <Text className="text-[11.5px] font-bold text-white">
                  {xp.data.currentXP.toLocaleString('vi-VN')}/{xp.data.nextLevelXP.toLocaleString('vi-VN')} XP
                </Text>
              </View>
              <View className="h-2 overflow-hidden rounded-full bg-white/25">
                <View className="h-full rounded-full bg-white" style={{ width: `${Math.min(100, Math.max(2, xp.data.progress * 100))}%` }} />
              </View>
            </View>
          </View>
        ) : null}

        {/* Thu nhập */}
        {canMoney && e ? (
          <Pressable
            onPress={() => router.push('/grading/payment-requests')}
            className="gap-3 rounded-3xl border border-border bg-surface p-4 active:opacity-90">
            <View className="flex-row items-center gap-3">
              <Image source={GRADING_STATS_3D_ICONS.earnings} style={{ width: 52, height: 52 }} contentFit="contain" accessible={false} />
              <View className="flex-1">
                <Text className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">Tổng thu nhập</Text>
                <Text className="text-[24px] font-extrabold text-foreground">{formatMoney(e.total_earnings)}</Text>
              </View>
              <View className="h-8 w-8 items-center justify-center rounded-full bg-surface-muted">
                <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
              </View>
            </View>

            <View className="flex-row overflow-hidden rounded-2xl bg-surface-muted px-1 py-3">
              <MoneyStat label="Đã nhận" value={formatMoney(e.paid_amount)} color={COLORS.graded} />
              <View className="w-px bg-border" />
              <MoneyStat label="Chờ duyệt" value={formatMoney(e.locked_amount)} color="#d97706" />
              <View className="w-px bg-border" />
              <MoneyStat label="Chưa yêu cầu" value={formatMoney(e.remaining_amount)} color="#2563eb" />
            </View>

            {min > 0 ? (
              <View className="gap-1.5">
                <View className="flex-row justify-between">
                  <Text className="text-[11.5px] font-semibold text-muted">Tiến độ yêu cầu thanh toán</Text>
                  <Text className="text-[11.5px] font-bold text-foreground">{e.remaining_submissions}/{min} bài</Text>
                </View>
                <View className="h-2 overflow-hidden rounded-full bg-surface-muted">
                  <View
                    className={`h-full rounded-full ${e.remaining_submissions >= min ? 'bg-success' : 'bg-info'}`}
                    style={{ width: `${Math.min(100, (e.remaining_submissions / min) * 100)}%` }}
                  />
                </View>
                <Text className="text-[12px] text-muted">
                  {e.remaining_submissions >= min
                    ? `Đủ ${min} bài — bấm để gửi yêu cầu thanh toán`
                    : `${e.remaining_submissions}/${min} bài · cần thêm ${min - e.remaining_submissions} bài để yêu cầu thanh toán`}
                  {paid.data?.total_batches_paid ? ` · ${paid.data.total_batches_paid} đợt đã trả` : ''}
                </Text>
              </View>
            ) : null}
          </Pressable>
        ) : null}

        <SectionHeading title="Hiệu suất nhận xét" subtitle={`Số liệu trong ${MODE_LABEL[mode]}`} />
        <Segmented<StatsMode>
          items={[
            { value: 'day', label: 'Hôm nay' },
            { value: 'week', label: 'Tuần' },
            { value: 'month', label: 'Tháng' },
            { value: 'year', label: 'Năm' },
          ]}
          value={mode}
          onChange={setMode}
        />

        {stats.isLoading ? (
          <ActivityIndicator className="py-10" color={brand} />
        ) : stats.isError || !s ? (
          <StateView icon="cloud-offline-outline" title="Không tải được thống kê" description={getErrorMessage(stats.error)} actionLabel="Thử lại" onAction={() => stats.refetch()} />
        ) : (
          <>
            <View className="flex-row flex-wrap justify-between gap-y-2">
              <Tile icon3d={GRADING_STATS_3D_ICONS.approved} color={COLORS.graded} value={s.totalGraded} label="Đã được duyệt" onPress={() => s.totalGraded && setDetail('graded')} />
              <Tile icon3d={GRADING_STATS_3D_ICONS.waiting} color={COLORS.waitingReview} value={s.totalWaitingReview} label="Chờ duyệt" />
              <Tile icon3d={GRADING_STATS_3D_ICONS.overdue} color="#e11d48" value={s.totalLateGraded} label="Nhận xét trễ hạn" onPress={() => s.totalLateGraded && setDetail('lateGraded')} />
              <Tile icon3d={GRADING_STATS_3D_ICONS.regrade} color={COLORS.regrade} value={s.totalRegrade} label="Bị nhận xét lại" onPress={() => s.totalRegrade && setDetail('regrade')} />
              <Tile icon3d={GRADING_STATS_3D_ICONS.timeout} color={COLORS.timeout} value={s.totalTimeout} label="Hết giờ / bỏ dở" wide onPress={() => s.totalTimeout && setDetail('timeout')} />
            </View>

            <View className="gap-3 rounded-3xl border border-border bg-surface p-4">
              <View className="flex-row items-center gap-2">
                <View className="h-8 w-8 items-center justify-center rounded-xl bg-brand-soft">
                  <Ionicons name="analytics" size={17} color={brand} />
                </View>
                <View className="flex-1">
                  <Text className="text-[15px] font-extrabold text-foreground">Xu hướng hoạt động</Text>
                  <Text className="text-[11.5px] text-muted">So sánh trạng thái trong {MODE_LABEL[mode]}</Text>
                </View>
              </View>
              {empty ? (
                <Text className="py-8 text-center text-[13px] text-muted">Dữ liệu sẽ xuất hiện khi có hoạt động nhận xét.</Text>
              ) : (
                <AreaChart
                  labels={ts.map((d) => d.label)}
                  series={[
                    { key: 'graded', label: 'Đã duyệt', color: COLORS.graded, values: ts.map((d) => d.graded) },
                    { key: 'waitingReview', label: 'Chờ duyệt', color: COLORS.waitingReview, values: ts.map((d) => d.waitingReview) },
                    { key: 'regrade', label: 'Nhận xét lại', color: COLORS.regrade, values: ts.map((d) => d.regrade) },
                    { key: 'timeout', label: 'Hết giờ', color: COLORS.timeout, values: ts.map((d) => d.timeout) },
                  ]}
                />
              )}
            </View>
          </>
        )}

        {history.data?.length ? (
          <View className="rounded-3xl border border-border bg-surface px-4 py-2">
            <View className="flex-row items-center gap-2 py-2">
              <Image source={GRADING_STATS_3D_ICONS.level} style={{ width: 34, height: 34 }} contentFit="contain" accessible={false} />
              <View>
                <Text className="text-[15px] font-extrabold text-foreground">XP gần đây</Text>
                <Text className="text-[11.5px] text-muted">Lịch sử thay đổi kinh nghiệm</Text>
              </View>
            </View>
            {history.data.map((h) => (
              <View key={h._id} className="flex-row items-center gap-3 border-t border-border py-2.5">
                <Image
                  source={XP_ICONS[h.event_type] ?? GRADING_STATS_3D_ICONS.level}
                  style={{ width: 32, height: 32 }}
                  contentFit="contain"
                  accessible={false}
                />
                <View className="flex-1">
                  <Text className="text-[13.5px] font-semibold text-foreground">{XP_EVENT[h.event_type] ?? h.event_type}</Text>
                  <Text className="text-[11.5px] text-muted" numberOfLines={1}>
                    {formatDateTime(h.created_at)}
                    {h.note ? ` · ${h.note}` : ''}
                  </Text>
                </View>
                <Text className={`text-[15px] font-extrabold ${h.xp_change >= 0 ? 'text-success' : 'text-danger'}`}>
                  {h.xp_change >= 0 ? '+' : ''}
                  {h.xp_change}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
      <DetailSheet mode={mode} type={detail} onClose={() => setDetail(null)} />
    </View>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 rounded-2xl bg-white/10 px-3 py-2.5">
      <Text className="text-[10.5px] font-semibold uppercase tracking-wide text-white/65">{label}</Text>
      <Text className="mt-0.5 text-[14px] font-extrabold text-white" numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

function MoneyStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View className="min-w-0 flex-1 items-center px-1.5">
      <Text className="text-[12px] font-extrabold" style={{ color }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text className="mt-0.5 text-[10.5px] text-muted" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View className="gap-0.5 px-0.5">
      <Text className="text-[17px] font-extrabold text-foreground">{title}</Text>
      <Text className="text-[12px] text-muted">{subtitle}</Text>
    </View>
  );
}

function Tile({
  icon3d,
  color,
  value,
  label,
  wide,
  onPress,
}: {
  icon3d: number;
  color: string;
  value: number;
  label: string;
  wide?: boolean;
  onPress?: () => void;
}) {
  if (wide) {
    return (
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        className="w-full flex-row items-center gap-3 rounded-3xl border border-border bg-surface p-4 active:opacity-85">
        <Image source={icon3d} style={{ width: 48, height: 48 }} contentFit="contain" accessible={false} />
        <View className="min-w-0 flex-1">
          <Text className="text-[12px] text-muted">{label}</Text>
          <Text className="text-[25px] font-extrabold" style={{ color }}>
            {value.toLocaleString('vi-VN')}
          </Text>
        </View>
        {onPress && value ? (
          <View className="h-8 w-8 items-center justify-center rounded-full bg-surface-muted">
            <Ionicons name="chevron-forward" size={15} color="#9ca3af" />
          </View>
        ) : null}
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      className="w-[48.8%] gap-1.5 rounded-3xl border border-border bg-surface p-3.5 active:opacity-85">
      {/* 2 dòng: icon + số cùng hàng, nhãn bên dưới */}
      <View className="flex-row items-center gap-2.5">
        <Image source={icon3d} style={{ width: 38, height: 38 }} contentFit="contain" accessible={false} />
        <Text className="flex-1 text-[24px] font-extrabold" style={{ color }} numberOfLines={1} adjustsFontSizeToFit>
          {value.toLocaleString('vi-VN')}
        </Text>
        {onPress && value ? <Ionicons name="chevron-forward" size={15} color="#9ca3af" /> : null}
      </View>
      <Text className="text-[12px] text-muted" numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function DetailSheet({ mode, type, onClose }: { mode: StatsMode; type: StatsDetailType | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const brand = useThemeColor('brand');
  const q = useGradingStatsDetail(mode, type);
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const total = q.data?.pages[0]?.pagination?.total ?? 0;
  if (!type) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View className="flex-1 justify-end bg-black/45">
        <Pressable className="absolute inset-0" onPress={onClose} />
        <View className="h-[80%] rounded-t-3xl bg-surface pt-3" style={{ paddingBottom: insets.bottom + 8 }}>
          <View className="h-1 w-10 self-center rounded-full bg-border" />
          <View className="px-5 pb-2 pt-3">
            <Text className="text-[18px] font-extrabold text-foreground">{DETAIL_TITLE[type]}</Text>
            <Text className="text-[12.5px] text-muted">
              Trong {MODE_LABEL[mode]} · {total} bài
            </Text>
          </View>
          <FlatList
            data={items}
            keyExtractor={(i) => i._id}
            contentContainerClassName="px-5"
            onEndReachedThreshold={0.4}
            onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && void q.fetchNextPage()}
            ListEmptyComponent={q.isLoading ? <ActivityIndicator className="py-8" color={brand} /> : <Text className="py-8 text-center text-muted">Không có bài nào</Text>}
            ListFooterComponent={q.isFetchingNextPage ? <ActivityIndicator className="py-3" color={brand} /> : null}
            renderItem={({ item, index }) => (
              <Pressable
                onPress={() => {
                  onClose();
                  router.push({ pathname: '/result/[id]', params: { id: item._id, staff: '1' } });
                }}
                className={`gap-0.5 py-3 active:opacity-70 ${index ? 'border-t border-border' : ''}`}>
                <Text className="text-[14px] font-semibold text-foreground" numberOfLines={2}>
                  {item.assignment_title}
                </Text>
                <Text className="text-[12.5px] text-muted">
                  {item.student_name} · {formatDate(item.graded_at)}
                </Text>
                {item.reason ? <Text className="text-[12.5px] text-warning">Lý do: {item.reason}</Text> : null}
                {item.payment_status ? (
                  <Text className={`text-[12px] font-semibold ${item.payment_status === 'Đã thanh toán' ? 'text-success' : item.payment_status === 'Đang yêu cầu' ? 'text-warning' : 'text-muted'}`}>
                    {item.payment_status}
                  </Text>
                ) : null}
              </Pressable>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}
