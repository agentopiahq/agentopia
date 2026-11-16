import type { Metadata } from 'next';
import { use } from 'react';

import CustomMarkdown from '@/components/CustomMarkdown';
import { getFileContent } from '@/lib/file';
import { pageMetadata } from '@/seo';

export const metadata: Metadata = {
  title: 'Terms of Service',
  ...pageMetadata({
    path: '/terms',
    title: 'Terms of Service',
    description:
      'The terms for using the Agentopia website, the agentopia command-line tool and its plugins.',
  }),
};

async function getTermsOfServiceContent() {
  return await getFileContent('src/legal/terms.md');
}

export default function TermsOfServicePage() {
  const content = use(getTermsOfServiceContent());

  return (
    <div className="mx-1 py-12 text-slate-800">
      <CustomMarkdown markdown={content} />
    </div>
  );
}
