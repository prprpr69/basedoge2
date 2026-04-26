import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BasedDodge - Endless Dodger on Base',
  description: 'Dodge the obstacles. Survive forever. Built on Base Layer 2.',
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen overflow-hidden">{children}</body>
    </html>
  );
}
