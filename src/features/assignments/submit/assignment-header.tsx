import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState, type ComponentProps } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { htmlToPlain, RichText } from '@/components/ui/rich-text';
import { formatDateTime } from '@/lib/format';
import { useThemeColor } from '@/theme/use-theme-color';

import { SUBMISSION_STATUS, type AssignmentDetail } from '../detail-api';

/** Thông tin chung của bài tập — dùng ở đầu mọi kiểu nộp (video / ảnh / nhiều mục / quiz). */
export function AssignmentHeader({ assignment }: { assignment: AssignmentDetail }) {
  const muted = useThemeColor('muted');
  const success = useThemeColor('success');
  const [now] = useState(Date.now);
  const [expanded, setExpanded] = useState(false);
  // Chỉ dùng bản chữ thường để ĐO độ dài (quyết định có nút "Xem thêm"), còn hiện thì vẽ đủ
  // định dạng — mô tả bài tập hay có đậm, danh sách, link.
  const longDescription = htmlToPlain(assignment.description).length > 220;
  const deadline = assignment.submission_deadline;
  const overdue = !!deadline && new Date(deadline).getTime() < now;
  const latest = assignment.latest_submission;

  return (
    <View className="gap-3">
      <View className="gap-3 rounded-2xl border border-border bg-surface p-4">
        <View className="flex-row flex-wrap gap-1.5">
          {assignment.assignment_type ? <Badge label={assignment.assignment_type.label} tone="brand" /> : null}
          {assignment.is_redo ? <Badge label="Làm lại" tone="violet" /> : null}
          {!assignment.requires_grading ? <Badge label="Không cần chấm" tone="violet" /> : null}
        </View>
        <Text className="text-xl font-bold text-foreground">{assignment.title}</Text>

        {deadline ? (
          <View className="flex-row items-center gap-2">
            <Ionicons name="time-outline" size={16} color={muted} />
            <Text className={`text-sm ${overdue ? 'font-semibold text-danger' : 'text-muted'}`}>
              Hạn nộp: {formatDateTime(deadline)}
              {overdue ? ' (đã quá hạn)' : ''}
            </Text>
          </View>
        ) : null}
        {assignment.required_duration_minutes ? (
          <View className="flex-row items-center gap-2">
            <Ionicons name="hourglass-outline" size={16} color={muted} />
            <Text className="text-sm text-muted">Thời gian làm bài: {assignment.required_duration_minutes} phút</Text>
          </View>
        ) : null}

        {assignment.description ? (
          <View>
            {/* Gấp bằng chiều cao chứ không bằng numberOfLines: nội dung giờ là nhiều khối, không
                còn là một thẻ Text để cắt dòng. */}
            <View style={longDescription && !expanded ? { maxHeight: 160, overflow: 'hidden' } : undefined}>
              <RichText html={assignment.description} />
            </View>
            {longDescription ? (
              <Pressable onPress={() => setExpanded((v) => !v)} hitSlop={6}>
                <Text className="pt-1.5 text-sm font-semibold text-brand">{expanded ? 'Thu gọn' : 'Xem thêm'}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {assignment.grading_criteria?.length ? (
          <View className="gap-1.5 border-t border-border pt-3">
            <Text className="text-sm font-semibold text-foreground">Tiêu chí chấm</Text>
            {assignment.grading_criteria.map((c) => (
              <View key={c.name} className="flex-row justify-between gap-3">
                <Text className="flex-1 text-sm text-muted">{c.name}</Text>
                <Text className="text-sm font-medium text-foreground">{c.max_score}đ</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      {assignment.is_redo && assignment.redo_reason ? (
        <Notice tone="violet" icon="refresh-circle-outline" title="Giáo viên yêu cầu làm lại" body={assignment.redo_reason} />
      ) : null}

      {latest && !assignment.is_redo ? (
        <View className="gap-3 rounded-2xl bg-success-soft p-4">
          <View className="flex-row items-start gap-3">
            <Ionicons name="checkmark-circle" size={22} color={success} />
            <View className="flex-1 gap-1">
              <Text className="text-base font-semibold text-success">Bạn đã nộp bài</Text>
              <Text className="text-sm text-foreground">
                {formatDateTime(latest.submitted_at)} · lần {latest.attempt_number}
                {latest.is_late ? ' · nộp trễ' : ''}
              </Text>
              {/* Nói rõ bài đang ở đâu: chờ nhận xét hay đã có điểm — trước chỉ biết "đã nộp" */}
              {SUBMISSION_STATUS[latest.status] ? (
                <Badge label={SUBMISSION_STATUS[latest.status].label} tone={SUBMISSION_STATUS[latest.status].tone} dot />
              ) : null}
            </View>
          </View>
          <Button
            title="Xem kết quả"
            variant="secondary"
            icon="ribbon-outline"
            onPress={() => router.push({ pathname: '/result/[id]', params: { id: latest._id } })}
          />
        </View>
      ) : null}

      {!assignment.can_submit && !assignment.can_edit_submission && !latest ? (
        <Notice
          tone="danger"
          icon="lock-closed-outline"
          title="Không thể nộp bài"
          body={assignment.cannot_submit_reason || 'Bài tập đã quá hạn nộp.'}
        />
      ) : null}
    </View>
  );
}

const NOTICE_TONE = {
  danger: { box: 'bg-danger-soft', title: 'text-danger', color: 'danger' as const },
  violet: { box: 'bg-violet-soft', title: 'text-violet', color: 'violet' as const },
  warning: { box: 'bg-warning-soft', title: 'text-warning', color: 'warning' as const },
  info: { box: 'bg-info-soft', title: 'text-info', color: 'info' as const },
};

export function Notice({
  tone,
  icon,
  title,
  body,
}: {
  tone: keyof typeof NOTICE_TONE;
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  body?: string;
}) {
  const t = NOTICE_TONE[tone];
  const color = useThemeColor(t.color);
  return (
    <View className={`flex-row items-start gap-3 rounded-2xl p-4 ${t.box}`}>
      <Ionicons name={icon} size={20} color={color} />
      <View className="flex-1 gap-0.5">
        <Text className={`text-base font-semibold ${t.title}`}>{title}</Text>
        {body ? <Text className="text-sm text-foreground">{body}</Text> : null}
      </View>
    </View>
  );
}
