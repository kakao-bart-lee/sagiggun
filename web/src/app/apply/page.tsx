import Link from 'next/link';
import { ApplyForm } from './apply-form';

export const metadata = { title: '소개팅 신청 — Some Love' };

export default function ApplyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <nav className="mb-6">
        <Link href="/" className="text-sm font-bold text-fog-muted hover:text-fog">
          ← 목록으로
        </Link>
      </nav>

      <header className="mb-6">
        <h1 className="text-2xl font-extrabold text-fog">소개팅 신청 💗</h1>
        <p className="mt-2 text-sm leading-relaxed text-fog-muted">
          아래 양식을 채워주시면 주인장이 확인 후 익명 소개글로 다듬어 올려드려요. 스레드 안 하는
          친구 대신 신청도 가능합니다.
        </p>
        <ul className="mt-4 flex flex-col gap-1 text-xs text-fog-muted">
          <li>✔️ 사진은 주인장만 확인합니다. 공개 목록에는 절대 올라가지 않아요.</li>
          <li>✔️ 자기관리 조금이라도 되신 분만 신청해주세요.</li>
          <li>✔️ 미성년자는 신청할 수 없습니다.</li>
        </ul>
      </header>

      <ApplyForm />
    </main>
  );
}
