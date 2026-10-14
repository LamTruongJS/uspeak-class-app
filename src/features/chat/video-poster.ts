import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { createVideoPlayer } from 'expo-video';

/**
 * Trích 1 khung hình làm ảnh bìa cho video SẮP GỬI.
 *
 * Vì sao làm ở máy người gửi chứ không ở server: class-be chỉ có `sharp` (ảnh), muốn cắt khung
 * video phải cài thêm ffmpeg — nặng CPU trên VPS đang chật. Ở đây tệp đã nằm sẵn trên máy, lấy
 * khung chỉ tốn mili-giây và ảnh bìa gửi kèm luôn trong lượt upload.
 *
 * Hỏng (codec lạ, video 0 giây, máy yếu) thì trả `null` — tin vẫn gửi bình thường, chỉ là không
 * có ảnh bìa; KHÔNG được để lỗi này chặn việc gửi video.
 */
export async function makeVideoPoster(uri: string): Promise<{ uri: string; width: number; height: number } | null> {
  let player: ReturnType<typeof createVideoPlayer> | null = null;
  try {
    player = createVideoPlayer({ uri });
    // Chờ nạp xong (tối đa ~3s) rồi mới cắt: gọi lúc player còn 'loading' thì Android báo lỗi
    // không tìm thấy track video.
    for (let i = 0; i < 30 && player.status === 'loading'; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (player.status === 'error') return null;
    // 0.5s thay vì 0s: khung đầu của nhiều video là màn đen/chuyển cảnh.
    const [thumb] = await player.generateThumbnailsAsync([0.5], { maxWidth: 720 });
    if (!thumb) return null;
    const image = await ImageManipulator.manipulate(thumb).renderAsync();
    const out = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.7 });
    return { uri: out.uri, width: out.width, height: out.height };
  } catch {
    return null;
  } finally {
    player?.release();
  }
}
