export class ThreadsApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ThreadsApiError';
  }
}

const REQUEST_TIMEOUT_MS = 10_000;
const SCOPES = 'threads_basic,threads_content_publish';

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
