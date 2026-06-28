import './styles.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AnswerBrief AI',
  description: 'Role-specific interview prep for telecom and regulated careers.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
