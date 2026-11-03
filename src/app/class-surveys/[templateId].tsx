import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, Text, View, type LayoutChangeEvent } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { KeyboardAvoider } from '@/components/ui/keyboard-avoider';
import { LoadingView, StateView } from '@/components/ui/state-view';
import { showToast } from '@/components/ui/toast';
import { useGeneralSurveys, useSubmitSurvey, useSurveySubmission, useSurveyTemplate } from '@/features/surveys/class-survey';
import {
  answersToMap,
  cleanDescription,
  findMissingRequired,
  groupSurveySections,
  isFieldAnswered,
  sortSurveyFields,
  surveyMinutes,
  toAnswerList,
  type SurveyAnswerMap,
} from '@/features/surveys/survey-form-logic';
import { SurveyQuestionForm } from '@/features/surveys/survey-question-form';
import { getErrorMessage } from '@/lib/api/client';
import { formatDate } from '@/lib/format';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

/**
 * Điền phiếu khảo sát — dùng chung cho 2 loại (như màn /surveys của web):
 * - Theo lớp (`classId`): nạp sẵn đáp án đã gửi, gửi lại = CẬP NHẬT câu trả lời cũ.
 * - Khảo sát chung (không có `classId`): mỗi học viên làm đúng 1 lần, gửi KHÔNG kèm `class_id`;
 *   đã gửi thì chỉ xem lại (CRM trả 409 nếu nộp lại).
 * Đủ 7 loại câu của web (thêm SCALE), nhóm câu theo `section`, "Khác: <nội dung>", `max_select`.
 */
