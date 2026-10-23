import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { showToast } from '@/components/ui/toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api, getErrorMessage } from '@/lib/api/client';
import { useThemeColor } from '@/theme/use-theme-color';

import { invalidateAfterSubmit, submitApi, type AssignmentDetail } from '../detail-api';
import { Notice } from './assignment-header';
import { existingImages, ImagesEditor, resolveImageKeys, type PickedImage } from './images-editor';
import { hasInvalid, makeLink, validUrls, YoutubeLinksEditor, type YoutubeLink } from './youtube-links-editor';

/**
 * Các kiểu nộp bài (port từ uspeak-class-fe my-assignments/[id]/submit/*):
 * - Video: dán link YouTube. Video HV đã tải thẳng lên Bunny (từ web) được giữ nguyên khi sửa bài; app chưa tải lên được
 * - Ảnh: chọn/chụp ảnh, nén rồi upload S3
 * - Nhiều mục: mỗi mục là video hoặc ảnh
 * - Shadowing: không nộp ở đây, mở app Shadowing qua SSO
 *
 * Chế độ: `can_submit` → nộp mới (hoặc nộp lại khi GV yêu cầu làm lại);
 * đã nộp + `can_edit_submission` (chưa ai nhận chấm) → cho sửa bài nộp.
 */

type Mode = 'submit' | 'edit' | 'readonly';

export function getMode(a: AssignmentDetail): Mode {
  if (a.can_submit) return 'submit';
  if (a.can_edit_submission && a.latest_submission) return 'edit';
  return 'readonly';
}

/** Khung chung: tiêu đề khối + nội dung + nút nộp; sửa bài thì ẩn sau nút "Sửa bài nộp". */
function FormSection({
  mode,
  title,
  hint,
  children,
  submitting,
  canSubmit,
  onSubmit,
}: {
  mode: Mode;
  title: string;
  hint?: string;
  children: ReactNode;
  submitting: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
}) {
  const [editing, setEditing] = useState(false);
  if (mode === 'readonly') return null;
  if (mode === 'edit' && !editing) {
    return (
      <Button title="Sửa bài nộp" icon="create-outline" variant="secondary" onPress={() => setEditing(true)} />
    );
  }
  return (
    <View className="gap-4 rounded-2xl border border-border bg-surface p-4">
      <View className="gap-1">
        <Text className="text-lg font-semibold text-foreground">{title}</Text>
        {hint ? <Text className="text-sm text-muted">{hint}</Text> : null}
      </View>
      {children}
      <Button
        title={mode === 'edit' ? 'Cập nhật bài nộp' : 'Nộp bài'}
        icon="paper-plane"
        loading={submitting}
        disabled={!canSubmit}
        onPress={onSubmit}
      />
    </View>
  );
}

/** Chạy hàm nộp + báo lỗi + chuyển màn thành công. */
function useSubmitter(assignment: AssignmentDetail) {
  const [submitting, setSubmitting] = useState(false);
  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      setSubmitting(true);
      try {
        await fn();
        invalidateAfterSubmit(assignment._id);
        router.replace({
          pathname: '/submit-success',
          params: { id: assignment._id, grading: assignment.requires_grading ? '1' : '0' },
        });
      } catch (err) {
        showToast('error', 'Chưa nộp được bài', err instanceof Error && !('response' in err) ? err.message : getErrorMessage(err));
      } finally {
        setSubmitting(false);
      }
    },
    [assignment._id, assignment.requires_grading],
  );
  return { submitting, run };
}

// ─── Video (link YouTube) ───────────────────────────────────────────────────

