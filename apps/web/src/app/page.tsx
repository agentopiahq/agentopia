import { type Metadata } from 'next';

import Hero from '@/components/Hero';
import { TAGLINE, TITLE } from '@/constants';
import { STRUCTURED_DATA, pageMetadata } from '@/seo';

const HOME_TITLE = `${TITLE} | ${TAGLINE}`;

export const metadata: Metadata = pageMetadata({ path: '/', title: HOME_TITLE });

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        // Server-rendered, so crawlers read it without running the office.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
      />
      <Hero />
    </>
  );
}
