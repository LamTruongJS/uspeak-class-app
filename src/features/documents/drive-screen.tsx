import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { router, Stack } from 'expo-router';
import { useDeferredValue, useState } from 'react';
import { Linking, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';

import { Segmented } from '@/components/ui/segmented';
import { LoadingView, StateView } from '@/components/ui/state-view';
import { ImageViewer } from '@/features/chat/message-content';
import { getErrorMessage } from '@/lib/api/client';
import { formatDate } from '@/lib/format';
import { resolveMediaUrl, useMediaToken } from '@/lib/media';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

import {
  DOCUMENT_VIEWS,
  documentFileUrl,
  fileIcon,
  formatBytes,
  isImageFile,
  useDriveList,
  type DocumentNode,
  type DocumentView,
} from './api';

/**
 * Màn kho tài liệu — dùng chung cho `/documents` (gốc) và `/documents/[id]` (bên trong 1 thư mục).
 * Ở thư mục con thì khoá vào view "kho" và ẩn thanh chọn view cho khỏi rối.
 */
export function DriveScreen({ parentId, title }: { parentId?: string; title?: string }) {
  const [view, setView] = useState<DocumentView>('kho');
  const [search, setSearch] = useState('');
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const q = useDeferredValue(search.trim());

  const muted = useThemeColor('muted');
  const brand = useThemeColor('brand');
  const { data: media } = useMediaToken();
  const list = useDriveList({ view: parentId ? 'kho' : view, parent: parentId ?? null, q });
  const pull = usePullRefresh(() => list.refetch());

  function openNode(node: DocumentNode) {
    if (node.loai === 'folder') {
      router.push({ pathname: '/documents/[id]', params: { id: node._id, name: node.ten } });
      return;
    }
    if (node.loai === 'link') {
      if (node.link?.url) void Linking.openURL(node.link.url);
      return;
    }
    const url = resolveMediaUrl(documentFileUrl(node), media?.media_token);
    if (!url) return;
    if (isImageFile(node)) setViewerUri(url);
    else void Linking.openURL(url); // PDF/Office/video… để hệ điều hành chọn app mở
  }

  const header = (
    <View className="gap-3 pb-1">
      {!parentId ? <Segmented variant="chip" value={view} onChange={setView} items={DOCUMENT_VIEWS} /> : null}
      <View className="h-11 flex-row items-center gap-2 rounded-xl bg-surface-muted px-3">
        <Ionicons name="search" size={18} color={muted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Tìm tài liệu…"
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
      {list.data?.breadcrumb?.length ? (
        <Text className="text-xs text-muted" numberOfLines={1}>
          {list.data.breadcrumb.map((b) => b.ten).join(' / ')}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: title || list.data?.folder?.ten || 'Tài liệu' }} />
      {list.isLoading ? (
        <LoadingView />
      ) : list.isError ? (
        <StateView
          icon="cloud-offline-outline"
          title="Không mở được kho tài liệu"
          description={getErrorMessage(list.error)}
          actionLabel="Thử lại"
          onAction={() => list.refetch()}
        />
      ) : (
        <FlashList
          data={list.data?.items ?? []}
          keyExtractor={(n: DocumentNode) => n._id}
          ListHeaderComponent={header}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          ItemSeparatorComponent={() => <View className="h-2" />}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}
          ListEmptyComponent={
            <StateView
              icon="folder-open-outline"
              title={q ? 'Không tìm thấy tài liệu' : 'Thư mục trống'}
              description={q ? undefined : 'Tạo thư mục và tải tệp lên ở bản web.'}
            />
          }
          renderItem={({ item }) => <DriveRow node={item} onPress={() => openNode(item)} />}
        />
      )}
      <ImageViewer uri={viewerUri} onClose={() => setViewerUri(null)} />
    </View>
  );
}

function DriveRow({ node, onPress }: { node: DocumentNode; onPress: () => void }) {
  const muted = useThemeColor('muted');
  const { icon, color } = fileIcon(node);
  const meta = [
    node.loai === 'link' ? node.link?.domain : formatBytes(node.file?.kich_thuoc),
    formatDate(node.updated_at || node.created_at),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-2xl border border-border bg-surface p-3.5 active:bg-surface-muted">
      <View className="h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: `${color}22` }}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <View className="flex-1 gap-0.5">
        <Text className="text-[15px] font-semibold text-foreground" numberOfLines={2}>
          {node.ten}
        </Text>
        {meta ? <Text className="text-[11px] text-muted">{meta}</Text> : null}
      </View>
      <Ionicons name={node.loai === 'folder' ? 'chevron-forward' : 'open-outline'} size={16} color={muted} />
    </Pressable>
  );
}
