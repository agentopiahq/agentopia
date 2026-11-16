import { type Metadata } from 'next';
import { use } from 'react';

import CustomMarkdown from '@/components/CustomMarkdown';
import Hero from '@/components/Hero';
import StructuredData from '@/components/StructuredData';
import { getFileContent } from '@/lib/file';
import { PAGES, pageMetadata } from '@/seo';

export const metadata: Metadata = pageMetadata('/');

export default function Home() {
  const overview = use(getFileContent(PAGES['/'].markdown));
  return (
    <main>
      <StructuredData route="/" />
      {/*
        The office is a canvas, so what it shows is also here in words, for
        screen readers and for crawlers that run no JavaScript: the same
        markdown as /about and /index.md.
      */}
      <article className="sr-only">
        <CustomMarkdown markdown={overview} />
      </article>
      <Hero />
    </main>
  );
}
