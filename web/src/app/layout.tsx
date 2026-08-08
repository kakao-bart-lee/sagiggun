import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '매칭 관리자',
  description: '자기소개 수집과 게시 문구 검수',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
