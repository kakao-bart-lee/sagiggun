import { describe, it, expect, vi } from 'vitest';
import '../src/content/collector.js';

const collector = () => globalThis.TSNIP.collector;

describe('collector.normalizeHandle', () => {
  it('@와 경로를 제거한다', () => {
    expect(collector().normalizeHandle('@alice/foo')).toBe('alice');
    expect(collector().normalizeHandle(' bob ')).toBe('bob');
  });
});

describe('collector.scrapeThread', () => {
  it('헤더 링크와 본문 텍스트를 모은다', () => {
    document.body.innerHTML = `
      <aside><div dir="auto">사이드바 추천 문구</div></aside>
      <main>
        <header><a href="/@sam">@sam</a></header>
        <div data-pressable-container>
          <div dir="auto">안녕하세요 저는 99년생 서울 거주입니다. 취미는 등산이에요.</div>
          <img src="https://scontent.cdninstagram.com/v/t51.1/x.jpg" />
        </div>
        <img src="https://scontent.cdninstagram.com/avatar.jpg" />
      </main>
    `;
    const scraped = collector().scrapeThread(document);
    expect(scraped.handle).toBe('sam');
    expect(scraped.rawText).toContain('99년생');
    expect(scraped.rawText).not.toContain('사이드바');
    expect(scraped.imageUrls.length).toBe(1);
  });

  it('대화 컨테이너를 찾지 못하면 전체 문서를 수집하지 않는다', () => {
    document.body.innerHTML = `
      <header><a href="/@sam">@sam</a></header>
      <div dir="auto">페이지 전체에 흩어진 텍스트</div>
    `;
    expect(collector().scrapeThread(document)).toEqual({ handle: '', rawText: '', imageUrls: [] });
  });
});

describe('collector.collectAndUpload — 관심 문의 자동 연결', () => {
  function setDom() {
    document.body.innerHTML = `
      <main>
        <header><a href="/@sam">@sam</a></header>
        <div data-pressable-container>
          <div dir="auto">안녕하세요 저는 99년생 서울 거주입니다. 취미는 등산이에요.</div>
        </div>
      </main>
    `;
  }

  function makeApi(inquiries) {
    return {
      createProfile: vi.fn(async () => ({ profile: { id: 'p1' }, duplicates: [] })),
      uploadPhotos: vi.fn(async () => ({ saved: [], failed: [] })),
      getConfig: vi.fn(async () => ({ apiBaseUrl: 'https://ops.example', apiToken: 'x' })),
      listOpenInquiries: vi.fn(async () => ({ inquiries })),
      attachInquiryProfile: vi.fn(async () => ({ status: 'SPEC_RECEIVED' })),
    };
  }

  it('연결 가능한 상태(접수/스펙 문의중)의 열린 문의에만 수집 프로필을 연결한다', async () => {
    setDom();
    const api = makeApi([
      { id: 'q1', status: 'RECEIVED' },
      { id: 'q2', status: 'SPEC_REQUESTED' },
      { id: 'q3', status: 'FORWARDED' }, // 이미 스펙이 붙은 건 — 건드리면 안 된다
    ]);
    const result = await collector().collectAndUpload({ storage: {}, api, doc: document });

    expect(api.listOpenInquiries).toHaveBeenCalledWith({}, 'sam');
    expect(api.attachInquiryProfile.mock.calls.map(([, id]) => id)).toEqual(['q1', 'q2']);
    expect(api.attachInquiryProfile).toHaveBeenCalledWith({}, 'q1', 'p1');
    expect(result.inquiriesAttached).toBe(2);
  });

  it('문의 조회가 실패해도 수집은 성공한다', async () => {
    setDom();
    const api = makeApi([]);
    api.listOpenInquiries = vi.fn(async () => {
      throw new Error('네트워크 오류');
    });
    const result = await collector().collectAndUpload({ storage: {}, api, doc: document });
    expect(result.profileId).toBe('p1');
    expect(result.inquiriesAttached).toBe(0);
  });

  it('개별 연결이 실패해도 나머지는 계속 연결한다', async () => {
    setDom();
    const api = makeApi([
      { id: 'q1', status: 'RECEIVED' },
      { id: 'q2', status: 'RECEIVED' },
    ]);
    api.attachInquiryProfile = vi
      .fn()
      .mockRejectedValueOnce(new Error('이미 처리됨'))
      .mockResolvedValueOnce({ status: 'SPEC_RECEIVED' });
    const result = await collector().collectAndUpload({ storage: {}, api, doc: document });
    expect(result.inquiriesAttached).toBe(1);
  });
});
