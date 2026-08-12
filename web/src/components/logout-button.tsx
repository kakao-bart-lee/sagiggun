'use client';

import { useRouter } from 'next/navigation';

export function LogoutButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      // 나머지 nav 항목과 같은 이유로 px-1.5 py-2 — 텍스트 줄높이만으로는 24px 미달.
      className="shrink-0 whitespace-nowrap px-1.5 py-2 hover:text-fog"
      onClick={async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        router.push('/admin/login');
        router.refresh();
      }}
    >
      로그아웃
    </button>
  );
}
