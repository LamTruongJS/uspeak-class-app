import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Animated, RefreshControl, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { CollapsingTopBar, CoverStatusBar, useCollapsingHeader } from '@/components/ui/collapsing-header';
import { LoadingView, StateView } from '@/components/ui/state-view';
import { CLASS_QUICK_ACTION_3D_ICONS, STAFF_CLASS_MANAGEMENT_3D_ICONS } from '@/constants/three-d-icons';
import { useChatRooms } from '@/features/chat/api';
import { COURSE_TYPE_LABEL, STATUS_META, useStaffClassDetail, useStaffClasses } from '@/features/classes/staff-api';
import { ClassCover, QuickActions } from '@/features/classes/student-class-hero';
import { MenuRow, NextTeachCard, StatsCard } from '@/features/classes/teach-overview';
import { getErrorMessage } from '@/lib/api/client';
import { formatDate } from '@/lib/format';
import { resolveMediaUrl, useMediaToken } from '@/lib/media';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

/**
 * Chi tiết lớp dạy (giáo viên / trợ giảng / quản trị) — cùng bố cục với chi tiết lớp học viên:
 * trang TỔNG QUAN (ảnh bìa tràn, thanh trên trong suốt, buổi dạy tiếp theo, lối tắt, 3 vòng chỉ số)
 * rồi danh sách mục dọc, mỗi mục mở MỘT MÀN RIÊNG (`teach/[id]/students|assignments|attendance|notifications`).
 *
 * Bỏ thanh tab cuộn ngang vì lý do như bên học viên: trên điện thoại tab tràn khỏi màn hình và đổi
 * tab là mất chỗ đang đọc. Không còn nút "Bản web" (15/10/2026): điểm danh, thông báo, khoá/bảo lưu học
 * viên, nhân bản/xoá bài tập làm ngay trong từng màn.
 */
