// 로그인 엔드포인트 전용 메모리 기반 rate limit (Fix round 1 — Important 2).
//
// 단일 운영자 앱이라는 전제로 최대한 단순하게 간다: 별도 인프라(Redis 등) 없이
// 프로세스 메모리에 IP별 실패 횟수만 기록한다. 서버 재시작 시 카운터가 초기화되는
// 것은 이 규모에서 허용 가능한 트레이드오프다.
//
// 수치 근거: 정상적인 관리자가 비밀번호를 몇 번 틀려도(오타 등) 곧바로 잠기지
// 않도록 여유를 두면서(1분에 5회), 무차별 대입은 사실상 무력화한다 — 5분 잠금이
// 반복되면 시간당 최대 약 60회, 하루 최대 약 1440회로 시도 횟수가 눌린다.
// 이 정도면 어떤 비-사소한 비밀번호도 온라인 무차별 대입으로는 뚫기 어렵다.
const WINDOW_MS = 60_000; // 실패를 세는 창(1분)
const MAX_ATTEMPTS = 5; // 창 안에서 이 횟수를 넘기면 잠금
const LOCKOUT_MS = 5 * 60_000; // 잠금 지속 시간(5분)

export const RATE_LIMIT = { WINDOW_MS, MAX_ATTEMPTS, LOCKOUT_MS };

type Bucket = {
  failures: number[];
  blockedUntil: number;
};

const buckets = new Map<string, Bucket>();

// x-forwarded-for의 첫 IP를 쓴다. 이 앱 앞에 리버스 프록시가 없으면(로컬 개발 등)
// 헤더 자체가 없어 모든 클라이언트가 'unknown' 한 버킷으로 묶인다 — 그러면 (a) 한
// 공격자가 그 버킷을 잠가 정상 관리자까지 막을 수 있고(self-DoS), (b) 반대로
// 서로 다른 클라이언트가 뒤섞여 IP별 격리라는 전제가 무너진다. x-forwarded-for는
// 클라이언트가 조작 가능한 헤더라 x-real-ip 등을 추가로 신뢰하지 않는다 —
// 브리프에 없는 신뢰 경계를 새로 만드는 셈이라 하지 않는다.
export function getClientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  const first = xff?.split(',')[0]?.trim();
  return first || 'unknown';
}

export function checkRateLimit(key: string, now: number): { limited: boolean; retryAfterMs: number } {
  const bucket = buckets.get(key);
  if (!bucket || bucket.blockedUntil <= now) return { limited: false, retryAfterMs: 0 };
  return { limited: true, retryAfterMs: bucket.blockedUntil - now };
}

export function recordLoginFailure(key: string, now: number): void {
  const bucket = buckets.get(key) ?? { failures: [], blockedUntil: 0 };
  bucket.failures = bucket.failures.filter((t) => now - t < WINDOW_MS);
  bucket.failures.push(now);
  if (bucket.failures.length >= MAX_ATTEMPTS) {
    bucket.blockedUntil = now + LOCKOUT_MS;
    bucket.failures = [];
  }
  buckets.set(key, bucket);
}

export function recordLoginSuccess(key: string): void {
  buckets.delete(key);
}

// ---------------------------------------------------------------------------
// 공개 제출(신청·관심) 슬라이딩 윈도우 — 로그인 잠금과 달리 실패/성공 구분 없이
// 제출 자체를 IP당 분당 N회로 누른다. 익명 폼이라 스팸·도배가 유일한 위협 모델이고,
// 정상 사용자는 분당 3회를 넘길 일이 없다.
// ---------------------------------------------------------------------------
const SUBMIT_WINDOW_MS = 60_000;
const SUBMIT_MAX = 3;
const SUBMIT_BUCKET_CAP = 10_000; // 무한 성장 방지 — 넘으면 만료 버킷부터 청소

export const PUBLIC_SUBMIT_LIMIT = { WINDOW_MS: SUBMIT_WINDOW_MS, MAX: SUBMIT_MAX };

const submitBuckets = new Map<string, number[]>();

export function checkPublicSubmitLimit(
  key: string,
  now: number
): { limited: boolean; retryAfterMs: number } {
  if (submitBuckets.size > SUBMIT_BUCKET_CAP) {
    for (const [k, times] of submitBuckets) {
      if (times.every((t) => now - t >= SUBMIT_WINDOW_MS)) submitBuckets.delete(k);
    }
  }

  const times = (submitBuckets.get(key) ?? []).filter((t) => now - t < SUBMIT_WINDOW_MS);
  if (times.length >= SUBMIT_MAX) {
    submitBuckets.set(key, times);
    return { limited: true, retryAfterMs: SUBMIT_WINDOW_MS - (now - times[0]) };
  }
  times.push(now);
  submitBuckets.set(key, times);
  return { limited: false, retryAfterMs: 0 };
}
