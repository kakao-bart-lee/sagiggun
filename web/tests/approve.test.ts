import { describe, it, expect, vi, beforeEach } from 'vitest';

// approve 라우트는 deps 주입 자리가 없어서(다른 lib 모듈과 달리 prisma를 직접 import한다)
// 모듈 자체를 모킹한다. 라우트가 실제로 쓰는 세 메서드만 흉내 내는 인메모리 Profile 표다.
type Row = {
  id: string;
  status: string;
  finalBody: string | null;
  draftBody: string | null;
};

const rows = new Map<string, Row>();

// 읽기(findUnique)와 쓰기(update/updateMany) 사이에 끼어드는 "다른 요청"을 심는 자리.
// 첫 번째 쓰기 호출 직전에 딱 한 번 실행된다 — canApprove 검사를 통과시킨 뒤 실제
// UPDATE가 DB에 닿기 직전이 정확히 TOCTOU 창이라, 여기가 경쟁 상대를 넣을 지점이다.
let interleave: (() => void) | null = null;

function runInterleave(): void {
  const hook = interleave;
  interleave = null;
  hook?.();
}

type Where = Record<string, unknown>;

// where 절을 실제로 평가한다. 조건을 진짜로 보지 않고 늘 정해진 count를 돌려주면
// "status가 APPROVED로 바뀌지 않았다"는 단언이 공짜로 통과해 아무것도 증명하지 못한다.
function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(
    ([key, value]) => (row as unknown as Record<string, unknown>)[key] === value
  );
}

// select는 무시하고 행 전체를 돌려준다 — 라우트는 자기가 select한 필드만 읽으므로 무해하다.
vi.mock('@/lib/prisma', () => ({
  prisma: {
    profile: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const row = rows.get(where.id);
        return row ? { ...row } : null;
      }),
      // 수정 전 라우트가 쓰던 조건 없는 쓰기. 남겨 두는 이유는 이 테스트를 옛 코드
      // 모양(update 무조건 호출)에 그대로 대고 돌려 red를 확인할 수 있게 하기 위함이다.
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        runInterleave();
        const row = rows.get(where.id);
        if (!row) throw new Error('없는 행');
        Object.assign(row, data);
        return { ...row };
      }),
      updateMany: vi.fn(
        async ({ where, data }: { where: Where & { id: string }; data: Partial<Row> }) => {
          runInterleave();
          const row = rows.get(where.id);
          if (!row || !matches(row, where)) return { count: 0 };
          Object.assign(row, data);
          return { count: 1 };
        }
      ),
    },
  },
}));

// 라우트는 반드시 동적으로 불러온다 — 최상단에서 정적 import하면 vi.mock 팩토리가
// 위 상수들이 초기화되기 전에 실행돼 TDZ 오류가 난다.
async function approve(id: string): Promise<Response> {
  const { POST } = await import('@/app/api/profiles/[id]/approve/route');
  return POST(new Request(`http://localhost/api/profiles/${id}/approve`, { method: 'POST' }), {
    params: Promise.resolve({ id }),
  });
}

describe('POST /api/profiles/[id]/approve', () => {
  beforeEach(() => {
    rows.clear();
    interleave = null;
    rows.set('p1', {
      id: 'p1',
      status: 'DRAFTED',
      finalBody: '✨ 게시 문구',
      draftBody: '✨ 초안',
    });
  });

  it('게시 문구가 있으면 승인한다', async () => {
    const response = await approve('p1');
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.profile.status).toBe('APPROVED');
    expect(rows.get('p1')?.status).toBe('APPROVED');
  });

  it('없는 프로필은 404다', async () => {
    const response = await approve('nope');
    expect(response.status).toBe(404);
  });

  it('게시 문구가 비어 있으면 400이고 상태를 바꾸지 않는다', async () => {
    rows.set('p1', { id: 'p1', status: 'DRAFTED', finalBody: '   ', draftBody: null });
    const response = await approve('p1');
    expect(response.status).toBe(400);
    expect(rows.get('p1')?.status).toBe('DRAFTED');
  });

  // 경쟁 조건 재현 — 두 탭/두 세션/직접 API 호출에서 실제로 벌어지는 순서다.
  // 1) approve가 finalBody를 읽고 canApprove를 통과시킨다
  // 2) 그 사이 다른 요청이 PATCH로 finalBody를 비운다  ← interleave
  // 3) approve가 status만 APPROVED로 쓴다
  // 수정 전에는 3이 조건 없는 update라 "APPROVED인데 게시 문구가 빈" 상태가 만들어졌다.
  it('읽은 뒤 다른 요청이 finalBody를 비우면 승인하지 않고 409를 준다', async () => {
    interleave = () => {
      const row = rows.get('p1');
      if (row) row.finalBody = '';
    };

    const response = await approve('p1');

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toMatch(/변경되었습니다/);
    // 핵심 단언: canApprove가 막으려던 불변식 위반 상태에 도달하지 않았다.
    expect(rows.get('p1')?.status).toBe('DRAFTED');
    expect(rows.get('p1')?.finalBody).toBe('');
  });

  it('읽은 뒤 다른 요청이 status를 바꾸면 승인하지 않고 409를 준다', async () => {
    interleave = () => {
      const row = rows.get('p1');
      if (row) row.status = 'ARCHIVED';
    };

    const response = await approve('p1');

    expect(response.status).toBe(409);
    // 보관 처리한 쪽의 결과가 승인으로 덮어써지지 않았다.
    expect(rows.get('p1')?.status).toBe('ARCHIVED');
  });
});
