import { Ionicons } from '@expo/vector-icons';
import { useState, type ComponentProps } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showToast } from '@/components/ui/toast';
import { useActionSheet } from '@/components/ui/action-sheet';
import { DateTimeField } from '@/components/ui/date-time-field';
import { htmlToPlain } from '@/components/ui/rich-text';
import { getErrorMessage } from '@/lib/api/client';
import { plainToHtml } from '@/lib/html';

import {
  CLASS_TEST_TEMPLATES,
  countSubmissions,
  criteriaFrom,
  fetchEditableAssignment,
  multiTaskErrors,
  quizErrors,
  sanitizeQuizQuestions,
  TYPE_LOOK,
  useAssignmentTypes,
  useRubricTemplates,
  useSaveAssignment,
  type AssignmentAttachment,
  type Criteria,
  type Difficulty,
  type EditableAssignment,
  type QuizQuestion,
  type SubmissionItem,
} from './api';
import { AttachmentsEditor, InheritSheet, SaveTemplateButton } from './extras';
import { Choice, Field, Input, Section, SmallButton, ToggleRow } from './fields';
import { CriteriaEditor, ItemsEditor } from './items-editor';
import { QuizEditor } from './quiz-editor';
import { pickQuizExcel, shareQuizTemplate } from './quiz-import';
import { ShadowingForm } from './shadowing-form';

type IconName = ComponentProps<typeof Ionicons>['name'];

const toDate = (v?: string | null) => (v ? new Date(v) : null);
const endOfToday = () => {
  const d = new Date();
  d.setHours(23, 59, 0, 0);
  return d;
};

/**
 * Form tạo / sửa bài tập — 1 màn cuộn dọc chia thẻ (thay 3 tab Thông tin / Câu hỏi / Cài đặt của web):
 * Loại bài → Thông tin → Câu hỏi (quiz) / Mục nộp (nhiều mục) → Tiêu chí chấm → Hạn & cài đặt.
 * Thanh dưới: tạo mới = "Lưu nháp" + "Xuất bản"; sửa = "Lưu" (+ "Lưu & xuất bản" nếu đang là nháp).
 *
 * Mô tả / yêu cầu nhận xét web soạn bằng Tiptap (HTML): app soạn chữ thường → đoạn văn HTML; khi chữ không
 * đổi so với nguồn (bài đang sửa / bài kế thừa / mẫu bài kiểm tra) thì gửi lại nguyên HTML gốc → không mất định dạng.
 *
 * Tạo mới còn có: bài kiểm tra dựng sẵn (EET), kế thừa bài có sẵn, loại Shadowing (form riêng ShadowingForm).
 */
