import { Ionicons } from '@expo/vector-icons';
import { memo, useMemo, type ReactNode } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { formatDate, formatTime } from '@/lib/format';
import { useThemeColor } from '@/theme/use-theme-color';

import {
  absentList,
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
 * Chỉ xem — sửa điểm danh vẫn làm trên web.
 */
export const SessionCard = memo(function SessionCard({
  session,
  fallbackNumber,
  expanded,
  onToggle,
}: {
  session: ClassSessionItem;
  fallbackNumber: number;
  expanded: boolean;
  onToggle: () => void;
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

  return (
    <View className="overflow-hidden rounded-2xl border border-border bg-surface">
      <Pressable onPress={onToggle} className="flex-row items-center gap-3 p-3.5 active:bg-surface-muted">
        <View className="h-10 w-10 items-center justify-center rounded-xl bg-brand-soft">
          <Text className="text-sm font-extrabold text-brand">{sessionBadge(session, fallbackNumber)}</Text>
        </View>
        <View className="flex-1 gap-0.5">
          <Text className="text-[15px] font-bold text-foreground" numberOfLines={1}>
            {sessionTitle(session, fallbackNumber)}
          </Text>
          <Text className="text-xs text-muted" numberOfLines={1}>
            {formatDate(session.date)} · {formatTime(session.date)}
            {teacherName ? ` · GV ${teacherName}` : ''}
          </Text>
        </View>
        <View className="items-end gap-1">
          <View className="flex-row gap-1">
            <Count icon="checkmark-circle" value={view.present.length} tone="success" />
            {view.absent.length ? <Count icon="close-circle" value={view.absent.length} tone="danger" /> : null}
            {view.strangers.length ? <Count icon="help-circle" value={view.strangers.length} tone="warning" /> : null}
          </View>
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

          {session.zoom_join_url ? (
            <Pressable
              onPress={() => Linking.openURL(session.zoom_join_url!)}
              className="flex-row items-center gap-2 self-start rounded-xl bg-surface-muted px-3 py-2 active:opacity-70">
              <Ionicons name="videocam" size={16} color={zoom} />
              <Text className="text-[13px] font-semibold text-foreground">Mở link Zoom</Text>
            </Pressable>
          ) : null}

          <Group title="Có mặt" tone="text-success" count={view.present.length}>
            {view.present.map((p, i) => (
              <PersonRow key={`${p.email ?? p.name}-${i}`} person={p} />
            ))}
          </Group>

          {view.absent.length ? (
            <Group title="Vắng" tone="text-danger" count={view.absent.length}>
              {view.absent.map((s) => (
                <View key={s._id} className="flex-row items-center gap-2.5">
                  <Avatar name={s.name} size={30} />
                  <View className="flex-1">
                    <Text className="text-[13px] font-medium text-foreground" numberOfLines={1}>
                      {s.name}
                    </Text>
                    <Text className="text-[11px] text-muted" numberOfLines={1}>
                      {[s.group_name, s.phone || s.email].filter(Boolean).join(' · ') || '—'}
                    </Text>
                  </View>
                </View>
              ))}
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

function Count({ icon, value, tone }: { icon: 'checkmark-circle' | 'close-circle' | 'help-circle'; value: number; tone: 'success' | 'danger' | 'warning' }) {
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

function PersonRow({ person }: { person: GroupedParticipant }) {
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
    </View>
  );
}
