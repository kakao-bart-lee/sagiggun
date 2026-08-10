interface Env {
  ORIGIN_URL: string;
  CANONICAL_HOST: string;
}

const BODYLESS_METHODS = new Set(['GET', 'HEAD']);
const HOP_BY_HOP_HEADERS = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'upgrade',
];

function originUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:') {
    throw new Error('ORIGIN_URL은 https URL이어야 합니다.');
  }
  return url;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    let origin: URL;
    try {
      origin = originUrl(env.ORIGIN_URL);
    } catch (error) {
      return new Response(error instanceof Error ? error.message : 'origin 설정 오류', {
        status: 500,
      });
    }

    const incoming = new URL(request.url);
    const canonicalHost = env.CANONICAL_HOST || incoming.host;
    const target = new URL(origin);
    target.pathname = `${origin.pathname.replace(/\/$/, '')}${incoming.pathname}`;
    target.search = incoming.search;

    const headers = new Headers(request.headers);
    for (const header of HOP_BY_HOP_HEADERS) headers.delete(header);
    headers.set('host', origin.host);
    headers.set('x-forwarded-host', incoming.host);
    headers.set('x-forwarded-proto', 'https');

    let response: Response;
    try {
      response = await fetch(
        new Request(target, {
          body: BODYLESS_METHODS.has(request.method) ? undefined : request.body,
          headers,
          method: request.method,
          redirect: 'manual',
        }),
      );
    } catch {
      return new Response('upstream 요청에 실패했습니다.', { status: 502 });
    }

    return rewriteOriginRedirects(response, origin, canonicalHost);
  },
};

function rewriteOriginRedirects(response: Response, origin: URL, canonicalHost: string): Response {
  const location = response.headers.get('location');
  if (!location) return response;

  const headers = new Headers(response.headers);
  try {
    const nextLocation = new URL(location, origin);
    if (nextLocation.host === origin.host) {
      nextLocation.protocol = 'https:';
      nextLocation.host = canonicalHost;
      headers.set('location', nextLocation.toString());
    }
  } catch {
    return response;
  }

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}
