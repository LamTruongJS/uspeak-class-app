import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { Linking, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { SUPPORT_HOTLINE, SUPPORT_HOTLINE_TEL } from '@/constants/support';
import { POLICIES, POLICY_LOOK, usePolicyStatus } from '@/features/policies/api';
import { formatDate } from '@/lib/format';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';
import { menuScreenOptions } from '@/features/navigation/app-menu';

/**
 * Điều khoản & chính sách — 7 văn bản của web (/terms-of-use, /privacy-policy…) đọc native trong app.
 * Mỗi dòng cho biết đã đồng ý chưa (GET /policies); đồng ý ở màn chi tiết.
 */
export default function PoliciesScreen() {
  const brand = useThemeColor('brand');
  const success = useThemeColor('success');
  const status = usePolicyStatus();
  const pull = usePullRefresh(() => status.refetch());
  const byKey = new Map((status.data?.policies ?? []).map((p) => [p.key, p]));
  const missing = POLICIES.filter((p) => byKey.size && !byKey.get(p.key)?.accepted).length;

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: 'Điều khoản & chính sách', ...menuScreenOptions }} />
      <ScrollView
        contentContainerClassName="gap-4 p-4 pb-10"
        refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}>
        {status.data ? (
          <View className={`flex-row items-center gap-3 rounded-3xl p-4 ${missing ? 'bg-warning-soft' : 'bg-success-soft'}`}>
            <Ionicons name={missing ? 'alert-circle' : 'checkmark-circle'} size={28} color={missing ? '#d97706' : success} />
            <View className="flex-1">
              <Text className={`text-[15px] font-bold ${missing ? 'text-warning' : 'text-success'}`}>
                {missing ? `Còn ${missing} chính sách chưa đồng ý` : 'Bạn đã đồng ý tất cả chính sách'}
              </Text>
              <Text className="text-[13px] text-muted">
                {missing ? 'Mở từng chính sách, đọc và bấm đồng ý ở cuối trang.' : 'Uspeak sẽ báo khi có phiên bản mới.'}
              </Text>
            </View>
          </View>
        ) : null}

        <View className="overflow-hidden rounded-3xl bg-surface">
          {POLICIES.map((p, i) => {
            const look = POLICY_LOOK[p.key] ?? { icon: 'document-text' as const, color: '#475569', blurb: '' };
            const st = byKey.get(p.key);
            return (
              <Pressable
                key={p.key}
                onPress={() => router.push({ pathname: '/policies/[key]', params: { key: p.key } })}
                className={`flex-row items-center gap-3 px-4 py-3.5 active:bg-surface-muted ${i ? 'border-t border-border' : ''}`}>
                <View className="h-11 w-11 items-center justify-center rounded-2xl" style={{ backgroundColor: `${look.color}1a` }}>
                  <Ionicons name={look.icon} size={21} color={look.color} />
                </View>
                <View className="flex-1 gap-0.5">
                  <Text className="text-[15.5px] font-bold text-foreground" numberOfLines={1}>
                    {p.title}
                  </Text>
                  <Text className="text-[12.5px] text-muted" numberOfLines={1}>
                    {look.blurb}
                  </Text>
                  {st ? (
                    <Text className={`text-[12px] font-semibold ${st.accepted ? 'text-success' : 'text-warning'}`}>
                      {st.accepted
                        ? `✓ Đã đồng ý${st.accepted_at ? ` ${formatDate(st.accepted_at)}` : ''} · v${p.version}`
                        : `Chưa đồng ý · v${p.version}`}
                    </Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={17} color="#9ca3af" />
              </Pressable>
            );
          })}
        </View>

        <View className="gap-3 rounded-3xl bg-surface p-4">
          <Text className="text-[15px] font-bold text-foreground">Cần giải đáp thêm?</Text>
          <Text className="text-[13.5px] leading-5 text-muted">
            Có thắc mắc về điều khoản, hoàn học phí hay dữ liệu cá nhân, liên hệ Uspeak để được hỗ trợ.
          </Text>
          <View className="flex-row gap-2">
            <Pressable
              onPress={() => void Linking.openURL(SUPPORT_HOTLINE_TEL)}
              className="h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl bg-brand active:opacity-85">
              <Ionicons name="call" size={16} color="#fff" />
              <Text className="text-[14px] font-bold text-white">{SUPPORT_HOTLINE}</Text>
            </Pressable>
            <Pressable
              onPress={() => void Linking.openURL('mailto:admin@uspeak.vn')}
              className="h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl bg-brand-soft active:opacity-85">
              <Ionicons name="mail" size={16} color={brand} />
              <Text className="text-[14px] font-bold text-brand">Gửi email</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
