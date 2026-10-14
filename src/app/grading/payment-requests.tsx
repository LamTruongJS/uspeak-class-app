import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { KeyboardAvoider } from '@/components/ui/keyboard-avoider';
import { LoadingView, StateView } from '@/components/ui/state-view';
import { WEB_URL } from '@/config/env';
import { formatMoney, PAYMENT_STATUS_VIEW, useMyEarnings, useMyPaymentRequests, useSubmitPaymentRequest } from '@/features/payment/api';
import { getErrorMessage } from '@/lib/api/client';
import { formatDateTime } from '@/lib/format';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

/**
 * Yêu cầu thanh toán tiền nhận xét bài — bản mobile của web /payment-requests:
 * xem thu nhập, gửi yêu cầu cho số bài chưa được tính tiền, theo dõi các yêu cầu đã gửi.
 * Điền CCCD / tài khoản ngân hàng vẫn làm trên web (giấy tờ cá nhân, nhập 1 lần).
 */
export default function PaymentRequestsScreen() {
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');
  const [reason, setReason] = useState('');

  const earnings = useMyEarnings();
  const requests = useMyPaymentRequests();
  const submit = useSubmitPaymentRequest();
  const pull = usePullRefresh(() => Promise.all([earnings.refetch(), requests.refetch()]));

  const data = earnings.data;
  const hasPending = requests.data?.has_pending ?? false;
  const canRequest = !!data && data.remaining_submissions > 0 && data.is_payment_info_filled && !hasPending;

  async function send() {
    if (!data) return;
    try {
      await submit.mutateAsync(reason.trim());
      setReason('');
      Alert.alert('Đã gửi yêu cầu', `Yêu cầu thanh toán ${data.remaining_submissions} bài đã được gửi, chờ Uspeak duyệt.`);
    } catch (err) {
      Alert.alert('Gửi không thành công', getErrorMessage(err));
    }
  }

  return (
    <KeyboardAvoider>
      <Stack.Screen options={{ title: 'Yêu cầu thanh toán' }} />
      <View className="flex-1 bg-background">
        {earnings.isLoading ? (
          <LoadingView />
        ) : earnings.isError || !data ? (
          <StateView
            icon="cloud-offline-outline"
            title="Không tải được thu nhập"
            description={getErrorMessage(earnings.error)}
            actionLabel="Thử lại"
            onAction={() => earnings.refetch()}
          />
        ) : (
          <ScrollView
            contentContainerClassName="gap-4 p-4 pb-10"
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}>
            {/* ── Tổng quan thu nhập ── */}
            <View className="gap-1 rounded-2xl bg-brand p-4">
              <Text className="text-[13px] text-white/80">Tổng thu nhập từ nhận xét bài</Text>
              <Text className="text-[28px] font-extrabold text-white">{formatMoney(data.total_earnings)}</Text>
              <Text className="text-[12px] text-white/80">
                Cấp {data.current_level} · {formatMoney(data.current_rate)}/bài · đã nhận xét {data.total_completed.toLocaleString('vi-VN')}{' '}
                bài
              </Text>
            </View>

            <View className="flex-row flex-wrap justify-between gap-y-2.5">
              <Tile
                icon="checkmark-circle"
                color="#059669"
                label="Đã thanh toán"
                value={formatMoney(data.paid_amount)}
                sub={`${data.paid_submissions} bài`}
              />
              <Tile
                icon="hourglass"
                color="#d97706"
                label="Đang chờ duyệt"
                value={formatMoney(data.locked_amount)}
                sub={`${data.locked_submissions} bài`}
              />
              <Tile
                icon="wallet"
                color="#2563eb"
                label="Chưa yêu cầu"
                value={formatMoney(data.remaining_amount)}
                sub={`${data.remaining_submissions} bài`}
              />
              <Tile
                icon="document-text"
                color="#7c3aed"
                label="Bài đã chấm"
                value={data.total_completed.toLocaleString('vi-VN')}
                sub="tổng cộng"
              />
            </View>

            {/* ── Gửi yêu cầu ── */}
            <View className="gap-3 rounded-2xl border border-border bg-surface p-4">
              <Text className="text-sm font-bold text-foreground">Gửi yêu cầu thanh toán</Text>

              {!data.is_payment_info_filled ? (
                <View className="gap-2 rounded-xl bg-warning-soft p-3">
                  <Text className="text-[13px] text-warning">
                    Chưa đủ thông tin thanh toán (CCCD, tài khoản ngân hàng). Điền trên bản web rồi quay lại gửi yêu cầu.
                  </Text>
                  <Pressable
                    onPress={() => void WebBrowser.openBrowserAsync(`${WEB_URL}/payment-requests`)}
                    className="flex-row items-center gap-1.5 self-start">
                    <Ionicons name="open-outline" size={14} color={brand} />
                    <Text className="text-[13px] font-semibold text-brand">Mở trang thanh toán trên web</Text>
                  </Pressable>
                </View>
              ) : hasPending ? (
                <Text className="text-[13px] text-muted">
                  Bạn đang có một yêu cầu chờ duyệt. Chờ Uspeak xử lý xong rồi mới gửi yêu cầu tiếp theo nhé.
                </Text>
              ) : data.remaining_submissions === 0 ? (
                <Text className="text-[13px] text-muted">Hiện chưa có bài nào chưa được tính tiền.</Text>
              ) : (
                <>
                  <TextInput
                    value={reason}
                    onChangeText={setReason}
                    placeholder="Ghi chú cho kế toán (không bắt buộc)"
                    placeholderTextColor={muted}
                    multiline
                    textAlignVertical="top"
                    className="min-h-[72px] rounded-xl border border-border bg-background p-3 text-[15px] text-foreground"
                  />
                  <Text className="text-[13px] text-muted">
                    Yêu cầu cho {data.remaining_submissions} bài · tạm tính {formatMoney(data.remaining_amount)}
                  </Text>
                </>
              )}

              <Button
                title={`Yêu cầu thanh toán${canRequest ? ` ${data.remaining_submissions} bài` : ''}`}
                icon="send"
                disabled={!canRequest}
                loading={submit.isPending}
                onPress={send}
              />
            </View>

            {/* ── Yêu cầu đã gửi ── */}
            <View className="gap-2">
              <Text className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
                Yêu cầu đã gửi · {requests.data?.pagination?.total ?? 0}
              </Text>
              {(requests.data?.data ?? []).length === 0 ? (
                <Text className="px-1 text-[13px] text-muted">Chưa có yêu cầu nào.</Text>
              ) : (
                (requests.data?.data ?? []).map((item) => {
                  const view = PAYMENT_STATUS_VIEW[item.status] ?? PAYMENT_STATUS_VIEW.pending;
                  return (
                    <View key={item._id} className="gap-1.5 rounded-2xl border border-border bg-surface p-3.5">
                      <View className="flex-row items-center justify-between">
                        <Badge label={view.label} tone={view.tone} />
                        <Text className="text-[15px] font-bold text-foreground">{formatMoney(item.total_payment)}</Text>
                      </View>
                      <Text className="text-[13px] text-muted">
                        {item.requested_submissions} bài · {formatMoney(item.rate_per_assignment)}/bài · cấp {item.level_at_request}
                      </Text>
                      {item.reason ? <Text className="text-[13px] text-foreground">Ghi chú: {item.reason}</Text> : null}
                      {item.rejection_reason ? (
                        <Text className="text-[13px] text-danger">Lý do từ chối: {item.rejection_reason}</Text>
                      ) : null}
                      <Text className="text-[11px] text-muted">Gửi {formatDateTime(item.createdAt)}</Text>
                    </View>
                  );
                })
              )}
            </View>
          </ScrollView>
        )}
      </View>
    </KeyboardAvoider>
  );
}

function Tile({
  icon,
  color,
  label,
  value,
  sub,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <View className="w-[48.8%] gap-1 rounded-2xl border border-border bg-surface p-3">
      <View className="h-8 w-8 items-center justify-center rounded-xl" style={{ backgroundColor: `${color}22` }}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <Text className="text-[15px] font-extrabold text-foreground">{value}</Text>
      <Text className="text-[11px] text-muted">
        {label} · {sub}
      </Text>
    </View>
  );
}
