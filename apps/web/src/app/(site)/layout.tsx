import { ReactNode } from 'react';

import Footer from '@/components/Footer';
import Header from '@/components/Header';

/** The plain pages (about, terms, privacy) keep the site's header and footer; the home page is the office alone. */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Header />
      <main>{children}</main>
      <Footer />
    </>
  );
}
