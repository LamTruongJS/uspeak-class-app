import { router, type Href } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import { WEB_URL } from '@/config/env';

import type { AppFeature } from './features';

/**
 * Mở một tính năng theo trạng thái:
 * - ready   → route trong app
 * - web     → trình duyệt trong app (bản web class, cần đăng nhập web riêng)
 * - planned → màn "Sắp có"
 */
export function openFeature(feature: AppFeature) {
  if (feature.status === 'ready' && feature.route) {
    router.navigate(feature.route as Href);
    return;
  }
  if (feature.status === 'web' && feature.webPath) {
    void WebBrowser.openBrowserAsync(`${WEB_URL}${feature.webPath}`);
    return;
  }
  router.push({ pathname: '/feature/[key]', params: { key: feature.key } });
}
