import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useDeferredValue, useMemo, useState, type ComponentProps } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTabBarSpace } from '@/components/ui/floating-tab-bar';
import { LoadingView, StateView } from '@/components/ui/state-view';
import { SUPPORT_HOTLINE } from '@/constants/support';
import { useMyPermissionCodes } from '@/features/chat/api';
import { fold } from '@/features/chat/mentions';
import { useMyClasses, type StudentClassItem } from '@/features/classes/api';
import { ClassCard, StaffClassCard } from '@/features/classes/class-card';
import { isMyClass, STATUS_META, useStaffClasses, type ClassStatus, type StaffClassItem } from '@/features/classes/staff-api';
import { getErrorMessage } from '@/lib/api/client';
import { useMediaToken } from '@/lib/media';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { isStaffRole } from '@/navigation/features';
import { useAuthStore } from '@/stores/auth.store';
import { useThemeColor } from '@/theme/use-theme-color';

type IconName = ComponentProps<typeof Ionicons>['name'];

export default function ClassesScreen() {
  const role = useAuthStore((s) => s.user?.role_code);
  return isStaffRole(role) ? <StaffClasses /> : <StudentClasses />;
}

// ─── Chung ──────────────────────────────────────────────────────────────────

function Header({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View className="gap-3 px-4 pb-1" style={{ paddingTop: insets.top + 12 }}>
      <View>
        <Text className="text-[28px] font-bold text-foreground">{title}</Text>
        {subtitle ? <Text className="text-sm text-muted">{subtitle}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const muted = useThemeColor('muted');
  return (
    <View className="h-11 flex-row items-center gap-2 rounded-xl bg-surface-muted px-3">
      <Ionicons name="search" size={18} color={muted} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={muted}
        autoCorrect={false}
        className="flex-1 text-base text-foreground"
      />
      {value ? (
        <Pressable hitSlop={8} onPress={() => onChange('')} accessibilityLabel="Xoá ô tìm">
          <Ionicons name="close-circle" size={18} color={muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

function Chips<T extends string>({
  items,
  value,
  onChange,
}: {
  items: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-4 grow-0" contentContainerClassName="gap-2 px-4">
      {items.map((it) => {
        const on = it.value === value;
        return (
          <Pressable
            key={it.value}
            onPress={() => onChange(it.value)}
            className={`flex-row items-center gap-1.5 rounded-full px-3.5 py-1.5 ${on ? 'bg-brand' : 'bg-surface-muted'}`}>
            <Text className={`text-sm font-semibold ${on ? 'text-on-brand' : 'text-foreground'}`}>{it.label}</Text>
            {it.count !== undefined ? (
              <Text className={`text-xs font-bold ${on ? 'text-on-brand opacity-80' : 'text-muted'}`}>{it.count}</Text>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function SummaryTile({ icon, value, label, color }: { icon: IconName; value: string; label: string; color: string }) {
  return (
    <View className="flex-1 gap-1 rounded-2xl border border-border bg-surface p-3">
      <View className="h-7 w-7 items-center justify-center rounded-lg" style={{ backgroundColor: `${color}22` }}>
        <Ionicons name={icon} size={15} color={color} />
      </View>
      <Text className="text-xl font-extrabold text-foreground">{value}</Text>
      <Text className="text-[11px] text-muted" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

// ─── Học viên ───────────────────────────────────────────────────────────────

type StudentFilter = 'learning' | 'done' | 'all';

function StudentClasses() {
  const tabBarSpace = useTabBarSpace();
  const { data, isLoading, isError, error, refetch } = useMyClasses();
  const pull = usePullRefresh(refetch);
  const { data: token } = useMediaToken();
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');
  const danger = useThemeColor('danger');
  const [filter, setFilter] = useState<StudentFilter>('learning');
  const [search, setSearch] = useState('');
  const q = useDeferredValue(fold(search.trim()));

  const all = useMemo(() => data ?? [], [data]);
  const learning = all.filter((c) => (c.progress ?? 0) < 100);
  const list = useMemo(() => {
    const byFilter =
      filter === 'learning'
        ? all.filter((c) => (c.progress ?? 0) < 100)
        : filter === 'done'
          ? all.filter((c) => (c.progress ?? 0) >= 100)
          : all;
    return q ? byFilter.filter((c) => fold(`${c.display_name ?? ''} ${c.class_name} ${c.class_code}`).includes(q)) : byFilter;
  }, [all, filter, q]);

  const open = (c: StudentClassItem) => {
    if (c.access_locked) {
      Alert.alert(
        'Lớp đang bị khoá',
        `${c.access_lock_reason ? `Lý do: ${c.access_lock_reason}\n` : ''}Liên hệ hotline ${SUPPORT_HOTLINE} để được hỗ trợ.`,
      );
      return;
    }
    router.push({ pathname: '/class/[id]', params: { id: c._id } });
  };

  return (
    <View className="flex-1 bg-background">
      <Header title="Lớp học của tôi" subtitle="Các lớp bạn đang tham gia">
        {all.length > 3 ? <SearchBox value={search} onChange={setSearch} placeholder="Tìm lớp…" /> : null}
        <Chips<StudentFilter>
          value={filter}
          onChange={setFilter}
          items={[
            { value: 'learning', label: 'Đang học', count: learning.length },
            { value: 'done', label: 'Hoàn thành', count: all.length - learning.length },
            { value: 'all', label: 'Tất cả', count: all.length },
          ]}
        />
      </Header>
      {isLoading ? (
        <LoadingView />
      ) : isError ? (
        <StateView
          icon="cloud-offline-outline"
          title="Không tải được danh sách lớp"
          description={getErrorMessage(error)}
          actionLabel="Thử lại"
          onAction={() => refetch()}
        />
      ) : (
        <FlashList
          data={list}
          keyExtractor={(c) => c._id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: tabBarSpace }}
          ItemSeparatorComponent={() => <View className="h-3" />}
          keyboardDismissMode="on-drag"
          refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}
          ListEmptyComponent={
            <StateView
              icon="school-outline"
              title={search ? 'Không tìm thấy lớp' : filter === 'done' ? 'Chưa có lớp hoàn thành' : 'Bạn chưa có lớp nào'}
              description={search ? undefined : 'Khi được xếp lớp, lớp sẽ hiện ở đây.'}
            />
          }
          renderItem={({ item }) => (
            <ClassCard item={item} token={token?.media_token} muted={muted} danger={danger} onPress={() => open(item)} />
          )}
        />
      )}
    </View>
  );
}

// ─── Giáo viên / trợ giảng / quản trị ───────────────────────────────────────

type StatusFilter = 'ALL' | ClassStatus;
type Owner = 'mine' | 'all';

function StaffClasses() {
  const tabBarSpace = useTabBarSpace();
  const myId = useAuthStore((s) => s.user?._id);
  const canViewAll = useMyPermissionCodes().data?.includes('CLASS_VIEW_ALL') ?? false;
  const { data, isLoading, isError, error, refetch } = useStaffClasses();
  const pull = usePullRefresh(refetch);
  const { data: token } = useMediaToken();
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');
  const [owner, setOwner] = useState<Owner | null>(null);
  const [status, setStatus] = useState<StatusFilter>('IN_PROGRESS');
  const [search, setSearch] = useState('');
  const q = useDeferredValue(fold(search.trim()));

  // Mặc định: có quyền xem mọi lớp → "Tất cả", không thì chỉ lớp của mình (giống web)
  const effOwner: Owner = canViewAll ? (owner ?? 'all') : 'mine';
  const all = useMemo(() => data ?? [], [data]);
  const mineCount = all.filter((c) => isMyClass(c, myId)).length;
  const byOwner = useMemo(() => (effOwner === 'mine' ? all.filter((c) => isMyClass(c, myId)) : all), [all, effOwner, myId]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: byOwner.length };
    for (const x of byOwner) c[x.status_class] = (c[x.status_class] ?? 0) + 1;
    return c;
  }, [byOwner]);
  const list = useMemo(() => {
    const s = status === 'ALL' ? byOwner : byOwner.filter((c) => c.status_class === status);
    return q ? s.filter((c) => fold(`${c.display_name ?? ''} ${c.class_name} ${c.class_code} ${c.teacher?.name ?? ''}`).includes(q)) : s;
  }, [byOwner, status, q]);
  const students = byOwner.reduce((s, c) => s + (c.active_students || 0), 0);
  const assignments = byOwner.reduce((s, c) => s + (c.assignment_count || 0), 0);

  const statusItems: { value: StatusFilter; label: string; count?: number }[] = [
    { value: 'IN_PROGRESS', label: STATUS_META.IN_PROGRESS.label, count: counts.IN_PROGRESS ?? 0 },
    { value: 'OPEN_REGISTRATION', label: STATUS_META.OPEN_REGISTRATION.label, count: counts.OPEN_REGISTRATION ?? 0 },
    { value: 'CLOSED_REGISTRATION', label: STATUS_META.CLOSED_REGISTRATION.label, count: counts.CLOSED_REGISTRATION ?? 0 },
    { value: 'ENDED', label: STATUS_META.ENDED.label, count: counts.ENDED ?? 0 },
    { value: 'ALL', label: 'Tất cả', count: counts.ALL ?? 0 },
  ];

  const header = (
    <View className="gap-3 pb-3">
      <View className="flex-row gap-2">
        <SummaryTile icon="school" color="#2563eb" value={String(byOwner.length)} label="Lớp" />
        <SummaryTile icon="people" color="#059669" value={students.toLocaleString('vi-VN')} label="Học viên" />
        <SummaryTile icon="document-text" color="#7c3aed" value={assignments.toLocaleString('vi-VN')} label="Bài tập" />
      </View>
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      <Header title="Lớp dạy" subtitle={effOwner === 'mine' ? 'Các lớp bạn phụ trách' : 'Toàn bộ lớp trên hệ thống'}>
        <SearchBox value={search} onChange={setSearch} placeholder="Tìm lớp, mã lớp, giáo viên…" />
        {canViewAll ? (
          <View className="flex-row rounded-xl bg-surface-muted p-1">
            {(
              [
                { value: 'all', label: 'Tất cả lớp', count: all.length },
                { value: 'mine', label: 'Lớp của tôi', count: mineCount },
              ] as const
            ).map((o) => (
              <Pressable
                key={o.value}
                onPress={() => setOwner(o.value)}
                className={`flex-1 items-center rounded-lg py-2 ${effOwner === o.value ? 'bg-surface' : ''}`}>
                <Text className={`text-sm font-semibold ${effOwner === o.value ? 'text-foreground' : 'text-muted'}`}>
                  {o.label} <Text className="text-muted">{o.count}</Text>
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <Chips<StatusFilter> items={statusItems} value={status} onChange={setStatus} />
      </Header>

      {isLoading ? (
        <LoadingView />
      ) : isError ? (
        <StateView
          icon="cloud-offline-outline"
          title="Không tải được danh sách lớp"
          description={getErrorMessage(error)}
          actionLabel="Thử lại"
          onAction={() => refetch()}
        />
      ) : (
        <FlashList
          data={list}
          keyExtractor={(c) => c._id}
          ListHeaderComponent={header}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: tabBarSpace }}
          ItemSeparatorComponent={() => <View className="h-3" />}
          keyboardDismissMode="on-drag"
          refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}
          ListEmptyComponent={<StateView icon="school-outline" title={search ? 'Không tìm thấy lớp' : 'Không có lớp nào'} />}
          renderItem={({ item }: { item: StaffClassItem }) => (
            <StaffClassCard
              item={item}
              token={token?.media_token}
              muted={muted}
              // Chỉ gắn nhãn khi nó phân biệt được (quản trị được tính là phụ trách mọi lớp)
              mine={mineCount < all.length && isMyClass(item, myId)}
              onPress={() => router.push({ pathname: '/teach/[id]', params: { id: item._id } })}
            />
          )}
        />
      )}
    </View>
  );
}
