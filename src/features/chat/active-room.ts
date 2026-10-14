/**
 * Phòng chat đang mở trên màn hình. Tách file riêng (không import gì) vì cả socket chat lẫn
 * bộ xử lý thông báo đẩy đều cần đọc — để chung với socket.ts sẽ tạo vòng import
 * auth.store → push → socket → auth.store.
 */
export const activeRoom: { id: string | null } = { id: null };
