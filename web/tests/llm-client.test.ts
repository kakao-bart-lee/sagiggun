import { describe, expect, it } from 'vitest';
import { toOpenAIInput } from '@/lib/llm/client';

describe('toOpenAIInput', () => {
  it('시스템·텍스트·base64 이미지를 Responses 입력으로 변환한다', () => {
    expect(
      toOpenAIInput({
        model: 'gpt-test',
        system: '시스템 지시',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
              { type: 'text', text: '<입력정보>원문</입력정보>' },
            ],
          },
        ],
      })
    ).toEqual([
      {
        role: 'system',
        content: [{ type: 'input_text', text: '시스템 지시' }],
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_image',
            image_url: 'data:image/png;base64,AAAA',
            detail: 'high',
          },
          { type: 'input_text', text: '<입력정보>원문</입력정보>' },
        ],
      },
    ]);
  });

  it('문자열 메시지도 input_text로 변환한다', () => {
    expect(
      toOpenAIInput({
        model: 'gpt-test',
        messages: [{ role: 'user', content: '원문' }],
      })
    ).toEqual([{ role: 'user', content: [{ type: 'input_text', text: '원문' }] }]);
  });
});
