/**
 * Danh sách ngân hàng chuẩn VietQR cho ô chọn ngân hàng nhận tiền chấm bài.
 *
 * ⚠️ NGUỒN GỐC là `uspeak-class-fe/src/utils/vietqr-banks.ts` (bên đó còn phần nhận diện tên
 * ngân hàng gõ tay — app không cần vì app chỉ CHỌN từ danh sách). Thêm/bớt ngân hàng thì sửa
 * bên đó trước rồi chép sang đây; `code` phải khớp vì CRM dựng ảnh QR theo mã này.
 */
export interface VietQrBank {
  /** Mã VietQR, VD: 'VPB' */
  code: string;
  /** Tên ngắn hay gọi, VD: 'VPBank' */
  shortName: string;
  /** Tên đầy đủ */
  name: string;
}

export const VIETQR_BANKS: VietQrBank[] = [
  { code: 'CAKE', shortName: 'CAKE', name: 'CAKE by VPBank' },
  { code: 'UBANK', shortName: 'Ubank', name: 'Ubank by VPBank' },
  { code: 'TIMO', shortName: 'Timo', name: 'Timo by Bản Việt Bank' },
  { code: 'PGB', shortName: 'PGBank', name: 'Ngân hàng TMCP Thịnh vượng và Phát triển' },
  { code: 'SGICB', shortName: 'SaigonBank', name: 'Ngân hàng TMCP Sài Gòn Công Thương' },
  { code: 'VCB', shortName: 'Vietcombank', name: 'Ngân hàng TMCP Ngoại thương Việt Nam' },
  { code: 'BIDV', shortName: 'BIDV', name: 'Ngân hàng TMCP Đầu tư và Phát triển Việt Nam' },
  { code: 'ICB', shortName: 'VietinBank', name: 'Ngân hàng TMCP Công thương Việt Nam' },
  { code: 'VBA', shortName: 'Agribank', name: 'Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam' },
  { code: 'TCB', shortName: 'Techcombank', name: 'Ngân hàng TMCP Kỹ thương Việt Nam' },
  { code: 'MB', shortName: 'MBBank', name: 'Ngân hàng TMCP Quân đội' },
  { code: 'VPB', shortName: 'VPBank', name: 'Ngân hàng TMCP Việt Nam Thịnh Vượng' },
  { code: 'ACB', shortName: 'ACB', name: 'Ngân hàng TMCP Á Châu' },
  { code: 'TPB', shortName: 'TPBank', name: 'Ngân hàng TMCP Tiên Phong' },
  { code: 'STB', shortName: 'Sacombank', name: 'Ngân hàng TMCP Sài Gòn Thương Tín' },
  { code: 'HDB', shortName: 'HDBank', name: 'Ngân hàng TMCP Phát triển TP. Hồ Chí Minh' },
  { code: 'SHB', shortName: 'SHB', name: 'Ngân hàng TMCP Sài Gòn - Hà Nội' },
  { code: 'VIB', shortName: 'VIB', name: 'Ngân hàng TMCP Quốc tế Việt Nam' },
  { code: 'EIB', shortName: 'Eximbank', name: 'Ngân hàng TMCP Xuất Nhập khẩu Việt Nam' },
  { code: 'MSB', shortName: 'MSB', name: 'Ngân hàng TMCP Hàng Hải Việt Nam' },
  { code: 'OCB', shortName: 'OCB', name: 'Ngân hàng TMCP Phương Đông' },
  { code: 'LPB', shortName: 'LPBank', name: 'Ngân hàng TMCP Lộc Phát Việt Nam' },
  { code: 'SEAB', shortName: 'SeABank', name: 'Ngân hàng TMCP Đông Nam Á' },
  { code: 'SCB', shortName: 'SCB', name: 'Ngân hàng TMCP Sài Gòn' },
  { code: 'ABB', shortName: 'ABBANK', name: 'Ngân hàng TMCP An Bình' },
  { code: 'BAB', shortName: 'BacABank', name: 'Ngân hàng TMCP Bắc Á' },
  { code: 'NAB', shortName: 'NamABank', name: 'Ngân hàng TMCP Nam Á' },
  { code: 'VAB', shortName: 'VietABank', name: 'Ngân hàng TMCP Việt Á' },
  { code: 'NCB', shortName: 'NCB', name: 'Ngân hàng TMCP Quốc Dân' },
  { code: 'PVCB', shortName: 'PVcomBank', name: 'Ngân hàng TMCP Đại Chúng Việt Nam' },
  { code: 'KLB', shortName: 'KienlongBank', name: 'Ngân hàng TMCP Kiên Long' },
  { code: 'VIETBANK', shortName: 'VietBank', name: 'Ngân hàng TMCP Việt Nam Thương Tín' },
  { code: 'VCCB', shortName: 'BVBank', name: 'Ngân hàng TMCP Bản Việt' },
  { code: 'BVB', shortName: 'BaoVietBank', name: 'Ngân hàng TMCP Bảo Việt' },
  { code: 'GPB', shortName: 'GPBank', name: 'Ngân hàng Thương mại TNHH MTV Dầu Khí Toàn Cầu' },
  { code: 'CBB', shortName: 'CBBank', name: 'Ngân hàng Thương mại TNHH MTV Xây dựng Việt Nam' },
  { code: 'PBVN', shortName: 'PublicBank', name: 'Ngân hàng TNHH MTV Public Việt Nam' },
  { code: 'SHBVN', shortName: 'ShinhanBank', name: 'Ngân hàng TNHH MTV Shinhan Việt Nam' },
  { code: 'WVN', shortName: 'Woori', name: 'Ngân hàng TNHH MTV Woori Việt Nam' },
  { code: 'HSBC', shortName: 'HSBC', name: 'Ngân hàng TNHH MTV HSBC (Việt Nam)' },
  { code: 'SCVN', shortName: 'StandardChartered', name: 'Ngân hàng TNHH MTV Standard Chartered Việt Nam' },
  { code: 'UOB', shortName: 'UOB', name: 'Ngân hàng United Overseas Bank Việt Nam' },
  { code: 'CIMB', shortName: 'CIMB', name: 'Ngân hàng TNHH MTV CIMB Việt Nam' },
];

/** Tên hiển thị: "VPBank — Ngân hàng TMCP Việt Nam Thịnh Vượng" */
export function bankLabel(b: VietQrBank) {
  return b.shortName === b.name ? b.name : `${b.shortName} — ${b.name}`;
}

export function findBank(code?: string | null) {
  return code ? (VIETQR_BANKS.find((b) => b.code === code) ?? null) : null;
}
