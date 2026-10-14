import { API_URL } from '@/config/env';
import { tokenStorage } from '@/lib/auth/token-storage';

import { refreshSession } from './client';

/** File trên máy (ảnh vừa chọn, bản ghi âm…) — React Native gửi multipart bằng {uri,name,type}. */
export interface LocalFile {
  uri: string;
  name: string;
  type: string;
}

export class UploadError extends Error {
  constructor(
    message: string,
    public status: number,
    public data: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/** Người dùng bấm Huỷ giữa chừng — chỗ gọi chỉ việc bỏ qua, KHÔNG báo lỗi gửi. */
export class UploadAbortedError extends Error {
  constructor() {
    super('Đã huỷ tải lên');
  }
}

export interface UploadOptions {
  /** Phần trăm đã gửi (0..100). Chỉ có khi máy chủ/mạng báo được tổng dung lượng. */
  onProgress?: (percent: number) => void;
  /** Huỷ giữa chừng (nút Huỷ ở bong bóng tin đang gửi). */
  signal?: AbortSignal;
}

/**
 * Gửi một request có đính kèm bằng XMLHttpRequest.
 *
 * Vì sao KHÔNG dùng fetch: fetch của React Native không có sự kiện tiến trình — gửi 1 video 40MB
 * thì màn hình đứng im không biết tới đâu, và không huỷ được. XHR có cả hai (`upload.onprogress`,
 * `abort()`), vẫn tự gắn boundary cho FormData y như fetch.
 */
function sendXhr(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: FormData | Blob,
  opts?: UploadOptions,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    if (opts?.signal?.aborted) {
      reject(new UploadAbortedError());
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value);

    if (opts?.onProgress) {
      xhr.upload.onprogress = (e: ProgressEvent) => {
        if (e.lengthComputable && e.total > 0) opts.onProgress?.(Math.min(100, Math.round((e.loaded / e.total) * 100)));
      };
    }

    const onAbort = () => xhr.abort();
    opts?.signal?.addEventListener('abort', onAbort);
    const done = () => opts?.signal?.removeEventListener('abort', onAbort);

    xhr.onload = () => {
      done();
      resolve({ status: xhr.status, text: xhr.responseText ?? '' });
    };
    xhr.onerror = () => {
      done();
      reject(new UploadError('Không gửi được tệp — kiểm tra lại kết nối mạng.', 0));
    };
    xhr.onabort = () => {
      done();
      reject(new UploadAbortedError());
    };
    xhr.send(body as unknown as Document);
  });
}

/**
 * Gửi multipart/form-data. KHÔNG dùng axios: axios 1.x trên React Native hay serialize FormData sai
 * (gửi "[object FormData]"). Tự refresh token 1 lần khi gặp 401, giống interceptor của `api`.
 */
export async function uploadMultipart<T>(
  path: string,
  fields: Record<string, LocalFile | LocalFile[] | string>,
  method: 'POST' | 'PATCH' | 'PUT' = 'POST',
  opts?: UploadOptions,
): Promise<T> {
  const build = () => {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      for (const v of Array.isArray(value) ? value : [value]) {
        // RN FormData nhận object {uri,name,type} cho file — kiểu DOM không khai báo nên phải ép.
        form.append(key, v as unknown as Blob);
      }
    }
    return form;
  };

  const send = (accessToken?: string) =>
    sendXhr(
      `${API_URL}${path}`,
      method,
      {
        Accept: 'application/json',
        'X-Client-Type': 'mobile',
        'x-class-mode': 'production',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      build(),
      opts,
    );

  let res = await send((await tokenStorage.get())?.accessToken);
  if (res.status === 401) {
    const tokens = await refreshSession();
    if (tokens) res = await send(tokens.accessToken);
  }

  let data: Record<string, unknown> = {};
  try {
    data = res.text ? (JSON.parse(res.text) as Record<string, unknown>) : {};
  } catch {
    data = {};
  }
  if (res.status < 200 || res.status >= 300) {
    const msg = typeof data.message === 'string' ? data.message : 'Tải tệp lên thất bại, vui lòng thử lại.';
    throw new UploadError(msg, res.status, data);
  }
  return data as T;
}

/**
 * PUT thẳng lên S3 bằng link presigned (tệp lớn, không qua class-be). Cũng chạy XHR để có tiến
 * trình + huỷ được — đây mới là chỗ lâu nhất khi gửi video.
 */
export async function uploadBinary(url: string, fileUri: string, contentType: string, opts?: UploadOptions): Promise<void> {
  const blob = await (await fetch(fileUri)).blob();
  const res = await sendXhr(url, 'PUT', { 'Content-Type': contentType }, blob, opts);
  if (res.status < 200 || res.status >= 300) throw new UploadError(`Tải lên thất bại (${res.status})`, res.status);
}
