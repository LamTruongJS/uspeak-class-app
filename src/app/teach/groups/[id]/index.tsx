import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Animated, RefreshControl, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { CollapsingTopBar, CoverStatusBar, useCollapsingHeader } from '@/components/ui/collapsing-header';
import { StateView } from '@/components/ui/state-view';
import { CLASS_QUICK_ACTION_3D_ICONS, STAFF_CLASS_MANAGEMENT_3D_ICONS } from '@/constants/three-d-icons';
import { useChatRooms } from '@/features/chat/api';
import { COURSE_TYPE_LABEL, STATUS_META, useStaffClasses } from '@/features/classes/staff-api';
import { ClassCover, QuickActions } from '@/features/classes/student-class-hero';
import { useMyTeachingGroups, useTeachingGroupDetail } from '@/features/classes/teach-api';
import { MenuRow, NextTeachCard, StatsCard } from '@/features/classes/teach-overview';
import { getErrorMessage } from '@/lib/api/client';
import { formatDate } from '@/lib/format';
import { resolveMediaUrl, useMediaToken } from '@/lib/media';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

/**
 * Chi tiết nhóm giảng dạy — CÙNG bố cục với chi tiết lớp dạy (`teach/[id]`, anh yêu cầu 16/10/2026):
 * ảnh bìa tràn + thanh trên trong suốt, trợ giảng, buổi học tiếp theo, lối tắt, 3 vòng chỉ số của NHÓM,
 * rồi các mục quản lý.
 *
 * CHỈ thông tin về học viên của nhóm (anh chốt): mọi mục mở màn của lớp kèm `?group=<id>` để lọc còn học
 * viên trong nhóm — Học viên, Bài nộp, Điểm danh, Bảng điểm, Báo cáo (xem `useGroupScope`). Chat là phòng
 * của NHÓM (room.group_id), không phải phòng cả lớp. Không còn mục của cả lớp (bài tập, chi tiết lớp…).
 */
