export const SESSION_COOKIE = 'matching_session';
export const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

const encoder = new TextEncoder();

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

function toBase64Url(bytes: ArrayBuffer): string {
  let binary = '';
  for (const b of new Uint8Array(bytes)) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sign(secret: string, payload: string): Promise<string> {
  const key = await hmacKey(secret);
  return toBase64Url(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)));
}

export async function createSessionToken(secret: string, expiresAt: number): Promise<string> {
  const payload = String(expiresAt);
  return `${payload}.${await sign(secret, payload)}`;
}

export async function verifySessionToken(
  secret: string,
  token: string,
  now: number
): Promise<boolean> {
  if (typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payload, signature] = parts;
  if (!payload || !signature) return false;

  const expiresAt = Number(payload);
  if (!Number.isFinite(expiresAt)) return false;

  // 서명을 먼저 확인한다. 만료시각은 서명에 포함되어 있으므로 위조할 수 없다.
  const expected = await sign(secret, payload);
  if (!timingSafeEqual(expected, signature)) return false;

  return expiresAt > now;
}

// 상수시간 비교. HMAC 서명 검증뿐 아니라 관리자 비밀번호 비교에도 재사용한다
// (Fix round 1 — Important 1). 길이가 다르면 조기 반환하므로 비밀번호 "길이" 자체는
// 여전히 타이밍으로 드러날 수 있다 — 문자 내용의 위치는 드러나지 않는다. 완벽한
// 상수시간 문자열 비교는 어렵고, 이 경계는 알고 넘어가기로 한다.
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Authorization: Bearer <token> 에서 토큰만 뽑는다. */
export function parseBearerToken(authorization: string | null | undefined): string {
  if (!authorization || typeof authorization !== 'string') return '';
  const m = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return m?.[1]?.trim() ?? '';
}

/** OPS_API_TOKEN과 Bearer를 상수시간에 비교. 둘 중 하나라도 비면 false. */
export function verifyOpsApiToken(
  expected: string | null | undefined,
  bearer: string
): boolean {
  if (!expected || !bearer) return false;
  return timingSafeEqual(expected, bearer);
}
