import './styles.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AnswerBrief AI',
  metadataBase: new URL('https://www.answer-brief.com'),
  description: 'Role-specific interview prep that turns your resume and job posting into a practical interview brief.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
