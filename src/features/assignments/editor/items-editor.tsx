import { Text, View } from 'react-native';

import { showToast } from '@/components/ui/toast';
import { useActionSheet } from '@/components/ui/action-sheet';

import { MULTI_TASK_MAX_ITEMS, newItem, type Criteria, type RubricTemplate, type SubmissionItem } from './api';
import { Choice, IconButton, Input, SmallButton, ToggleRow } from './fields';

/** Mục nộp của bài "Nhiều mục" (MultiTaskItemsBuilder web): tên, loại video / ảnh, cần chấm, hướng dẫn. */
export function ItemsEditor({ items, onChange }: { items: SubmissionItem[]; onChange: (v: SubmissionItem[]) => void }) {
  const sheet = useActionSheet();
  const patch = (key: string, p: Partial<SubmissionItem>) => onChange(items.map((i) => (i.key === key ? { ...i, ...p } : i)));
  const reorder = (arr: SubmissionItem[]) => onChange(arr.map((i, idx) => ({ ...i, sort_order: idx })));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const arr = [...items];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    reorder(arr);
  };
  const graded = items.filter((i) => i.requires_grading).length;

  return (
    <View className="gap-3">
      <Text className="text-[12.5px] text-muted">
        {items.length} mục · {graded} mục cần chấm. Bài được tính là “cần chấm” khi có ít nhất 1 mục cần chấm.
      </Text>
      {items.map((it, i) => (
        <View key={it.key} className="gap-2.5 rounded-2xl border border-border bg-background p-3.5">
          <View className="flex-row items-center gap-2">
            <Text className="flex-1 text-[13px] font-bold text-muted">Mục {i + 1}</Text>
            <IconButton icon="arrow-up" label="Lên" disabled={i === 0} onPress={() => move(i, -1)} />
            <IconButton icon="arrow-down" label="Xuống" disabled={i === items.length - 1} onPress={() => move(i, 1)} />
            <IconButton
              icon="trash-outline"
              label="Xoá mục"
              onPress={() =>
                sheet.confirm({
                  title: `Xoá mục ${i + 1}?`,
                  label: 'Xoá mục',
                  icon: 'trash-outline',
                  onConfirm: () => reorder(items.filter((x) => x.key !== it.key)),
                })
              }
            />
          </View>
          <Input value={it.label} onChange={(v) => patch(it.key, { label: v })} placeholder="Tên mục (vd: Video đọc đoạn 1)" />
          <Choice
            items={[
              { value: 'youtube_video', label: 'Video' },
              { value: 'image_upload', label: 'Hình ảnh' },
            ]}
            value={it.type}
            onChange={(v) => patch(it.key, { type: v })}
          />
          <ToggleRow title="Cần chấm" value={it.requires_grading} onChange={(v) => patch(it.key, { requires_grading: v })} />
          <Input value={it.instructions ?? ''} onChange={(v) => patch(it.key, { instructions: v })} placeholder="Hướng dẫn cho mục này (tuỳ chọn)" multiline minHeight={56} />
        </View>
      ))}
      {items.length < MULTI_TASK_MAX_ITEMS ? <SmallButton icon="add" label="Thêm mục nộp" onPress={() => onChange([...items, newItem(items.length)])} /> : null}
      {sheet.sheet}
    </View>
  );
}

/** Tiêu chí chấm điểm (tên, điểm tối đa, mô tả) + áp template có sẵn. */
export function CriteriaEditor({
  criteria,
  onChange,
  templates,
}: {
  criteria: Criteria[];
  onChange: (v: Criteria[]) => void;
  templates: RubricTemplate[];
}) {
  const sheet = useActionSheet();
  const patch = (id: string, p: Partial<Criteria>) => onChange(criteria.map((c) => (c.id === id ? { ...c, ...p } : c)));
  const total = criteria.reduce((s, c) => s + (Number(c.maxScore) || 0), 0);

  const applyTemplate = () => {
    if (!templates.length) return showToast('warning', 'Chưa có template tiêu chí nào');
    // Danh sách template: bảng chọn cuộn được nên không phải cắt còn 6 như bản Alert cũ
    sheet.show({
      title: 'Áp template tiêu chí',
      message: 'Thay toàn bộ tiêu chí hiện tại bằng template:',
      actions: templates.map((t) => ({
        label: t.name,
        icon: 'list-outline',
        onPress: () =>
          onChange(t.criteria.map((c, i) => ({ id: `${Date.now()}${i}`, name: c.name, maxScore: c.max_score, description: c.description || '' }))),
      })),
    });
  };

  return (
    <View className="gap-3">
      {criteria.map((c, i) => (
        <View key={c.id} className="gap-2 rounded-2xl border border-border bg-background p-3.5">
          <View className="flex-row items-center gap-2">
            <View className="flex-1">
              <Input value={c.name} onChange={(v) => patch(c.id, { name: v })} placeholder={`Tiêu chí ${i + 1} (vd: Phát âm)`} />
            </View>
            <View className="w-[76px]">
              <Input value={String(c.maxScore)} onChange={(v) => patch(c.id, { maxScore: Number(v.replace(/\D/g, '')) || 0 })} numeric />
            </View>
            <IconButton icon="trash-outline" label="Xoá tiêu chí" onPress={() => onChange(criteria.filter((x) => x.id !== c.id))} />
          </View>
          <Input value={c.description} onChange={(v) => patch(c.id, { description: v })} placeholder="Mô tả (vd: Phát âm rõ ràng, đúng trọng âm)" />
        </View>
      ))}
      <View className="flex-row flex-wrap items-center gap-2">
        <SmallButton icon="add" label="Thêm tiêu chí" onPress={() => onChange([...criteria, { id: String(Date.now()), name: '', maxScore: 10, description: '' }])} />
        {templates.length ? <SmallButton icon="copy-outline" label="Dùng template" tone="muted" onPress={applyTemplate} /> : null}
        {criteria.length ? <Text className="text-[12.5px] text-muted">Tổng {total} điểm</Text> : null}
      </View>
      {sheet.sheet}
    </View>
  );
}
