import type { Metadata } from 'next';
import { use } from 'react';

import CustomMarkdown from '@/components/CustomMarkdown';
import { getFileContent } from '@/lib/file';
import { pageMetadata } from '@/seo';

export const metadata: Metadata = pageMetadata({
  path: '/privacy',
  title: 'Privacy Policy',
  description:
    'How Agentopia handles your information: what the website collects, and what the agentopia command keeps on your own machine.',
});

async function getPrivacyPolicyContent() {
  return await getFileContent('src/legal/privacy.md');
}

export default function PrivacyPolicyPage() {
  const content = use(getPrivacyPolicyContent());

  return (
    <div className="mx-1 py-12 text-slate-800">
      <CustomMarkdown markdown={content} />
    </div>
  );
}
