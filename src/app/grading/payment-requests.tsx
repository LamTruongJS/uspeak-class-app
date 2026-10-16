import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useMemo, useState, type ComponentProps } from 'react';
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showToast } from '@/components/ui/toast';
import { Badge } from '@/components/ui/badge';
import { Segmented } from '@/components/ui/segmented';
import { LoadingView, StateView } from '@/components/ui/state-view';
import { EditProfileSheet } from '@/features/auth/edit-profile-sheet';
import { PaymentInfoSheet } from '@/features/auth/payment-info-sheet';
import { findBank } from '@/features/auth/vietqr-banks';
import {
  formatMoney,
  PAYMENT_STATUS_VIEW,
  SUBMISSION_PAYMENT_VIEW,
  useMyEarnings,
  useMyGradedSubmissions,
  useMyPaymentRequests,
  usePaymentThreshold,
  useSubmitPaymentRequest,
  type GradedSubmissionPayment,
  type PaymentRequestItem,
  type SubmissionPaymentStatus,
} from '@/features/payment/api';
import { getErrorMessage } from '@/lib/api/client';
import { formatDate, formatDateTime } from '@/lib/format';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useAuthStore } from '@/stores/auth.store';
import { useThemeColor } from '@/theme/use-theme-color';
import { menuScreenOptions } from '@/features/navigation/app-menu';

type IconName = ComponentProps<typeof Ionicons>['name'];
type Tab = 'requests' | 'submissions';
type SubFilter = 'all' | SubmissionPaymentStatus;
type Row = { kind: 'request'; item: PaymentRequestItem } | { kind: 'submission'; item: GradedSubmissionPayment };

/**
 * Yêu cầu thanh toán tiền nhận xét bài — bản mobile của web /payment-requests.
 *
 * - Thẻ đầu: số tiền chưa yêu cầu + tiến độ tới NGƯỠNG tối thiểu (payment_threshold) + nút gửi.
 * - Hồ sơ nhận tiền (liên lạc / ngân hàng / CCCD): thiếu gì bổ sung NGAY trong app (PaymentInfoSheet,
 *   EditProfileSheet) — class-be từ chối tạo yêu cầu khi thiếu.
 * - 2 tab: yêu cầu đã gửi · từng bài đã chấm kèm trạng thái thanh toán (lọc theo trạng thái).
 * Luật tiền nong ở class-be (`getMyEarningsSummary`, `submitPaymentRequest`), app chỉ hiển thị lại.
 */