export function AssignmentForm({ classId, initial, onSaved }: { classId: string; initial?: EditableAssignment; onSaved: () => void }) {
  const sheet = useActionSheet();
  const insets = useSafeAreaInsets();
  const types = useAssignmentTypes();
  const templates = useRubricTemplates();
  const save = useSaveAssignment();
  const editing = !!initial;

  // HTML gốc của mô tả / yêu cầu nhận xét + bản chữ thường để so (xem chú thích đầu file)
  const [baseDesc, setBaseDesc] = useState({ html: initial?.description ?? '', plain: htmlToPlain(initial?.description) });
  const [baseReview, setBaseReview] = useState({ html: initial?.review_requirement ?? '', plain: htmlToPlain(initial?.review_requirement) });
  const [typeId, setTypeId] = useState(initial?.assignment_type_id ?? '');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [session, setSession] = useState(initial?.session_number ?? '');
  const [desc, setDesc] = useState(baseDesc.plain);
  const [review, setReview] = useState(baseReview.plain);
  const [testTemplate, setTestTemplate] = useState(initial?.test_template ?? '');
  const [attachments, setAttachments] = useState<AssignmentAttachment[]>(initial?.attachments ?? []);
  const [inheritOpen, setInheritOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [questions, setQuestions] = useState<QuizQuestion[]>(Array.isArray(initial?.quiz_questions) ? initial.quiz_questions : []);
  const [items, setItems] = useState<SubmissionItem[]>(Array.isArray(initial?.submission_items) ? initial.submission_items : []);
  const [criteria, setCriteria] = useState<Criteria[]>(initial ? criteriaFrom(initial) : []);
  const [due, setDue] = useState<Date | null>(toDate(initial?.submission_deadline));
  const [late, setLate] = useState(initial?.allow_late_submission ?? false);
  const [requiresGrading, setRequiresGrading] = useState(initial?.requires_grading !== false);
  const [gradingDue, setGradingDue] = useState<Date | null>(toDate(initial?.grading_deadline));
  const [gradingMinutes, setGradingMinutes] = useState(String(initial?.grading_duration_minutes ?? 30));
  const [duration, setDuration] = useState(initial?.required_duration_minutes ? String(initial.required_duration_minutes) : '');
  const [difficulty, setDifficulty] = useState<Difficulty>(initial?.difficulty ?? 'medium');
  const [publishAt, setPublishAt] = useState<Date | null>(toDate(initial?.scheduled_publish_at));
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  // Shadowing chỉ có lúc tạo mới (giao từ thư viện Shadowing, sửa bên hệ Shadowing)
  const typeList = (types.data ?? []).filter((t) => !editing || t.code !== 'shadowing');
  const effTypeId = typeId || typeList[0]?._id || '';
  const code = typeList.find((t) => t._id === effTypeId)?.code ?? '';
  const isQuiz = code === 'quiz';
  const isMulti = code === 'multi_task';
  const isVideo = code === 'video_speaking' || code === 'youtube_video';
  const isShadowing = code === 'shadowing';
  const typeLabel = typeList.find((t) => t._id === effTypeId)?.label ?? '';
  const appliedTemplate = CLASS_TEST_TEMPLATES.find((t) => t.code === testTemplate);

  const applyTestTemplate = (tpl: (typeof CLASS_TEST_TEMPLATES)[number]) => {
    const video = typeList.find((t) => t.code === 'video_speaking');
    if (!video) return showToast('warning', 'Thiếu loại "Video Speaking"', 'Liên hệ quản trị viên kiểm tra cấu hình loại bài tập.');
    setTestTemplate(tpl.code);
    setTypeId(video._id);
    setTitle(tpl.assignmentTitle);
    const plain = htmlToPlain(tpl.descriptionHtml);
    setBaseDesc({ html: tpl.descriptionHtml, plain });
    setDesc(plain);
    setRequiresGrading(true);
    setDuration(String(tpl.durationMinutes));
    setQuestions([]);
    setItems([]);
    showToast('success', `Đã áp "${tpl.name}"`, 'Thêm tiêu chí chấm điểm, đặt hạn nộp rồi xuất bản.');
  };

  const inherit = async (id: string) => {
    setInheritOpen(false);
    try {
      const a = await fetchEditableAssignment(id);
      setTitle(a.title || '');
      const d = { html: a.description ?? '', plain: htmlToPlain(a.description) };
      const r = { html: a.review_requirement ?? '', plain: htmlToPlain(a.review_requirement) };
      setBaseDesc(d);
      setDesc(d.plain);
      setBaseReview(r);
      setReview(r.plain);
      setLate(a.allow_late_submission ?? false);
      setRequiresGrading(a.requires_grading !== false);
      setDifficulty(a.difficulty ?? 'medium');
      setDuration(a.required_duration_minutes ? String(a.required_duration_minutes) : '');
      setGradingMinutes(String(a.grading_duration_minutes ?? 30));
      setSession(a.session_number ?? '');
      setTestTemplate(a.test_template ?? '');
      setQuestions(Array.isArray(a.quiz_questions) ? a.quiz_questions : []);
      setItems(Array.isArray(a.submission_items) ? a.submission_items : []);
      setCriteria(criteriaFrom(a));
      setAttachments(a.attachments ?? []);
      showToast('success', 'Đã kế thừa bài tập', 'Kiểm tra lại nội dung, đặt hạn nộp rồi lưu.');
    } catch (e) {
      showToast('error', 'Không tải được bài để kế thừa', getErrorMessage(e));
    }
  };

  const importExcel = async () => {
    setImporting(true);
    try {
      const res = await pickQuizExcel();
      if (!res) return;
      if (res.errors.length) {
        showToast(
          'error',
          `File có ${res.errors.length} lỗi`,
          [...res.errors.slice(0, 8), res.errors.length > 8 ? `…và ${res.errors.length - 8} lỗi khác` : ''].filter(Boolean).join('\n'),
          6000,
        );
        return;
      }
      if (!res.questions.length) return showToast('warning', 'File chưa có câu hỏi hợp lệ');
      setQuestions((q) => [...q, ...res.questions]);
      showToast('success', `Đã nhập ${res.questions.length} câu hỏi`);
    } catch (e) {
      showToast('error', 'Không đọc được file Excel', `Tải file mẫu và nhập đúng định dạng.\n${getErrorMessage(e)}`);
    } finally {
      setImporting(false);
    }
  };
  const grading = isMulti ? items.some((i) => i.requires_grading) : isQuiz ? false : requiresGrading;

  // ─── Kiểm tra (giống web) ───
  const errors: string[] = [];
  if (!title.trim()) errors.push('Chưa nhập tiêu đề bài tập');
  // Web chặn hạn nộp trước hôm nay; khi SỬA mà không đổi hạn cũ thì cho qua (bài đã quá hạn vẫn sửa được nội dung)
  const dueChanged = !initial || due?.getTime() !== toDate(initial.submission_deadline)?.getTime();
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const dueError = due && dueChanged && due < startToday ? 'Hạn nộp bài phải từ hôm nay trở đi' : '';
  const gradingDueError = due && gradingDue && gradingDue < due ? 'Hạn nhận xét phải sau hạn nộp bài' : '';
  if (dueError) errors.push(dueError);
  if (gradingDueError) errors.push(gradingDueError);
  if (isQuiz) errors.push(...quizErrors(questions));
  if (isMulti) errors.push(...multiTaskErrors(items));
  const criteriaError = isVideo && grading && !criteria.some((c) => c.name.trim()) ? 'Bài video có nhận xét bắt buộc phải có ít nhất 1 tiêu chí chấm điểm.' : '';
  if (criteriaError) errors.push(criteriaError);

  const submit = async (publish?: boolean) => {
    setTried(true);
    if (errors.length) return showToast('warning', 'Chưa lưu được', errors.slice(0, 6).join('\n'));
    const valid = criteria.filter((c) => c.name.trim());
    const payload: Record<string, unknown> = {
      class_id: initial?.class_id ?? classId,
      assignment_type_id: effTypeId,
      title: title.trim(),
      description: desc.trim() === baseDesc.plain.trim() && baseDesc.html ? baseDesc.html : desc.trim() ? plainToHtml(desc) : undefined,
      review_requirement:
        review.trim() === baseReview.plain.trim() && baseReview.html ? baseReview.html : review.trim() ? plainToHtml(review) : undefined,
      test_template: testTemplate || (editing ? '' : undefined),
      attachments: attachments.map(({ key, name, type, size }) => ({ key, name, type, size })),
      grading_rubric: valid.map((c) => `${c.name.trim()} (${c.maxScore} điểm): ${c.description.trim()}`).join('\n') || undefined,
      grading_criteria: valid.length ? valid.map((c) => ({ name: c.name.trim(), max_score: c.maxScore, description: c.description.trim() })) : editing ? [] : undefined,
      required_duration_minutes: (isQuiz || code === 'essay') && duration ? Number(duration) : undefined,
      submission_deadline: due?.toISOString(),
      allow_late_submission: late,
      grading_deadline: gradingDue?.toISOString(),
      grading_duration_minutes: gradingMinutes ? Number(gradingMinutes) : undefined,
      difficulty,
      requires_grading: grading,
      quiz_questions: isQuiz ? sanitizeQuizQuestions(questions) : undefined,
      submission_items: isMulti ? items : undefined,
      session_number: session.trim() || undefined,
      scheduled_publish_at: publishAt?.toISOString(),
      ...(publish !== undefined ? { is_published: publish } : {}),
    };

    const run = async () => {
      setBusy(true);
      try {
        await save.mutateAsync({ id: initial?._id, payload });
        onSaved();
      } catch (e) {
        showToast('error', editing ? 'Không cập nhật được' : 'Không tạo được bài tập', getErrorMessage(e));
      } finally {
        setBusy(false);
      }
    };

    // Đổi từ "không cần chấm" sang "cần chấm" khi đã có bài nộp → hỏi lại (giống web)
    if (initial && grading && initial.requires_grading === false) {
      setBusy(true);
      const n = await countSubmissions(initial._id).catch(() => 0);
      setBusy(false);
      if (n > 0) {
        sheet.confirm({
          title: 'Đã có bài nộp — vẫn đổi sang cần chấm?',
          message: `${n} bài đã hoàn thành sẽ tự chuyển sang trạng thái chờ chấm.`,
          label: 'Xác nhận',
          icon: 'refresh-outline',
          onConfirm: () => void run(),
        });
        return;
      }
    }
    await run();
  };

  if (types.isLoading) return <ActivityIndicator className="py-10" />;

  const typeSection = (
    <Section icon="apps" title="Loại bài tập">
      <View className="flex-row flex-wrap justify-between gap-y-2">
        {typeList.map((t) => {
          const look = TYPE_LOOK[t.code] ?? { icon: 'document-text', color: '#6b7280', hint: '' };
          const on = t._id === effTypeId;
          return (
            <Pressable
              key={t._id}
              onPress={() => {
                setTypeId(t._id);
                if (t.code !== 'video_speaking') setTestTemplate('');
              }}
              className="w-[48.8%] gap-1 rounded-2xl border-2 p-3 active:opacity-80"
              style={{ borderColor: on ? look.color : 'transparent', backgroundColor: on ? `${look.color}12` : 'rgba(127,127,127,0.07)' }}>
              <View className="flex-row items-center gap-2">
                <Ionicons name={look.icon as IconName} size={18} color={look.color} />
                <Text className="flex-1 text-[14px] font-bold text-foreground" numberOfLines={1}>
                  {t.label}
                </Text>
              </View>
              <Text className="text-[11.5px] text-muted" numberOfLines={2}>
                {look.hint || t.description}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {editing ? <Text className="text-[12px] text-warning">Đổi loại bài khi đã có học viên nộp có thể làm lệch bài nộp cũ.</Text> : null}
    </Section>
  );

  const bar = (children: React.ReactNode) => (
    <View className="absolute bottom-0 left-0 right-0 flex-row gap-2.5 border-t border-border bg-surface px-4 pt-3" style={{ paddingBottom: insets.bottom + 12 }}>
      {children}
    </View>
  );

  if (isShadowing && !editing) {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ShadowingForm
          classId={classId}
          onCreated={onSaved}
          header={typeSection}
          renderBar={(submitShadowing, shadowingBusy) => bar(<BarButton label="Giao bài Shadowing" primary busy={shadowingBusy} onPress={submitShadowing} />)}
        />
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
      <ScrollView contentContainerClassName="gap-3 p-4" contentContainerStyle={{ paddingBottom: 120 + insets.bottom }} keyboardShouldPersistTaps="handled">
        {typeSection}

        {/* Bắt đầu nhanh (chỉ khi tạo mới) */}
        {!editing ? (
          <Section icon="flash" title="Bắt đầu nhanh">
            {CLASS_TEST_TEMPLATES.map((tpl) => {
              const on = testTemplate === tpl.code;
              return (
                <View key={tpl.code} className={`gap-2 rounded-2xl border-2 p-3.5 ${on ? 'border-success bg-success-soft' : 'border-transparent bg-surface-muted'}`}>
                  <View className="flex-row items-center gap-2">
                    <Ionicons name="school" size={18} color={on ? '#059669' : '#7c3aed'} />
                    <Text className="flex-1 text-[14.5px] font-bold text-foreground">{tpl.name}</Text>
                    <View className="rounded-full bg-violet-soft px-2 py-0.5">
                      <Text className="text-[10.5px] font-bold text-violet">{tpl.badge}</Text>
                    </View>
                  </View>
                  <Text className="text-[12.5px] leading-5 text-muted">{tpl.summary}</Text>
                  {on ? (
                    <View className="flex-row items-center gap-2">
                      <Ionicons name="checkmark-circle" size={16} color="#059669" />
                      <Text className="flex-1 text-[12.5px] font-semibold text-success">Đang dùng mẫu này — học viên làm bài theo đề dựng sẵn</Text>
                      <SmallButton icon="close" label="Bỏ mẫu" tone="muted" onPress={() => setTestTemplate('')} />
                    </View>
                  ) : (
                    <SmallButton icon="add" label="Dùng mẫu này" onPress={() => applyTestTemplate(tpl)} />
                  )}
                </View>
              );
            })}
            <Pressable onPress={() => setInheritOpen(true)} className="flex-row items-center gap-3 rounded-2xl bg-surface-muted p-3.5 active:opacity-80">
              <Ionicons name="git-branch-outline" size={20} color="#2563eb" />
              <View className="flex-1">
                <Text className="text-[14.5px] font-bold text-foreground">Kế thừa bài có sẵn</Text>
                <Text className="text-[12.5px] text-muted">Chép nội dung từ 1 bài {typeLabel} ở lớp khác</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
            </Pressable>
          </Section>
        ) : appliedTemplate ? (
          <View className="flex-row items-center gap-2 rounded-2xl bg-success-soft p-3.5">
            <Ionicons name="school" size={18} color="#059669" />
            <Text className="flex-1 text-[13px] font-semibold text-success">Bài dùng mẫu “{appliedTemplate.name}”</Text>
          </View>
        ) : null}

        {/* Thông tin */}
        <Section icon="document-text" title="Thông tin">
          <Field label="Tiêu đề *" error={tried && !title.trim() ? 'Chưa nhập tiêu đề' : undefined}>
            <Input value={title} onChange={setTitle} placeholder="Vd: Speaking Test Unit 1" />
          </Field>
          <Field label="Buổi học" hint="Vd: Buổi 5 — hiện trên thẻ bài tập của học viên">
            <Input value={session} onChange={setSession} placeholder="Buổi 1" />
          </Field>
          <Field label="Hướng dẫn cho học viên">
            <Input value={desc} onChange={setDesc} placeholder="Viết hướng dẫn làm bài…" multiline minHeight={110} />
          </Field>
          {grading ? (
            <Field label="Yêu cầu nhận xét (cho người chấm)">
              <Input value={review} onChange={setReview} placeholder="Nội dung cần nhận xét…" multiline />
            </Field>
          ) : null}
        </Section>

        {isQuiz ? (
          <Section icon="help-circle" title={`Câu hỏi · ${questions.length}`} right={<Text className="text-[12px] font-semibold text-muted">Tổng 10 điểm</Text>}>
            <View className="flex-row flex-wrap gap-2">
              <SmallButton icon={importing ? 'hourglass-outline' : 'document-attach-outline'} label="Nhập từ Excel" tone="muted" onPress={() => void importExcel()} />
              <SmallButton icon="download-outline" label="File mẫu" tone="muted" onPress={() => void shareQuizTemplate().catch((e) => showToast('error', 'Không tạo được file mẫu', getErrorMessage(e)))} />
            </View>
            <QuizEditor questions={questions} onChange={setQuestions} />
          </Section>
        ) : null}

        {isMulti ? (
          <Section icon="list" title={`Mục nộp · ${items.length}`}>
            <ItemsEditor items={items} onChange={setItems} />
          </Section>
        ) : null}

        {grading ? (
          <Section icon="ribbon" title="Tiêu chí chấm điểm">
            {criteriaError && tried ? <Text className="text-[12.5px] font-semibold text-danger">{criteriaError}</Text> : null}
            <CriteriaEditor criteria={criteria} onChange={setCriteria} templates={templates.data ?? []} />
            <SaveTemplateButton criteria={criteria} defaultName={title.trim() ? `Template - ${title.trim()}` : ''} />
          </Section>
        ) : null}

        <Section icon="attach" title={`Tài liệu đính kèm${attachments.length ? ` · ${attachments.length}` : ''}`}>
          <AttachmentsEditor value={attachments} onChange={setAttachments} />
        </Section>

        {/* Cài đặt */}
        <Section icon="settings" title="Hạn nộp & cài đặt">
          <Field label="Hạn nộp bài" error={tried ? dueError : undefined}>
            <DateTimeField value={due} onChange={setDue} clearable placeholder="Không giới hạn" defaultValue={endOfToday} />
          </Field>
          <ToggleRow title="Cho phép nộp muộn" hint="Quá hạn học viên vẫn nộp được (bị đánh dấu trễ)" value={late} onChange={setLate} />
          {!isQuiz && !isMulti ? (
            <ToggleRow title="Cần chấm bài" hint="Tắt: học viên nộp xong là hoàn thành, không qua người chấm" value={requiresGrading} onChange={setRequiresGrading} />
          ) : null}
          {grading ? (
            <>
              <Field label="Hạn nhận xét" error={tried ? gradingDueError : undefined}>
                <DateTimeField value={gradingDue} onChange={setGradingDue} clearable placeholder="Không đặt" defaultValue={endOfToday} />
              </Field>
              <Field label="Thời gian nhận xét mỗi bài (phút)">
                <Input value={gradingMinutes} onChange={(v) => setGradingMinutes(v.replace(/\D/g, ''))} numeric placeholder="30" />
              </Field>
            </>
          ) : null}
          {isQuiz || code === 'essay' ? (
            <Field label="Thời gian làm bài (phút)" hint="Để trống = không giới hạn">
              <Input value={duration} onChange={(v) => setDuration(v.replace(/\D/g, ''))} numeric placeholder="Vd: 30" />
            </Field>
          ) : null}
          <Field label="Độ khó">
            <Choice
              items={[
                { value: 'easy', label: 'Dễ' },
                { value: 'medium', label: 'Trung bình' },
                { value: 'hard', label: 'Khó' },
              ]}
              value={difficulty}
              onChange={setDifficulty}
            />
          </Field>
          <Field label="Hẹn giờ xuất bản" hint="Bài tự hiện với học viên vào giờ này (lưu nháp để dùng)">
            <DateTimeField value={publishAt} onChange={setPublishAt} clearable placeholder="Không hẹn" />
          </Field>
        </Section>

        {tried && errors.length ? (
          <View className="gap-1 rounded-2xl bg-danger-soft p-3.5">
            {errors.slice(0, 8).map((e) => (
              <Text key={e} className="text-[12.5px] text-danger">
                • {e}
              </Text>
            ))}
          </View>
        ) : null}
      </ScrollView>

      {/* Thanh lưu */}
      <View className="absolute bottom-0 left-0 right-0 flex-row gap-2.5 border-t border-border bg-surface px-4 pt-3" style={{ paddingBottom: insets.bottom + 12 }}>
        {editing ? (
          <>
            <BarButton label={initial?.is_published ? 'Cập nhật bài tập' : 'Lưu thay đổi'} primary={!!initial?.is_published} busy={busy} onPress={() => void submit(initial?.is_published ? true : undefined)} />
            {!initial?.is_published ? <BarButton label="Lưu & xuất bản" primary busy={busy} onPress={() => void submit(true)} /> : null}
          </>
        ) : (
          <>
            <BarButton label="Lưu nháp" busy={busy} onPress={() => void submit(false)} />
            <BarButton label={publishAt ? 'Lưu & hẹn giờ' : 'Xuất bản'} primary busy={busy} onPress={() => void submit(publishAt ? false : true)} />
          </>
        )}
      </View>
      {inheritOpen ? (
        <InheritSheet
          typeId={effTypeId}
          typeLabel={typeLabel}
          onClose={() => setInheritOpen(false)}
          onPick={(a) =>
            sheet.confirm({
              title: 'Kế thừa bài này?',
              message: `Nội dung đang soạn sẽ bị thay bằng “${a.title}”.`,
              label: 'Kế thừa',
              icon: 'download-outline',
              danger: false,
              onConfirm: () => void inherit(a._id),
            })
          }
        />
      ) : null}
      {sheet.sheet}
    </KeyboardAvoidingView>
  );
}

function BarButton({ label, primary, busy, onPress }: { label: string; primary?: boolean; busy: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      className={`h-12 flex-1 items-center justify-center rounded-2xl active:opacity-85 ${primary ? 'bg-brand' : 'bg-surface-muted'} ${busy ? 'opacity-60' : ''}`}>
      {busy && primary ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text className={`text-[15px] font-bold ${primary ? 'text-white' : 'text-foreground'}`}>{label}</Text>
      )}
    </Pressable>
  );
}
