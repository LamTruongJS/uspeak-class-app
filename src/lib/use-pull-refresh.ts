import { useState } from 'react';

/**
 * Trạng thái "kéo để làm mới" — CHỈ bật khi người dùng tự kéo.
 *
 * Đừng truyền `isRefetching` của react-query vào RefreshControl: dữ liệu tự tải lại ngầm (socket
 * báo phòng đổi, app quay lại foreground…) cũng làm isRefetching = true → vòng xoay hiện ra và
 * iOS kéo danh sách giật lên đầu để chừa chỗ cho nó — đang cuộn xuống thì bị nhảy ngược lên.
 */
export function usePullRefresh(refetch: () => Promise<unknown> | unknown) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };
  return { refreshing, onRefresh };
}
