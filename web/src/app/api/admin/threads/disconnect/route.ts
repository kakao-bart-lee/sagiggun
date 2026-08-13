import { NextResponse } from 'next/server';
import { clearThreadsAccount } from '@/lib/threads/account';

export async function POST() {
  await clearThreadsAccount();
  return NextResponse.json({ ok: true });
}
