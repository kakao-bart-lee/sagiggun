interface Env {
  ORIGIN_URL: string;
}

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
    const target = new URL(origin);
    target.pathname = `${origin.pathname.replace(/\/$/, '')}${incoming.pathname}`;
    target.search = incoming.search;

    const upstream = new Request(target, request);
    const headers = new Headers(upstream.headers);
    headers.delete('host');
    headers.set('x-forwarded-host', incoming.host);
    headers.set('x-forwarded-proto', incoming.protocol.replace(':', ''));

    return fetch(new Request(upstream, { headers, redirect: 'manual' }));
  },
};
