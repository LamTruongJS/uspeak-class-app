/**
 * Việc cần làm khi quay lại phòng chat từ màn Thông tin phòng (mở ô tìm, nhảy tới tin ghim).
 *
 * Màn Thông tin đặt intent rồi `router.back()`; màn phòng đọc + xoá trong useFocusEffect. Không
 * dùng params của router vì navigate tới route đang nằm dưới stack có thể đẩy thêm một màn phòng
 * mới (tuỳ phiên bản expo-router) — back + intent thì luôn về đúng màn cũ, giữ nguyên vị trí cuộn.
 */
export type RoomIntent = { roomId: string } & ({ type: 'search' } | { type: 'jump'; messageId: string });

let pending: RoomIntent | null = null;

export function setRoomIntent(intent: RoomIntent) {
  pending = intent;
}

/** Lấy intent của phòng này (nếu có) và xoá luôn để không chạy lại. */
export function takeRoomIntent(roomId: string): RoomIntent | null {
  if (!pending || pending.roomId !== roomId) return null;
  const intent = pending;
  pending = null;
  return intent;
}
