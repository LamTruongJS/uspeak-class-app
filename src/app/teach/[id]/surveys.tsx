import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { showToast } from '@/components/ui/toast';
import { useActionSheet } from '@/components/ui/action-sheet';
import { Avatar } from '@/components/ui/avatar';
import { Segmented } from '@/components/ui/segmented';
import { StateView } from '@/components/ui/state-view';
import { useClassSurveyResponses, useClassSurveyTemplates, useSurveyRemind, type SurveyTemplateLite } from '@/features/classes/class-admin-api';
import { useStaffClassDetail, useStaffClasses } from '@/features/classes/staff-api';
import { getErrorMessage } from '@/lib/api/client';
import { formatDateTime } from '@/lib/format';
import { resolveMediaUrl, useMediaToken } from '@/lib/media';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

/**
 * Khảo sát của lớp (ClassSurveyTab web): chọn phiếu → ai đã trả lời (bấm xem câu trả lời) / ai chưa
 * (nhắc từng người hoặc nhắc tất cả — gửi thông báo cho học viên).
 */
export default function ClassSurveysScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const brand = useThemeColor('brand');
  const { data: token } = useMediaToken();
  const cls = useStaffClasses().data?.find((c) => c._id === id);
  const templates = useClassSurveyTemplates(id);
  const [picked, setPicked] = useState('');
  const sheet = useActionSheet();
  const tpl: SurveyTemplateLite | undefined = templates.data?.find((t) => t._id === picked) ?? templates.data?.[0];
  const responses = useClassSurveyResponses(id, tpl?._id ?? '');
  const detail = useStaffClassDetail(id);
  const remind = useSurveyRemind(id);
  const pull = usePullRefresh(() => Promise.all([templates.refetch(), responses.refetch(), detail.refetch()]));
  const [tab, setTab] = useState<'done' | 'todo'>('done');
  const [open, setOpen] = useState<string | null>(null);

  const doneIds = useMemo(() => new Set((responses.data ?? []).map((r) => r.user?._id ?? r.user_id)), [responses.data]);
  const pending = useMemo(() => (detail.data?.students ?? []).filter((s) => !doneIds.has(s._id)), [detail.data, doneIds]);

  const answerText = (key: string, value: string | string[]) => {
    const field = tpl?.fields.find((f) => f.field_key === key);
    const label = (v: string) => field?.options?.find((o) => o.value === v)?.label ?? v;
    return Array.isArray(value) ? value.map(label).join(', ') : label(value);
  };

  const remindAll = () =>
    tpl &&
    sheet.confirm({
      title: `Nhắc ${pending.length} học viên?`,
      message: 'Học viên chưa làm phiếu sẽ nhận thông báo nhắc.',
      label: 'Gửi nhắc',
      icon: 'notifications-outline',
      danger: false,
      onConfirm: () =>
        remind.all.mutate(
          { templateId: tpl._id, studentIds: pending.map((s) => s._id) },
          { onSuccess: () => showToast('success', 'Đã gửi nhắc'), onError: (e) => showToast('error', 'Không gửi được', getErrorMessage(e)) },
        ),
    });

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: cls?.class_code ? `Khảo sát · ${cls.class_code}` : 'Khảo sát lớp', headerShown: true }} />
      <ScrollView
        contentContainerClassName="gap-3 p-4 pb-10"
        refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}>
        {templates.isLoading ? (
          <ActivityIndicator className="py-10" color={brand} />
        ) : !templates.data?.length ? (
          <StateView icon="clipboard-outline" title="Lớp chưa có phiếu khảo sát" />
        ) : (
          <>
            {templates.data.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
                {templates.data.map((t) => (
                  <Pressable key={t._id} onPress={() => setPicked(t._id)} className={`h-9 justify-center rounded-full px-3.5 ${tpl?._id === t._id ? 'bg-brand' : 'bg-surface'}`}>
                    <Text className={`text-[13px] font-semibold ${tpl?._id === t._id ? 'text-white' : 'text-foreground'}`}>{t.title}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
            <View className="gap-1 rounded-3xl bg-surface p-4">
              <Text className="text-[16px] font-extrabold text-foreground">{tpl?.title}</Text>
              {tpl?.description ? <Text className="text-[13px] text-muted">{tpl.description}</Text> : null}
              <View className="flex-row items-center gap-2 pt-2">
                <View className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted">
                  <View className="h-full rounded-full bg-success" style={{ width: `${(doneIds.size / Math.max(1, doneIds.size + pending.length)) * 100}%` }} />
                </View>
                <Text className="text-[12.5px] font-bold text-foreground">
                  {doneIds.size}/{doneIds.size + pending.length}
                </Text>
              </View>
            </View>
            <Segmented
              items={[
                { value: 'done', label: 'Đã trả lời', count: responses.data?.length ?? 0 },
                { value: 'todo', label: 'Chưa làm', count: pending.length },
              ]}
              value={tab}
              onChange={setTab}
            />
            {tab === 'done' ? (
              responses.isLoading ? (
                <ActivityIndicator className="py-6" color={brand} />
              ) : (
                (responses.data ?? []).map((r) => (
                  <View key={r._id} className="overflow-hidden rounded-3xl bg-surface">
                    <Pressable onPress={() => setOpen((c) => (c === r._id ? null : r._id))} className="flex-row items-center gap-3 p-3.5 active:opacity-90">
                      <Avatar name={r.user?.name} uri={resolveMediaUrl(r.user?.avatar, token?.media_token)} size={38} />
                      <View className="flex-1">
                        <Text className="text-[14.5px] font-bold text-foreground" numberOfLines={1}>
                          {r.user?.name ?? 'Học viên'}
                        </Text>
                        <Text className="text-[12px] text-muted">{formatDateTime(r.submitted_at)}</Text>
                      </View>
                      <Ionicons name={open === r._id ? 'chevron-up' : 'chevron-down'} size={16} color="#9ca3af" />
                    </Pressable>
                    {open === r._id ? (
                      <View className="gap-2.5 border-t border-border px-4 py-3">
                        {r.answers.map((a) => (
                          <View key={a.field_key} className="gap-0.5">
                            <Text className="text-[12.5px] font-semibold text-muted">{tpl?.fields.find((f) => f.field_key === a.field_key)?.label ?? a.field_key}</Text>
                            <Text className="text-[14px] text-foreground" selectable>
                              {answerText(a.field_key, a.value) || '—'}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>
                ))
              )
            ) : (
              <>
                {pending.length ? (
                  <Pressable onPress={remindAll} disabled={remind.all.isPending} className="h-11 flex-row items-center justify-center gap-2 rounded-2xl bg-brand active:opacity-85">
                    <Ionicons name="notifications" size={17} color="#fff" />
                    <Text className="text-[14.5px] font-bold text-white">{remind.all.isPending ? 'Đang gửi…' : `Nhắc tất cả (${pending.length})`}</Text>
                  </Pressable>
                ) : (
                  <Text className="py-6 text-center text-muted">Cả lớp đã làm phiếu 🎉</Text>
                )}
                {pending.map((s) => (
                  <View key={s._id} className="flex-row items-center gap-3 rounded-3xl bg-surface p-3.5">
                    <Avatar name={s.name} size={36} />
                    <Text className="flex-1 text-[14.5px] font-semibold text-foreground" numberOfLines={1}>
                      {s.name}
                    </Text>
                    <Pressable
                      onPress={() =>
                        tpl &&
                        remind.one.mutate(
                          { templateId: tpl._id, studentId: s._id },
                          { onSuccess: () => showToast('success', `Đã nhắc ${s.name}`), onError: (e) => showToast('error', 'Không gửi được', getErrorMessage(e)) },
                        )
                      }
                      className="flex-row items-center gap-1 rounded-full bg-brand-soft px-3 py-1.5 active:opacity-70">
                      <Ionicons name="notifications-outline" size={14} color={brand} />
                      <Text className="text-[12.5px] font-bold text-brand">Nhắc</Text>
                    </Pressable>
                  </View>
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
      {sheet.sheet}
    </View>
  );
}
