import { ReactNode } from 'react';

import Footer from '@/components/Footer';
import Header from '@/components/Header';

/** The legal pages keep the site's header and footer; the home page is the office alone. */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <main>
        <Header />

        {children}
      </main>

      <Footer />
    </>
  );
}
