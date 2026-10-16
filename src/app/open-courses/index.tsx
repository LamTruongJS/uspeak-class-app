import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { router, Stack } from 'expo-router';
import { useDeferredValue, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';

import { useActionSheet } from '@/components/ui/action-sheet';
import { LoadingView, StateView } from '@/components/ui/state-view';
import {
  courseSearchText,
  foldQuery,
  pricing,
  SORTS,
  sortCourses,
  useOpenCourses,
  type OpenCourseClass,
  type OpenCourseSort,
} from '@/features/open-courses/api';
import { CourseCard } from '@/features/open-courses/course-card';
import { getErrorMessage } from '@/lib/api/client';
import { useMediaToken } from '@/lib/media';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';
import { menuScreenOptions } from '@/features/navigation/app-menu';

/**
 * Khoá học mở đăng ký — bản mobile của web /open-courses: tìm, lọc theo khoá học (kèm số lớp), Ưu đãi /
 * Zoom / E-Learning, sắp xếp; thẻ lớp → màn chi tiết (open-courses/[id]). Bước đăng ký xem ở màn chi tiết.
 */
export default function OpenCoursesScreen() {
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');
  const fg = useThemeColor('foreground');
  const { data: token } = useMediaToken();
  const query = useOpenCourses();
  const pull = usePullRefresh(() => query.refetch());

  const [search, setSearch] = useState('');
  const q = useDeferredValue(foldQuery(search.trim()));
  const [courseId, setCourseId] = useState('all');
  const [kind, setKind] = useState<'all' | 'promo' | 'zoom' | 'elearning'>('all');
  const [sort, setSort] = useState<OpenCourseSort>('newest');
  const menu = useActionSheet();

  const all = useMemo(() => query.data ?? [], [query.data]);
  // Khoá học kèm số lớp (nhiều lớp nhất lên trước) — hàng chip lọc theo khoá
  const facets = useMemo(() => {
    const m = new Map<string, { id: string; name: string; count: number }>();
    for (const c of all) {
      if (!c.course?._id) continue;
      const f = m.get(c.course._id) ?? { id: c.course._id, name: c.course.course_name || c.course.course_code, count: 0 };
      f.count += 1;
      m.set(c.course._id, f);
    }
    return [...m.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'vi'));
  }, [all]);
  const promoCount = useMemo(() => all.filter((c) => pricing(c).hasPromo).length, [all]);

  const list = useMemo(() => {
    const filtered = all.filter((c) => {
      if (courseId !== 'all' && c.course?._id !== courseId) return false;
      if (kind === 'promo' && !pricing(c).hasPromo) return false;
      if ((kind === 'zoom' || kind === 'elearning') && c.course_type !== kind) return false;
      if (q && !courseSearchText(c).includes(q)) return false;
      return true;
    });
    return sortCourses(filtered, sort);
  }, [all, courseId, kind, q, sort]);

  const filtered = courseId !== 'all' || kind !== 'all' || !!q;
  const reset = () => {
    setCourseId('all');
    setKind('all');
    setSearch('');
  };

  const pickSort = () =>
    menu.show({
      title: 'Sắp xếp',
      actions: SORTS.map((s) => ({ label: s.label, selected: s.value === sort, onPress: () => setSort(s.value) })),
    });

  const header = (
    <View className="gap-3 pb-3">
      {/* Tổng quan */}
      <View className="flex-row gap-2">
        <Stat value={all.length} label="Lớp đang mở" icon="school" />
        <Stat value={facets.length} label="Khoá học" icon="library" />
        <Stat value={promoCount} label="Đang ưu đãi" icon="flame" hot />
      </View>

      <View className="h-11 flex-row items-center gap-2 rounded-full bg-surface-muted px-4">
        <Ionicons name="search" size={17} color={muted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Tìm lớp, khoá học, giảng viên…"
          placeholderTextColor={muted}
          autoCorrect={false}
          className="flex-1 text-[15px] text-foreground"
        />
        {search ? (
          <Pressable hitSlop={8} onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={muted} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
        <Chip label="Tất cả khoá" on={courseId === 'all'} onPress={() => setCourseId('all')} />
        {facets.map((f) => (
          <Chip
            key={f.id}
            label={f.name}
            count={f.count}
            on={courseId === f.id}
            onPress={() => setCourseId(courseId === f.id ? 'all' : f.id)}
          />
        ))}
      </ScrollView>

      <View className="flex-row items-center gap-2">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2" className="flex-1">
          {promoCount ? (
            <Chip small label="🔥 Ưu đãi" on={kind === 'promo'} onPress={() => setKind(kind === 'promo' ? 'all' : 'promo')} />
          ) : null}
          <Chip small label="Học Zoom" on={kind === 'zoom'} onPress={() => setKind(kind === 'zoom' ? 'all' : 'zoom')} />
          <Chip small label="E-Learning" on={kind === 'elearning'} onPress={() => setKind(kind === 'elearning' ? 'all' : 'elearning')} />
        </ScrollView>
        <Pressable
          onPress={pickSort}
          hitSlop={6}
          className="h-8 flex-row items-center gap-1 rounded-full bg-surface-muted px-3 active:opacity-70">
          <Ionicons name="swap-vertical" size={14} color={fg} />
          <Text className="text-[12.5px] font-semibold text-foreground">{SORTS.find((s) => s.value === sort)?.label}</Text>
        </Pressable>
      </View>

      {filtered ? (
        <View className="flex-row items-center justify-between">
          <Text className="text-[13px] text-muted">{list.length} lớp phù hợp</Text>
          <Pressable onPress={reset} hitSlop={8}>
            <Text className="text-[13px] font-semibold text-brand">Xoá bộ lọc</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: 'Khoá học mở đăng ký', ...menuScreenOptions }} />
      {query.isLoading ? (
        <LoadingView />
      ) : query.isError ? (
        <StateView
          icon="cloud-offline-outline"
          title="Không tải được danh sách lớp"
          description={getErrorMessage(query.error)}
          actionLabel="Thử lại"
          onAction={() => query.refetch()}
        />
      ) : (
        <FlashList
          data={list}
          keyExtractor={(c: OpenCourseClass) => c._id}
          ListHeaderComponent={header}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          ItemSeparatorComponent={() => <View className="h-3.5" />}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}
          ListEmptyComponent={
            filtered ? (
              <StateView
                icon="search-outline"
                title="Không tìm thấy lớp phù hợp"
                description="Thử bỏ bớt bộ lọc để xem thêm lớp."
                actionLabel="Xoá bộ lọc"
                onAction={reset}
              />
            ) : (
              <StateView icon="school-outline" title="Chưa có lớp nào đang mở đăng ký" description="Lớp mới sẽ được cập nhật liên tục." />
            )
          }
          renderItem={({ item }) => (
            <CourseCard
              c={item}
              token={token?.media_token}
              onPress={() => router.push({ pathname: '/open-courses/[id]', params: { id: item._id } })}
            />
          )}
        />
      )}
      {menu.sheet}
    </View>
  );
}

function Stat({ value, label, icon, hot }: { value: number; label: string; icon: 'school' | 'library' | 'flame'; hot?: boolean }) {
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');
  return (
    <View className={`flex-1 gap-1 rounded-2xl p-3 ${hot ? 'bg-brand-soft' : 'bg-surface'}`}>
      <Ionicons name={icon} size={17} color={hot ? brand : muted} />
      <Text className={`text-[20px] font-extrabold ${hot ? 'text-brand' : 'text-foreground'}`}>{value}</Text>
      <Text className="text-[11.5px] text-muted" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function Chip({ label, count, on, small, onPress }: { label: string; count?: number; on: boolean; small?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-1.5 rounded-full px-3.5 active:opacity-80 ${small ? 'h-8' : 'h-9'} ${on ? 'bg-foreground' : 'bg-surface-muted'}`}>
      <Text
        className={`font-semibold ${small ? 'text-[12.5px]' : 'text-[13.5px]'} ${on ? 'text-background' : 'text-muted'}`}
        numberOfLines={1}>
        {label}
      </Text>
      {count ? <Text className={`text-[12px] font-bold ${on ? 'text-background opacity-70' : 'text-muted'}`}>{count}</Text> : null}
    </Pressable>
  );
}
