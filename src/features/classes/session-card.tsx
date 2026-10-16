import { Ionicons } from '@expo/vector-icons';
import { memo, useMemo, useState, type ReactNode } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { formatDate, formatTime } from '@/lib/format';
import { useThemeColor } from '@/theme/use-theme-color';

import {
  absentList,
  participantUserId,
  type AbsenceReasonItem,
  formatDuration,
  groupParticipants,
  ROLE_LABEL,
  sessionBadge,
  sessionTitle,
  type ClassSessionItem,
  type GroupedParticipant,
} from './sessions-api';

/**
 * Một buổi học trong tab Điểm danh của lớp dạy. Bấm để mở danh sách:
 * có mặt → vắng → người lạ vào phòng (giống 3 tab con của web, gộp lại cho vừa điện thoại).
 * Có `admin` (nhân sự) thì mỗi người có nút đổi Có mặt ⇄ Vắng, người vắng có lý do vắng (bấm để sửa),
 * và nút ⋯ sửa / xoá buổi — học viên xem thì không có `admin`.
 */
export interface SessionAdmin {
  reasons?: Map<string, AbsenceReasonItem>;
  onSetPresent: (userId: string, present: boolean) => void;
  onReason: (userId: string, name: string, current?: AbsenceReasonItem) => void;
  /** Không truyền = ẩn "Sửa / xoá buổi" (vd xem theo nhóm — buổi học là của cả lớp) */
  onMenu?: () => void;
}

