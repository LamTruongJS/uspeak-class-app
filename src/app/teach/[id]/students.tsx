import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useDeferredValue, useMemo, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showToast } from '@/components/ui/toast';
import { LoadingView, StateView } from '@/components/ui/state-view';
import { chatApi, useChatRooms, useMyPermissionCodes } from '@/features/chat/api';
import { fold } from '@/features/chat/mentions';
import { useStaffClassDetail, useStaffClasses, useStudentAdmin, type ClassStudentStats } from '@/features/classes/staff-api';
import { useActionSheet, type SheetAction } from '@/components/ui/action-sheet';
import { StudentRow } from '@/features/classes/student-row';
import { getErrorMessage } from '@/lib/api/client';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

type Sort = 'attention' | 'score' | 'name';

const SORTS: { value: Sort; label: string }[] = [
  { value: 'attention', label: 'Cần chú ý' },
  { value: 'score', label: 'Điểm cao' },
  { value: 'name', label: 'Tên A–Z' },
];

/**
 * Học viên của lớp (nhân sự): tìm, sắp xếp, nhắn riêng; nút ⋯ (theo quyền, như menu của web) để khoá /
 * mở khoá tài khoản (STUDENT_BLOCK) và bảo lưu học viên (STUDENT_DEFERRAL_CREATE).
 */
export default function ClassStudentsScreen() {
  const { id, sort: initialSort } = useLocalSearchParams<{ id: string; sort?: Sort }>();
  const brand = useThemeColor('brand');

  const classes = useStaffClasses();
  const cls = classes.data?.find((c) => c._id === id);
  const detail = useStaffClassDetail(id);
  const rooms = useChatRooms();
  const perms = useMyPermissionCodes().data ?? [];
  const canBlock = perms.includes('STUDENT_BLOCK');
  const canDefer = perms.includes('STUDENT_DEFERRAL_CREATE');
  const admin = useStudentAdmin(id);

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>(initialSort ?? 'attention');
  const [opening, setOpening] = useState<string | null>(null);
  const [deferFor, setDeferFor] = useState<ClassStudentStats | null>(null);
  const q = useDeferredValue(fold(search.trim()));
  const menu = useActionSheet();
  const pull = usePullRefresh(() => detail.refetch());

  const students = useMemo(() => {
    const list = (detail.data?.students ?? []).filter((s) => !q || fold(`${s.name} ${s.email ?? ''} ${s.phone ?? ''}`).includes(q));
    const cmp: Record<Sort, (a: ClassStudentStats, b: ClassStudentStats) => number> = {
      // Ít hoàn thành nhất / nhiều bài chưa nộp nhất lên đầu
      attention: (a, b) => a.completion_rate - b.completion_rate || b.not_submitted_count - a.not_submitted_count,
      score: (a, b) => (b.average_score ?? -1) - (a.average_score ?? -1),
      name: (a, b) => a.name.localeCompare(b.name, 'vi'),
    };
    return [...list].sort(cmp[sort]);
  }, [detail.data, q, sort]);

  async function messageStudent(s: ClassStudentStats) {
    setOpening(s._id);
    try {
      const dm = await chatApi.openDirect(s._id);
      void rooms.refetch();
      router.push({ pathname: '/chat/[roomId]', params: { roomId: dm._id } });
    } catch (err) {
      showToast('error', 'Không nhắn riêng được', getErrorMessage(err));
    } finally {
      setOpening(null);
    }
  }

  const toggleBlock = (st: ClassStudentStats) => {
    const blocked = st.isActive === false;
    menu.confirm({
      title: blocked ? `Mở khoá tài khoản ${st.name}?` : `Khoá tài khoản ${st.name}?`,
      message: blocked ? 'Học viên đăng nhập và học lại được.' : 'Học viên sẽ không đăng nhập được cho tới khi mở khoá.',
      label: blocked ? 'Mở khoá' : 'Khoá',
      icon: blocked ? 'lock-open-outline' : 'lock-closed-outline',
      danger: !blocked,
      onConfirm: () =>
        admin.block.mutate(
          { userId: st._id, active: blocked },
          {
            onSuccess: () => showToast('success', blocked ? 'Đã mở khoá tài khoản' : 'Đã khoá tài khoản'),
            onError: (e) => showToast('error', 'Không thực hiện được', getErrorMessage(e)),
          },
        ),
    });
  };

  const more = (st: ClassStudentStats) => {
    const blocked = st.isActive === false;
    const actions: SheetAction[] = [];
    if (canBlock) {
      actions.push({
        label: blocked ? 'Mở khoá tài khoản' : 'Khoá tài khoản',
        icon: blocked ? 'lock-open-outline' : 'lock-closed-outline',
        danger: !blocked,
        onPress: () => toggleBlock(st),
      });
    }
    if (canDefer) actions.push({ label: 'Bảo lưu học viên', icon: 'pause-circle-outline', onPress: () => setDeferFor(st) });
    menu.show({ title: st.name, actions });
  };

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: cls?.class_code ? `Học viên · ${cls.class_code}` : 'Học viên', headerShown: true }} />
      <FlatList
        data={students}
        keyExtractor={(s) => s._id}
        extraData={`${opening}|${sort}|${canBlock}|${canDefer}`}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        renderItem={({ item }) => (
          <View className="px-4 pb-2">
            <StudentRow
              s={item}
              opening={opening === item._id}
              onMessage={() => messageStudent(item)}
              onMore={canBlock || canDefer ? () => more(item) : undefined}
            />
          </View>
        )}
        ListHeaderComponent={<Tools search={search} onSearch={setSearch} sort={sort} onSort={setSort} />}
        ListEmptyComponent={
          detail.isLoading ? (
            <LoadingView />
          ) : detail.isError ? (
            <StateView icon="cloud-offline-outline" title="Không tải được danh sách" actionLabel="Thử lại" onAction={() => detail.refetch()} />
          ) : (
            <StateView icon="people-outline" title={search ? 'Không tìm thấy học viên' : 'Lớp chưa có học viên'} />
          )
        }
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 28, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}
      />
      {menu.sheet}
      {deferFor ? (
        <DeferSheet
          student={deferFor}
          saving={admin.defer.isPending}
          onClose={() => setDeferFor(null)}
          onSave={(months, reason) =>
            admin.defer.mutate(
              { userId: deferFor._id, months, reason },
              {
                onSuccess: () => {
                  setDeferFor(null);
                  showToast('success', 'Đã tạo bảo lưu', `${deferFor.name} được bảo lưu ${months} tháng.`);
                },
                onError: (e) => showToast('error', 'Không tạo được bảo lưu', getErrorMessage(e)),
              },
            )
          }
        />
      ) : null}
    </View>
  );
}

