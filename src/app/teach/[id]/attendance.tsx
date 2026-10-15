import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showToast } from '@/components/ui/toast';
import { useActionSheet } from '@/components/ui/action-sheet';
import { LoadingView, StateView } from '@/components/ui/state-view';
import { SessionCard } from '@/features/classes/session-card';
import {
  sessionTitle,
  useAbsenceReasons,
  useClassSessions,
  useSessionAdmin,
  useTeacherOptions,
  useZoomKeys,
  zoomKeyLabel,
  type AbsenceReasonItem,
  type ClassSessionItem,
  type SessionForm,
} from '@/features/classes/sessions-api';
import { useStaffClasses, type StaffClassItem } from '@/features/classes/staff-api';
import { getErrorMessage } from '@/lib/api/client';
import { formatDate, formatTime } from '@/lib/format';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

/**
 * Điểm danh của lớp (nhân sự) — làm NGAY TRONG APP như tab Điểm danh của web (AttendanceTab):
 * mở buổi → đổi Có mặt ⇄ Vắng từng người, ghi lý do vắng; nút + tạo buổi mới (ngày giờ, nội dung,
 * phòng Zoom, giáo viên); "Sửa / xoá buổi" trong từng buổi. Hiện cả buổi sắp diễn ra.
 */
export default function ClassAttendanceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const brand = useThemeColor('brand');
  const fg = useThemeColor('foreground');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const menu = useActionSheet();
  const [form, setForm] = useState<{ session?: ClassSessionItem } | null>(null);
  const [reasonEdit, setReasonEdit] = useState<{ sessionId: string; userId: string; name: string; current?: AbsenceReasonItem } | null>(null);

  const classes = useStaffClasses();
  const cls = classes.data?.find((c) => c._id === id);
  const sessions = useClassSessions(id, true, true);
  const reasons = useAbsenceReasons(id);
  const admin = useSessionAdmin(id);
  const items = sessions.data ?? [];
  const pull = usePullRefresh(() => Promise.all([sessions.refetch(), reasons.refetch()]));

  const setPresent = (sessionId: string, userId: string, present: boolean) =>
    admin.toggle.mutate(
      { sessionId, userId, isPresent: present },
      { onError: (e) => showToast('error', 'Chưa cập nhật được điểm danh', getErrorMessage(e)) },
    );

  const sessionMenu = (s: ClassSessionItem, n: number) => {
    const title = sessionTitle(s, n);
    const del = () =>
      menu.confirm({
        title: `Xoá ${title}?`,
        message: 'Dữ liệu điểm danh của buổi này cũng bị xoá. Không hoàn tác được.',
        label: 'Xoá',
        icon: 'trash-outline',
        onConfirm: () => admin.remove.mutate(s._id, { onError: (e) => showToast('error', 'Không xoá được', getErrorMessage(e)) }),
      });
    menu.show({
      title,
      actions: [
        { label: 'Sửa thông tin buổi', icon: 'create-outline', onPress: () => setForm({ session: s }) },
        { label: 'Xoá buổi học', icon: 'trash-outline', danger: true, onPress: del },
      ],
    });
  };

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: cls?.class_code ? `Điểm danh · ${cls.class_code}` : 'Điểm danh',
          headerShown: true,
          headerRight: () => (
            <Pressable onPress={() => setForm({})} hitSlop={10} accessibilityLabel="Tạo buổi học" className="active:opacity-60">
              <Ionicons name="add-circle-outline" size={25} color={fg} />
            </Pressable>
          ),
        }}
      />
      <FlatList
        data={items}
        keyExtractor={(s) => s._id}
        extraData={[expandedId, reasons.data]}
        renderItem={({ item, index }) => (
          <View className="px-4 pb-2.5">
            <SessionCard
              session={item}
              fallbackNumber={items.length - index}
              expanded={expandedId === item._id}
              onToggle={() => setExpandedId((c) => (c === item._id ? null : item._id))}
              admin={{
                reasons: reasons.data,
                onSetPresent: (userId, present) => setPresent(item._id, userId, present),
                onReason: (userId, name, current) => setReasonEdit({ sessionId: item._id, userId, name, current }),
                onMenu: () => sessionMenu(item, items.length - index),
              }}
            />
          </View>
        )}
        ListHeaderComponent={
          items.length ? (
            <Text className="px-5 pb-2 text-[12.5px] text-muted">
              Bấm vào buổi để điểm danh: <Text className="font-semibold text-danger">Đánh vắng</Text> /{' '}
              <Text className="font-semibold text-success">Có mặt</Text> từng học viên.
            </Text>
          ) : null
        }
        ListEmptyComponent={
          sessions.isLoading ? (
            <LoadingView />
          ) : sessions.isError ? (
            <StateView icon="cloud-offline-outline" title="Không tải được buổi học" actionLabel="Thử lại" onAction={() => sessions.refetch()} />
          ) : (
            <StateView
              icon="calendar-outline"
              title="Chưa có buổi học nào"
              description="Tạo buổi học để cấu hình Zoom và điểm danh."
              actionLabel="Tạo buổi học"
              onAction={() => setForm({})}
            />
          )
        }
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 28, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}
      />

      {menu.sheet}
      {form ? <SessionFormSheet cls={cls} session={form.session} classId={id} onClose={() => setForm(null)} /> : null}
      {reasonEdit ? (
        <ReasonSheet
          name={reasonEdit.name}
          initial={reasonEdit.current?.reason ?? ''}
          saving={admin.reason.isPending}
          onClose={() => setReasonEdit(null)}
          onSave={(text) =>
            admin.reason.mutate(
              { id: reasonEdit.current?._id, sessionId: reasonEdit.sessionId, userId: reasonEdit.userId, reason: text },
              { onSuccess: () => setReasonEdit(null), onError: (e) => showToast('error', 'Chưa lưu được', getErrorMessage(e)) },
            )
          }
        />
      ) : null}
    </View>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 justify-end bg-black/45">
        <Pressable className="absolute inset-0" onPress={onClose} />
        <View className="max-h-[90%] rounded-t-3xl bg-surface pt-3" style={{ paddingBottom: insets.bottom + 12 }}>
          <View className="h-1 w-10 self-center rounded-full bg-border" />
          <Text className="px-5 pb-1 pt-3 text-[18px] font-extrabold text-foreground">{title}</Text>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ReasonSheet({
  name,
  initial,
  saving,
  onClose,
  onSave,
}: {
  name: string;
  initial: string;
  saving: boolean;
  onClose: () => void;
  onSave: (text: string) => void;
}) {
  const muted = useThemeColor('muted');
  const [text, setText] = useState(initial);
  return (
    <Sheet title="Lý do vắng" onClose={onClose}>
      <View className="gap-3 px-5 pt-1">
        <Text className="text-[13.5px] text-muted">{name}</Text>
        <TextInput
          value={text}
          onChangeText={setText}
          autoFocus
          placeholder="Vd: Ốm, có việc gia đình, đi công tác…"
          placeholderTextColor={muted}
          multiline
          textAlignVertical="top"
          className="min-h-[90px] rounded-2xl border border-border bg-background p-3.5 text-[15px] text-foreground"
        />
        <SaveButton label="Lưu lý do" disabled={!text.trim() || text.trim() === initial.trim()} saving={saving} onPress={() => onSave(text.trim())} />
      </View>
    </Sheet>
  );
}