export default function TeachingGroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const brand = useThemeColor('brand');
  const { data: token } = useMediaToken();

  const detail = useTeachingGroupDetail(id);
  const groups = useMyTeachingGroups();
  const classes = useStaffClasses();
  const rooms = useChatRooms();

  const data = detail.data;
  const classId = data?.class_id ?? '';
  // Ảnh bìa, lịch học, ảnh trợ giảng không có trong API chi tiết nhóm → lấy từ danh sách nhóm / lớp đã tải
  const item = groups.data?.find((g) => g._id === id);
  const cls = classes.data?.find((c) => c._id === classId);
  // Phòng chat của nhóm: ưu tiên phòng nhóm chuẩn (type group), không có thì phòng con gắn nhóm
  const groupRooms = (rooms.data ?? []).filter((r) => r.group_id === id);
  const groupRoom = groupRooms.find((r) => r.type === 'group') ?? groupRooms[0];

  const students = data?.students ?? [];
  // Cùng luật "cần chú ý" với trang lớp: còn ≥ 2 bài chưa nộp hoặc nộp < 50%
  const attentionCount = students.filter((s) => s.not_submitted_count >= 2 || s.completion_rate < 50).length;
  const status = data ? STATUS_META[data.status_class] : null;
  const courseType = data?.course_type ?? item?.course_type ?? cls?.course_type;
  const live = data?.status_class === 'IN_PROGRESS' || data?.status_class === 'CLOSED_REGISTRATION';
  const assistant = data?.assistant ?? item?.assistant ?? null;
  const start = data?.start_date ?? item?.start_date;
  const end = data?.end_date ?? item?.end_date;

  const pull = usePullRefresh(() => Promise.all([detail.refetch(), groups.refetch()]));
  const ch = useCollapsingHeader();

  const openChat = () => groupRoom && router.push({ pathname: '/chat/[roomId]', params: { roomId: groupRoom._id } });
  const openStudents = (sort?: 'attention') =>
    router.push({ pathname: '/teach/[id]/students', params: { id: classId, group: id, ...(sort ? { sort } : {}) } });
  // Các màn của lớp, lọc theo học viên nhóm (?group=)
  const goGroup = (section: 'attendance' | 'submissions' | 'report') =>
    router.push({ pathname: `/teach/[id]/${section}`, params: { id: classId, group: id } });
  const openGradebook = () => router.push({ pathname: '/grading/gradebook/[classId]', params: { classId, group: id } });

  if (detail.isError) {
    return (
      <View className="flex-1 bg-background">
        <Stack.Screen options={{ title: item?.group_name ?? 'Nhóm giảng dạy', headerShown: true }} />
        <StateView
          icon="cloud-offline-outline"
          title="Không tải được nhóm"
          description={getErrorMessage(detail.error)}
          actionLabel="Thử lại"
          onAction={() => detail.refetch()}
        />
      </View>
    );
  }

  const title = data?.group_name ?? item?.group_name ?? 'Nhóm giảng dạy';

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
            id={classId || id}
            image={cls?.class_image ?? item?.cover_image}
            title={title}
            code={data?.class_code ?? item?.class_code ?? ''}
            token={token?.media_token}
            topInset={ch.topInset}
            chips={[
              ...(status ? [{ label: status.label, tone: status.tone === 'success' ? ('success' as const) : ('light' as const) }] : []),
              ...(courseType ? [{ label: COURSE_TYPE_LABEL[courseType] ?? courseType, tone: 'dark' as const }] : []),
              ...(data?.class_code ? [{ label: `Lớp ${data.class_code}`, tone: 'dark' as const }] : []),
            ]}
          />
          <View className="-mt-6 gap-3.5 rounded-t-[28px] bg-background px-4 pb-4 pt-5">
            {assistant?.name ? (
              <View className="flex-row items-center gap-3">
                <Avatar name={assistant.name} uri={resolveMediaUrl(assistant.avatar, token?.media_token)} size={44} />
                <View className="flex-1">
                  <Text className="text-[16px] font-bold text-foreground" numberOfLines={1}>
                    {assistant.name}
                  </Text>
                  <Text className="text-[13px] text-muted" numberOfLines={1}>
                    Trợ giảng
                    {data?.teacher?.name ? ` · GV ${data.teacher.name}` : ''}
                    {start ? ` · ${formatDate(start)}${end ? ` → ${formatDate(end)}` : ''}` : ''}
                  </Text>
                </View>
              </View>
            ) : null}

            {live && cls?.class_time ? <NextTeachCard classTime={cls.class_time} label="Buổi học tiếp theo" /> : null}

            <QuickActions
              actions={[
                {
                  key: 'chat',
                  icon: 'chatbubbles',
                  icon3d: CLASS_QUICK_ACTION_3D_ICONS.chat,
                  label: 'Chat nhóm',
                  tone: 'brand',
                  disabled: !groupRoom,
                  badge: groupRoom?.notifications_muted ? undefined : groupRoom?.unread_count || undefined,
                  onPress: () => void openChat(),
                },
                {
                  key: 'grade',
                  icon: 'create',
                  icon3d: CLASS_QUICK_ACTION_3D_ICONS.grade,
                  label: 'Bài nộp',
                  tone: 'warning',
                  disabled: !classId,
                  onPress: () => goGroup('submissions'),
                },
                {
                  key: 'gradebook',
                  icon: 'podium',
                  icon3d: CLASS_QUICK_ACTION_3D_ICONS.gradebook,
                  label: 'Bảng điểm',
                  tone: 'info',
                  disabled: !classId,
                  onPress: openGradebook,
                },
                {
                  key: 'attendance',
                  icon: 'checkbox',
                  icon3d: CLASS_QUICK_ACTION_3D_ICONS.attendance,
                  label: 'Điểm danh',
                  tone: 'success',
                  disabled: !classId,
                  onPress: () => goGroup('attendance'),
                },
              ]}
            />

            {detail.isLoading ? (
              <ActivityIndicator className="py-6" color={brand} />
            ) : data?.stats ? (
              <StatsCard
                title="Tình hình nhóm"
                stats={data.stats}
                activeStudents={students.length}
                maxStudents={data.max_students}
                attention={attentionCount}
                onOpenStudents={() => openStudents('attention')}
              />
            ) : null}
          </View>
        </View>

        <View className="gap-2.5 px-4">
          <View className="flex-row items-center gap-1.5 pl-1">
            <Image source={STAFF_CLASS_MANAGEMENT_3D_ICONS.groups} style={{ width: 27, height: 27 }} contentFit="contain" accessible={false} />
            <Text className="text-[12.5px] font-bold uppercase tracking-wide text-muted">Quản lý nhóm</Text>
          </View>

          <MenuRow
            icon3d={STAFF_CLASS_MANAGEMENT_3D_ICONS.students}
            title="Học viên"
            subtitle={
              data
                ? `${students.length}${data.max_students ? `/${data.max_students}` : ''} học viên${attentionCount ? ` · ${attentionCount} cần chú ý` : ''}`
                : 'Danh sách học viên của nhóm, tiến độ từng người'
            }
            badge={attentionCount || undefined}
            onPress={() => openStudents()}
          />

          <MenuRow
            icon3d={STAFF_CLASS_MANAGEMENT_3D_ICONS.submissions}
            title="Bài nộp"
            subtitle="Bài của học viên trong nhóm — chấm, review, kết quả"
            onPress={() => goGroup('submissions')}
          />
          <MenuRow
            icon3d={STAFF_CLASS_MANAGEMENT_3D_ICONS.attendance}
            title="Điểm danh"
            subtitle="Có mặt / vắng của học viên trong nhóm từng buổi"
            onPress={() => goGroup('attendance')}
          />
          <MenuRow
            icon3d={CLASS_QUICK_ACTION_3D_ICONS.gradebook}
            title="Bảng điểm"
            subtitle="Điểm từng bài, điểm TB của học viên trong nhóm"
            onPress={openGradebook}
          />
          <MenuRow
            icon3d={STAFF_CLASS_MANAGEMENT_3D_ICONS.report}
            title="Báo cáo nhóm"
            subtitle="Học viên cần lưu tâm, thiếu bài, vắng học"
            onPress={() => goGroup('report')}
          />
        </View>
      </Animated.ScrollView>

      <CollapsingTopBar
        title={title}
        header={ch}
        actions={
          groupRoom
            ? [
                {
                  icon: 'chatbubbles-outline',
                  label: 'Chat nhóm',
                  onPress: () => void openChat(),
                  badge: !!groupRoom.unread_count && !groupRoom.notifications_muted,
                },
              ]
            : []
        }
      />
    </View>
  );
}
