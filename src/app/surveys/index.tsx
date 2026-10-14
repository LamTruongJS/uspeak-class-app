import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import * as Clipboard from 'expo-clipboard';
import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { KeyboardAvoider } from '@/components/ui/keyboard-avoider';
import { Segmented } from '@/components/ui/segmented';
import { StateView } from '@/components/ui/state-view';
import { WEB_URL } from '@/config/env';
import {
  SURVEY_STATUS_FILTERS,
  SURVEY_STATUS_VIEW,
  surveyPublicUrl,
  useCreateInputSurvey,
  useInputSurveys,
  type InputSurvey,
} from '@/features/surveys/api';
import { getErrorMessage } from '@/lib/api/client';
import { formatDate } from '@/lib/format';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

/** Khảo sát đầu vào — bản mobile của web /input-surveys: danh sách phiếu, tạo phiếu, lấy link gửi. */
export default function InputSurveysScreen() {
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const query = useInputSurveys({ status, search: debounced });
  const create = useCreateInputSurvey();
  const pull = usePullRefresh(() => query.refetch());
  const items = useMemo(() => query.data?.pages.flatMap((p) => p.data) ?? [], [query.data]);
  const total = query.data?.pages[0]?.pagination?.total ?? 0;

  async function copyLink(token: string) {
    await Clipboard.setStringAsync(surveyPublicUrl(WEB_URL, token));
    Alert.alert('Đã copy link', 'Gửi link này cho người cần làm khảo sát đầu vào.');
  }

  async function submitNew() {
    const name = newName.trim();
    if (!name) return;
    try {
      const survey = await create.mutateAsync(name);
      setCreating(false);
      setNewName('');
      Alert.alert('Đã tạo phiếu', `Mã phiếu: ${survey.public_token}`, [
        { text: 'Để sau', style: 'cancel' },
        { text: 'Copy link', onPress: () => void copyLink(survey.public_token) },
      ]);
    } catch (err) {
      Alert.alert('Không tạo được phiếu', getErrorMessage(err));
    }
  }

  const header = (
    <View className="gap-3 pb-1">
      <Text className="text-[13px] text-muted">{total.toLocaleString('vi-VN')} phiếu khảo sát đầu vào.</Text>
      <Button title="Tạo phiếu khảo sát" icon="add-circle-outline" onPress={() => setCreating(true)} />
      <View className="h-11 flex-row items-center gap-2 rounded-xl bg-surface-muted px-3">
        <Ionicons name="search" size={18} color={muted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Tìm theo tên / email / SĐT…"
          placeholderTextColor={muted}
          autoCorrect={false}
          className="flex-1 text-base text-foreground"
        />
        {search ? (
          <Pressable hitSlop={8} onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={muted} />
          </Pressable>
        ) : null}
      </View>
      <Segmented variant="chip" value={status} onChange={setStatus} items={SURVEY_STATUS_FILTERS} />
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: 'Khảo sát đầu vào' }} />
      <FlashList
        data={items}
        keyExtractor={(s: InputSurvey) => s._id}
        ListHeaderComponent={header}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        ItemSeparatorComponent={() => <View className="h-2" />}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
        ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator className="py-4" color={brand} /> : null}
        ListEmptyComponent={
          query.isLoading ? (
            <ActivityIndicator className="py-8" color={brand} />
          ) : query.isError ? (
            <StateView
              icon="cloud-offline-outline"
              title="Không tải được danh sách"
              description={getErrorMessage(query.error)}
              actionLabel="Thử lại"
              onAction={() => query.refetch()}
            />
          ) : (
            <StateView icon="clipboard-outline" title="Chưa có phiếu khảo sát nào" />
          )
        }
        renderItem={({ item }) => {
          const view = SURVEY_STATUS_VIEW[item.status] ?? SURVEY_STATUS_VIEW.not_started;
          return (
            <Pressable
              onPress={() => router.push({ pathname: '/surveys/[id]', params: { id: item._id } })}
              className="gap-2 rounded-2xl border border-border bg-surface p-3.5 active:bg-surface-muted">
              <View className="flex-row items-center gap-2">
                <Badge label={view.label} tone={view.tone} />
                {item.videos?.length ? <Badge label={`${item.videos.length} video`} tone="info" /> : null}
                <View className="flex-1" />
                <Pressable hitSlop={8} onPress={() => void copyLink(item.public_token)} accessibilityLabel="Copy link khảo sát">
                  <Ionicons name="link-outline" size={18} color={brand} />
                </Pressable>
              </View>
              <Text className="text-[15px] font-semibold text-foreground" numberOfLines={1}>
                {item.student_name}
              </Text>
              <Text className="text-[13px] text-muted" numberOfLines={1}>
                {[item.phone, item.email].filter(Boolean).join(' · ') || 'Chưa có liên hệ'}
              </Text>
              <Text className="text-[11px] text-muted">
                Tạo {formatDate(item.createdAt)}
                {item.submitted_at ? ` · Nộp ${formatDate(item.submitted_at)}` : ''}
              </Text>
            </Pressable>
          );
        }}
      />

      {/* Tạo phiếu mới */}
      <Modal visible={creating} transparent animationType="fade" onRequestClose={() => setCreating(false)}>
        <KeyboardAvoider className="flex-1">
          <Pressable className="flex-1 justify-end bg-black/50" onPress={() => setCreating(false)}>
            <Pressable className="gap-3 rounded-t-3xl bg-surface p-5" onPress={(e) => e.stopPropagation()}>
              <Text className="text-lg font-bold text-foreground">Tạo phiếu khảo sát</Text>
              <Text className="text-[13px] text-muted">
                Nhập tên người sẽ làm khảo sát. Sau khi tạo, copy link gửi cho họ tự điền thông tin và nộp video.
              </Text>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                placeholder="Tên người làm khảo sát"
                placeholderTextColor={muted}
                autoFocus
                className="h-12 rounded-xl border border-border bg-background px-3.5 text-base text-foreground"
              />
              <Button title="Tạo phiếu" loading={create.isPending} disabled={!newName.trim()} onPress={submitNew} />
              <Button title="Đóng" variant="ghost" onPress={() => setCreating(false)} />
            </Pressable>
          </Pressable>
        </KeyboardAvoider>
      </Modal>
    </View>
  );
}