export default function SurveyFormScreen() {
  const { templateId, classId, title } = useLocalSearchParams<{ templateId: string; classId?: string; title?: string }>();
  const isGeneral = !classId;
  const brand = useThemeColor('brand');
  const success = useThemeColor('success');

  const general = useGeneralSurveys({ enabled: isGeneral });
  const template = useSurveyTemplate(templateId, { enabled: !isGeneral });
  const submission = useSurveySubmission(templateId, classId ?? '');
  const submit = useSubmitSurvey();
  const pull = usePullRefresh(() =>
    isGeneral ? general.refetch() : Promise.all([template.refetch(), submission.refetch()]),
  );

  const generalItem = isGeneral ? general.data?.find((g) => g.template_id === templateId) : undefined;
  const source = isGeneral
    ? generalItem && {
        title: generalItem.template_title,
        description: generalItem.template_description,
        fields: generalItem.template_fields,
      }
    : template.data;
  const loading = isGeneral ? general.isLoading : template.isLoading;
  const error = isGeneral ? general.error : template.error;

  // Chỉ giữ phần người dùng vừa sửa; câu đã gửi lấy thẳng từ server → không cần nạp bằng useEffect
  // (React Compiler cấm setState trong effect) và luôn đúng sau khi refetch.
  const [draft, setDraft] = useState<SurveyAnswerMap>({});
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [showAnswers, setShowAnswers] = useState(false);
  const serverAnswers = useMemo(
    () => answersToMap(isGeneral ? generalItem?.answers : submission.data?.answers),
    [isGeneral, generalItem, submission.data],
  );
  const answers = useMemo(() => ({ ...serverAnswers, ...draft }), [serverAnswers, draft]);
  const rawFields = source?.fields;
  const fields = useMemo(() => sortSurveyFields(rawFields), [rawFields]);
  const sectionCount = useMemo(() => groupSurveySections(fields).filter((s) => s.title).length, [fields]);

  const answered = fields.filter((f) => isFieldAnswered(f, answers[f.field_key])).length;
  const percent = fields.length ? Math.round((answered / fields.length) * 100) : 0;
  const alreadySent = isGeneral ? !!generalItem?.submitted : submission.data?.submitted === true;
  const readOnly = isGeneral && alreadySent;

  // Cuộn tới câu còn thiếu: nhớ node từng câu, đo vị trí so với khối form (con trực tiếp của nội dung cuộn).
  const scrollRef = useRef<ScrollView>(null);
  const formRef = useRef<View>(null);
  const formY = useRef(0);
  const nodes = useRef(new Map<string, View>());
  const registerField = useCallback((key: string, node: View | null) => {
    if (node) nodes.current.set(key, node);
    else nodes.current.delete(key);
  }, []);
  const onFormLayout = (e: LayoutChangeEvent) => {
    formY.current = e.nativeEvent.layout.y;
  };
  const scrollToField = (key: string) => {
    const node = nodes.current.get(key);
    const form = formRef.current;
    if (!node || !form) return;
    node.measureLayout(form, (_x, y) => scrollRef.current?.scrollTo({ y: Math.max(0, formY.current + y - 16), animated: true }));
  };

  const update = (key: string, value: string | string[]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    if (focusKey === key) setFocusKey(null);
  };

  async function send() {
    const missing = findMissingRequired(fields, answers);
    if (missing) {
      setFocusKey(missing.field_key);
      scrollToField(missing.field_key);
      showToast('warning', 'Còn câu chưa trả lời', `Bạn chưa trả lời: "${missing.label}"`);
      return;
    }

    try {
      await submit.mutateAsync({ template_id: templateId, class_id: isGeneral ? undefined : classId, answers: toAnswerList(fields, answers) });
      // Quay lại ngay, lời cảm ơn hiện thành toast trên màn trước — không bắt bấm "Xong" chỉ để đọc
      router.back();
      showToast(
        'success',
        isGeneral ? 'Cảm ơn bạn đã hoàn thành khảo sát!' : alreadySent ? 'Đã cập nhật khảo sát' : 'Đã gửi khảo sát',
        isGeneral ? undefined : 'Cảm ơn bạn đã dành thời gian trả lời!',
      );
    } catch (err) {
      showToast('error', 'Gửi không thành công', getErrorMessage(err));
    }
  }

  const description = cleanDescription(source?.description);
  const stats = [
    `${fields.length} câu hỏi`,
    `Khoảng ${surveyMinutes(fields, source?.description)} phút`,
    ...(sectionCount > 1 ? [`${sectionCount} phần`] : []),
  ];

  return (
    <KeyboardAvoider>
      <Stack.Screen options={{ title: title || 'Khảo sát' }} />
      <View className="flex-1 bg-background">
        {loading ? (
          <LoadingView />
        ) : error || !source ? (
          <StateView
            icon={error ? 'cloud-offline-outline' : 'clipboard-outline'}
            title={error ? 'Không mở được phiếu khảo sát' : 'Phiếu khảo sát không còn mở'}
            description={error ? getErrorMessage(error) : 'Phiếu này đã đóng hoặc không còn dành cho bạn.'}
            actionLabel="Thử lại"
            onAction={() => void pull.onRefresh()}
          />
        ) : (
          <>
            <ScrollView
              ref={scrollRef}
              className="flex-1"
              contentContainerClassName="gap-4 p-4 pb-6"
              keyboardShouldPersistTaps="handled"
              refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}>
              <View className="gap-2 rounded-2xl border border-border bg-surface p-4">
                <View className="flex-row flex-wrap items-center gap-2">
                  <Badge label={alreadySent ? 'Đã gửi' : 'Chưa làm'} tone={alreadySent ? 'success' : 'warning'} />
                  {isGeneral ? <Badge label="Khảo sát chung · làm 1 lần" tone="brand" /> : null}
                  {!readOnly ? (
                    <Text className="text-[11px] text-muted">
                      {answered}/{fields.length} câu đã trả lời
                    </Text>
                  ) : null}
                </View>
                <Text className="text-[17px] font-bold leading-6 text-foreground">{source.title}</Text>
                {description ? <Text className="text-[13px] leading-5 text-muted">{description}</Text> : null}
                <Text className="text-[12px] text-muted">{stats.join(' · ')}</Text>
                {alreadySent && !isGeneral ? (
                  <Text className="text-[12px] text-success">
                    Bạn đã gửi phiếu này. Sửa câu trả lời rồi bấm cập nhật là Uspeak ghi nhận bản mới nhất.
                  </Text>
                ) : null}
                {!readOnly ? (
                  <View className="h-1 overflow-hidden rounded-full bg-surface-muted">
                    <View className={`h-full rounded-full ${percent === 100 ? 'bg-success' : 'bg-brand'}`} style={{ width: `${percent}%` }} />
                  </View>
                ) : null}
              </View>

              {readOnly ? (
                <View className="items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-6">
                  <View className="h-14 w-14 items-center justify-center rounded-2xl bg-success-soft">
                    <Ionicons name="checkmark-done" size={28} color={success} />
                  </View>
                  <Text className="text-[18px] font-bold text-foreground">Cảm ơn bạn đã chia sẻ!</Text>
                  <Text className="text-center text-[13px] leading-5 text-muted">
                    Bạn đã hoàn thành phiếu này
                    {generalItem?.submitted_at ? ` ngày ${formatDate(generalItem.submitted_at)}` : ''}. Uspeak sẽ dùng câu trả lời
                    để thiết kế bài học sát với mục tiêu của bạn hơn.
                  </Text>
                  <Button
                    title={showAnswers ? 'Ẩn câu trả lời' : 'Xem lại câu trả lời'}
                    icon={showAnswers ? 'eye-off-outline' : 'eye-outline'}
                    variant="secondary"
                    onPress={() => setShowAnswers((v) => !v)}
                    className="mt-2"
                  />
                </View>
              ) : null}

              {!readOnly || showAnswers ? (
                <View ref={formRef} onLayout={onFormLayout}>
                  <SurveyQuestionForm
                    fields={fields}
                    answers={answers}
                    onChange={update}
                    readOnly={readOnly}
                    focusFieldKey={focusKey}
                    registerField={registerField}
                  />
                </View>
              ) : null}

              {fields.length === 0 ? <StateView icon="clipboard-outline" title="Phiếu này chưa có câu hỏi nào" /> : null}
            </ScrollView>

            {fields.length > 0 && !readOnly ? (
              <View className="flex-row items-center gap-3 border-t border-border bg-surface p-3">
                <View className="min-w-0 flex-1 gap-1.5">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-[12px] text-muted">
                      Đã trả lời {answered}/{fields.length}
                    </Text>
                    <Text className="text-[12px] font-semibold text-foreground">{percent}%</Text>
                  </View>
                  <View className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
                    <View className={`h-full rounded-full ${percent === 100 ? 'bg-success' : 'bg-brand'}`} style={{ width: `${percent}%` }} />
                  </View>
                </View>
                <Button
                  title={alreadySent ? 'Cập nhật' : 'Gửi khảo sát'}
                  icon="send"
                  loading={submit.isPending}
                  onPress={send}
                />
              </View>
            ) : null}
          </>
        )}
      </View>
    </KeyboardAvoider>
  );
}
