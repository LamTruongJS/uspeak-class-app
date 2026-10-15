import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams, type Href } from 'expo-router';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { Animated, Linking, Pressable, RefreshControl, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useActionSheet } from '@/components/ui/action-sheet';
import { CollapsingTopBar, CoverStatusBar, useCollapsingHeader } from '@/components/ui/collapsing-header';
import { LoadingView, StateView } from '@/components/ui/state-view';
import { CLASS_CONTENT_3D_ICONS } from '@/constants/three-d-icons';
import { SUPPORT_HOTLINE, SUPPORT_HOTLINE_TEL } from '@/constants/support';
import { useChatRooms } from '@/features/chat/api';
import { useActiveClassNotifications } from '@/features/class-notifications/api';
import { useClassInfo, useStudentAttendance } from '@/features/classes/api';
import { PaymentQrSheet } from '@/features/classes/payment-qr';
import { DebtAlert, HeroCover, NextSessionCard, ProgressCard, QuickActions, TeacherRow } from '@/features/classes/student-class-hero';
import { useJoinRoom } from '@/features/classes/use-join-room';
import { flattenContentNodes, buildNodeTree, useStudentTree } from '@/features/elearning/api';
import { useMediaToken } from '@/lib/media';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useAuthStore } from '@/stores/auth.store';
import { useThemeColor } from '@/theme/use-theme-color';

/**
 * Chi tiết lớp (học viên) — dữ liệu và luật port từ uspeak-class-fe my-classes/[classId]/page.tsx.
 *
 * Bố cục: màn này là TRANG TỔNG QUAN, mỗi phần nội dung là một MÀN RIÊNG mở từ danh sách mục dọc
 * bên dưới (`class/[id]/assignments`, `attendance`, `report`, `notifications`, E-Learning dùng lại
 * `elearning/[classId]`).
 *
 * Trước đây 5 phần nằm trong 5 tab cuộn ngang: trên điện thoại thanh tab tràn khỏi màn hình, tab
 * cuối bị khuất, và mỗi lần đổi tab là mất chỗ đang đọc. Danh sách mục dọc + mở màn riêng là kiểu
 * quen thuộc trên điện thoại: thấy hết đầu mục ngay, mỗi phần có cả màn hình để thở, và nút Quay
 * lại của hệ thống trả đúng về đây.
 */
