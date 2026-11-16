import { use } from 'react';

import CustomMarkdown from '@/components/CustomMarkdown';
import StructuredData from '@/components/StructuredData';
import { getFileContent } from '@/lib/file';
import { PAGES, type Route } from '@/seo';

/** A page that is its markdown (`PAGES[route].markdown`), with its JSON-LD. */
export default function MarkdownPage({ route }: { route: Route }) {
  const content = use(getFileContent(PAGES[route].markdown));
  return (
    <article className="mx-1 py-12 text-slate-800">
      <StructuredData route={route} />
      <CustomMarkdown markdown={content} />
    </article>
  );
}