export function VideoSubmit({ assignment }: { assignment: AssignmentDetail }) {
  const mode = getMode(assignment);
  const latest = assignment.latest_submission;
  // Nộp lại theo yêu cầu GV thì để trống (nhập link mới), sửa bài thì nạp link cũ.
  const initial =
    mode === 'edit' ? (latest?.video_urls?.length ? latest.video_urls : latest?.video_url ? [latest.video_url] : []) : [];
  const [links, setLinks] = useState<YoutubeLink[]>(() => (initial.length ? initial.map((u) => makeLink(u)) : [makeLink()]));
  const { submitting, run } = useSubmitter(assignment);
  const urls = validUrls(links);

  return (
    <FormSection
      mode={mode}
      title="Nộp video bài làm"
      hint="Quay video, đăng lên YouTube ở chế độ Công khai hoặc Không công khai, rồi dán link vào đây."
      submitting={submitting}
      canSubmit={urls.length > 0 && !hasInvalid(links)}
      onSubmit={() =>
        run(() => (mode === 'edit' && latest ? submitApi.edit(latest._id, { video_urls: urls }) : submitApi.video(assignment._id, urls)))
      }>
      <YoutubeLinksEditor links={links} onChange={setLinks} />
    </FormSection>
  );
}

// ─── Ảnh ────────────────────────────────────────────────────────────────────

export function ImageSubmit({ assignment }: { assignment: AssignmentDetail }) {
  const mode = getMode(assignment);
  const latest = assignment.latest_submission;
  const [images, setImages] = useState<PickedImage[]>(() =>
    mode === 'edit' ? existingImages(latest?.image_urls, latest?.image_keys) : [],
  );
  const { submitting, run } = useSubmitter(assignment);

  return (
    <FormSection
      mode={mode}
      title="Nộp ảnh bài làm"
      hint="Chụp rõ nét, đủ sáng. Tối đa 10 ảnh."
      submitting={submitting}
      canSubmit={images.length > 0}
      onSubmit={() =>
        run(async () => {
          const keys = await resolveImageKeys(images, submitApi.uploadImages);
          return mode === 'edit' && latest
            ? submitApi.edit(latest._id, { image_keys: keys })
            : submitApi.image(assignment._id, keys);
        })
      }>
      <ImagesEditor images={images} onChange={setImages} max={10} />
    </FormSection>
  );
}

// ─── Nhiều mục ──────────────────────────────────────────────────────────────

interface ItemState {
  links: YoutubeLink[];
  images: PickedImage[];
}

