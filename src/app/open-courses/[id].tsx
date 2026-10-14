import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState, type ComponentProps } from 'react';
import { Linking, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/avatar';
import { LoadingView, StateView } from '@/components/ui/state-view';
import { SUPPORT_HOTLINE, SUPPORT_HOTLINE_TEL } from '@/constants/support';
import { scheduleParts } from '@/features/classes/next-session';
import { COURSE_TYPE_LABEL, daysUntil, discountLabel, pricing, sessionsText, useOpenCourses } from '@/features/open-courses/api';
import { CourseCover, priceText, seatsLeft } from '@/features/open-courses/course-card';
import { formatDate, formatVnd } from '@/lib/format';
import { resolveMediaUrl, useMediaToken } from '@/lib/media';
import { useThemeColor } from '@/theme/use-theme-color';

type IconName = ComponentProps<typeof Ionicons>['name'];

/**
 * Chi tiết 1 lớp đang mở đăng ký (web chưa có trang này — /open-courses/[id] của web mới là trang tạm).
 * Dữ liệu lấy từ danh sách đã tải (GET /classes/open-registration), không có API chi tiết riêng.
 *
 * ĐĂNG KÝ: app KHÔNG thu tiền (chính sách App Store / Google Play — xem docs/HANDOFF.md). Nút "Đăng ký" mở bảng
 * liên hệ tư vấn (gọi hotline); tư vấn viên chốt chỗ + hướng dẫn học phí ngoài app.
 */
export default function OpenCourseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const brand = useThemeColor('brand');
  const { data: token } = useMediaToken();
  const query = useOpenCourses();
  const c = query.data?.find((x) => x._id === id);
  const [sheet, setSheet] = useState(false);

  if (query.isLoading)
    return (
      <Frame>
        <LoadingView />
      </Frame>
    );
  if (!c) {
    return (
      <Frame>
        <StateView
          icon="school-outline"
          title="Lớp không còn mở đăng ký"
          description="Lớp này đã đóng đăng ký hoặc không còn hiển thị."
          actionLabel="Xem lớp khác"
          onAction={() => router.back()}
        />
      </Frame>
    );
  }

  const p = pricing(c);
  const off = discountLabel(c);
  const days = daysUntil(c.start_date);
  const seats = seatsLeft(c);
  const sch = scheduleParts(c.class_time);
  const full = seats === 0;

  const facts: { icon: IconName; label: string; value: string }[] = [
    {
      icon: 'rocket-outline',
      label: 'Khai giảng',
      value: `${formatDate(c.start_date)}${days === null ? (c.start_date ? ' · đã khai giảng' : '') : days === 0 ? ' · hôm nay' : ` · còn ${days} ngày`}`,
    },
    { icon: 'time-outline', label: 'Lịch học', value: sch ? `${sch.days.join(' · ')}, ${sch.time}` : c.class_time || 'Đang cập nhật' },
    ...(c.course_type === 'elearning'
      ? [{ icon: 'albums-outline' as const, label: 'Thời hạn', value: '1 năm' }]
      : sessionsText(c)
        ? [{ icon: 'albums-outline' as const, label: 'Số buổi', value: sessionsText(c)! }]
        : []),
    {
      icon: c.course_type === 'elearning' ? 'play-circle-outline' : 'videocam-outline',
      label: 'Hình thức',
      value: COURSE_TYPE_LABEL[c.course_type] ?? c.course_type,
    },
    ...(seats !== null
      ? [
          {
            icon: 'people-outline' as const,
            label: 'Sĩ số',
            value: full ? `Đã đủ ${c.max_students} học viên` : `${c.active_students}/${c.max_students} · còn ${seats} chỗ`,
          },
        ]
      : []),
    ...(c.end_date ? [{ icon: 'flag-outline' as const, label: 'Kết thúc dự kiến', value: formatDate(c.end_date) }] : []),
  ];

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: c.class_code }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}>
        <CourseCover c={c} height={210} token={token?.media_token} codeAt="top">
          <View className="absolute bottom-0 left-0 right-0 gap-1 px-5 pb-4">
            <View className="flex-row flex-wrap gap-1.5">
              {off && p.hasPromo ? (
                <View className="flex-row items-center gap-1 rounded-full bg-brand px-2.5 py-1">
                  <Ionicons name="flame" size={11} color="#fff" />
                  <Text className="text-[11.5px] font-extrabold text-white">Ưu đãi {off}</Text>
                </View>
              ) : null}
              <View className="rounded-full bg-success px-2.5 py-1">
                <Text className="text-[11.5px] font-bold text-white">Đang mở đăng ký</Text>
              </View>
            </View>
            <Text className="text-[13px] font-bold uppercase tracking-wide text-white/85">
              {c.course?.course_name || 'Khoá học Uspeak'}
            </Text>
            <Text className="text-[22px] font-extrabold leading-7 text-white" numberOfLines={2}>
              {c.display_name || c.class_name}
            </Text>
          </View>
        </CourseCover>

        <View className="gap-4 p-4">
          {/* Giá */}
          <View className="gap-2 rounded-3xl bg-surface p-4">
            <Text className="text-[12.5px] font-semibold text-muted">Học phí</Text>
            <View className="flex-row items-end gap-2.5">
              <Text className="text-[26px] font-extrabold text-brand">{priceText(p.finalPrice)}</Text>
              {p.hasPromo ? <Text className="pb-1 text-[14px] text-muted line-through">{priceText(c.price)}</Text> : null}
            </View>
            {p.hasPromo && c.promotion ? (
              <View className="flex-row items-center gap-2 rounded-2xl bg-brand-soft px-3 py-2.5">
                <Ionicons name="pricetag" size={16} color={brand} />
                <View className="flex-1">
                  <Text className="text-[13.5px] font-bold text-brand" numberOfLines={2}>
                    {c.promotion.promotion_name}
                  </Text>
                  <Text className="text-[12px] text-brand">
                    Tiết kiệm {formatVnd(p.saved)} · mã {c.promotion.promotion_code}
                  </Text>
                </View>
              </View>
            ) : null}
          </View>

          {/* Thông tin lớp */}
          <View className="rounded-3xl bg-surface px-4 py-1.5">
            {facts.map((f, i) => (
              <View key={f.label} className={`flex-row items-center gap-3 py-3 ${i ? 'border-t border-border' : ''}`}>
                <View className="h-9 w-9 items-center justify-center rounded-xl bg-brand-soft">
                  <Ionicons name={f.icon} size={17} color={brand} />
                </View>
                <Text className="text-[13.5px] text-muted">{f.label}</Text>
                <Text className="flex-1 text-right text-[14px] font-semibold text-foreground" numberOfLines={2}>
                  {f.value}
                </Text>
              </View>
            ))}
          </View>

          {/* Giảng viên */}
          {c.teacher?.name ? (
            <View className="flex-row items-center gap-3 rounded-3xl bg-surface p-4">
              <Avatar name={c.teacher.name} uri={resolveMediaUrl(c.teacher.avatar, token?.media_token)} size={48} />
              <View className="flex-1">
                <Text className="text-[12.5px] text-muted">Giảng viên</Text>
                <Text className="text-[16px] font-bold text-foreground">{c.teacher.name}</Text>
              </View>
            </View>
          ) : null}

          {c.url_sales_page ? (
            <Pressable
              onPress={() => void WebBrowser.openBrowserAsync(c.url_sales_page!)}
              className="flex-row items-center gap-3 rounded-3xl bg-surface p-4 active:opacity-80">
              <View className="h-9 w-9 items-center justify-center rounded-xl bg-info-soft">
                <Ionicons name="document-text-outline" size={17} color="#2563eb" />
              </View>
              <Text className="flex-1 text-[14.5px] font-semibold text-foreground">Giới thiệu chi tiết khoá học</Text>
              <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
            </Pressable>
          ) : null}
        </View>
      </ScrollView>

      {/* Thanh đăng ký */}
      <View
        className="absolute bottom-0 left-0 right-0 flex-row items-center gap-3 border-t border-border bg-surface px-4 pt-3"
        style={{ paddingBottom: insets.bottom + 12 }}>
        <View className="flex-1">
          <Text className="text-[12px] text-muted">{p.hasPromo ? 'Giá ưu đãi' : 'Học phí'}</Text>
          <Text className="text-[18px] font-extrabold text-brand">{priceText(p.finalPrice)}</Text>
        </View>
        <Pressable
          onPress={() => setSheet(true)}
          disabled={full}
          className={`h-12 flex-row items-center gap-2 rounded-2xl px-6 ${full ? 'bg-surface-muted' : 'bg-brand active:opacity-85'}`}>
          <Ionicons name={full ? 'lock-closed' : 'school'} size={18} color={full ? '#9ca3af' : '#fff'} />
          <Text className={`text-[15px] font-bold ${full ? 'text-muted' : 'text-white'}`}>{full ? 'Đã đủ chỗ' : 'Đăng ký'}</Text>
        </Pressable>
      </View>

      <RegisterSheet open={sheet} classCode={c.class_code} name={c.display_name || c.class_name} onClose={() => setSheet(false)} />
    </View>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: 'Chi tiết lớp' }} />
      {children}
    </View>
  );
}