/** Ô tìm + chip sắp xếp, nằm ngay đầu danh sách. */
function Tools({ search, onSearch, sort, onSort }: { search: string; onSearch: (v: string) => void; sort: Sort; onSort: (v: Sort) => void }) {
  const muted = useThemeColor('muted');
  return (
    <View className="gap-2.5 px-4 pb-3">
      <View className="h-11 flex-row items-center gap-2 rounded-full bg-surface-muted px-4">
        <Ionicons name="search" size={17} color={muted} />
        <TextInput
          value={search}
          onChangeText={onSearch}
          placeholder="Tìm học viên…"
          placeholderTextColor={muted}
          autoCorrect={false}
          className="flex-1 text-[15px] text-foreground"
        />
        {search ? (
          <Pressable hitSlop={8} onPress={() => onSearch('')}>
            <Ionicons name="close-circle" size={18} color={muted} />
          </Pressable>
        ) : null}
      </View>
      <View className="flex-row flex-wrap gap-2">
        {SORTS.map((s) => (
          <Pressable
            key={s.value}
            onPress={() => onSort(s.value)}
            className={`h-8 justify-center rounded-full border px-3.5 ${sort === s.value ? 'border-brand bg-brand-soft' : 'border-border bg-surface'}`}>
            <Text className={`text-[13px] font-semibold ${sort === s.value ? 'text-brand' : 'text-muted'}`}>{s.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** Bảo lưu: chọn số tháng (tính từ hôm nay) + lý do — cùng dữ liệu gửi đi như hộp thoại của web. */
function DeferSheet({
  student,
  saving,
  onClose,
  onSave,
}: {
  student: ClassStudentStats;
  saving: boolean;
  onClose: () => void;
  onSave: (months: number, reason: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const muted = useThemeColor('muted');
  const [months, setMonths] = useState(3);
  const [reason, setReason] = useState('');
  const [today] = useState(() => new Date());
  const end = new Date(today);
  end.setMonth(end.getMonth() + months);
  const ok = !!reason.trim() && !saving;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 justify-end bg-black/45">
        <Pressable className="absolute inset-0" onPress={onClose} />
        <View className="gap-3.5 rounded-t-3xl bg-surface px-5 pt-3" style={{ paddingBottom: insets.bottom + 16 }}>
          <View className="h-1 w-10 self-center rounded-full bg-border" />
          <View>
            <Text className="text-[18px] font-extrabold text-foreground">Bảo lưu học viên</Text>
            <Text className="text-[13.5px] text-muted">{student.name}</Text>
          </View>
          <Text className="text-[13px] font-semibold text-muted">Thời gian bảo lưu</Text>
          <View className="flex-row gap-2">
            {[1, 2, 3, 6, 12].map((m) => (
              <Pressable
                key={m}
                onPress={() => setMonths(m)}
                className={`h-10 flex-1 items-center justify-center rounded-xl ${months === m ? 'bg-brand' : 'bg-surface-muted'}`}>
                <Text className={`text-[13.5px] font-bold ${months === m ? 'text-white' : 'text-foreground'}`}>{m} th</Text>
              </Pressable>
            ))}
          </View>
          <Text className="text-[12.5px] text-muted">
            Từ hôm nay đến {end.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
          </Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="Lý do bảo lưu (bắt buộc)"
            placeholderTextColor={muted}
            multiline
            textAlignVertical="top"
            className="min-h-[84px] rounded-2xl border border-border bg-background p-3.5 text-[15px] text-foreground"
          />
          <Pressable
            onPress={() => ok && onSave(months, reason.trim())}
            disabled={!ok}
            className={`h-12 items-center justify-center rounded-2xl ${ok ? 'bg-brand active:opacity-85' : 'bg-surface-muted'}`}>
            <Text className={`text-[15px] font-bold ${ok ? 'text-white' : 'text-muted'}`}>{saving ? 'Đang lưu…' : 'Xác nhận bảo lưu'}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
