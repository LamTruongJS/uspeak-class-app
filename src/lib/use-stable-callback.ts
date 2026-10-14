import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * Hàm có địa chỉ KHÔNG đổi giữa các lần render nhưng luôn gọi bản mới nhất.
 * Dùng cho callback truyền xuống item của danh sách dài (memo): nếu callback đổi theo dữ liệu
 * (vd jumpTo phụ thuộc danh sách tin) thì mỗi tin mới làm MỌI item vẽ lại.
 * Chỉ gọi trong event handler — không gọi lúc render.
 */
export function useStableCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: A) => ref.current(...args), []);
}
