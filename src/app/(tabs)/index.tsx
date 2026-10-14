import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { mediaCacheKey, useMediaUrl } from '@/lib/media';
import { Screen } from '@/components/ui/screen';
import { useMyPermissionCodes } from '@/features/chat/api';
import { StaffDashboard, type DashboardPeriod } from '@/features/dashboard/staff-dashboard';
import { StudentDashboard, useStudentDashboardData } from '@/features/dashboard/student-dashboard';
import { featuresForUser, isStaffRole, type AppFeature } from '@/navigation/features';
import { openFeature } from '@/navigation/open-feature';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useAuthStore } from '@/stores/auth.store';
import { useThemeColor } from '@/theme/use-theme-color';

/** Vai trò thấy dashboard thống kê hệ thống — khớp menuConfig web ('/dashboard' + quyền DASHBOARD_VIEW). */
const DASHBOARD_ROLES = ['AD', 'TE', 'TA'];

/** Ảnh 3D chỉ dùng cho các lối tắt học viên trên trang chủ; mục khác vẫn dùng Ionicons. */
const SHORTCUT_3D_ICONS: Record<string, number> = {
  'my-classes': require('../../../assets/images/shortcut-icons/my-classes.png'),
  schedule: require('../../../assets/images/shortcut-icons/schedule.png'),
  'my-assignments': require('../../../assets/images/shortcut-icons/my-assignments.png'),
  'class-surveys': require('../../../assets/images/shortcut-icons/class-surveys.png'),
  'my-certificates': require('../../../assets/images/shortcut-icons/my-certificates.png'),
  'open-courses': require('../../../assets/images/shortcut-icons/open-courses.png'),
  'course-privileges': require('../../../assets/images/shortcut-icons/course-privileges.png'),
  shadowing: require('../../../assets/images/shortcut-icons/shadowing.png'),
};

/**
 * Trang chủ = Dashboard như bên web class:
 * - Học viên: dashboard học tập (StudentDashboard)
 * - Quản trị / giáo viên / trợ giảng có quyền DASHBOARD_VIEW: thống kê hệ thống (StaffDashboard)
 * - Vai trò khác (vd người nhận xét): lời chào + lối tắt
 */
export default function HomeScreen() {
  const role = useAuthStore((s) => s.user?.role_code);
  const staff = isStaffRole(role);
  const permissions = useMyPermissionCodes();
  const canStaffDashboard = staff && DASHBOARD_ROLES.includes(role ?? '') && !!permissions.data?.includes('DASHBOARD_VIEW');

  if (!staff) return <StudentHome />;
  if (canStaffDashboard) return <StaffHome />;
  return <BasicHome />;
}

function StudentHome() {
  const data = useStudentDashboardData();
  const pull = usePullRefresh(data.refetch);
  return (
    <Screen onRefresh={pull.onRefresh} refreshing={pull.refreshing}>
      <StudentDashboard data={data} shortcuts={<Shortcuts />} />
    </Screen>
  );
}

function StaffHome() {
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<DashboardPeriod>('week');
  const [refreshing, setRefreshing] = useState(false);
  return (
    <Screen
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await queryClient.invalidateQueries({ queryKey: ['assignments', 'stats', 'system'] });
        setRefreshing(false);
      }}>
      <StaffDashboard period={period} onPeriodChange={setPeriod} shortcuts={<Shortcuts />} />
    </Screen>
  );
}

function BasicHome() {
  const user = useAuthStore((s) => s.user);
  // Ảnh đại diện lưu ở class-be dạng `/uploads/file?key=…` → phải nối media token mới tải được
  const avatarUri = useMediaUrl(user?.avatar);
  const [hour] = useState(() => new Date().getHours());
  const greeting = hour < 11 ? 'Chào buổi sáng' : hour < 14 ? 'Chào buổi trưa' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  return (
    <Screen>
      <View className="flex-row items-center gap-3 pb-5">
        <Avatar name={user?.name} uri={avatarUri} cacheKey={mediaCacheKey(user?.avatar)} size={48} />
        <View className="flex-1">
          <Text className="text-sm text-muted">{greeting} 👋</Text>
          <Text className="text-xl font-bold text-foreground" numberOfLines={1}>
            {user?.name}
          </Text>
        </View>
      </View>
      <Shortcuts />
    </Screen>
  );
}

/** Lối tắt tới các tính năng (đợt 1–2 cho học viên, tới đợt 3 cho nhân viên) — tối đa 8 ô. */
function Shortcuts() {
  const role = useAuthStore((s) => s.user?.role_code);
  const staff = isStaffRole(role);
  // Chỉ hiện tính năng tài khoản này thực sự có quyền (giống menu bên web)
  const permissions = useMyPermissionCodes();
  const items = featuresForUser(role, permissions.data)
    .filter((f) => f.group !== 'account' && f.group !== 'admin' && f.key !== 'dashboard')
    .filter((f) => (staff ? f.phase <= 3 : f.phase <= 2))
    .slice(0, 8);
  if (!items.length) return null;
  return (
    <View className="flex-row flex-wrap gap-y-4 rounded-2xl border border-border bg-surface py-4">
      {items.map((f) => (
        <Shortcut key={f.key} feature={f} />
      ))}
    </View>
  );
}

function Shortcut({ feature }: { feature: AppFeature }) {
  const brand = useThemeColor('brand');
  const shortcutIcon = SHORTCUT_3D_ICONS[feature.key];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={feature.label}
      onPress={() => openFeature(feature)}
      className="w-1/4 items-center gap-1.5 px-1 active:opacity-70">
      {/* Icon 3D tự có khối + bóng → để trần; chỉ icon nét dự phòng mới cần ô nền */}
      {shortcutIcon ? (
        <Image source={shortcutIcon} style={{ width: 52, height: 52 }} contentFit="contain" />
      ) : (
        <View className="h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft">
          <Ionicons name={feature.icon} size={22} color={brand} />
        </View>
      )}
      <Text className="text-center text-xs text-foreground" numberOfLines={2}>
        {feature.label}
      </Text>
    </Pressable>
  );
}