export default function TeachClassScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const brand = useThemeColor('brand');
  const { data: token } = useMediaToken();

  const classes = useStaffClasses();
  const cls = classes.data?.find((c) => c._id === id);
  const detail = useStaffClassDetail(id);
  const rooms = useChatRooms();

  const stats = detail.data?.stats;
  const classRoom = (rooms.data ?? []).find((r) => r.class_id === id && r.type === 'class');
  // Học viên cần chú ý: còn ≥ 2 bài chưa nộp hoặc nộp < 50%
  const attentionCount = (detail.data?.students ?? []).filter((s) => s.not_submitted_count >= 2 || s.completion_rate < 50).length;

  const pull = usePullRefresh(() => Promise.all([detail.refetch(), classes.refetch()]));
  const ch = useCollapsingHeader();

  const openChat = () => classRoom && router.push({ pathname: '/chat/[roomId]', params: { roomId: classRoom._id } });
  const go = (
    section: 'students' | 'assignments' | 'attendance' | 'notifications' | 'submissions' | 'report' | 'groups' | 'surveys' | 'certificates' | 'exemptions' | 'practice',
    params?: Record<string, string>,
  ) =>
    router.push({ pathname: `/teach/[id]/${section}`, params: { id, ...params } });

  if (detail.isError) {
    return (
      <View className="flex-1 bg-background">
        <Stack.Screen options={{ title: cls?.class_code ?? 'Lớp học', headerShown: true }} />
        <StateView
          icon="cloud-offline-outline"
          title="Không tải được lớp"
          description={getErrorMessage(detail.error)}
          actionLabel="Thử lại"
          onAction={() => detail.refetch()}
        />
      </View>
    );
  }
  if (!cls && classes.isLoading) {
    return (
      <View className="flex-1 bg-background">
        <Stack.Screen options={{ title: 'Lớp học', headerShown: true }} />
        <LoadingView />
      </View>
    );
  }

  const status = cls ? STATUS_META[cls.status_class] : null;
  const live = cls?.status_class === 'IN_PROGRESS' || cls?.status_class === 'CLOSED_REGISTRATION';

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: false }} />
      <CoverStatusBar collapsed={ch.collapsed} />

      <Animated.ScrollView
        onScroll={ch.onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: ch.bottomInset + 28 }}
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
          <ClassCover
            id={id}
            image={cls?.class_image}
            title={cls?.display_name || cls?.class_name || 'Lớp học'}
            code={cls?.class_code ?? ''}
            token={token?.media_token}
            topInset={ch.topInset}
            chips={[
              ...(status ? [{ label: status.label, tone: status.tone === 'success' ? ('success' as const) : ('light' as const) }] : []),
              ...(cls ? [{ label: COURSE_TYPE_LABEL[cls.course_type] ?? cls.course_type, tone: 'dark' as const }] : []),
            ]}
          />
          <View className="-mt-6 gap-3.5 rounded-t-[28px] bg-background px-4 pb-4 pt-5">
            {cls?.teacher?.name ? (
              <View className="flex-row items-center gap-3">
                <Avatar name={cls.teacher.name} uri={resolveMediaUrl(cls.teacher.avatar, token?.media_token)} size={44} />
                <View className="flex-1">
                  <Text className="text-[16px] font-bold text-foreground" numberOfLines={1}>
                    {cls.teacher.name}
                  </Text>
                  <Text className="text-[13px] text-muted" numberOfLines={1}>
                    Giảng viên
                    {cls.start_date ? ` · ${formatDate(cls.start_date)}${cls.end_date ? ` → ${formatDate(cls.end_date)}` : ''}` : ''}
                  </Text>
                </View>
              </View>
            ) : null}

            {cls && live ? <NextTeachCard classTime={cls.class_time} /> : null}

            <QuickActions
              actions={[
                {
                  key: 'chat',
                  icon: 'chatbubbles',
                  icon3d: CLASS_QUICK_ACTION_3D_ICONS.chat,
                  label: 'Chat lớp',
                  tone: 'brand',
                  disabled: !classRoom,
                  badge: classRoom?.notifications_muted ? undefined : classRoom?.unread_count || undefined,
                  onPress: () => void openChat(),
                },
                {
                  key: 'grade',
                  icon: 'create',
                  icon3d: CLASS_QUICK_ACTION_3D_ICONS.grade,
                  label: 'Chấm bài',
                  tone: 'warning',
                  onPress: () => router.push('/assignments'),
                },
                {
                  key: 'gradebook',
                  icon: 'podium',
                  icon3d: CLASS_QUICK_ACTION_3D_ICONS.gradebook,
                  label: 'Bảng điểm',
                  tone: 'info',
                  onPress: () => router.push({ pathname: '/grading/gradebook/[classId]', params: { classId: id } }),
                },
                {
                  key: 'attendance',
                  icon: 'checkbox',
                  icon3d: CLASS_QUICK_ACTION_3D_ICONS.attendance,
                  label: 'Điểm danh',
                  tone: 'success',
                  onPress: () => go('attendance'),
                },
              ]}
            />

            {detail.isLoading ? (
              <ActivityIndicator className="py-6" color={brand} />
            ) : stats ? (
              <StatsCard
                stats={stats}
                activeStudents={cls?.active_students}
                maxStudents={cls?.max_students}
                attention={attentionCount}
                onOpenStudents={() => go('students', { sort: 'attention' })}
              />
            ) : null}
          </View>
        </View>

        <View className="gap-2.5 px-4">
          <View className="flex-row items-center gap-1.5 pl-1">
            <Image
              source={STAFF_CLASS_MANAGEMENT_3D_ICONS.students}
              style={{ width: 27, height: 27 }}
              contentFit="contain"
              accessible={false}
            />
            <Text className="text-[12.5px] font-bold uppercase tracking-wide text-muted">Quản lý lớp</Text>
          </View>

          <MenuRow
            icon3d={STAFF_CLASS_MANAGEMENT_3D_ICONS.students}
            title="Học viên"
            subtitle={
              detail.data
                ? `${detail.data.students.length} học viên${attentionCount ? ` · ${attentionCount} cần chú ý` : ''}`
                : 'Danh sách học viên, tiến độ từng người'
            }
            badge={attentionCount || undefined}
            onPress={() => go('students')}
          />
          <MenuRow
            icon3d={STAFF_CLASS_MANAGEMENT_3D_ICONS.assignments}
            title="Bài tập"
            subtitle={stats ? `${stats.total_assignments} bài tập · ${stats.total_submissions.toLocaleString('vi-VN')} bài nộp` : 'Bài tập của lớp'}
            onPress={() => go('assignments')}
          />
          <MenuRow
            icon3d={STAFF_CLASS_MANAGEMENT_3D_ICONS.attendance}
            title="Điểm danh"
            subtitle="Tạo buổi học, đánh có mặt / vắng, lý do vắng"
            onPress={() => go('attendance')}
          />
          <MenuRow
            icon3d={STAFF_CLASS_MANAGEMENT_3D_ICONS.notifications}
            title="Thông báo lớp"
            subtitle="Đăng, hẹn giờ, sửa, xoá thông báo cho lớp"
            onPress={() => go('notifications')}
          />
          <MenuRow
            icon3d={STAFF_CLASS_MANAGEMENT_3D_ICONS.submissions}
            title="Bài nộp"
            subtitle="Chấm, review, duyệt nhanh bài của lớp"
            onPress={() => go('submissions')}
          />

          <Text className="pl-1 pt-3 text-[12.5px] font-bold uppercase tracking-wide text-muted">Theo dõi & tiện ích</Text>
          <MenuRow
            icon3d={STAFF_CLASS_MANAGEMENT_3D_ICONS.report}
            title="Báo cáo lớp"
            subtitle="Học viên cần lưu tâm, thiếu bài, vắng học"
            onPress={() => go('report')}
          />
          <MenuRow
            icon3d={STAFF_CLASS_MANAGEMENT_3D_ICONS.groups}
            title="Danh sách nhóm"
            subtitle={detail.data?.groups?.length ? `${detail.data.groups.length} nhóm thảo luận` : 'Nhóm thảo luận + trợ giảng'}
            onPress={() => go('groups')}
          />
          <MenuRow
            icon3d={STAFF_CLASS_MANAGEMENT_3D_ICONS.surveys}
            title="Khảo sát"
            subtitle="Ai đã trả lời, nhắc người chưa làm"
            onPress={() => go('surveys')}
          />
          <MenuRow
            icon3d={STAFF_CLASS_MANAGEMENT_3D_ICONS.certificates}
            title="Chứng chỉ học tập"
            subtitle="Xét điều kiện, gửi chứng chỉ"
            onPress={() => go('certificates')}
          />
          <MenuRow
            icon3d={STAFF_CLASS_MANAGEMENT_3D_ICONS.practice}
            title="Luyện tập nói"
            subtitle="Bộ câu luyện tập, tiến độ học viên"
            onPress={() => go('practice')}
          />
          <MenuRow
            icon3d={STAFF_CLASS_MANAGEMENT_3D_ICONS.exemptions}
            title="Không cần nhận xét"
            subtitle="Học viên nộp bài là tự hoàn thành"
            onPress={() => go('exemptions')}
          />
          <MenuRow
            icon3d={STAFF_CLASS_MANAGEMENT_3D_ICONS.elearning}
            title="E-Learning"
            subtitle="Xem nội dung E-Learning của lớp"
            onPress={() => router.push({ pathname: '/elearning/[classId]', params: { classId: id } })}
          />
        </View>
      </Animated.ScrollView>

      <CollapsingTopBar
        title={cls?.display_name || cls?.class_name || 'Lớp học'}
        header={ch}
        actions={
          classRoom
            ? [
                {
                  icon: 'chatbubbles-outline',
                  label: 'Chat lớp',
                  onPress: () => void openChat(),
                  badge: !!classRoom.unread_count && !classRoom.notifications_muted,
                },
              ]
            : []
        }
      />
    </View>
  );
}