export default function PaymentRequestsScreen() {
  const brand = useThemeColor('brand');
  const user = useAuthStore((s) => s.user);
  const earnings = useMyEarnings();
  const requests = useMyPaymentRequests();
  const threshold = usePaymentThreshold();
  const [tab, setTab] = useState<Tab>('requests');
  const [filter, setFilter] = useState<SubFilter>('all');
  const submissions = useMyGradedSubmissions(tab === 'submissions');
  const [sheet, setSheet] = useState<'request' | 'payment' | 'profile' | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const pull = usePullRefresh(() =>
    Promise.all([earnings.refetch(), requests.refetch(), threshold.refetch(), tab === 'submissions' ? submissions.refetch() : null]),
  );

  const data = earnings.data;
  const min = threshold.data ?? 0;
  const hasPending = requests.data?.has_pending ?? false;
  const pi = user?.payment_info;
  const checks = [
    { key: 'contact', label: 'Liên lạc', ok: !!(user?.email && user?.phone), hint: user?.phone || 'Thiếu số điện thoại' },
    {
      key: 'bank',
      label: 'Tài khoản ngân hàng',
      ok: !!(pi?.bank_name && pi?.bank_account_number && pi?.bank_account_name),
      hint: pi?.bank_account_number
        ? `${findBank(pi.bank_code)?.shortName ?? pi.bank_name ?? ''} ••••${pi.bank_account_number.slice(-4)}`
        : 'Chưa có',
    },
    {
      key: 'cccd',
      label: 'CCCD',
      ok: !!(pi?.cccd_number && pi?.cccd_issued_date && pi?.cccd_issued_place),
      hint: pi?.cccd_number ? `••••${pi.cccd_number.slice(-4)}` : 'Chưa có',
    },
  ];
  const profileOk = checks.every((c) => c.ok);

  const blocker = !data
    ? null
    : hasPending
      ? 'Bạn đang có 1 yêu cầu chờ duyệt — gửi tiếp sau khi Uspeak xử lý xong.'
      : !profileOk
        ? 'Bổ sung hồ sơ nhận tiền bên dưới trước khi gửi.'
        : data.remaining_submissions === 0
          ? 'Chưa có bài nào chưa được tính tiền.'
          : min > 0 && data.remaining_submissions < min
            ? `Cần tối thiểu ${min} bài chưa thanh toán (còn thiếu ${min - data.remaining_submissions} bài).`
            : null;

  const subList = useMemo(() => submissions.data?.data ?? [], [submissions.data]);
  const rows: Row[] = useMemo(
    () =>
      tab === 'requests'
        ? (requests.data?.data ?? []).map((item) => ({ kind: 'request' as const, item }))
        : subList
            .filter((s) => filter === 'all' || s.payment_request_status === filter)
            .map((item) => ({ kind: 'submission' as const, item })),
    [tab, requests.data, subList, filter],
  );

  if (earnings.isLoading) return <Frame><LoadingView /></Frame>;
  if (earnings.isError || !data) {
    return (
      <Frame>
        <StateView
          icon="cloud-offline-outline"
          title="Không tải được thu nhập"
          description={getErrorMessage(earnings.error)}
          actionLabel="Thử lại"
          onAction={() => earnings.refetch()}
        />
      </Frame>
    );
  }

  const progress = min > 0 ? Math.min(1, data.remaining_submissions / min) : 1;
  const summary = submissions.data?.summary;

  const header = (
    <View className="gap-4 pb-3">
      {/* ── Có thể yêu cầu ── */}
      <View className="gap-3 overflow-hidden rounded-3xl bg-brand p-5">
        <View className="absolute -right-10 -top-12 h-44 w-44 rounded-full bg-white/10" />
        <View className="gap-0.5">
          <Text className="text-[13px] font-semibold text-white/80">Có thể yêu cầu thanh toán</Text>
          <Text className="font-extrabold text-white" style={{ fontSize: 32, lineHeight: 40 }}>
            {formatMoney(data.remaining_amount)}
          </Text>
          <Text className="text-[13px] text-white/85">
            {data.remaining_submissions} bài chưa yêu cầu · {formatMoney(data.current_rate)}/bài
          </Text>
        </View>
        {min > 0 ? (
          <View className="gap-1.5">
            <View className="h-2 overflow-hidden rounded-full bg-white/25">
              <View className="h-full rounded-full bg-white" style={{ width: `${Math.max(3, progress * 100)}%` }} />
            </View>
            <Text className="text-[12px] text-white/85">
              {progress >= 1 ? `Đã đủ ngưỡng tối thiểu ${min} bài` : `${data.remaining_submissions}/${min} bài · tối thiểu ${min} bài mới được gửi`}
            </Text>
          </View>
        ) : null}
        <Pressable
          onPress={() => setSheet('request')}
          disabled={!!blocker}
          className={`h-12 flex-row items-center justify-center gap-2 rounded-2xl ${blocker ? 'bg-white/20' : 'bg-white active:opacity-85'}`}>
          <Ionicons name={blocker ? 'lock-closed' : 'send'} size={17} color={blocker ? '#ffffffb3' : brand} />
          <Text className={`text-[15px] font-bold ${blocker ? 'text-white/75' : 'text-brand'}`}>Gửi yêu cầu thanh toán</Text>
        </Pressable>
        {blocker ? <Text className="text-center text-[12.5px] text-white/85">{blocker}</Text> : null}
      </View>

      {/* ── Số liệu ── */}
      <View className="flex-row gap-2">
        <Tile icon="checkmark-circle" color="#059669" label="Đã nhận" value={formatMoney(data.paid_amount)} sub={`${data.paid_submissions} bài`} />
        <Tile icon="hourglass" color="#d97706" label="Chờ duyệt" value={formatMoney(data.locked_amount)} sub={`${data.locked_submissions} bài`} />
        <Tile icon="trending-up" color="#2563eb" label="Tổng thu nhập" value={formatMoney(data.total_earnings)} sub={`${data.total_completed} bài`} />
      </View>

      {/* ── Hồ sơ nhận tiền ── */}
      <View className="overflow-hidden rounded-3xl bg-surface">
        <View className="flex-row items-center gap-2 px-4 pb-1 pt-3.5">
          <Text className="flex-1 text-[15px] font-bold text-foreground">Hồ sơ nhận tiền</Text>
          <Badge label={profileOk ? 'Đầy đủ' : 'Còn thiếu'} tone={profileOk ? 'success' : 'warning'} />
        </View>
        {checks.map((c) => (
          <Pressable
            key={c.key}
            onPress={() => setSheet(c.key === 'contact' ? 'profile' : 'payment')}
            className="flex-row items-center gap-3 px-4 py-3 active:bg-surface-muted">
            <Ionicons name={c.ok ? 'checkmark-circle' : 'alert-circle'} size={20} color={c.ok ? '#059669' : '#d97706'} />
            <View className="flex-1">
              <Text className="text-[14.5px] font-semibold text-foreground">{c.label}</Text>
              <Text className={`text-[12.5px] ${c.ok ? 'text-muted' : 'text-warning'}`} numberOfLines={1}>
                {c.hint}
              </Text>
            </View>
            <Text className="text-[13px] font-semibold text-brand">{c.ok ? 'Sửa' : 'Bổ sung'}</Text>
          </Pressable>
        ))}
      </View>

      {/* ── Quy định ── */}
      <Pressable onPress={() => setRulesOpen((v) => !v)} className="gap-2 rounded-3xl bg-surface px-4 py-3.5 active:opacity-90">
        <View className="flex-row items-center gap-2">
          <Ionicons name="information-circle" size={18} color="#2563eb" />
          <Text className="flex-1 text-[14.5px] font-semibold text-foreground">Quy định yêu cầu thanh toán</Text>
          <Ionicons name={rulesOpen ? 'chevron-up' : 'chevron-down'} size={16} color="#9ca3af" />
        </View>
        {rulesOpen
          ? [
              'Chỉ tính bài đã nhận xét xong và được Reviewer duyệt.',
              `Cần tối thiểu ${min || '—'} bài chưa thanh toán mới gửi được. Gửi xong số bài được chốt và đếm lại từ đầu.`,
              'Mỗi lần chỉ có 1 yêu cầu chờ duyệt; yêu cầu sau gửi được khi yêu cầu trước đã duyệt hoặc từ chối.',
              'Hồ sơ phải đủ: họ tên, email, SĐT, ngân hàng, số tài khoản, chủ tài khoản, CCCD (số, ngày cấp, nơi cấp).',
            ].map((t) => (
              <View key={t} className="flex-row gap-2 pl-1">
                <Text className="text-[13.5px] text-muted">•</Text>
                <Text className="flex-1 text-[13.5px] leading-5 text-muted">{t}</Text>
              </View>
            ))
          : null}
      </Pressable>

      <Segmented<Tab>
        items={[
          { value: 'requests', label: 'Yêu cầu đã gửi', count: requests.data?.pagination?.total ?? 0 },
          { value: 'submissions', label: 'Bài đã chấm', count: summary?.total_graded ?? data.total_completed },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'submissions' && summary ? (
        <Segmented<SubFilter>
          variant="chip"
          items={[
            { value: 'all', label: 'Tất cả', count: summary.total_graded },
            { value: 'unrequested', label: 'Chưa yêu cầu', count: summary.unrequested_total },
            { value: 'requested', label: 'Đang yêu cầu', count: summary.in_request_total },
            { value: 'paid', label: 'Đã thanh toán', count: summary.paid_total },
          ]}
          value={filter}
          onChange={setFilter}
        />
      ) : null}
    </View>
  );

  const listLoading = tab === 'requests' ? requests.isLoading : submissions.isLoading;

  return (
    <Frame>
      <FlatList
        data={rows}
        keyExtractor={(r) => `${r.kind}-${r.item._id}`}
        ListHeaderComponent={header}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        ItemSeparatorComponent={() => <View className="h-2.5" />}
        refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}
        ListEmptyComponent={
          listLoading ? (
            <View className="py-10">
              <LoadingView />
            </View>
          ) : (
            <View className="items-center gap-1 py-10">
              <Ionicons name={tab === 'requests' ? 'receipt-outline' : 'documents-outline'} size={34} color="#9ca3af" />
              <Text className="text-[14px] text-muted">{tab === 'requests' ? 'Chưa gửi yêu cầu nào' : 'Chưa có bài nào ở mục này'}</Text>
            </View>
          )
        }
        renderItem={({ item: r }) => (r.kind === 'request' ? <RequestCard item={r.item} /> : <SubmissionRow item={r.item} />)}
      />

      <RequestSheet
        open={sheet === 'request'}
        count={data.remaining_submissions}
        rate={data.current_rate}
        amount={data.remaining_amount}
        onClose={() => setSheet(null)}
      />
      <PaymentInfoSheet visible={sheet === 'payment'} onClose={() => setSheet(null)} />
      <EditProfileSheet visible={sheet === 'profile'} onClose={() => setSheet(null)} />
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: 'Yêu cầu thanh toán', ...menuScreenOptions }} />
      {children}
    </View>
  );
}