function SaveButton({ label, disabled, saving, onPress }: { label: string; disabled?: boolean; saving?: boolean; onPress: () => void }) {
  const off = disabled || saving;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      className={`h-12 flex-row items-center justify-center gap-2 rounded-2xl ${off ? 'bg-surface-muted' : 'bg-brand active:opacity-85'}`}>
      <Ionicons name="checkmark" size={18} color={off ? '#9ca3af' : '#fff'} />
      <Text className={`text-[15px] font-bold ${off ? 'text-muted' : 'text-white'}`}>{saving ? 'Đang lưu…' : label}</Text>
    </Pressable>
  );
}

const idOf = (v: unknown) => (typeof v === 'object' && v ? ((v as { _id?: string })._id ?? '') : ((v as string) ?? ''));

/**
 * Tạo / sửa buổi học (POST /classes/:id/sessions, PATCH /classes/sessions/:id/metadata) — các ô như hộp
 * thoại "Cấu hình buổi học" của web. Buổi mới lấy sẵn phòng Zoom + giáo viên của lớp.
 */
function SessionFormSheet({
  cls,
  session,
  classId,
  onClose,
}: {
  cls?: StaffClassItem;
  session?: ClassSessionItem;
  classId: string;
  onClose: () => void;
}) {
  const admin = useSessionAdmin(classId);
  const teachers = useTeacherOptions(true);
  const zoomKeys = useZoomKeys(true);
  const [date, setDate] = useState(() => {
    if (session?.date) return new Date(session.date);
    const d = new Date();
    d.setMinutes(0, 0, 0);
    return d;
  });
  const [iosPicker, setIosPicker] = useState(false);
  const [topic, setTopic] = useState(session?.topic ?? '');
  const [meetingId, setMeetingId] = useState(session?.zoom_meeting_id ?? cls?.zoom_id ?? '');
  const [pass, setPass] = useState(session?.zoom_pass ?? cls?.zoom_pass ?? '');
  const [joinUrl, setJoinUrl] = useState(session?.zoom_join_url ?? '');
  const [teacherId, setTeacherId] = useState(idOf(session?.teacher_id) || cls?.teacher?._id || '');
  const [zoomKeyId, setZoomKeyId] = useState(idOf(session?.zoom_key_id) || cls?.zoom_key_id || '');

  const pickDate = () => {
    if (Platform.OS === 'ios') return setIosPicker((v) => !v);
    // Android: chọn ngày rồi chọn giờ (2 hộp thoại hệ thống)
    DateTimePickerAndroid.open({
      value: date,
      mode: 'date',
      onChange: (e, d) => {
        if (e.type !== 'set' || !d) return;
        DateTimePickerAndroid.open({
          value: d,
          mode: 'time',
          is24Hour: true,
          onChange: (e2, t) => e2.type === 'set' && t && setDate(t),
        });
      },
    });
  };

  const save = () => {
    if (!meetingId.trim()) return showToast('warning', 'Thiếu ID phòng Zoom', 'Nhập Meeting ID của phòng Zoom cho buổi học.');
    const data: SessionForm = {
      date: date.toISOString(),
      topic: topic.trim() || undefined,
      zoom_meeting_id: meetingId.trim().replace(/\s+/g, ''),
      zoom_pass: pass.trim() || undefined,
      zoom_join_url: joinUrl.trim() || undefined,
      teacher_id: teacherId || undefined,
      zoom_key_id: zoomKeyId || undefined,
    };
    admin.save.mutate(
      { sessionId: session?._id, data },
      { onSuccess: onClose, onError: (e) => showToast('error', session ? 'Chưa lưu được' : 'Chưa tạo được buổi học', getErrorMessage(e)) },
    );
  };

  return (
    <Sheet title={session ? 'Sửa buổi học' : 'Tạo buổi học'} onClose={onClose}>
      <ScrollView contentContainerClassName="gap-3.5 px-5 pb-2 pt-2" keyboardShouldPersistTaps="handled">
        <Field label="Ngày giờ học">
          <Pressable onPress={pickDate} className="h-12 flex-row items-center gap-2.5 rounded-2xl border border-border bg-background px-4 active:opacity-80">
            <Ionicons name="calendar-outline" size={18} color="#6b7280" />
            <Text className="flex-1 text-[15px] font-semibold text-foreground">
              {formatDate(date)} · {formatTime(date)}
            </Text>
            <Ionicons name="chevron-down" size={16} color="#9ca3af" />
          </Pressable>
          {Platform.OS === 'ios' && iosPicker ? (
            <DateTimePicker value={date} mode="datetime" display="inline" onChange={(_e: DateTimePickerEvent, d?: Date) => d && setDate(d)} />
          ) : null}
        </Field>
        <Field label="Nội dung buổi học">
          <Input value={topic} onChange={setTopic} placeholder="Vd: Unit 5 – Phát âm âm cuối" />
        </Field>
        <View className="flex-row gap-2.5">
          <View className="flex-1">
            <Field label="Meeting ID Zoom *">
              <Input value={meetingId} onChange={setMeetingId} placeholder="123 456 7890" keyboard="number-pad" />
            </Field>
          </View>
          <View className="flex-1">
            <Field label="Mật khẩu">
              <Input value={pass} onChange={setPass} placeholder="Passcode" />
            </Field>
          </View>
        </View>
        <Field label="Link vào phòng (tuỳ chọn)">
          <Input value={joinUrl} onChange={setJoinUrl} placeholder="https://zoom.us/j/…" keyboard="url" />
        </Field>
        <Field label="Giáo viên dạy buổi này">
          <ChipPicker
            loading={teachers.isLoading}
            value={teacherId}
            onChange={setTeacherId}
            options={(teachers.data ?? []).map((t) => ({ value: t.id, label: t.name }))}
            extra={cls?.teacher?._id ? { value: cls.teacher._id, label: cls.teacher.name } : undefined}
          />
        </Field>
        <Field label="Tài khoản Zoom">
          <ChipPicker
            loading={zoomKeys.isLoading}
            value={zoomKeyId}
            onChange={setZoomKeyId}
            options={(zoomKeys.data ?? []).map((k) => ({ value: k._id, label: zoomKeyLabel(k) }))}
          />
        </Field>
        <SaveButton label={session ? 'Lưu thay đổi' : 'Tạo buổi học'} saving={admin.save.isPending} onPress={save} />
      </ScrollView>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="gap-1.5">
      <Text className="text-[13px] font-semibold text-muted">{label}</Text>
      {children}
    </View>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  keyboard,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboard?: 'number-pad' | 'url';
}) {
  const muted = useThemeColor('muted');
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={muted}
      keyboardType={keyboard ?? 'default'}
      autoCapitalize={keyboard ? 'none' : 'sentences'}
      className="h-12 rounded-2xl border border-border bg-background px-4 text-[15px] text-foreground"
    />
  );
}

/** Chọn 1 trong danh sách bằng chip cuộn ngang (danh sách giáo viên / tài khoản Zoom ngắn). */
function ChipPicker({
  value,
  onChange,
  options,
  extra,
  loading,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  extra?: { value: string; label: string };
  loading?: boolean;
}) {
  const list = extra && !options.some((o) => o.value === extra.value) ? [extra, ...options] : options;
  if (loading) return <Text className="text-[13px] text-muted">Đang tải…</Text>;
  if (!list.length) return <Text className="text-[13px] text-muted">Không có lựa chọn</Text>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
      {list.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(on ? '' : o.value)}
            className={`h-9 flex-row items-center gap-1.5 rounded-full px-3.5 ${on ? 'bg-brand' : 'bg-surface-muted'}`}>
            {on ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
            <Text className={`text-[13px] font-semibold ${on ? 'text-white' : 'text-foreground'}`} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
