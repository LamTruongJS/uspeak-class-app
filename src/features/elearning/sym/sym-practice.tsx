import { useCallback, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { FilterChips } from '@/components/ui/list-filters';
import { Segmented } from '@/components/ui/segmented';

import { SymFill } from './sym-fill';
import { SymListen } from './sym-listen';
import type { SymContent } from './types';

type Mode = 'listen' | 'fill';

/**
 * Bài Speak Your Mind trong app — giống màn web (class-fe SymRenderer): chỉ 2 chế độ
 * Nghe audio (VN → chờ → EN, tranh zoom theo câu) và Điền từ (Speaking Outline).
 */
export function SymPractice({ classId, practiceId, content }: { classId: string; practiceId: string; content: SymContent }) {
  const units = useMemo(() => content?.units ?? [], [content]);
  const [unitIndex, setUnitIndex] = useState(0);
  const [mode, setMode] = useState<Mode>('listen');
  const [progress, setProgress] = useState({ current: 0, total: 0, context: '' });

  const onProgress = useCallback((current: number, total: number, context: string) => {
    setProgress((p) => (p.current === current && p.total === total && p.context === context ? p : { current, total, context }));
  }, []);

  const unit = units[unitIndex];
  if (!unit) return <Text className="py-8 text-center text-[13px] text-muted">Bài luyện tập này chưa có nội dung.</Text>;

  return (
    <View className="gap-3">
      {units.length > 1 ? (
        <FilterChips
          items={units.map((u, i) => ({ value: String(i), label: u.unit }))}
          value={String(unitIndex)}
          onChange={(v) => setUnitIndex(Number(v))}
        />
      ) : null}

      <View className="gap-1 rounded-2xl bg-brand-soft px-4 py-3">
        <Text className="text-[11px] font-black uppercase tracking-wide text-brand">Speak Your Mind · {unit.unit}</Text>
        <Text className="text-[16px] font-bold text-foreground">{unit.title}</Text>
        <View className="flex-row items-center justify-between gap-2">
          <Text className="flex-1 text-[12px] text-muted" numberOfLines={1}>
            {progress.context ? `Đang học: ${progress.context}` : unit.subtitle}
          </Text>
          <Text className="text-[13px] font-bold text-brand">
            {mode === 'listen' ? 'Câu' : 'Đã điền'} {progress.current}/{progress.total}
          </Text>
        </View>
      </View>

      <Segmented
        items={[
          { value: 'listen', label: 'Nghe audio' },
          { value: 'fill', label: 'Điền từ' },
        ]}
        value={mode}
        onChange={setMode}
      />

      {mode === 'listen' ? (
        <SymListen key={unit.unit} unit={unit} onProgress={onProgress} />
      ) : (
        <SymFill key={unit.unit} unit={unit} classId={classId} practiceId={practiceId} onProgress={onProgress} />
      )}
    </View>
  );
}
