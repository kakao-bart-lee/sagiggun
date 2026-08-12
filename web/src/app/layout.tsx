import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Some Love',
  description: '자기소개 수집과 게시 문구 검수',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        {/* 폰트 CSS와 그 안의 woff2가 모두 이 오리진에서 온다. 커넥션을 미리 열어 두면
            연결 왕복(DNS+TLS)이 CSS 요청 자체와 겹치지 않고 먼저 끝난다. */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://cdn.jsdelivr.net" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>
        {/*
          THESIS: Session strip queues the desk; split proof is where approval happens — not a SaaS dashboard.
          OWN-WORLD: Ink-black blotter, white accession cards, yellow/red/blue outlined telop seals and stamp CTAs.
          STORY: Operator picks a profile from today's strip, compares photos+source to draft, stamps approve.
          FIRST VIEWPORT: Top strip of cards + selected split desk (photos/source | draft/actions); 「새 프로필」 yellow stamp.
          FORM: Accession Register × Variety Telop chroma; seed d561092c steered to Register×Telop; hybrid Strip+Proof.
          FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
        */}
        {children}
      </body>
    </html>
  );
}
