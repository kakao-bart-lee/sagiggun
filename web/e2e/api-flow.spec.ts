import { test, expect, type APIRequestContext } from '@playwright/test';

const OPS_TOKEN = 'e2e-ops-token-16chars';
const ADMIN_PASSWORD = 'e2e-admin-password';

function ops(request: APIRequestContext) {
  return {
    get: (url: string) =>
      request.get(url, { headers: { Authorization: `Bearer ${OPS_TOKEN}` } }),
    post: (url: string, data?: unknown) =>
      request.post(url, {
        headers: { Authorization: `Bearer ${OPS_TOKEN}` },
        data,
      }),
    patch: (url: string, data?: unknown) =>
      request.patch(url, {
        headers: { Authorization: `Bearer ${OPS_TOKEN}` },
        data,
      }),
  };
}

test.describe.serial('API e2e — intake → LLM mock → match → delivery', () => {
  test('Bearer OPS_API_TOKEN으로 목록을 읽는다', async ({ request }) => {
    const res = await ops(request).get('/api/profiles');
    expect(res.status(), await res.text()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.profiles)).toBe(true);
    expect(body.profiles.length).toBeGreaterThan(0);
  });

  test('시드 프로필로 매칭·수락·보낼 메시지', async ({ request }) => {
    const api = ops(request);
    const list = await api.get('/api/profiles?status=PUBLISHED');
    expect(list.status(), await list.text()).toBe(200);
    const { profiles } = await list.json();
    const subject = profiles.find((p: { sourceHandle: string }) => p.sourceHandle === 'mina_seoul');
    expect(subject, 'mina_seoul seeded').toBeTruthy();

    const matchRes = await api.post(`/api/profiles/${subject.id}/match`, { topN: 3 });
    expect(matchRes.status(), await matchRes.text()).toBe(200);
    const matchBody = await matchRes.json();
    expect(matchBody.suggestions.length).toBeGreaterThan(0);

    const suggestionId = matchBody.suggestions[0].id;
    const accept = await api.patch(`/api/matches/suggestions/${suggestionId}`, {
      action: 'ACCEPT',
    });
    expect(accept.status(), await accept.text()).toBe(200);
    const accepted = await accept.json();
    expect(accepted.deliveryIds).toHaveLength(2);

    const deliveries = await api.get('/api/deliveries?status=PENDING');
    expect(deliveries.status(), await deliveries.text()).toBe(200);
    const dBody = await deliveries.json();
    expect(dBody.items.length).toBeGreaterThanOrEqual(2);

    const firstId = dBody.items[0].id;
    expect((await api.patch(`/api/deliveries/${firstId}`, { status: 'INSERTED' })).ok()).toBeTruthy();
    expect((await api.patch(`/api/deliveries/${firstId}`, { status: 'DONE' })).ok()).toBeTruthy();
  });

  test('신규 프로필 extract→compose→approve→publish (Threads 미연결이면 400)', async ({ request }) => {
    const api = ops(request);
    const handle = `e2e_${Date.now()}`;
    const rawText = [
      '안녕하세요 여성 01년생입니다.',
      '서울 동작 거주, 163cm, 디자이너입니다.',
      '취미는 카페, 영화.',
      '이상형은 유머 있고 성실한 사람.',
      '97년생~05년생, 서울/경기 희망. 흡연 절대 안 됨.',
    ].join('\n');

    const created = await api.post('/api/profiles', { sourceHandle: handle, rawText });
    expect(created.status(), await created.text()).toBe(201);
    const { profile } = await created.json();

    const extract = await api.post(`/api/profiles/${profile.id}/extract`);
    expect(extract.status(), await extract.text()).toBe(200);
    const extracted = await extract.json();
    expect(extracted.profile.gender).toBe('F');
    expect(extracted.profile.birthYear).toBeTruthy();

    const compose = await api.post(`/api/profiles/${profile.id}/compose`);
    expect(compose.status(), await compose.text()).toBe(200);
    const composed = await compose.json();
    expect(composed.profile.finalBody).toContain('✨');
    expect(composed.profile.finalBody).toContain('📨 관심 있으신 분은 메세지 주세요!');

    const approve = await api.post(`/api/profiles/${profile.id}/approve`);
    expect(approve.status(), await approve.text()).toBe(200);

    // e2e 환경에는 Threads 연결(ThreadsAccount)이 없다 — OAuth는 실제 브라우저 왕복이 필요해
    // 로컬/CI에서 재현할 수 없다(설계 문서 §3/§9). 연결이 없을 때 명확한 400을 주는지만 본다.
    const publish = await api.post(`/api/profiles/${profile.id}/publish`);
    expect(publish.status(), await publish.text()).toBe(400);
    const body = await publish.json();
    expect(body.error).toMatch(/연결/);
  });
});
