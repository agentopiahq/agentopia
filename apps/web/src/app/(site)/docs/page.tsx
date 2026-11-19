import { type Metadata } from 'next';

import MarkdownPage from '@/app/(site)/MarkdownPage';
import { pageMetadata } from '@/seo';

export const metadata: Metadata = pageMetadata('/docs');

export default function Page() {
  return <MarkdownPage route="/docs" />;
}
