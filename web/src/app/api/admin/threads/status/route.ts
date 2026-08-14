import { NextResponse } from 'next/server';
import { getThreadsAccount } from '@/lib/threads/account';

export async function GET() {
  const account = await getThreadsAccount();
  if (!account) return NextResponse.json({ connected: false });
  return NextResponse.json({
    connected: true,
    username: account.username,
    tokenExpiresAt: account.tokenExpiresAt.toISOString(),
  });
}
