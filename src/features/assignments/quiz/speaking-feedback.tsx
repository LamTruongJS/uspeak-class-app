import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { useThemeColor } from '@/theme/use-theme-color';

import type { QuizResult } from '../detail-api';

/** Port describeQuizFailure (class-fe assignments/result/[id]/page.tsx) — giải thích vì sao câu nói chưa có điểm. */
export function describeQuizFailure(result: Pick<QuizResult, 'status' | 'error' | 'details'>) {
  const code = String(result?.error || result?.details?.failure?.code || '').toUpperCase();
  const status = String(result?.status || 'failed').toLowerCase();
  if (status === 'pending' || status === 'processing' || code.includes('PENDING'))
    return { title: 'Câu này đang chờ chấm.', hint: 'Hệ thống sẽ tự chấm lại khi bạn nộp bài.' };
  if (status === 'skipped' || code.includes('RATE_LIMIT'))
    return { title: 'Bạn đã dùng hết lượt chấm cho câu này.', hint: 'Điểm sẽ được chốt theo bản thu gần nhất khi bạn nộp bài.' };
  if (code === 'AUDIO_TOO_LONG')
    return { title: 'Bản thu dài quá nên Uspeak chưa chấm được.', hint: 'Mỗi câu chỉ nên thu tối đa 2 phút, đọc đúng phần câu mẫu.' };
  if (code === 'NO_AUDIO' || code === 'AUDIO_TOO_SMALL')
    return { title: 'Uspeak chưa nhận được câu trả lời từ bạn.', hint: 'Bản thu đang trống hoặc quá ngắn. Hãy thu lại và đọc to, rõ.' };
  if (code.includes('RECOGNITION'))
    return { title: 'Uspeak chưa nghe rõ giọng đọc của bạn.', hint: 'Thu lại ở nơi yên tĩnh, đưa micro lại gần và đọc to, rõ ràng.' };
  if (code === 'REFERENCE_TEXT_EMPTY')
    return { title: 'Câu hỏi này chưa có câu mẫu để đối chiếu.', hint: 'Vui lòng báo giáo viên để được hỗ trợ.' };
  return { title: 'Uspeak chưa chấm được câu này.', hint: 'Có thể do kết nối tạm thời. Hãy thử thu lại; nếu vẫn lỗi hãy báo giáo viên.' };
}

/** Thẻ nhận xét phát âm (Azure) — điểm tổng, 4 tiêu chí, câu nghe được, từ cần luyện. */
export function SpeakingFeedback({ result }: { result: QuizResult }) {
  const warning = useThemeColor('warning');
  const d = result.details ?? {};
  const hasDetails = [d.strictScore, d.pronScore, d.accuracyScore, d.fluencyScore, d.prosodyScore].some((v) => v !== undefined);

  if (!hasDetails) {
    const info = describeQuizFailure(result);
    return (
      <View className="flex-row items-start gap-3 rounded-xl bg-warning-soft p-3">
        <Ionicons name="alert-circle" size={18} color={warning} />
        <View className="flex-1 gap-0.5">
          <Text className="text-sm font-semibold text-warning">{info.title}</Text>
          <Text className="text-xs text-foreground">{info.hint}</Text>
        </View>
      </View>
    );
  }

  const overall = Math.round(Number(d.strictScore ?? d.pronScore ?? 0));
  // Tiêu chí Azure không chấm (vd ngữ điệu ở locale không hỗ trợ) → "Không chấm", không vẽ thanh 0
  const reported = d.reportedScores && typeof d.reportedScores === 'object' ? (d.reportedScores as Record<string, unknown>) : null;
  const scored = (key: string, v: unknown) => (reported ? reported[key] != null : v !== undefined);
  const metrics = [
    { label: 'Chính xác', value: Number(d.accuracyScore ?? 0), ok: scored('accuracy', d.accuracyScore) },
    { label: 'Trôi chảy', value: Number(d.fluencyScore ?? 0), ok: scored('fluency', d.fluencyScore) },
    { label: 'Đầy đủ', value: Number(d.completenessScore ?? 0), ok: scored('completeness', d.completenessScore) },
    { label: 'Ngữ điệu', value: Number(d.prosodyScore ?? 0), ok: scored('prosody', d.prosodyScore) },
  ];
  const wordIssues: { word?: string; accuracyScore?: number }[] = Array.isArray(d.strictScoring?.wordIssues)
    ? d.strictScoring.wordIssues
    : [];
  const recognized = String(d.recognizedText || '').trim().replace(/\.+$/, '');

  return (
    <View className="gap-3 rounded-xl border border-border bg-surface p-3">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-semibold text-foreground">Nhận xét phát âm</Text>
        <View className="h-12 w-12 items-center justify-center rounded-full border-4 border-brand-soft">
          <Text className="text-base font-bold text-brand">{overall}</Text>
        </View>
      </View>
      <View className="gap-2">
        {metrics.map((m) => (
          <View key={m.label} className="gap-1">
            <View className="flex-row justify-between">
              <Text className="text-xs text-muted">{m.label}</Text>
              <Text className="text-xs font-semibold text-foreground">{m.ok ? Math.round(m.value) : 'Không chấm'}</Text>
            </View>
            <View className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
              {m.ok ? <View className="h-full rounded-full bg-brand" style={{ width: `${Math.max(0, Math.min(100, m.value))}%` }} /> : null}
            </View>
          </View>
        ))}
      </View>
      <View className="gap-1 rounded-lg bg-surface-muted p-2.5">
        <Text className="text-xs font-semibold uppercase text-muted">Uspeak nghe được</Text>
        <Text className="text-sm text-foreground">{recognized || 'Không nhận diện được giọng nói'}</Text>
      </View>
      {wordIssues.length ? (
        <View className="gap-1.5">
          <Text className="text-xs font-semibold uppercase text-warning">Từ cần luyện lại</Text>
          <View className="flex-row flex-wrap gap-1.5">
            {wordIssues.map((w, i) => (
              <View key={`${w.word}-${i}`} className="rounded-full bg-warning-soft px-2.5 py-1">
                <Text className="text-xs font-semibold text-warning">
                  {w.word || 'Từ'} · {Math.round(Number(w.accuracyScore || 0))}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}