export function MultiTaskSubmit({ assignment }: { assignment: AssignmentDetail }) {
  const mode = getMode(assignment);
  const items = [...(assignment.submission_items ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const { submitting, run } = useSubmitter(assignment);

  const [state, setState] = useState<Record<string, ItemState>>(() => {
    const prev = new Map(
      (mode === 'edit' ? (assignment.latest_submission?.item_submissions ?? []) : []).map((s) => [s.item_key, s]),
    );
    return Object.fromEntries(
      items.map((def) => {
        const p = prev.get(def.key);
        return [
          def.key,
          {
            links: p?.video_urls?.length ? p.video_urls.map((u) => makeLink(u)) : [makeLink()],
            images: existingImages(p?.image_urls, p?.image_keys),
          },
        ];
      }),
    );
  });

  const missing = items.find((def) => {
    const st = state[def.key];
    return def.type === 'youtube_video' ? validUrls(st.links).length === 0 || hasInvalid(st.links) : st.images.length === 0;
  });

  return (
    <FormSection
      mode={mode}
      title={`Nộp bài (${items.length} mục)`}
      hint={missing ? `Còn thiếu: ${missing.label}` : 'Đã đủ các mục, sẵn sàng nộp.'}
      submitting={submitting}
      canSubmit={!missing}
      onSubmit={() =>
        run(async () => {
          const payload = [];
          for (const def of items) {
            const st = state[def.key];
            payload.push(
              def.type === 'youtube_video'
                ? { item_key: def.key, video_urls: validUrls(st.links) }
                : { item_key: def.key, image_keys: await resolveImageKeys(st.images, submitApi.uploadImages) },
            );
          }
          return submitApi.multi(assignment._id, payload);
        })
      }>
      {items.map((def, i) => (
        <View key={def.key} className="gap-3 border-t border-border pt-4">
          <View className="flex-row items-center gap-2">
            <Text className="flex-1 text-base font-semibold text-foreground">
              {i + 1}. {def.label}
            </Text>
            <Badge label={def.type === 'youtube_video' ? 'Video' : 'Ảnh'} tone="info" />
            {!def.requires_grading ? <Badge label="Không chấm" tone="violet" /> : null}
          </View>
          {def.instructions ? <Text className="text-sm text-muted">{def.instructions}</Text> : null}
          {def.type === 'youtube_video' ? (
            <YoutubeLinksEditor
              links={state[def.key].links}
              max={20}
              onChange={(links) => setState((s) => ({ ...s, [def.key]: { ...s[def.key], links } }))}
            />
          ) : (
            <ImagesEditor
              images={state[def.key].images}
              max={20}
              onChange={(images) => setState((s) => ({ ...s, [def.key]: { ...s[def.key], images } }))}
            />
          )}
        </View>
      ))}
    </FormSection>
  );
}

// ─── Shadowing ──────────────────────────────────────────────────────────────

export function ShadowingPanel({ assignment }: { assignment: AssignmentDetail }) {
  const info = assignment.shadowing!;
  const [opening, setOpening] = useState(false);
  const p = info.progress;
  const done = p?.parts_completed ?? 0;
  const total = p?.parts_total ?? info.parts_total;
  const pct = total ? Math.round((done / total) * 100) : 0;

  async function open() {
    setOpening(true);
    try {
      // SSO sang Shadowing đúng bài — cùng endpoint web dùng (class-be /sso/shadowing)
      const { data } = await api.post<{ url?: string }>('/sso/shadowing', {
        redirect: info.deep_link_path || '/assignments',
      });
      if (!data.url) throw new Error('Không mở được Shadowing.');
      await WebBrowser.openBrowserAsync(data.url);
    } catch (err) {
      showToast('error', 'Không mở được Shadowing', getErrorMessage(err));
    } finally {
      setOpening(false);
    }
  }

  return (
    <View className="gap-4 rounded-2xl border border-border bg-surface p-4">
      <Text className="text-lg font-semibold text-foreground">Bài luyện Shadowing</Text>
      <Text className="text-sm text-muted">
        {info.targets_label} · yêu cầu độ chính xác ≥ {info.min_accuracy}%
      </Text>
      <View className="gap-1.5">
        <View className="flex-row justify-between">
          <Text className="text-sm text-muted">Tiến độ</Text>
          <Text className="text-sm font-semibold text-foreground">
            {done}/{total} phần{p?.accuracy != null ? ` · chính xác ${Math.round(p.accuracy)}%` : ''}
          </Text>
        </View>
        <View className="h-2 overflow-hidden rounded-full bg-surface-muted">
          <View className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
        </View>
      </View>
      <Button title={done ? 'Luyện tiếp' : 'Bắt đầu luyện'} icon="headset" loading={opening} onPress={open} />
    </View>
  );
}

// ─── Bài kiểm tra dựng sẵn ──────────────────────────────────────────────────

/** Bài kiểm tra dựng sẵn (test_template, vd EET) có giao diện làm bài riêng chỉ có trên web. */
export function TestTemplateNotice() {
  return (
    <Notice
      tone="info"
      icon="desktop-outline"
      title="Bài kiểm tra này làm trên máy tính"
      body="Bài có đề, audio và đồng hồ đếm ngược riêng — vui lòng mở class.uspeak.vn trên máy tính để làm bài."
    />
  );
}

export function SuccessIcon() {
  const success = useThemeColor('success');
  return (
    <View className="h-20 w-20 items-center justify-center rounded-full bg-success-soft">
      <Ionicons name="checkmark-done" size={40} color={success} />
    </View>
  );
}
