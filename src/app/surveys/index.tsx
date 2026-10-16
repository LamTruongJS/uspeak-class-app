import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, Share, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showToast } from '@/components/ui/toast';
import { useActionSheet } from '@/components/ui/action-sheet';
import { Avatar } from '@/components/ui/avatar';
import { Segmented } from '@/components/ui/segmented';
import { StateView } from '@/components/ui/state-view';
import { WEB_URL } from '@/config/env';
import {
  SURVEY_STATUS_FILTERS,
  SURVEY_STATUS_VIEW,
  surveyShareMessage,
  useCreateInputSurvey,
  useInputSurveys,
  type InputSurvey,
} from '@/features/surveys/api';
import { getErrorMessage } from '@/lib/api/client';
import { formatDate } from '@/lib/format';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';
import { menuScreenOptions } from '@/features/navigation/app-menu';

const STATUS_ICON = {
  not_started: 'time-outline',
  pending_review: 'videocam',
  suitable: 'checkmark-circle',
  unsuitable: 'close-circle',
} as const;

/**
 * Khảo sát đầu vào — bản mobile của web /input-surveys.
 * Nhân sự tạo phiếu (nút + nổi) → CHIA SẺ link qua Zalo/Messenger ngay từ sheet hệ thống → người làm
 * tự nộp video ở trang web công khai → giáo viên xem video + nhận xét trong app (surveys/[id]).
 */
export default function InputSurveysScreen() {
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState('all');
  const sheet = useActionSheet();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const query = useInputSurveys({ status, search: debounced });
  const pull = usePullRefresh(() => query.refetch());
  const items = useMemo(() => query.data?.pages.flatMap((p) => p.data) ?? [], [query.data]);
  const total = query.data?.pages[0]?.pagination?.total ?? 0;

  const header = (
    <View className="gap-3 pb-3">
      <View className="h-11 flex-row items-center gap-2 rounded-full bg-surface-muted px-4">
        <Ionicons name="search" size={17} color={muted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Tìm theo tên, email, SĐT…"
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
      <Segmented variant="chip" value={status} onChange={setStatus} items={SURVEY_STATUS_FILTERS} />
      {!query.isLoading ? (
        <Text className="px-1 text-[13px] text-muted">
          {total.toLocaleString('vi-VN')} phiếu{status !== 'all' || debounced ? ' phù hợp' : ''}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: 'Khảo sát đầu vào', ...menuScreenOptions }} />
      <FlashList
        data={items}
        keyExtractor={(s: InputSurvey) => s._id}
        ListHeaderComponent={header}
        contentContainerStyle={{ padding: 16, paddingBottom: 110 + insets.bottom }}
        ItemSeparatorComponent={() => <View className="h-2.5" />}
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
            <StateView
              icon="clipboard-outline"
              title={status !== 'all' || debounced ? 'Không có phiếu phù hợp' : 'Chưa có phiếu khảo sát nào'}
              description="Bấm nút + để tạo phiếu và gửi link cho người cần làm khảo sát."
            />
          )
        }
        renderItem={({ item }) => <SurveyCard s={item} />}
      />

      {/* Nút tạo nổi góc dưới */}
      <Pressable
        onPress={() => setCreating(true)}
        accessibilityLabel="Tạo phiếu khảo sát"
        className="absolute right-5 h-14 flex-row items-center gap-2 rounded-full bg-brand px-5 active:opacity-85"
        style={{ bottom: insets.bottom + 20, elevation: 6, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } }}>
        <Ionicons name="add" size={22} color="#fff" />
        <Text className="text-[15px] font-bold text-white">Tạo phiếu</Text>
      </Pressable>

      <CreateSheet
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(survey) =>
          sheet.confirm({
            title: 'Đã tạo phiếu',
            message: `Gửi link cho ${survey.student_name} để làm khảo sát.`,
            label: 'Chia sẻ link',
            icon: 'share-outline',
            danger: false,
            onConfirm: () => void Share.share({ message: surveyShareMessage(WEB_URL, survey) }),
          })
        }
      />
      {sheet.sheet}
    </View>
  );
}

