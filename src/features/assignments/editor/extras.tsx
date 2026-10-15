import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as WebBrowser from 'expo-web-browser';
import { useDeferredValue, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showToast } from '@/components/ui/toast';
import { getErrorMessage } from '@/lib/api/client';
import { formatDate } from '@/lib/format';
import { useThemeColor } from '@/theme/use-theme-color';

import {
  uploadAssignmentFiles,
  useCreateRubricTemplate,
  useInheritableAssignments,
  type AssignmentAttachment,
  type Criteria,
  type InheritableAssignment,
} from './api';
import { IconButton, SmallButton } from './fields';

const fmtSize = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const extOf = (name: string) => (name.split('.').pop() ?? '').slice(0, 4).toUpperCase() || 'FILE';

/** Tài liệu đính kèm cho học viên: chọn file trên máy → tải lên ngay (POST /assignments/upload-files). */
export function AttachmentsEditor({ value, onChange }: { value: AssignmentAttachment[]; onChange: (v: AssignmentAttachment[]) => void }) {
  const brand = useThemeColor('brand');
  const [uploading, setUploading] = useState(false);

  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
    if (res.canceled || !res.assets.length) return;
    const tooBig = res.assets.filter((a) => (a.size ?? 0) > 25 * 1024 * 1024);
    if (tooBig.length) showToast('warning', 'File quá lớn', `${tooBig.map((a) => a.name).join(', ')} vượt 25MB, đã bỏ qua.`);
    const files = res.assets
      .filter((a) => (a.size ?? 0) <= 25 * 1024 * 1024)
      .slice(0, 10)
      .map((a) => ({ uri: a.uri, name: a.name, type: a.mimeType || 'application/octet-stream' }));
    if (!files.length) return;
    setUploading(true);
    try {
      const up = await uploadAssignmentFiles(files);
      onChange([...value, ...up].slice(0, 20));
    } catch (e) {
      showToast('error', 'Chưa tải được tài liệu', getErrorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  return (
    <View className="gap-2">
      {value.map((a) => (
        <View key={a.key} className="flex-row items-center gap-3 rounded-2xl bg-surface-muted p-3">
          <View className="h-10 w-10 items-center justify-center rounded-xl bg-brand-soft">
            <Text className="text-[10px] font-extrabold text-brand">{extOf(a.name)}</Text>
          </View>
          <Pressable className="flex-1" onPress={() => a.url && void WebBrowser.openBrowserAsync(a.url)}>
            <Text className="text-[14px] font-semibold text-foreground" numberOfLines={1}>
              {a.name}
            </Text>
            {a.size ? <Text className="text-[12px] text-muted">{fmtSize(a.size)}</Text> : null}
          </Pressable>
          <IconButton icon="close" label="Bỏ tài liệu" onPress={() => onChange(value.filter((x) => x.key !== a.key))} />
        </View>
      ))}
      <Pressable onPress={pick} disabled={uploading} className="flex-row items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-3.5 active:opacity-70">
        {uploading ? <ActivityIndicator color={brand} /> : <Ionicons name="cloud-upload-outline" size={18} color={brand} />}
        <Text className="text-[14px] font-bold text-brand">{uploading ? 'Đang tải lên…' : 'Thêm tài liệu (PDF, Word, ảnh… ≤25MB)'}</Text>
      </Pressable>
    </View>
  );
}

/** Lưu bộ tiêu chí đang soạn thành template để lần sau áp nhanh. */
export function SaveTemplateButton({ criteria, defaultName }: { criteria: Criteria[]; defaultName: string }) {
  const [open, setOpen] = useState(false);
  const valid = criteria.filter((c) => c.name.trim());
  if (!valid.length) return null;
  return (
    <>
      <SmallButton icon="bookmark-outline" label="Lưu thành template" tone="muted" onPress={() => setOpen(true)} />
      {open ? <SaveTemplateSheet criteria={valid} defaultName={defaultName} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function SaveTemplateSheet({ criteria, defaultName, onClose }: { criteria: Criteria[]; defaultName: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const muted = useThemeColor('muted');
  const create = useCreateRubricTemplate();
  const [name, setName] = useState(defaultName);
  const save = () =>
    create.mutate(
      { name: name.trim(), criteria: criteria.map((c) => ({ name: c.name.trim(), max_score: c.maxScore, description: c.description.trim() })) },
      {
        onSuccess: () => {
          onClose();
          showToast('success', 'Đã lưu template', `"${name.trim()}" — ${criteria.length} tiêu chí.`);
        },
        onError: (e) => showToast('error', 'Không lưu được template', getErrorMessage(e)),
      },
    );
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 justify-end bg-black/45">
        <Pressable className="absolute inset-0" onPress={onClose} />
        <View className="gap-3 rounded-t-3xl bg-surface px-5 pt-3" style={{ paddingBottom: insets.bottom + 16 }}>
          <View className="h-1 w-10 self-center rounded-full bg-border" />
          <Text className="text-[18px] font-extrabold text-foreground">Lưu tiêu chí thành template</Text>
          <Text className="text-[13px] text-muted">{criteria.map((c) => `${c.name} (${c.maxScore})`).join(' · ')}</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            autoFocus
            placeholder="Tên template"
            placeholderTextColor={muted}
            className="h-12 rounded-2xl border border-border bg-background px-4 text-[15px] text-foreground"
          />
          <Pressable
            onPress={save}
            disabled={!name.trim() || create.isPending}
            className={`h-12 items-center justify-center rounded-2xl ${name.trim() ? 'bg-brand active:opacity-85' : 'bg-surface-muted'}`}>
            <Text className={`text-[15px] font-bold ${name.trim() ? 'text-white' : 'text-muted'}`}>{create.isPending ? 'Đang lưu…' : 'Lưu template'}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Chọn 1 bài có sẵn (cùng loại, mọi lớp) để chép nội dung sang bài mới. */
export function InheritSheet({ typeId, typeLabel, onPick, onClose }: { typeId: string; typeLabel: string; onPick: (a: InheritableAssignment) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const muted = useThemeColor('muted');
  const brand = useThemeColor('brand');
  const [search, setSearch] = useState('');
  const q = useDeferredValue(search.trim());
  const list = useInheritableAssignments(typeId, q, true);
  const items = useMemo(() => list.data?.pages.flatMap((p) => p.data ?? []) ?? [], [list.data]);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 justify-end bg-black/45">
        <Pressable className="absolute inset-0" onPress={onClose} />
        <View className="h-[80%] rounded-t-3xl bg-surface pt-3" style={{ paddingBottom: insets.bottom + 8 }}>
          <View className="h-1 w-10 self-center rounded-full bg-border" />
          <View className="gap-2.5 px-5 pb-2 pt-3">
            <Text className="text-[18px] font-extrabold text-foreground">Kế thừa bài có sẵn</Text>
            <Text className="text-[13px] text-muted">Bài loại {typeLabel} ở mọi lớp — chọn để chép tiêu đề, hướng dẫn, câu hỏi, tiêu chí… sang bài mới.</Text>
            <View className="h-11 flex-row items-center gap-2 rounded-full bg-surface-muted px-4">
              <Ionicons name="search" size={17} color={muted} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Tìm theo tên bài…"
                placeholderTextColor={muted}
                autoCorrect={false}
                className="flex-1 text-[15px] text-foreground"
              />
            </View>
          </View>
          <FlatList
            data={items}
            keyExtractor={(a) => a._id}
            keyboardShouldPersistTaps="handled"
            contentContainerClassName="px-5 pb-4"
            onEndReachedThreshold={0.4}
            onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && void list.fetchNextPage()}
            ListEmptyComponent={
              list.isLoading ? <ActivityIndicator className="py-8" color={brand} /> : <Text className="py-8 text-center text-[13.5px] text-muted">Không có bài nào</Text>
            }
            ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator className="py-3" color={brand} /> : null}
            renderItem={({ item, index }) => (
              <Pressable onPress={() => onPick(item)} className={`flex-row items-center gap-3 py-3 active:opacity-70 ${index ? 'border-t border-border' : ''}`}>
                <View className="flex-1">
                  <Text className="text-[14.5px] font-semibold text-foreground" numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text className="text-[12px] text-muted" numberOfLines={1}>
                    {[item.class_code || item.class_name || 'Hệ thống', item.created_at ? formatDate(item.created_at) : null].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
              </Pressable>
            )}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
