import { useLocalSearchParams } from 'expo-router';

import { DriveScreen } from '@/features/documents/drive-screen';

/** Nội dung một thư mục trong kho tài liệu. */
export default function DocumentFolderScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  return <DriveScreen parentId={id} title={name} />;
}
