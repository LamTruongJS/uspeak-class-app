import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Segmented } from '@/components/ui/segmented';
import { LoadingView } from '@/components/ui/state-view';
import { useClassSessions, type ClassSessionItem } from '@/features/classes/sessions-api';
import { useStaffClassDetail, useStaffClasses, type ClassStudentStats } from '@/features/classes/staff-api';
import { formatDate } from '@/lib/format';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

type Tab = 'risk' | 'missing' | 'absent';
type Risk = 'high' | 'medium' | 'low';

/** Mức cần lưu tâm — luật y như ReportsTab web (getRiskLevel). */
const riskOf = (absent: number, missing: number): Risk =>
  absent >= 3 || missing >= 5 ? 'high' : absent >= 2 || missing >= 3 ? 'medium' : 'low';
const RISK_VIEW: Record<Risk, { label: string; box: string; text: string }> = {
  high: { label: 'Cao', box: 'bg-danger-soft', text: 'text-danger' },
  medium: { label: 'Trung bình', box: 'bg-warning-soft', text: 'text-warning' },
  low: { label: 'Thấp', box: 'bg-info-soft', text: 'text-info' },
};

/**
 * Báo cáo lớp (ReportsTab web, bản điện thoại): tổng quan + 3 danh sách — học viên cần lưu tâm (vắng / thiếu
 * bài), bài tập bị thiếu nhiều nhất, vắng theo buổi. Bấm 1 dòng để mở chi tiết. Số liệu tính trên máy từ
 * GET /classes/:id/detail (missing_assignments) + buổi học đã diễn ra.
 */
