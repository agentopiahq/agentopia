import { Analytics } from '@vercel/analytics/next';
import { clsx } from 'clsx';
import { type Metadata, type Viewport } from 'next';
import { Inter, Lexend } from 'next/font/google';
import { ReactNode } from 'react';

import { COPYRIGHT_HOLDER, DESCRIPTION, FULL_WEBSITE_URL, MAIN_COLOR, TITLE } from '@/constants';
import '@/styles/globals.css';
import '@/styles/tailwind.css';

export const metadata: Metadata = {
  metadataBase: new URL(FULL_WEBSITE_URL),
  title: {
    template: `%s | ${TITLE}`,
    default: TITLE,
  },
  description: DESCRIPTION,
  applicationName: TITLE,
  keywords: [
    'Claude Code',
    'coding agent',
    'AI agent visualizer',
    'agent session viewer',
    'subagents',
    'Claude Code hooks',
    'terminal coding agent',
  ],
  authors: [{ name: COPYRIGHT_HOLDER }],
  creator: COPYRIGHT_HOLDER,
  publisher: COPYRIGHT_HOLDER,
  // Pages set their own canonical URL (`pageMetadata` in `@/seo`): one set
  // here would be inherited, and mark every page a copy of the home page.
  openGraph: {
    type: 'website',
    siteName: TITLE,
    title: TITLE,
    description: DESCRIPTION,
    url: FULL_WEBSITE_URL,
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  icons: [
    { rel: 'apple-touch-icon', sizes: '180x180', url: '/apple-touch-icon.png' },
    { rel: 'icon', type: 'image/png', sizes: '32x32', url: '/favicon-32x32.png' },
    { rel: 'icon', type: 'image/png', sizes: '16x16', url: '/favicon-16x16.png' },
  ],
  manifest: '/site.webmanifest',
};

export const viewport: Viewport = {
  themeColor: MAIN_COLOR,
};

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const lexend = Lexend({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-lexend',
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={clsx(
        'h-full scroll-smooth bg-transparent antialiased',
        inter.variable,
        lexend.variable
      )}
    >
      <body className="flex h-full flex-col">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
