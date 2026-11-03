import { Linking, Text, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/format';

import { groupBySection, type StudentSurvey, type StudentSurveyQuestion } from './api';

function AnswerView({ question }: { question: StudentSurveyQuestion }) {
  if (!question.answer.length) {
    return <Text className="text-[14px] italic text-muted">Không trả lời</Text>;
  }
  if (question.type === 'URL') {
    return (
      <View className="gap-0.5">
        {question.answer.map((url) => (
          <Text key={url} className="text-[14px] text-brand" onPress={() => void Linking.openURL(url)}>
            {url}
          </Text>
        ))}
      </View>
    );
  }
  if (question.answer.length > 1) {
    return (
      <View className="gap-1">
        {question.answer.map((value, i) => (
          <View key={i} className="flex-row gap-2">
            <Text className="text-[14px] text-muted">•</Text>
            <Text className="shrink text-[14px] leading-5 text-foreground" selectable>
              {value}
            </Text>
          </View>
        ))}
      </View>
    );
  }
  return (
    <Text className="text-[14px] leading-5 text-foreground" selectable>
      {question.answer[0]}
    </Text>
  );
}

/** 1 phiếu khảo sát: tiêu đề + lớp/“Khảo sát chung” + ngày làm, rồi từng câu hỏi xếp dọc (web là 2 cột). */
export function SurveyCard({ survey }: { survey: StudentSurvey }) {
  return (
    <View className="overflow-hidden rounded-2xl border border-border bg-surface">
      <View className="gap-1.5 border-b border-border bg-surface-muted px-4 py-3">
        <Text className="text-[15px] font-bold text-foreground">{survey.title}</Text>
        <View className="flex-row flex-wrap items-center gap-1.5">
          {survey.scope === 'GENERAL' ? (
            <Badge label="Khảo sát chung" tone="violet" />
          ) : survey.class ? (
            <>
              <Badge label={survey.class.class_code || 'Lớp'} tone="info" />
              <Text className="shrink text-[12px] text-muted" numberOfLines={1}>
                {survey.class.class_name}
              </Text>
            </>
          ) : null}
        </View>
        <Text className="text-[12px] text-muted">
          Ngày làm: <Text className="font-semibold text-foreground">{formatDateTime(survey.submitted_at)}</Text>
        </Text>
      </View>

      {survey.questions.length === 0 ? (
        <Text className="px-4 py-6 text-center text-[13px] text-muted">Phiếu không có câu hỏi</Text>
      ) : (
        groupBySection(survey.questions).map((group, groupIndex) => (
          <View key={groupIndex}>
            {group.section ? (
              <Text className="bg-brand-soft px-4 py-2 text-[11.5px] font-bold uppercase tracking-wider text-brand">{group.section}</Text>
            ) : null}
            {group.items.map(({ question, index }) => (
              <View key={`${question.field_key}-${index}`} className="gap-1 border-t border-border px-4 py-3">
                <Text className={`text-[13px] font-semibold ${question.highlight ? 'text-danger' : 'text-muted'}`}>
                  {index + 1}. {question.label}
                </Text>
                <AnswerView question={question} />
              </View>
            ))}
          </View>
        ))
      )}
    </View>
  );
}