export default function ClassDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = useAuthStore((s) => s.user?._id);
  const insets = useSafeAreaInsets();
  const brand = useThemeColor('brand');
  const [qrOpen, setQrOpen] = useState(false);
  const sheet = useActionSheet();

  const classQuery = useClassInfo(id);
  const info = classQuery.data;
  const attendance = useStudentAttendance(id, userId);
  const notifications = useActiveClassNotifications(id);
  const elearning = useStudentTree(id);
  const rooms = useChatRooms();
  const { join, joiningCode } = useJoinRoom();
  const { data: mediaToken } = useMediaToken();

  const notificationItems = notifications.data?.pages.flatMap((p) => p.data) ?? [];
  const unreadNotifications = notificationItems.filter((n) => !n.is_read).length;
  const classRoom = (rooms.data ?? []).find((r) => r.class_id === id && r.type === 'class');

  // Mục E-Learning chỉ hiện khi lớp THỰC SỰ có nội dung (web dựng theo nội dung, không theo hình
  // thức lớp — lớp Zoom vẫn có thể có bài giảng).
  const elearningNodes = flattenContentNodes(buildNodeTree(elearning.data ?? []));
  const elearningDone = elearningNodes.filter((n) => n.is_completed).length;

  const pull = usePullRefresh(() =>
    Promise.all([classQuery.refetch(), attendance.refetch(), notifications.refetch(), elearning.refetch()]),
  );

  const ch = useCollapsingHeader();
  const title = info?.class_code ?? 'Chi tiết lớp';

  if (classQuery.isLoading) {
    return (
      <Shell title={title}>
        <LoadingView />
      </Shell>
    );
  }

  if (!info) {
    return (
      <Shell title={title}>
        <StateView
          icon="alert-circle-outline"
          title="Không tìm thấy lớp học"
          description="Lớp này không còn trong danh sách lớp của bạn."
          actionLabel="Thử lại"
          onAction={() => classQuery.refetch()}
        />
      </Shell>
    );
  }

  if (info.access_locked) {
    return (
      <Shell title={title}>
        <StateView
          icon="lock-closed-outline"
          title={`Bạn đã bị khoá quyền truy cập lớp ${info.class_code}`}
          description={`${info.access_lock_reason ? `Lý do: ${info.access_lock_reason}\n` : ''}Vui lòng liên hệ hotline ${SUPPORT_HOTLINE} để được hỗ trợ.`}
          actionLabel="Gọi hotline"
          onAction={() => Linking.openURL(SUPPORT_HOTLINE_TEL)}
        />
      </Shell>
    );
  }

  const isZoom = info.course_type === 'zoom';
  const done = Math.round(info.progress ?? 0) >= 100;
  const debt = Number(info.remaining_debt || 0);
  const openChat = () => classRoom && router.push({ pathname: '/chat/[roomId]', params: { roomId: classRoom._id } });
  const callHotline = () =>
    sheet.confirm({
      title: 'Gọi hỗ trợ',
      message: `Gọi hotline ${SUPPORT_HOTLINE}?`,
      label: 'Gọi ngay',
      icon: 'call-outline',
      danger: false,
      onConfirm: () => void Linking.openURL(SUPPORT_HOTLINE_TEL),
    });

  const go = (section: 'assignments' | 'attendance' | 'report' | 'notifications', params?: Record<string, string>) =>
    router.push({ pathname: `/class/[id]/${section}`, params: { id, ...params } });

  const submitted = Math.max(0, info.total_assignments - (info.pending_assignments ?? 0));
  const att = info.attendance_stats;

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: false }} />
      <CoverStatusBar collapsed={ch.collapsed} />

      <Animated.ScrollView
        onScroll={ch.onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
        refreshControl={
          <RefreshControl
            refreshing={pull.refreshing}
            onRefresh={pull.onRefresh}
            tintColor="#ffffff"
            colors={[brand]}
            progressViewOffset={ch.topBar}
          />
        }
        showsVerticalScrollIndicator={false}>
        <View onLayout={ch.onHeroLayout}>
          <HeroCover info={info} token={mediaToken?.media_token} topInset={insets.top} />
          <View className="-mt-6 gap-3.5 rounded-t-[28px] bg-background px-4 pb-4 pt-5">
            <TeacherRow info={info} token={mediaToken?.media_token} showSchedule={!isZoom || done} />
            {isZoom && !done ? (
              <NextSessionCard info={info} joining={joiningCode === info.class_code} onJoin={() => join(info.class_code)} />
            ) : null}
            <DebtAlert info={info} onPay={() => (info.qr_code ? setQrOpen(true) : callHotline())} />
            <QuickActions
              actions={[
                {
                  key: 'chat',
                  icon: 'chatbubbles',
                  label: 'Chat lớp',
                  tone: 'brand',
                  badge: classRoom?.notifications_muted ? undefined : classRoom?.unread_count || undefined,
                  disabled: !classRoom,
                  onPress: openChat,
                },
                { key: 'schedule', icon: 'calendar', label: 'Lịch học', tone: 'info', onPress: () => router.push('/schedule') },
                {
                  key: 'survey',
                  icon: 'clipboard',
                  label: 'Khảo sát',
                  tone: 'violet',
                  onPress: () =>
                    // Typed routes đang sinh nhầm '/class-surveys/index' cho route này → dùng chuỗi + ép kiểu Href
                    router.push(
                      `/class-surveys?classId=${info._id}&className=${encodeURIComponent(info.display_name || info.class_name)}` as Href,
                    ),
                },
                { key: 'support', icon: 'call', label: 'Hỗ trợ', tone: 'success', onPress: callHotline },
              ]}
            />
            <ProgressCard
              info={info}
              onOpenReport={() => go('report')}
              onOpenPending={() => go('assignments', { status: 'not_submitted' })}
            />
          </View>
        </View>

        <View className="gap-2.5 px-4">
          <Text className="pl-1 text-[12.5px] font-bold uppercase tracking-wide text-muted">Nội dung lớp học</Text>

          {elearningNodes.length ? (
            <MenuRow
              icon="play-circle"
              icon3d={CLASS_CONTENT_3D_ICONS.elearning}
              tone="brand"
              title="E-Learning"
              subtitle={`Đã học ${elearningDone}/${elearningNodes.length} mục`}
              onPress={() =>
                router.push({
                  pathname: '/elearning/[classId]',
                  params: { classId: info._id, className: info.display_name || info.class_name },
                })
              }
            />
          ) : null}

          <MenuRow
            icon="document-text"
            icon3d={CLASS_CONTENT_3D_ICONS.assignments}
            tone="info"
            title="Bài tập"
            subtitle={info.total_assignments ? `${submitted}/${info.total_assignments} bài đã nộp` : 'Chưa có bài tập nào'}
            badge={info.pending_assignments || undefined}
            onPress={() => go('assignments')}
          />

          <MenuRow
            icon="calendar"
            icon3d={CLASS_CONTENT_3D_ICONS.attendance}
            tone="success"
            title="Điểm danh"
            subtitle={att && att.total_sessions ? `Có mặt ${att.attended_sessions}/${att.total_sessions} buổi` : 'Chưa có buổi nào'}
            onPress={() => go('attendance')}
          />

          <MenuRow
            icon="bar-chart"
            icon3d={CLASS_CONTENT_3D_ICONS.report}
            tone="violet"
            title="Báo cáo học tập"
            subtitle="Điểm từng bài, chuyên cần, nhận xét"
            onPress={() => go('report')}
          />

          {notificationItems.length ? (
            <MenuRow
              icon="megaphone"
              tone="warning"
              title="Thông báo lớp"
              subtitle={`${notificationItems.length} thông báo đang hiệu lực`}
              badge={unreadNotifications || undefined}
              onPress={() => go('notifications')}
            />
          ) : null}
        </View>
      </Animated.ScrollView>

      <CollapsingTopBar
        title={info.display_name || info.class_name}
        header={ch}
        actions={
          classRoom
            ? [
                {
                  icon: 'chatbubbles-outline',
                  label: 'Chat lớp',
                  onPress: openChat,
                  badge: !!classRoom.unread_count && !classRoom.notifications_muted,
                },
              ]
            : []
        }
      />

      {sheet.sheet}
      {info.qr_code && debt > 0 ? (
        <PaymentQrSheet visible={qrOpen} onClose={() => setQrOpen(false)} qr={info.qr_code} amount={debt} />
      ) : null}
    </View>
  );
}

