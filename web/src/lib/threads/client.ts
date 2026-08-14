export class ThreadsApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ThreadsApiError';
  }
}

const REQUEST_TIMEOUT_MS = 10_000;
// threads_delete는 설정 화면의 "테스트 게시" 글을 지우는 데만 쓴다. 이미 연결된 계정의
// 토큰에는 이 권한이 없으므로, 이 값을 바꾼 뒤에는 연결 해제 후 재연결해야 반영된다.
const SCOPES = 'threads_basic,threads_content_publish,threads_delete';

function threadsErrorMessage(data: Record<string, unknown>, status: number): string {
  if (typeof data.error_message === 'string') return data.error_message;
  const error = data.error as { message?: string } | undefined;
  if (error && typeof error.message === 'string') return error.message;
  return `Threads API 오류 (HTTP ${status})`;
}

async function parseJsonOrThrow(response: Response): Promise<Record<string, unknown>> {
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new ThreadsApiError(threadsErrorMessage(data, response.status));
  return data;
}

async function getJson(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  return parseJsonOrThrow(response);
}

async function postJson(url: string, body: Record<string, string>): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  return parseJsonOrThrow(response);
}

export function buildAuthorizeUrl(args: { appId: string; redirectUri: string; state: string }): string {
  const url = new URL('https://threads.net/oauth/authorize');
  url.searchParams.set('client_id', args.appId);
  url.searchParams.set('redirect_uri', args.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', SCOPES);
  url.searchParams.set('state', args.state);
  return url.toString();
}

// 이 엔드포인트만 JSON body를 받는다(나머지는 query string) — Meta 공식 문서의 요청 예시가
// 그렇게 되어 있다.
export async function exchangeCodeForToken(args: {
  appId: string;
  appSecret: string;
  code: string;
  redirectUri: string;
}): Promise<{ accessToken: string; userId: string }> {
  const data = await postJson('https://graph.threads.net/oauth/access_token', {
    client_id: args.appId,
    client_secret: args.appSecret,
    code: args.code,
    grant_type: 'authorization_code',
    redirect_uri: args.redirectUri,
  });
  return { accessToken: String(data.access_token), userId: String(data.user_id) };
}

export async function exchangeForLongLivedToken(args: {
  appSecret: string;
  accessToken: string;
}): Promise<{ accessToken: string; expiresInSeconds: number }> {
  const url = new URL('https://graph.threads.net/access_token');
  url.searchParams.set('grant_type', 'th_exchange_token');
  url.searchParams.set('client_secret', args.appSecret);
  url.searchParams.set('access_token', args.accessToken);
  const data = await getJson(url.toString());
  return { accessToken: String(data.access_token), expiresInSeconds: Number(data.expires_in) };
}

export async function refreshLongLivedToken(args: {
  accessToken: string;
}): Promise<{ accessToken: string; expiresInSeconds: number }> {
  const url = new URL('https://graph.threads.net/refresh_access_token');
  url.searchParams.set('grant_type', 'th_refresh_token');
  url.searchParams.set('access_token', args.accessToken);
  const data = await getJson(url.toString());
  return { accessToken: String(data.access_token), expiresInSeconds: Number(data.expires_in) };
}

export async function fetchThreadsUsername(args: { accessToken: string }): Promise<string | null> {
  const url = new URL('https://graph.threads.net/v1.0/me');
  url.searchParams.set('fields', 'username');
  url.searchParams.set('access_token', args.accessToken);
  const data = await getJson(url.toString());
  return typeof data.username === 'string' ? data.username : null;
}

// container→publish 사이 공식 권장 대기(30초)는 텍스트 전용에는 과하다 — 미디어 다운로드가
// 없어 대개 즉시 끝난다. 그래서 먼저 즉시 publish를 시도하고, 실패했을 때만 상태를 확인해
// 짧게 재시도한다. 폴링 간격·횟수는 troubleshooting 문서의 상태값(IN_PROGRESS/ERROR/EXPIRED/
// FINISHED/PUBLISHED)을 그대로 따른다.
const PUBLISH_POLL_DELAY_MS = 3_000;
const MAX_PUBLISH_ATTEMPTS = 3;

async function postForm(url: string, body: Record<string, string>): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  return parseJsonOrThrow(response);
}

async function createTextContainer(args: {
  accessToken: string;
  threadsUserId: string;
  text: string;
}): Promise<string> {
  const data = await postForm(`https://graph.threads.net/v1.0/${args.threadsUserId}/threads`, {
    media_type: 'TEXT',
    text: args.text,
    access_token: args.accessToken,
  });
  return String(data.id);
}

async function tryPublish(args: {
  accessToken: string;
  threadsUserId: string;
  creationId: string;
}): Promise<{ postId: string } | { error: ThreadsApiError }> {
  try {
    const data = await postForm(
      `https://graph.threads.net/v1.0/${args.threadsUserId}/threads_publish`,
      { creation_id: args.creationId, access_token: args.accessToken }
    );
    return { postId: String(data.id) };
  } catch (error) {
    if (error instanceof ThreadsApiError) return { error };
    throw error;
  }
}

async function containerStatus(args: {
  accessToken: string;
  creationId: string;
}): Promise<{ status: string; errorMessage: string | null }> {
  const url = new URL(`https://graph.threads.net/v1.0/${args.creationId}`);
  url.searchParams.set('fields', 'status,error_message');
  url.searchParams.set('access_token', args.accessToken);
  const data = await getJson(url.toString());
  return {
    status: String(data.status ?? ''),
    errorMessage: typeof data.error_message === 'string' ? data.error_message : null,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function publishThreadsPost(args: {
  accessToken: string;
  threadsUserId: string;
  text: string;
}): Promise<string> {
  const creationId = await createTextContainer(args);

  for (let attempt = 1; attempt <= MAX_PUBLISH_ATTEMPTS; attempt += 1) {
    const result = await tryPublish({ ...args, creationId });
    if ('postId' in result) return result.postId;

    const status = await containerStatus({ accessToken: args.accessToken, creationId });
    if (status.status === 'ERROR' || status.status === 'EXPIRED') {
      throw new ThreadsApiError(status.errorMessage ?? 'Threads 게시에 실패했습니다.');
    }
    if (status.status !== 'IN_PROGRESS') {
      // container 자체는 문제없이 처리됐는데(예: FINISHED) publish 호출만 별도 이유로
      // 거절된 경우 — 예: 하루 250건 게시 한도 초과. 재시도해 봐도 같은 이유로 계속
      // 거절될 뿐이니, 방금 잡은 Threads의 실제 에러를 그대로 던진다.
      throw result.error;
    }
    if (attempt < MAX_PUBLISH_ATTEMPTS) await delay(PUBLISH_POLL_DELAY_MS);
  }
  throw new ThreadsApiError('Threads 게시가 시간 내에 완료되지 않았습니다. 잠시 후 다시 시도해 주세요.');
}

export async function deleteThreadsPost(args: {
  accessToken: string;
  postId: string;
}): Promise<string> {
  const url = new URL(`https://graph.threads.net/v1.0/${args.postId}`);
  url.searchParams.set('access_token', args.accessToken);
  const response = await fetch(url.toString(), {
    method: 'DELETE',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const data = await parseJsonOrThrow(response);
  return typeof data.deleted_id === 'string' ? data.deleted_id : args.postId;
}