function Tile({ icon, color, label, value, sub }: { icon: IconName; color: string; label: string; value: string; sub: string }) {
  return (
    <View className="flex-1 gap-1 rounded-2xl bg-surface p-3">
      <Ionicons name={icon} size={17} color={color} />
      <Text className="text-[14.5px] font-extrabold text-foreground" numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text className="text-[12px] font-semibold text-foreground" numberOfLines={1}>
        {label}
      </Text>
      <Text className="text-[11.5px] text-muted">{sub}</Text>
    </View>
  );
}

function RequestCard({ item }: { item: PaymentRequestItem }) {
  const view = PAYMENT_STATUS_VIEW[item.status] ?? PAYMENT_STATUS_VIEW.pending;
  return (
    <View className="gap-2 rounded-3xl bg-surface p-4">
      <View className="flex-row items-center justify-between">
        <Badge label={view.label} tone={view.tone} dot />
        <Text className="text-[12px] text-muted">{formatDateTime(item.createdAt)}</Text>
      </View>
      <View className="flex-row items-end justify-between">
        <Text className="text-[22px] font-extrabold text-foreground">{formatMoney(item.total_payment)}</Text>
        <Text className="pb-1 text-[13px] text-muted">
          {item.requested_submissions} bài × {formatMoney(item.rate_per_assignment)}
        </Text>
      </View>
      {item.reason ? (
        <Text className="text-[13.5px] leading-5 text-foreground">
          <Text className="text-muted">Ghi chú: </Text>
          {item.reason}
        </Text>
      ) : null}
      {item.rejection_reason ? (
        <View className="flex-row gap-2 rounded-2xl bg-danger-soft p-3">
          <Ionicons name="alert-circle" size={16} color="#dc2626" style={{ marginTop: 1 }} />
          <Text className="flex-1 text-[13px] leading-5 text-danger">Phản hồi từ Uspeak: {item.rejection_reason}</Text>
        </View>
      ) : null}
    </View>
  );
}