export default function ClassReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const brand = useThemeColor('brand');
  const cls = useStaffClasses().data?.find((c) => c._id === id);
  const detail = useStaffClassDetail(id);
  const sessions = useClassSessions(id, true);
  const pull = usePullRefresh(() => Promise.all([detail.refetch(), sessions.refetch()]));
  const [tab, setTab] = useState<Tab>('risk');
  const [open, setOpen] = useState<string | null>(null);

  const students = useMemo(() => detail.data?.students ?? [], [detail.data]);
  const stats = detail.data?.stats;

  const bySession = useMemo(
    () =>
      [...(sessions.data ?? [])]
        .sort((a, b) => new Date(a.date ?? 0).getTime() - new Date(b.date ?? 0).getTime())
        .map((s: ClassSessionItem, i) => {
          const absent = (s.absent_students ?? []).filter((a) => a.is_present !== true);
          const present = s.participants?.length ?? 0;
          return {
            id: s._id,
            label: `Buổi ${i + 1}`,
            topic: s.topic,
            date: s.date ?? null,
            absent,
            total: s.stats?.enrolled || present + absent.length,
          };
        }),
    [sessions.data],
  );

  const absentByStudent = useMemo(() => {
    const m = new Map<string, { label: string; date: string | null }[]>();
    bySession.forEach((s) => s.absent.forEach((a) => m.set(a._id, [...(m.get(a._id) ?? []), { label: s.label, date: s.date }])));
    return m;
  }, [bySession]);

  const atRisk = useMemo(
    () =>
      students
        .map((s) => {
          const absent = absentByStudent.get(s._id) ?? [];
          const missing = s.missing_assignments ?? [];
          return { s, absent, missing, risk: riskOf(absent.length, missing.length) };
        })
        .filter((x) => x.absent.length || x.missing.length)
        .sort(
          (a, b) =>
            ({ high: 0, medium: 1, low: 2 })[a.risk] - { high: 0, medium: 1, low: 2 }[b.risk] ||
            b.missing.length + b.absent.length - (a.missing.length + a.absent.length),
        ),
    [students, absentByStudent],
  );

  const missingByAssignment = useMemo(() => {
    const m = new Map<string, { title: string; deadline: string | null; students: ClassStudentStats[] }>();
    students.forEach((s) =>
      (s.missing_assignments ?? []).forEach((a) => {
        const cur = m.get(a._id) ?? { title: a.title, deadline: a.submission_deadline, students: [] };
        cur.students.push(s);
        m.set(a._id, cur);
      }),
    );
    return [...m.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.students.length - a.students.length);
  }, [students]);

  const attendRate = useMemo(() => {
    const rows = bySession.filter((s) => s.total > 0);
    if (!rows.length) return null;
    return Math.round((rows.reduce((sum, s) => sum + (s.total - s.absent.length) / s.total, 0) / rows.length) * 100);
  }, [bySession]);

  if (detail.isLoading) {
    return (
      <View className="flex-1 bg-background">
        <Stack.Screen options={{ title: 'Báo cáo lớp', headerShown: true }} />
        <LoadingView />
      </View>
    );
  }

  const toggle = (k: string) => setOpen((c) => (c === k ? null : k));

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: cls?.class_code ? `Báo cáo · ${cls.class_code}` : 'Báo cáo lớp', headerShown: true }} />
      <ScrollView
        contentContainerClassName="gap-3 p-4 pb-10"
        refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}>
        <View className="flex-row flex-wrap justify-between gap-y-2">
          <Tile icon="people" color="#2563eb" value={String(stats?.total_students ?? students.length)} label="Học viên" />
          <Tile icon="document-text" color="#7c3aed" value={String(stats?.total_assignments ?? 0)} label="Bài tập" />
          <Tile icon="cloud-upload" color="#059669" value={`${Math.round(stats?.completion_rate ?? 0)}%`} label="Tỉ lệ nộp bài" />
          <Tile
            icon="calendar"
            color="#d97706"
            value={attendRate === null ? '—' : `${attendRate}%`}
            label={`Đi học TB · ${bySession.length} buổi`}
          />
        </View>

        <Segmented<Tab>
          items={[
            { value: 'risk', label: 'Cần lưu tâm', count: atRisk.length },
            { value: 'missing', label: 'Thiếu bài', count: missingByAssignment.length },
            { value: 'absent', label: 'Vắng học', count: bySession.filter((s) => s.absent.length).length },
          ]}
          value={tab}
          onChange={(v) => {
            setTab(v);
            setOpen(null);
          }}
        />

        {tab === 'risk' ? (
          atRisk.length ? (
            atRisk.map(({ s, absent, missing, risk }) => (
              <Row
                key={s._id}
                open={open === s._id}
                onPress={() => toggle(s._id)}
                head={
                  <>
                    <Avatar name={s.name} size={38} />
                    <View className="flex-1">
                      <Text className="text-[14.5px] font-bold text-foreground" numberOfLines={1}>
                        {s.name}
                      </Text>
                      <Text className="text-[12.5px] text-muted">
                        {[absent.length ? `Vắng ${absent.length} buổi` : null, missing.length ? `Thiếu ${missing.length} bài` : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>
                    <View className={`rounded-full px-2 py-0.5 ${RISK_VIEW[risk].box}`}>
                      <Text className={`text-[11px] font-bold ${RISK_VIEW[risk].text}`}>{RISK_VIEW[risk].label}</Text>
                    </View>
                  </>
                }>
                {s.phone ? (
                  <Text className="text-[13px] font-semibold text-brand" onPress={() => void Linking.openURL(`tel:${s.phone}`)}>
                    Gọi {s.phone}
                  </Text>
                ) : null}
                {absent.length ? (
                  <Detail title="Vắng buổi" lines={absent.map((a) => `${a.label}${a.date ? ` · ${formatDate(a.date)}` : ''}`)} />
                ) : null}
                {missing.length ? (
                  <Detail
                    title="Thiếu bài"
                    lines={missing.map((m) => `${m.title}${m.submission_deadline ? ` · hạn ${formatDate(m.submission_deadline)}` : ''}`)}
                  />
                ) : null}
              </Row>
            ))
          ) : (
            <Empty text="Không có học viên nào vắng học hay thiếu bài 🎉" />
          )
        ) : null}

        {tab === 'missing' ? (
          missingByAssignment.length ? (
            missingByAssignment.map((a) => (
              <Row
                key={a.key}
                open={open === a.key}
                onPress={() => toggle(a.key)}
                head={
                  <>
                    <View className="h-10 w-10 items-center justify-center rounded-xl bg-danger-soft">
                      <Text className="text-[14px] font-extrabold text-danger">{a.students.length}</Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-[14.5px] font-bold text-foreground" numberOfLines={2}>
                        {a.title}
                      </Text>
                      <Text className="text-[12.5px] text-muted">
                        {a.deadline ? `Hạn ${formatDate(a.deadline)}` : 'Không hạn nộp'} · {a.students.length} học viên chưa nộp
                      </Text>
                    </View>
                  </>
                }>
                <Detail title="Học viên chưa nộp" lines={a.students.map((s) => `${s.name}${s.phone ? ` · ${s.phone}` : ''}`)} />
              </Row>
            ))
          ) : (
            <Empty text="Không có bài nào bị thiếu" />
          )
        ) : null}

        {tab === 'absent' ? (
          bySession.length ? (
            [...bySession].reverse().map((s) => (
              <Row
                key={s.id}
                open={open === s.id}
                onPress={() => s.absent.length && toggle(s.id)}
                head={
                  <>
                    <View className="flex-1">
                      <Text className="text-[14.5px] font-bold text-foreground" numberOfLines={1}>
                        {s.label}
                        {s.date ? ` · ${formatDate(s.date)}` : ''}
                      </Text>
                      {s.topic ? (
                        <Text className="text-[12.5px] text-muted" numberOfLines={1}>
                          {s.topic}
                        </Text>
                      ) : null}
                    </View>
                    <Text className={`text-[13px] font-bold ${s.absent.length ? 'text-danger' : 'text-success'}`}>
                      {s.absent.length ? `Vắng ${s.absent.length}/${s.total}` : 'Đủ lớp'}
                    </Text>
                  </>
                }>
                <Detail title="Học viên vắng" lines={s.absent.map((a) => `${a.name}${a.phone ? ` · ${a.phone}` : ''}`)} />
              </Row>
            ))
          ) : (
            <Empty text="Chưa có buổi học nào diễn ra" />
          )
        ) : null}
      </ScrollView>
    </View>
  );
}

