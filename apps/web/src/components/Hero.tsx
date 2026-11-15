import OfficeScene from '@/components/OfficeScene';
import { DESCRIPTION, TITLE } from '@/constants';

/**
 * The home page is the live office and nothing else: the credits, the
 * copyright and the links that used to sit under it are lettered in the
 * office's own corners by the viewer.
 */
export default function Hero() {
  return (
    <section id="hero" aria-label="Hero" className="h-svh w-full">
      <h1 className="sr-only">{TITLE}</h1>
      <p className="sr-only">{DESCRIPTION}</p>
      <OfficeScene />
    </section>
  );
}
