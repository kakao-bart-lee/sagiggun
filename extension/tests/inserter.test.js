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

describe('inserter.insert 기본 사다리 (opts.strategies 없이)', () => {
  it('paste가 성공하면 execCommand는 호출되지 않는다', async () => {
    const el = makeEditor();
    el.addEventListener('paste', (e) => {
      el.textContent += e.clipboardData.getData('text/plain');
    });
    const spy = vi.fn(() => true);
    document.execCommand = spy;

    const how = await inserter().insert(el, '첫째 줄\n둘째 줄');

    expect(how).toBe('paste');
    expect(el.textContent).toBe('첫째 줄\n둘째 줄');
    expect(spy).not.toHaveBeenCalled();
    delete document.execCommand;
  });

  it('paste가 실패하면 execCommand로 넘어간다', async () => {
    const el = makeEditor();
    // paste 리스너를 달지 않으므로 dispatchEvent는 성공해도 텍스트는 변하지 않는다.
    const spy = vi.fn((command, ui, text) => {
      el.textContent += text;
      return true;
    });
    document.execCommand = spy;

    const how = await inserter().insert(el, '안녕');

    expect(how).toBe('execCommand');
    expect(spy).toHaveBeenCalledWith('insertText', false, '안녕');
    delete document.execCommand;
  });
});

describe('inserter.insert 성공 판정 하드닝', () => {
  it('첫 확인에는 변화가 없지만 두 번째 확인에서 나타나면 다음 전략으로 내려가지 않는다', async () => {
    const el = makeEditor();
    let waitCount = 0;
    // run()은 항상 성공(true)을 돌려주지만, 실제 텍스트 변화는 두 번째
    // wait 이후에나 나타나는 "느린" 전략을 흉내낸다. paste가 실제로는
    // 성공했는데 판정이 성급하게 실패로 보고 execCommand가 같은 텍스트를
    // 한 번 더 넣는 상황(중복 삽입)을 재현한다.
    const delayedStrategy = {
      name: 'paste',
      run() {
        return true;
      },
    };
    const wait = vi.fn(async () => {
      waitCount++;
      if (waitCount === 2) el.textContent += '안녕';
    });

    const how = await inserter().insert(el, '안녕', {
      strategies: [delayedStrategy, workingStrategy('execCommand')],
      wait,
    });

    expect(how).toBe('paste');
    expect(el.textContent).toBe('안녕');
    expect(wait).toHaveBeenCalledTimes(2);
  });

  it('두 번 확인해도 끝내 변화가 없으면 다음 전략으로 넘어간다(기존 폴백 유지)', async () => {
    const el = makeEditor();
    const how = await inserter().insert(el, '안녕', {
      strategies: [noopStrategy('paste'), workingStrategy('execCommand')],
    });
    expect(how).toBe('execCommand');
    expect(el.textContent).toBe('안녕');
  });
});

describe('inserter.pasteStrategy 환경 가드', () => {
  it('DataTransfer가 없으면 false를 돌려주고 이벤트를 보내지 않는다', () => {
    const el = makeEditor();
    let received = false;
    el.addEventListener('paste', () => {
      received = true;
    });

    vi.stubGlobal('DataTransfer', undefined);
    expect(inserter().pasteStrategy.run(el, '안녕')).toBe(false);
    vi.unstubAllGlobals();

    expect(received).toBe(false);
  });

  it('ClipboardEvent가 없으면 false를 돌려주고 이벤트를 보내지 않는다', () => {
    const el = makeEditor();
    let received = false;
    el.addEventListener('paste', () => {
      received = true;
    });

    vi.stubGlobal('ClipboardEvent', undefined);
    expect(inserter().pasteStrategy.run(el, '안녕')).toBe(false);
    vi.unstubAllGlobals();

    expect(received).toBe(false);
  });
});
