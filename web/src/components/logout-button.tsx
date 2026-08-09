'use client';

import { useRouter } from 'next/navigation';

export function LogoutButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      className="hover:text-fog"
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
