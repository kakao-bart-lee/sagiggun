// connect가 심고 callback이 검증하는 CSRF state 쿠키 이름. 두 라우트가 리터럴로 각자
// 따로 적어두면 하나만 바뀌었을 때 조용히 어긋난다 — 상수 하나로 공유한다.
export const THREADS_OAUTH_STATE_COOKIE = 'threads_oauth_state';
