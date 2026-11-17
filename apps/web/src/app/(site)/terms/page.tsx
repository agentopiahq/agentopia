import { type Metadata } from 'next';

import MarkdownPage from '@/app/(site)/MarkdownPage';
import { pageMetadata } from '@/seo';

export const metadata: Metadata = pageMetadata('/terms');

export default function Page() {
  return <MarkdownPage route="/terms" />;
}