const TONE_BG: Record<string, string> = {
  brand: 'bg-brand-soft',
  info: 'bg-info-soft',
  success: 'bg-success-soft',
  violet: 'bg-violet-soft',
  warning: 'bg-warning-soft',
};

/** Một mục trong danh sách nội dung lớp: icon màu + tên + dòng số liệu + số việc cần làm. */
function MenuRow({
  icon,
  icon3d,
  tone,
  title,
  subtitle,
  badge,
  onPress,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  icon3d?: number;
  tone: keyof typeof TONE_BG;
  title: string;
  subtitle: string;
  badge?: number;
  onPress: () => void;
}) {
  const color = useThemeColor(tone as 'brand');
  const muted = useThemeColor('muted');
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-2xl border border-border bg-surface px-3.5 py-3 active:bg-surface-muted">
      <View className={`h-11 w-11 items-center justify-center overflow-hidden rounded-2xl ${icon3d ? '' : TONE_BG[tone]}`}>
        {icon3d ? (
          <Image source={icon3d} style={{ width: 42, height: 42 }} contentFit="contain" />
        ) : (
          <Ionicons name={icon} size={21} color={color} />
        )}
      </View>
      <View className="flex-1">
        <Text className="text-[15px] font-bold text-foreground">{title}</Text>
        <Text className="text-[12.5px] text-muted" numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {badge ? (
        <View className="min-w-[22px] items-center rounded-full bg-danger px-1.5 py-0.5">
          <Text className="text-[11px] font-bold text-white">{badge > 99 ? '99+' : badge}</Text>
        </View>
      ) : null}
      <Ionicons name="chevron-forward" size={17} color={muted} />
    </Pressable>
  );
}

/** Trạng thái tải / lỗi / bị khoá: dùng header native bình thường. */
function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title, headerShown: true }} />
      {children}
    </View>
  );
}
