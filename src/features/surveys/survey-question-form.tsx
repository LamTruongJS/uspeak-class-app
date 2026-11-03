import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { useThemeColor } from '@/theme/use-theme-color';

import type { SurveyField } from './class-survey';
import {
  groupSurveySections,
  isFieldAnswered,
  otherMissingText,
  otherOptionOf,
  questionNote,
  scaleRange,
  splitOtherValue,
  joinOther,
  type SurveyAnswerMap,
} from './survey-form-logic';

/**
 * Form khảo sát — bản mobile của `SurveyQuestionForm` (uspeak-class-fe). Câu hỏi gom theo nhóm
 * (`section`), số câu đánh liên tục; phiếu không chia nhóm thì mỗi câu là 1 thẻ như trước.
 *
 * Đủ 7 loại câu: TEXT · TEXTAREA · URL · SELECT · RADIO · CHECKBOX (có `max_select`) · SCALE
 * (thang điểm, có/không có mục con), lựa chọn "Khác" mở ô ghi rõ (lưu "Khác: <nội dung>"),
 * `hint` + `highlight` hiện dưới câu hỏi. Giống web: câu không bắt buộc mới ghi chú, không rải dấu *.
 *
 * Mọi nhóm luôn mở (web chỉ gập/mở trong hộp thoại máy tính) — trên điện thoại cuộn liền 1 mạch
 * dễ hơn, và câu thiếu khi bấm gửi luôn nằm sẵn trên màn để cuộn tới.
 */
export interface SurveyQuestionFormProps {
  fields: SurveyField[];
  answers: SurveyAnswerMap;
  onChange?: (fieldKey: string, value: string | string[]) => void;
  readOnly?: boolean;
  /** Câu bị thiếu khi bấm gửi — tô đỏ + ghi lý do */
  focusFieldKey?: string | null;
  /** Màn gọi để nhớ vị trí từng câu (cuộn tới câu thiếu) */
  registerField?: (fieldKey: string, node: View | null) => void;
}

export function SurveyQuestionForm({ fields, answers, onChange, readOnly, focusFieldKey, registerField }: SurveyQuestionFormProps) {
  const sections = useMemo(() => groupSurveySections(fields), [fields]);
  // Phiếu không chia nhóm: hiện thẳng từng câu, không cần khối.
  const flat = sections.length === 1 && !sections[0].title;

  const renderQuestion = ({ field, no }: { field: SurveyField; no: number }, framed: boolean, divided = false) => (
    <Question
      key={field.field_key}
      field={field}
      no={no}
      value={answers[field.field_key]}
      readOnly={readOnly}
      framed={framed}
      divided={divided}
      missing={focusFieldKey === field.field_key && !isFieldAnswered(field, answers[field.field_key])}
      onChange={(v) => onChange?.(field.field_key, v)}
      registerField={registerField}
    />
  );

  if (flat) {
    return <View className="gap-3">{sections[0]?.fields.map((f) => renderQuestion(f, true))}</View>;
  }

  return (
    <View className="gap-4">
      {sections.map((section) => {
        const done = section.fields.filter(({ field }) => isFieldAnswered(field, answers[field.field_key])).length;
        const total = section.fields.length;
        return (
          <View key={section.key} className="rounded-2xl border border-border bg-surface px-3.5 pt-3.5">
            <View className="flex-row items-center gap-2.5 pb-1">
              <View className="h-8 w-8 items-center justify-center rounded-lg bg-brand-soft">
                <Text className="text-[14px] font-bold text-brand">{section.badge}</Text>
              </View>
              <Text className="shrink text-[16px] font-bold text-foreground" numberOfLines={2}>
                {section.title || 'Câu hỏi'}
              </Text>
              <View className="flex-1" />
              <Text className={`text-[12px] ${!readOnly && done === total ? 'font-semibold text-success' : 'text-muted'}`}>
                {readOnly ? `${total} câu` : `${done}/${total}`}
              </Text>
            </View>
            <View className="pb-1">{section.fields.map((f, i) => renderQuestion(f, false, i > 0))}</View>
          </View>
        );
      })}
    </View>
  );
}

