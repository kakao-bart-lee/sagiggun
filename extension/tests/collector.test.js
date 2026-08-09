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
      <header><a href="/@sam">@sam</a></header>
      <div dir="auto">안녕하세요 저는 99년생 서울 거주입니다. 취미는 등산이에요.</div>
      <img src="https://scontent.cdninstagram.com/v/t51.1/x.jpg" />
    `;
    const scraped = collector().scrapeThread(document);
    expect(scraped.handle).toBe('sam');
    expect(scraped.rawText).toContain('99년생');
    expect(scraped.imageUrls.length).toBe(1);
  });
});
