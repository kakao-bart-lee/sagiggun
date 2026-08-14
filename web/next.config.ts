import type { NextConfig } from 'next';

const config: NextConfig = {
  serverExternalPackages: ['@prisma/client'],
  // next dev 전용. 터널(ngrok 등) 호스트로 개발 서버를 열 때 Next가 기본으로 막는
  // /_next/* 청크·HMR 요청을 허용한다. 값이 없으면 아무것도 허용하지 않으므로
  // 커밋돼도 기본 동작은 그대로다. 예: DEV_TUNNEL_HOST=xxxx.ngrok-free.dev
  allowedDevOrigins: process.env.DEV_TUNNEL_HOST ? [process.env.DEV_TUNNEL_HOST] : [],
};

export default config;