function Question({
  field,
  no,
  value,
  readOnly,
  framed,
  divided,
  missing,
  onChange,
  registerField,
}: {
  field: SurveyField;
  no: number;
  value: string | string[] | undefined;
  readOnly?: boolean;
  /** true = thẻ riêng (phiếu không chia nhóm), false = 1 dòng trong khối nhóm */
  framed: boolean;
  /** Kẻ vạch phân cách với câu phía trên (trong khối nhóm) */
  divided?: boolean;
  missing: boolean;
  onChange: (value: string | string[]) => void;
  registerField?: (fieldKey: string, node: View | null) => void;
}) {
  const note = questionNote(field);
  const box = framed
    ? `rounded-2xl border p-3.5 ${missing ? 'border-danger bg-danger-soft' : 'border-border bg-surface'}`
    : `py-4 ${missing ? '-mx-2 my-1 rounded-xl bg-danger-soft px-2' : divided ? 'border-t border-border' : ''}`;

  return (
    <View ref={(node) => registerField?.(field.field_key, node)} className={`gap-2.5 ${box}`}>
      <View className="gap-1">
        <Text className="text-[15px] font-semibold leading-5 text-foreground">
          <Text className="font-medium text-muted">{no}. </Text>
          {field.label}
          {!field.required && !readOnly ? <Text className="text-[13px] font-normal text-muted"> (không bắt buộc)</Text> : null}
        </Text>
        {field.highlight && !readOnly ? (
          <Text className="text-[13px] font-medium text-orange">Câu quan trọng, bạn viết càng cụ thể càng tốt</Text>
        ) : null}
        {note ? <Text className="text-[13px] leading-5 text-muted">{note}</Text> : null}
      </View>

      <QuestionInput field={field} value={value} readOnly={readOnly} onChange={onChange} />

      {missing ? (
        <Text className="text-[13px] font-medium text-danger">
          {otherMissingText(field, value) ? 'Bạn ghi rõ ý "Khác" giúp Uspeak nhé' : 'Vui lòng trả lời câu này'}
        </Text>
      ) : null}
    </View>
  );
}

function QuestionInput({
  field,
  value,
  readOnly,
  onChange,
}: {
  field: SurveyField;
  value: string | string[] | undefined;
  readOnly?: boolean;
  onChange: (value: string | string[]) => void;
}) {
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');

  if (field.type === 'RADIO' || field.type === 'SELECT' || field.type === 'CHECKBOX') {
    return <ChoiceInput field={field} value={value} readOnly={readOnly} onChange={onChange} brand={brand} muted={muted} />;
  }

  if (field.type === 'SCALE') {
    return <ScaleInput field={field} value={value} readOnly={readOnly} onChange={onChange} />;
  }

  const text = typeof value === 'string' ? value : '';

  if (readOnly) {
    return text.trim() ? (
      <Text className="rounded-xl bg-surface-muted px-3.5 py-3 text-[14px] leading-5 text-foreground">{text.trim()}</Text>
    ) : (
      <EmptyAnswer />
    );
  }

  if (field.type === 'TEXTAREA') {
    return (
      <TextInput
        value={text}
        onChangeText={onChange}
        placeholder={field.placeholder || 'Nhập câu trả lời...'}
        placeholderTextColor={muted}
        multiline
        textAlignVertical="top"
        className="min-h-[110px] rounded-xl border border-border bg-background p-3.5 text-[15px] text-foreground"
      />
    );
  }

  const isUrl = field.type === 'URL';
  return (
    <View className="h-12 flex-row items-center gap-2 rounded-xl border border-border bg-background px-3.5">
      {isUrl ? <Ionicons name="link-outline" size={16} color={muted} /> : null}
      <TextInput
        value={text}
        onChangeText={onChange}
        placeholder={field.placeholder || (isUrl ? 'https://facebook.com/...' : 'Nhập câu trả lời...')}
        placeholderTextColor={muted}
        keyboardType={isUrl ? 'url' : 'default'}
        autoCapitalize={isUrl ? 'none' : 'sentences'}
        autoCorrect={!isUrl}
        className="h-12 flex-1 text-[15px] text-foreground"
      />
    </View>
  );
}

