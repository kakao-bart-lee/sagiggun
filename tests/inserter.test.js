import { describe, it, expect, vi, beforeEach } from 'vitest';
import '../src/content/inserter.js';

const inserter = () => globalThis.TSNIP.inserter;

function makeEditor(initial = '') {
  const el = document.createElement('div');
  el.setAttribute('contenteditable', 'true');
  el.setAttribute('data-lexical-editor', 'true');
  el.setAttribute('role', 'textbox');
  el.textContent = initial;
  document.body.appendChild(el);
  return el;
}

/** 텍스트를 실제로 덧붙이는 가짜 전략 */
function workingStrategy(name) {
  return {
    name,
    run(editor, text) {
      editor.textContent += text;
      return true;
    },
  };
}

/** 시도는 하지만 아무 변화도 못 만드는 가짜 전략 */
function noopStrategy(name) {
  return { name, run: () => true };
}

describe('inserter.readText', () => {
  it('__lexicalTextContent가 있으면 그것을 읽는다', () => {
    const el = makeEditor('DOM 텍스트');
    el.__lexicalTextContent = '렉시컬 텍스트';
    expect(inserter().readText(el)).toBe('렉시컬 텍스트');
  });

  it('__lexicalTextContent가 없으면 textContent로 떨어진다', () => {
    expect(inserter().readText(makeEditor('DOM 텍스트'))).toBe('DOM 텍스트');
  });
});

describe('inserter.insert', () => {
  it('첫 전략이 성공하면 그 이름을 돌려준다', async () => {
    const el = makeEditor();
    const how = await inserter().insert(el, '안녕', {
      strategies: [workingStrategy('paste'), workingStrategy('execCommand')],
    });
    expect(how).toBe('paste');
    expect(el.textContent).toBe('안녕');
  });

  it('첫 전략이 아무 변화를 못 만들면 다음 전략으로 넘어간다', async () => {
    const el = makeEditor();
    const how = await inserter().insert(el, '안녕', {
      strategies: [noopStrategy('paste'), workingStrategy('execCommand')],
    });
    expect(how).toBe('execCommand');
    expect(el.textContent).toBe('안녕');
  });

  it('전략이 예외를 던져도 다음 전략으로 넘어간다', async () => {
    const el = makeEditor();
    const throwing = {
      name: 'paste',
      run() {
        throw new Error('DataTransfer 없음');
      },
    };
    const how = await inserter().insert(el, '안녕', {
      strategies: [throwing, workingStrategy('execCommand')],
    });
    expect(how).toBe('execCommand');
  });

  it('전부 실패하면 클립보드에 복사하고 clipboard를 돌려준다', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const el = makeEditor();
    const how = await inserter().insert(el, '안녕', {
      strategies: [noopStrategy('paste')],
    });
    expect(how).toBe('clipboard');
    expect(writeText).toHaveBeenCalledWith('안녕');
    vi.unstubAllGlobals();
  });

  it('클립보드까지 실패하면 failed를 돌려준다', async () => {
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: async () => {
          throw new Error('권한 없음');
        },
      },
    });
    const how = await inserter().insert(makeEditor(), '안녕', {
      strategies: [noopStrategy('paste')],
    });
    expect(how).toBe('failed');
    vi.unstubAllGlobals();
  });

  it('editor나 text가 비면 failed를 돌려준다', async () => {
    expect(await inserter().insert(null, '안녕')).toBe('failed');
    expect(await inserter().insert(makeEditor(), '')).toBe('failed');
  });

  it('__lexicalTextContent 변화도 성공으로 인정한다', async () => {
    const el = makeEditor('고정');
    el.__lexicalTextContent = '이전';
    const lexicalOnly = {
      name: 'paste',
      run(editor) {
        editor.__lexicalTextContent = '이후';
        return true;
      },
    };
    expect(await inserter().insert(el, '안녕', { strategies: [lexicalOnly] })).toBe('paste');
  });
});

describe('inserter.pasteStrategy', () => {
  it('text/plain을 담은 paste 이벤트를 에디터에 보낸다', () => {
    const el = makeEditor();
    let received = null;
    el.addEventListener('paste', (e) => {
      received = e.clipboardData.getData('text/plain');
    });
    expect(inserter().pasteStrategy.run(el, '첫째 줄\n둘째 줄')).toBe(true);
    expect(received).toBe('첫째 줄\n둘째 줄');
  });
});

describe('inserter.execCommandStrategy', () => {
  it('document.execCommand("insertText")를 호출한다', () => {
    const el = makeEditor();
    const spy = vi.fn(() => true);
    document.execCommand = spy;
    expect(inserter().execCommandStrategy.run(el, '안녕')).toBe(true);
    expect(spy).toHaveBeenCalledWith('insertText', false, '안녕');
    delete document.execCommand;
  });

  it('execCommand가 없으면 false를 돌려준다', () => {
    delete document.execCommand;
    expect(inserter().execCommandStrategy.run(makeEditor(), '안녕')).toBe(false);
  });
});