export const SessionCard = memo(function SessionCard({
  session,
  fallbackNumber,
  expanded,
  onToggle,
  admin,
}: {
  session: ClassSessionItem;
  fallbackNumber: number;
  expanded: boolean;
  onToggle: () => void;
  admin?: SessionAdmin;
}) {
  const muted = useThemeColor('muted');
  const zoom = useThemeColor('zoom');

  const view = useMemo(() => {
    const grouped = groupParticipants(session.participants ?? []);
    return {
      present: grouped.present,
      absent: absentList(session, grouped.markedAbsent),
      strangers: [...grouped.outside, ...grouped.notInCrm],
    };
  }, [session]);

  const teacherName = typeof session.teacher_id === 'object' ? session.teacher_id?.name : undefined;
  const [now] = useState(() => Date.now());
  // Chưa xếp ngày hoặc chưa tới giờ → chưa có điểm danh, đừng hiện "54 vắng"
  const upcoming = !session.date || new Date(session.date).getTime() > now;

  return (
    <View className="overflow-hidden rounded-3xl bg-surface">
      <Pressable onPress={onToggle} className="flex-row items-center gap-3 p-3.5 active:bg-surface-muted">
        <View className="h-10 w-10 items-center justify-center rounded-xl bg-brand-soft">
          <Text className="text-sm font-extrabold text-brand">{sessionBadge(session, fallbackNumber)}</Text>
        </View>
        <View className="flex-1 gap-0.5">
          <Text className="text-[15px] font-bold text-foreground" numberOfLines={1}>
            {sessionTitle(session, fallbackNumber)}
          </Text>
          <Text className="text-xs text-muted" numberOfLines={1}>
            {session.date ? `${formatDate(session.date)} · ${formatTime(session.date)}` : 'Chưa xếp ngày'}
            {teacherName ? ` · GV ${teacherName}` : ''}
          </Text>
        </View>
        <View className="items-end gap-1">
          {upcoming ? (
            <View className="rounded-full bg-info-soft px-2 py-0.5">
              <Text className="text-[11px] font-bold text-info">{session.date ? 'Sắp diễn ra' : 'Chưa diễn ra'}</Text>
            </View>
          ) : (
            <View className="flex-row gap-1">
              <Count icon="checkmark-circle" value={view.present.length} tone="success" />
              {view.absent.length ? <Count icon="close-circle" value={view.absent.length} tone="danger" /> : null}
              {view.strangers.length ? <Count icon="help-circle" value={view.strangers.length} tone="warning" /> : null}
            </View>
          )}
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={muted} />
        </View>
      </Pressable>

      {expanded ? (
        <View className="gap-3 border-t border-border p-3.5">
          {session.topic ? (
            <Text className="text-[13px] text-muted" numberOfLines={3}>
              Nội dung: <Text className="text-foreground">{session.topic}</Text>
            </Text>
          ) : null}

          <View className="flex-row flex-wrap gap-2">
            {session.zoom_join_url ? (
              <Pressable
                onPress={() => Linking.openURL(session.zoom_join_url!)}
                className="flex-row items-center gap-2 rounded-xl bg-surface-muted px-3 py-2 active:opacity-70">
                <Ionicons name="videocam" size={16} color={zoom} />
                <Text className="text-[13px] font-semibold text-foreground">Mở link Zoom</Text>
              </Pressable>
            ) : null}
            {admin?.onMenu ? (
              <Pressable
                onPress={admin.onMenu}
                className="flex-row items-center gap-2 rounded-xl bg-surface-muted px-3 py-2 active:opacity-70">
                <Ionicons name="settings-outline" size={15} color={muted} />
                <Text className="text-[13px] font-semibold text-foreground">Sửa / xoá buổi</Text>
              </Pressable>
            ) : null}
          </View>

          <Group title="Có mặt" tone="text-success" count={view.present.length}>
            {view.present.map((p, i) => {
              const uid = participantUserId(p);
              return (
                <PersonRow
                  key={`${p.email ?? p.name}-${i}`}
                  person={p}
                  action={admin && uid ? <MarkButton present onPress={() => admin.onSetPresent(uid, false)} /> : null}
                />
              );
            })}
          </Group>

          {view.absent.length ? (
            <Group title="Vắng" tone="text-danger" count={view.absent.length}>
              {view.absent.map((s) => {
                const reason = admin?.reasons?.get(`${session._id}:${s._id}`);
                return (
                  <View key={s._id} className="gap-1.5">
                    <View className="flex-row items-center gap-2.5">
                      <Avatar name={s.name} size={30} />
                      <View className="flex-1">
                        <Text className="text-[13px] font-medium text-foreground" numberOfLines={1}>
                          {s.name}
                        </Text>
                        <Text className="text-[11px] text-muted" numberOfLines={1}>
                          {[s.group_name, s.phone || s.email].filter(Boolean).join(' · ') || '—'}
                        </Text>
                      </View>
                      {admin ? <MarkButton present={false} onPress={() => admin.onSetPresent(s._id, true)} /> : null}
                    </View>
                    {admin ? (
                      <Pressable
                        onPress={() => admin.onReason(s._id, s.name, reason)}
                        className="ml-10 flex-row items-center gap-1.5 self-start rounded-lg bg-surface-muted px-2.5 py-1.5 active:opacity-70">
                        <Ionicons name={reason ? 'chatbox-ellipses' : 'add'} size={13} color={muted} />
                        <Text className={`text-[12px] ${reason ? 'text-foreground' : 'text-muted'}`} numberOfLines={2}>
                          {reason ? `Lý do: ${reason.reason}` : 'Thêm lý do vắng'}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                );
              })}
            </Group>
          ) : null}

          {view.strangers.length ? (
            <Group title="Không thuộc lớp" tone="text-warning" count={view.strangers.length}>
              {view.strangers.map((p, i) => (
                <PersonRow key={`${p.email ?? p.name}-stranger-${i}`} person={p} />
              ))}
            </Group>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

function Count({
  icon,
  value,
  tone,
}: {
  icon: 'checkmark-circle' | 'close-circle' | 'help-circle';
  value: number;
  tone: 'success' | 'danger' | 'warning';
}) {
  const color = useThemeColor(tone);
  const box = tone === 'success' ? 'bg-success-soft' : tone === 'danger' ? 'bg-danger-soft' : 'bg-warning-soft';
  const text = tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : 'text-warning';
  return (
    <View className={`flex-row items-center gap-1 rounded-full px-1.5 py-0.5 ${box}`}>
      <Ionicons name={icon} size={11} color={color} />
      <Text className={`text-[11px] font-bold ${text}`}>{value}</Text>
    </View>
  );
}

function Group({ title, tone, count, children }: { title: string; tone: string; count: number; children: ReactNode }) {
  return (
    <View className="gap-2">
      <Text className={`text-xs font-bold uppercase tracking-wide ${tone}`}>
        {title} · {count}
      </Text>
      {count ? children : <Text className="text-[13px] text-muted">Không có</Text>}
    </View>
  );
}

/** Nút đổi trạng thái: đang có mặt → "Đánh vắng", đang vắng → "Có mặt". */
function MarkButton({ present, onPress }: { present: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      className={`rounded-full px-2.5 py-1 active:opacity-70 ${present ? 'bg-danger-soft' : 'bg-success-soft'}`}>
      <Text className={`text-[11.5px] font-bold ${present ? 'text-danger' : 'text-success'}`}>{present ? 'Đánh vắng' : 'Có mặt'}</Text>
    </Pressable>
  );
}

function PersonRow({ person, action }: { person: GroupedParticipant; action?: ReactNode }) {
  const role = person.attendance_role_label || ROLE_LABEL[person.attendance_role ?? ''] || '';
  return (
    <View className="flex-row items-center gap-2.5">
      <Avatar name={person.name} size={30} />
      <View className="flex-1">
        <Text className="text-[13px] font-medium text-foreground" numberOfLines={1}>
          {person.name}
        </Text>
        <Text className="text-[11px] text-muted" numberOfLines={1}>
          {[person.group_name, role].filter(Boolean).join(' · ') || person.email || '—'}
        </Text>
      </View>
      <Text className="text-[11px] font-semibold text-muted">{formatDuration(person.total_duration)}</Text>
      {action}
    </View>
  );
}
