import OfficeScene from '@/components/OfficeScene';

/**
 * The home page is the live office and nothing else: the credits, the
 * copyright and the links that used to sit under it are lettered in the
 * office's own corners by the viewer. The page's heading and words are the
 * home page's (`app/page.tsx`), beside it.
 */
export default function Hero() {
  return (
    <section id="hero" aria-label="The office" className="h-svh w-full">
      <OfficeScene />
    </section>
  );
}