function ChoiceInput({
  field,
  value,
  readOnly,
  onChange,
  brand,
  muted,
}: {
  field: SurveyField;
  value: string | string[] | undefined;
  readOnly?: boolean;
  onChange: (value: string | string[]) => void;
  brand: string;
  muted: string;
}) {
  const options = field.options || [];
  const multi = field.type === 'CHECKBOX';
  // Giá trị thô (có thể là "Khác: abc").
  const raw = multi ? (Array.isArray(value) ? value : []) : typeof value === 'string' && value ? [value] : [];
  const parsed = raw.map((v) => ({ raw: v, ...splitOtherValue(field, v) }));
  const selectedBases = parsed.map((p) => p.base);
  const otherOpt = otherOptionOf(field);
  const otherSelected = otherOpt ? parsed.find((p) => p.base === otherOpt.value) : undefined;

  const max = multi ? field.max_select || 0 : 0;
  const reachedMax = max > 0 && raw.length >= max;
  const shown = readOnly ? options.filter((o) => selectedBases.includes(o.value)) : options;

  if (readOnly && !shown.length) return <EmptyAnswer />;

  const setOtherText = (text: string) => {
    if (!otherOpt) return;
    const next = joinOther(otherOpt.value, text);
    onChange(multi ? raw.map((v) => (splitOtherValue(field, v).base === otherOpt.value ? next : v)) : next);
  };

  return (
    <View className="gap-1.5">
      {shown.map((opt) => {
        const active = selectedBases.includes(opt.value);
        const blocked = !active && reachedMax;
        const otherText = readOnly && otherSelected && opt.value === otherOpt?.value ? otherSelected.text : '';
        const icon = multi ? (active ? 'checkbox' : 'square-outline') : active ? 'radio-button-on' : 'radio-button-off';
        return (
          <Pressable
            key={opt.value}
            accessibilityRole={multi ? 'checkbox' : 'radio'}
            accessibilityState={{ checked: active, disabled: readOnly || blocked }}
            disabled={readOnly || blocked}
            onPress={() => {
              if (multi) {
                onChange(active ? raw.filter((v) => splitOtherValue(field, v).base !== opt.value) : [...raw, opt.value]);
              } else {
                onChange(active && !field.required ? '' : opt.value);
              }
            }}
            className={`flex-row items-center gap-2.5 rounded-xl border p-3 active:opacity-70 ${active ? 'border-brand bg-brand-soft' : 'border-border bg-background'} ${blocked ? 'opacity-40' : ''}`}>
            <Ionicons name={icon} size={18} color={active ? brand : muted} />
            <Text className={`flex-1 text-[14px] ${active ? 'font-semibold text-brand' : 'text-foreground'}`}>
              {otherText ? `${opt.label}: ${otherText}` : opt.label}
            </Text>
          </Pressable>
        );
      })}
      {!readOnly && otherSelected ? (
        <TextInput
          autoFocus
          value={otherSelected.text}
          onChangeText={setOtherText}
          placeholder="Bạn ghi rõ giúp Uspeak nhé..."
          placeholderTextColor={muted}
          className="mt-1 h-12 rounded-xl border border-border bg-background px-3.5 text-[15px] text-foreground"
        />
      ) : null}
    </View>
  );
}

function ScaleInput({
  field,
  value,
  readOnly,
  onChange,
}: {
  field: SurveyField;
  value: string | string[] | undefined;
  readOnly?: boolean;
  onChange: (value: string | string[]) => void;
}) {
  const points = scaleRange(field);
  const items = field.scale_items?.length ? field.scale_items : null;
  const isNps = points[0] === '0';

  const scaleRow = (selected: string, pick: (v: string) => void) => (
    <View className="flex-row gap-1">
      {points.map((p) => {
        const active = selected === p;
        return (
          <Pressable
            key={p}
            accessibilityRole="button"
            accessibilityLabel={`${p} điểm`}
            accessibilityState={{ selected: active, disabled: !!readOnly }}
            disabled={readOnly}
            onPress={() => pick(p)}
            className={`h-9 flex-1 items-center justify-center rounded-lg border active:opacity-70 ${active ? 'border-brand bg-brand' : 'border-border bg-background'}`}>
            <Text className={`text-[13px] font-semibold ${active ? 'text-on-brand' : 'text-muted'}`}>{p}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  // Chú thích 2 đầu thang chỉ ghi 1 lần cho cả câu.
  const legend = readOnly ? null : (
    <View className="flex-row justify-between">
      <Text className="text-[12px] text-muted">
        {points[0]} = {isNps ? 'chắc chắn không' : 'rất yếu'}
      </Text>
      <Text className="text-[12px] text-muted">
        {points[points.length - 1]} = {isNps ? 'chắc chắn có' : 'rất tốt'}
      </Text>
    </View>
  );

  if (!items) {
    return (
      <View className="gap-1.5">
        {scaleRow(typeof value === 'string' ? value : '', (v) => onChange(v))}
        {legend}
      </View>
    );
  }

  const current = Array.isArray(value) ? value : [];
  return (
    <View className="gap-3">
      {items.map((item, i) => (
        <View key={item} className="gap-1.5">
          <Text className="text-[14px] font-medium text-foreground">{item}</Text>
          {scaleRow(String(current[i] ?? ''), (v) => {
            const next = items.map((_, idx) => String(current[idx] ?? ''));
            next[i] = v;
            onChange(next);
          })}
        </View>
      ))}
      {legend}
    </View>
  );
}

function EmptyAnswer() {
  return <Text className="text-[13px] italic text-muted">Không trả lời</Text>;
}
