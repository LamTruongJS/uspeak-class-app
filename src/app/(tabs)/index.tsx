import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { HOME_SHORTCUT_3D_ICONS, STAFF_DASHBOARD_3D_ICONS } from '@/constants/three-d-icons';
import { Screen } from '@/components/ui/screen';
import { useGradingSummary } from '@/features/assignments/grading-api';
import { useMyPermissionCodes } from '@/features/chat/api';
import { DashboardHeader } from '@/features/dashboard/dashboard-header';
import { StaffDashboard, type DashboardPeriod } from '@/features/dashboard/staff-dashboard';
import { StudentDashboard, useStudentDashboardData } from '@/features/dashboard/student-dashboard';
import { featuresForUser, isStaffRole, type AppFeature } from '@/navigation/features';
import { openFeature } from '@/navigation/open-feature';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useAuthStore } from '@/stores/auth.store';
import { useThemeColor } from '@/theme/use-theme-color';

/** Vai trò thấy dashboard thống kê hệ thống — khớp menuConfig web ('/dashboard' + quyền DASHBOARD_VIEW). */
const DASHBOARD_ROLES = ['AD', 'TE', 'TA'];

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

/**
 * Trang chủ của người nhận xét (TG): trước đây chỉ có lời chào + lối tắt, không nói gì về việc
 * cần làm — trong khi hàng chờ nhận xét mới là việc chính của họ.
 */
function GraderToday() {
  const summary = useGradingSummary(true);
  const s = summary.data;
  const go = () => router.push('/assignments');
  return (
    <Pressable onPress={go} className="gap-3 rounded-2xl border border-border bg-surface p-4 active:opacity-80">
      <View className="flex-row items-center gap-2">
        <Image source={STAFF_DASHBOARD_3D_ICONS.pendingGrading} style={{ width: 28, height: 28 }} contentFit="contain" accessible={false} />
        <Text className="flex-1 text-[15px] font-bold text-foreground">Việc nhận xét hôm nay</Text>
        <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
      </View>
      <View className="flex-row gap-2">
        <GraderStat icon3d={STAFF_DASHBOARD_3D_ICONS.pendingGrading} value={s?.total} label="Trong hàng chờ" tone="text-foreground" />
        <GraderStat icon3d={STAFF_DASHBOARD_3D_ICONS.urgent} value={s?.urgent} label="Gấp (< 12 giờ)" tone="text-danger" />
        <GraderStat icon3d={STAFF_DASHBOARD_3D_ICONS.activeGrading} value={s?.claimed} label="Bạn đang giữ" tone="text-info" />
      </View>
      {s && s.urgent > 0 ? (
        <Text className="text-[12.5px] font-medium text-danger">Nhận các bài gấp trước khi nhận bài thường.</Text>
      ) : null}
    </Pressable>
  );
}

function GraderStat({ icon3d, value, label, tone }: { icon3d: number; value?: number; label: string; tone: string }) {
  return (
    <View className="flex-1 items-center gap-0.5 rounded-xl bg-surface-muted py-2.5">
      <Image source={icon3d} style={{ width: 30, height: 30 }} contentFit="contain" accessible={false} />
      <Text className={`text-[20px] font-extrabold ${tone}`}>{value ?? '–'}</Text>
      <Text className="text-center text-[11.5px] text-muted">{label}</Text>
    </View>
  );
}

function BasicHome() {
  const user = useAuthStore((s) => s.user);
  const [hour] = useState(() => new Date().getHours());
  const greeting = hour < 11 ? 'Chào buổi sáng' : hour < 14 ? 'Chào buổi trưa' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  const role = user?.role_code;
  const eyebrow =
    role === 'AD'
      ? 'Không gian quản trị'
      : role === 'TE'
        ? 'Không gian giảng dạy'
        : role === 'TA'
          ? 'Không gian trợ giảng'
          : role === 'TG'
            ? 'Không gian nhận xét'
            : 'Không gian làm việc';
  const description =
    role === 'TG' ? 'Theo dõi hàng chờ và tiến độ nhận xét bài' : 'Theo dõi công việc và truy cập nhanh các tính năng';
  return (
    <Screen>
      <View className="gap-4">
        <DashboardHeader user={user} greeting={greeting} eyebrow={eyebrow} description={description} icon="briefcase" />
        <GraderToday />
        <Shortcuts />
      </View>
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
  const shortcutIcon = HOME_SHORTCUT_3D_ICONS[feature.key];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={feature.label}
      onPress={() => openFeature(feature)}
      className="w-1/4 items-center gap-1.5 px-1 active:opacity-70">
      {/* Icon 3D tự có khối + bóng → để trần; chỉ icon nét dự phòng mới cần ô nền */}
      {shortcutIcon ? (
        <Image source={shortcutIcon} style={{ width: 52, height: 52 }} contentFit="contain" accessible={false} />
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
