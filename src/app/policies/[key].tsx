import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showToast } from '@/components/ui/toast';
import { StateView } from '@/components/ui/state-view';
import { findPolicy, POLICY_LOOK, useAcceptPolicy, usePolicyStatus } from '@/features/policies/api';
import { PolicyBody } from '@/features/policies/policy-body';
import { getErrorMessage } from '@/lib/api/client';
import { formatDate } from '@/lib/format';
import { useThemeColor } from '@/theme/use-theme-color';

/**
 * Đọc 1 chính sách: đầu trang (tên, hiệu lực, phiên bản, trạng thái đồng ý) → các Điều dạng thẻ.
 * Nút mục lục trên thanh tiêu đề mở danh sách Điều, chọn là cuộn tới. Chưa đồng ý thì có thanh
 * "Tôi đã đọc và đồng ý" ở đáy (POST /policies/:key/accept — giống nút cuối trang web).
 */
export default function PolicyDetailScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const insets = useSafeAreaInsets();
  const fg = useThemeColor('foreground');
  const success = useThemeColor('success');
  const policy = findPolicy(key);
  const status = usePolicyStatus();
  const accept = useAcceptPolicy();
  const [tocOpen, setTocOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const bodyY = useRef(0);
  const sectionY = useRef(new Map<string, number>());

  if (!policy) {
    return (
      <View className="flex-1 bg-background">
        <Stack.Screen options={{ title: 'Chính sách' }} />
        <StateView icon="document-outline" title="Không tìm thấy chính sách" />
      </View>
    );
  }

  const look = POLICY_LOOK[policy.key] ?? { icon: 'document-text' as const, color: '#475569', blurb: '' };
  const st = status.data?.policies.find((p) => p.key === policy.key);
  const needAccept = !!st && !st.accepted;

  const jump = (id: string) => {
    setTocOpen(false);
    const y = sectionY.current.get(id);
    if (y !== undefined) scrollRef.current?.scrollTo({ y: bodyY.current + y - 12, animated: true });
  };

  const doAccept = async () => {
    try {
      await accept.mutateAsync(policy.key);
    } catch (err) {
      showToast('error', 'Chưa ghi nhận được', getErrorMessage(err));
    }
  };

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: policy.title,
          headerRight: policy.toc.length
            ? () => (
                <Pressable onPress={() => setTocOpen(true)} hitSlop={10} accessibilityLabel="Mục lục" className="px-1 active:opacity-60">
                  <Ionicons name="list" size={23} color={fg} />
                </Pressable>
              )
            : undefined,
        }}
      />
      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 16, paddingBottom: (needAccept ? 110 : 40) + insets.bottom }}>
        {/* Đầu trang */}
        <View className="gap-3 pb-4">
          <View className="h-14 w-14 items-center justify-center rounded-2xl" style={{ backgroundColor: `${look.color}1a` }}>
            <Ionicons name={look.icon} size={28} color={look.color} />
          </View>
          <Text className="text-[24px] font-extrabold leading-8 text-foreground">{policy.heading}</Text>
          <View className="flex-row flex-wrap gap-2">
            {policy.meta.map((m) => (
              <View key={m.label} className="rounded-full bg-surface px-3 py-1.5">
                <Text className="text-[12px] text-muted">
                  {m.label}: <Text className="font-bold text-foreground">{m.value}</Text>
                </Text>
              </View>
            ))}
          </View>
          {st?.accepted ? (
            <View className="flex-row items-center gap-2 self-start rounded-full bg-success-soft px-3 py-1.5">
              <Ionicons name="checkmark-circle" size={15} color={success} />
              <Text className="text-[12.5px] font-bold text-success">
                Bạn đã đồng ý{st.accepted_at ? ` ngày ${formatDate(st.accepted_at)}` : ''}
              </Text>
            </View>
          ) : null}
          {policy.toc.length ? (
            <Pressable
              onPress={() => setTocOpen(true)}
              className="flex-row items-center gap-3 rounded-2xl bg-surface px-4 py-3 active:opacity-80">
              <Ionicons name="list" size={18} color={look.color} />
              <Text className="flex-1 text-[14.5px] font-semibold text-foreground">Mục lục · {policy.toc.length} mục</Text>
              <Ionicons name="chevron-down" size={16} color="#9ca3af" />
            </Pressable>
          ) : null}
        </View>

        <View onLayout={(e) => (bodyY.current = e.nativeEvent.layout.y)}>
          <PolicyBody nodes={policy.body} onSection={(id, y) => sectionY.current.set(id, y)} />
        </View>
      </ScrollView>

      {needAccept ? (
        <View className="absolute bottom-0 left-0 right-0 gap-2 border-t border-border bg-surface px-4 pt-3" style={{ paddingBottom: insets.bottom + 12 }}>
          <Pressable
            onPress={doAccept}
            disabled={accept.isPending}
            className="h-12 flex-row items-center justify-center gap-2 rounded-2xl bg-brand active:opacity-85">
            <Ionicons name="checkmark-done" size={19} color="#fff" />
            <Text className="text-[15px] font-bold text-white">{accept.isPending ? 'Đang ghi nhận…' : 'Tôi đã đọc và đồng ý'}</Text>
          </Pressable>
        </View>
      ) : null}

      <Modal visible={tocOpen} transparent animationType="slide" onRequestClose={() => setTocOpen(false)} statusBarTranslucent>
        <View className="flex-1 justify-end bg-black/45">
          <Pressable className="absolute inset-0" onPress={() => setTocOpen(false)} />
          <View className="max-h-[75%] rounded-t-3xl bg-surface pt-3" style={{ paddingBottom: insets.bottom + 8 }}>
            <View className="h-1 w-10 self-center rounded-full bg-border" />
            <Text className="px-5 pb-2 pt-3 text-[17px] font-extrabold text-foreground">Mục lục</Text>
            <ScrollView>
              {policy.toc.map((t, i) => (
                <Pressable
                  key={t.id}
                  onPress={() => jump(t.id)}
                  className={`flex-row items-center gap-3 px-5 py-3 active:bg-surface-muted ${i ? 'border-t border-border' : ''}`}>
                  <Text className="flex-1 text-[14.5px] text-foreground">{t.label}</Text>
                  <Ionicons name="chevron-forward" size={15} color="#9ca3af" />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
