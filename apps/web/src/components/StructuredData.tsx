import { type Route, structuredData } from '@/seo';

/** A page's JSON-LD, server-rendered so crawlers read it without running anything. */
export default function StructuredData({ route }: { route: Route }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData(route)) }}
    />
  );
}
