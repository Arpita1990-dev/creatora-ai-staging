import './globals.css';
import { headers } from 'next/headers';
import { getLocaleConfig } from '@/lib/locales';
import { AuthProvider } from '@/components/AuthProvider';
import CreatoraBackground from '@/components/CreatoraBackground';

export const metadata = {
  title: 'Creatora AI — AI Content Creation & Social Publishing',
  description: 'Create AI-powered images, videos and avatar-led content and publish directly to Facebook, Instagram, LinkedIn and YouTube with Creatora AI.',
  icons: {
    icon: '/branding/creatora-icon.png',
    shortcut: '/branding/creatora-icon.png',
    apple: '/branding/creatora-icon.png',
  },
};

export default async function RootLayout({ children }) {
  // Locale is derived from the URL path by middleware.js and passed
  // through as a plain response header â€” the root layout is shared by
  // every locale's route tree, so it can't take a `locale` prop directly.
  const headerList = await headers();
  const { htmlLang } = getLocaleConfig(headerList.get('x-locale'));

  return (
    <html lang={htmlLang}>
      <body>
        <div className="creatora-app-frame">
          <CreatoraBackground />
          <AuthProvider>{children}</AuthProvider>
        </div>
      </body>
    </html>
  );
}