function SurveyCard({ s }: { s: InputSurvey }) {
  const view = SURVEY_STATUS_VIEW[s.status] ?? SURVEY_STATUS_VIEW.not_started;
  const brand = useThemeColor('brand');
  const toneColor = { neutral: '#6b7280', warning: '#d97706', success: '#059669', danger: '#dc2626' }[view.tone as string] ?? '#6b7280';
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/surveys/[id]', params: { id: s._id } })}
      className="flex-row items-center gap-3 rounded-3xl bg-surface p-3.5 active:opacity-90">
      <View>
        <Avatar name={s.student_name} size={46} />
        <View className="absolute -bottom-0.5 -right-0.5 h-5 w-5 items-center justify-center rounded-full border-2 border-surface" style={{ backgroundColor: toneColor }}>
          <Ionicons name={STATUS_ICON[s.status] ?? 'time-outline'} size={10} color="#fff" />
        </View>
      </View>
      <View className="flex-1 gap-0.5">
        <Text className="text-[15.5px] font-bold text-foreground" numberOfLines={1}>
          {s.student_name}
        </Text>
        <Text className="text-[12.5px] text-muted" numberOfLines={1}>
          {[s.phone, s.email].filter(Boolean).join(' · ') || 'Chưa điền liên hệ'}
        </Text>
        <View className="flex-row items-center gap-1.5 pt-0.5">
          <Text className="text-[12px] font-bold" style={{ color: toneColor }}>
            {view.label}
          </Text>
          {s.videos?.length ? <Text className="text-[12px] text-muted">· {s.videos.length} video</Text> : null}
          <Text className="text-[12px] text-muted">· {formatDate(s.submitted_at ?? s.createdAt)}</Text>
        </View>
      </View>
      <Pressable
        hitSlop={8}
        onPress={() => void Share.share({ message: surveyShareMessage(WEB_URL, s) })}
        accessibilityLabel="Chia sẻ link khảo sát"
        className="h-10 w-10 items-center justify-center rounded-full bg-brand-soft active:opacity-70">
        <Ionicons name="share-social" size={17} color={brand} />
      </Pressable>
    </Pressable>
  );
}

/** Tạo phiếu: nhập tên → tạo → chia sẻ link luôn. */
function CreateSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (s: InputSurvey) => void }) {
  const insets = useSafeAreaInsets();
  const muted = useThemeColor('muted');
  const create = useCreateInputSurvey();
  const [name, setName] = useState('');

  const submit = async () => {
    const n = name.trim();
    if (!n) return;
    try {
      const survey = await create.mutateAsync(n);
      setName('');
      onClose();
      // Bảng "đã tạo" do MÀN CHA mở: mở trong chính tấm này thì nó tắt theo luôn
      onCreated(survey);
    } catch (err) {
      showToast('error', 'Không tạo được phiếu', getErrorMessage(err));
    }
  };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 justify-end bg-black/45">
        <Pressable className="absolute inset-0" onPress={onClose} />
        <View className="gap-3.5 rounded-t-3xl bg-surface px-5 pt-3" style={{ paddingBottom: insets.bottom + 16 }}>
          <View className="h-1 w-10 self-center rounded-full bg-border" />
          <Text className="text-[18px] font-extrabold text-foreground">Tạo phiếu khảo sát</Text>
          <Text className="text-[13.5px] leading-5 text-muted">
            Nhập tên người sẽ làm khảo sát. Tạo xong chia sẻ link để họ tự điền thông tin và nộp video giới thiệu.
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Tên người làm khảo sát"
            placeholderTextColor={muted}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={submit}
            className="h-12 rounded-2xl border border-border bg-background px-4 text-[15px] text-foreground"
          />
          <Pressable
            onPress={submit}
            disabled={!name.trim() || create.isPending}
            className={`h-12 flex-row items-center justify-center gap-2 rounded-2xl ${name.trim() ? 'bg-brand active:opacity-85' : 'bg-surface-muted'}`}>
            <Ionicons name="add-circle" size={18} color={name.trim() ? '#fff' : '#9ca3af'} />
            <Text className={`text-[15px] font-bold ${name.trim() ? 'text-white' : 'text-muted'}`}>
              {create.isPending ? 'Đang tạo…' : 'Tạo phiếu'}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