/** Đăng ký qua tư vấn viên (không thu tiền trong app). */
function RegisterSheet({ open, classCode, name, onClose }: { open: boolean; classCode: string; name: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const success = useThemeColor('success');
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View className="flex-1 justify-end bg-black/45">
        <Pressable className="absolute inset-0" onPress={onClose} />
        <View className="gap-3.5 rounded-t-3xl bg-surface px-5 pt-3" style={{ paddingBottom: insets.bottom + 16 }}>
          <View className="h-1 w-10 self-center rounded-full bg-border" />
          <Text className="text-[18px] font-extrabold text-foreground">Đăng ký lớp {classCode}</Text>
          <Text className="text-[14px] leading-5 text-muted">
            Gọi tư vấn viên Uspeak để giữ chỗ lớp <Text className="font-semibold text-foreground">{name}</Text>. Bạn sẽ được xác nhận lịch
            học, ưu đãi đang áp dụng và hướng dẫn hoàn tất học phí.
          </Text>
          {['Báo mã lớp ' + classCode + ' khi gọi để được xử lý nhanh', 'Sau khi hoàn tất, lớp tự hiện trong mục Lớp học của bạn'].map(
            (t) => (
              <View key={t} className="flex-row items-start gap-2">
                <Ionicons name="checkmark-circle" size={17} color={success} />
                <Text className="flex-1 text-[13.5px] text-foreground">{t}</Text>
              </View>
            ),
          )}
          <Pressable
            onPress={() => {
              onClose();
              void Linking.openURL(SUPPORT_HOTLINE_TEL);
            }}
            className="mt-1 h-12 flex-row items-center justify-center gap-2 rounded-2xl bg-brand active:opacity-85">
            <Ionicons name="call" size={18} color="#fff" />
            <Text className="text-[15px] font-bold text-white">Gọi tư vấn {SUPPORT_HOTLINE}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
