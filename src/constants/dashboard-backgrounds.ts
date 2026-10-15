/** Bộ banner Trang chủ cho mọi vai trò; chọn theo seed để ảnh không đổi giữa các lần render trong cùng một phiên. */
export const DASHBOARD_HEADER_BACKGROUNDS = [
  require('../../assets/images/dashboard-headers/student-mountains.jpg'),
  require('../../assets/images/dashboard-headers/student-library.jpg'),
  require('../../assets/images/dashboard-headers/student-forest.jpg'),
  require('../../assets/images/dashboard-headers/student-city-blue-hour.jpg'),
  require('../../assets/images/dashboard-headers/student-study.jpg'),
  require('../../assets/images/dashboard-headers/student-coast-sunrise.jpg'),
  require('../../assets/images/dashboard-headers/student-campus.jpg'),
  require('../../assets/images/dashboard-headers/student-learning-studio.jpg'),
  require('../../assets/images/dashboard-headers/student-autumn-lake.jpg'),
  require('../../assets/images/dashboard-headers/student-observatory.jpg'),
  require('../../assets/images/dashboard-headers/student-countryside.jpg'),
  require('../../assets/images/dashboard-headers/student-creative-atelier.jpg'),
] as const;

export function dashboardHeaderBackground(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return DASHBOARD_HEADER_BACKGROUNDS[Math.abs(hash) % DASHBOARD_HEADER_BACKGROUNDS.length];
}