function Tile({
  icon,
  color,
  value,
  label,
}: {
  icon: 'people' | 'document-text' | 'cloud-upload' | 'calendar';
  color: string;
  value: string;
  label: string;
}) {
  return (
    <View className="w-[48.8%] gap-1 rounded-3xl bg-surface p-3.5">
      <Ionicons name={icon} size={18} color={color} />
      <Text className="text-[22px] font-extrabold text-foreground">{value}</Text>
      <Text className="text-[12px] text-muted" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function Row({ head, open, onPress, children }: { head: ReactNode; open: boolean; onPress: () => void; children: ReactNode }) {
  return (
    <View className="overflow-hidden rounded-3xl bg-surface">
      <Pressable onPress={onPress} className="flex-row items-center gap-3 p-3.5 active:opacity-90">
        {head}
      </Pressable>
      {open ? <View className="gap-2.5 border-t border-border px-4 py-3">{children}</View> : null}
    </View>
  );
}

function Detail({ title, lines }: { title: string; lines: string[] }) {
  return (
    <View className="gap-1">
      <Text className="text-[12px] font-bold uppercase tracking-wide text-muted">
        {title} · {lines.length}
      </Text>
      {lines.map((l, i) => (
        <Text key={i} className="text-[13.5px] text-foreground">
          • {l}
        </Text>
      ))}
    </View>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <View className="items-center rounded-3xl bg-surface p-8">
      <Text className="text-center text-[14px] text-muted">{text}</Text>
    </View>
  );
}
