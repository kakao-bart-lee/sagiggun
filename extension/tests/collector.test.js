import { describe, it, expect } from 'vitest';
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