function SubmissionRow({ item }: { item: GradedSubmissionPayment }) {
  const view = SUBMISSION_PAYMENT_VIEW[item.payment_request_status] ?? SUBMISSION_PAYMENT_VIEW.unrequested;
  const a = item.assignment;
  return (
    <View className="flex-row items-center gap-3 rounded-2xl bg-surface p-3.5">
      <View className="flex-1 gap-0.5">
        <Text className="text-[14.5px] font-semibold text-foreground" numberOfLines={1}>
          {a?.title || 'Bài tập'}
        </Text>
        <Text className="text-[12.5px] text-muted" numberOfLines={1}>
          {[a?.class?.class_code, item.student?.name].filter(Boolean).join(' · ')}
        </Text>
        <Text className="text-[11.5px] text-muted">Chấm {formatDate(item.graded_at)}</Text>
      </View>
      <View className="items-end gap-1">
        <Text className="text-[14px] font-bold text-success">{formatMoney(item.rate_at_grading)}</Text>
        <Badge label={view.label} tone={view.tone} />
      </View>
    </View>
  );
}

/** Xác nhận gửi: tóm tắt số bài × đơn giá + ghi chú (bắt buộc, giống web). */
function RequestSheet({ open, count, rate, amount, onClose }: { open: boolean; count: number; rate: number; amount: number; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const muted = useThemeColor('muted');
  const submit = useSubmitPaymentRequest();
  const [reason, setReason] = useState('');

  const send = async () => {
    if (!reason.trim()) {
      showToast('warning', 'Thiếu ghi chú', 'Nhập vài chữ cho kế toán (vd: thanh toán đợt tháng 10).');
      return;
    }
    try {
      await submit.mutateAsync(reason.trim());
      setReason('');
      onClose();
      showToast('success', 'Đã gửi yêu cầu', `Yêu cầu thanh toán ${count} bài đã được gửi, chờ Uspeak duyệt.`);
    } catch (err) {
      showToast('error', 'Gửi không thành công', getErrorMessage(err));
    }
  };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 justify-end bg-black/45">
        <Pressable className="absolute inset-0" onPress={onClose} />
        <View className="gap-4 rounded-t-3xl bg-surface px-5 pt-3" style={{ paddingBottom: insets.bottom + 16 }}>
          <View className="h-1 w-10 self-center rounded-full bg-border" />
          <Text className="text-[18px] font-extrabold text-foreground">Gửi yêu cầu thanh toán</Text>
          <View className="overflow-hidden rounded-2xl bg-surface-muted">
            {[
              ['Số bài', `${count} bài`],
              ['Đơn giá hiện tại', `${formatMoney(rate)}/bài`],
              ['Tạm tính', formatMoney(amount)],
            ].map(([k, v], i) => (
              <View key={k} className={`flex-row items-center justify-between px-4 py-3 ${i ? 'border-t border-border' : ''}`}>
                <Text className="text-[14px] text-muted">{k}</Text>
                <Text className={`text-[15px] font-bold ${i === 2 ? 'text-brand' : 'text-foreground'}`}>{v}</Text>
              </View>
            ))}
          </View>
          <Text className="text-[12px] leading-4 text-muted">
            Số tiền chính xác tính theo đơn giá chốt ở từng bài lúc chấm — kế toán xác nhận khi duyệt.
          </Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="Ghi chú cho kế toán (bắt buộc)"
            placeholderTextColor={muted}
            multiline
            textAlignVertical="top"
            className="min-h-[84px] rounded-2xl border border-border bg-background p-3.5 text-[15px] text-foreground"
          />
          <Pressable
            onPress={send}
            disabled={submit.isPending}
            className="h-12 flex-row items-center justify-center gap-2 rounded-2xl bg-brand active:opacity-85">
            <Ionicons name="send" size={17} color="#fff" />
            <Text className="text-[15px] font-bold text-white">{submit.isPending ? 'Đang gửi…' : `Gửi yêu cầu ${count} bài`}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
