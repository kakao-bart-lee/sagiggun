import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '../src/content/panel-css.js';
import '../src/content/storage.js';
import '../src/content/detector.js';
import '../src/content/inserter.js';
import '../src/content/panel.js';
import '../src/content/index.js';

const NS = () => globalThis.TSNIP;

function makeEditor() {
  const el = document.createElement('div');
  el.setAttribute('contenteditable', 'true');
  el.setAttribute('data-lexical-editor', 'true');
  el.setAttribute('role', 'textbox');
  document.body.appendChild(el);
  return el;
}

// boot()은 관찰자와 문서 리스너를 남기므로 테스트마다 반드시 정리한다.
// 정리하지 않으면 이전 테스트의 관찰자가 다음 테스트에서 패널을 다시 붙여 실패한다.
let booted = null;

function boot() {
  booted = NS().boot();
  return booted;
}

beforeEach(() => {
  globalThis.__tsnipBooted = false;
});

afterEach(() => {
  booted?.destroy();
  booted = null;
  globalThis.__tsnipBooted = false;
});

describe('boot', () => {
  it('패널을 마운트한다', () => {
    expect(boot()).not.toBeNull();
    expect(document.getElementById('tsnip-host')).not.toBeNull();
  });

  it('두 번째 호출은 null을 돌려주고 아무것도 하지 않는다', () => {
    boot();
    expect(NS().boot()).toBeNull();
    expect(document.querySelectorAll('#tsnip-host')).toHaveLength(1);
  });

  it('포커스된 에디터를 삽입 대상으로 넘긴다', async () => {
    const editor = makeEditor();
    const handle = boot();
    editor.dispatchEvent(new Event('focusin', { bubbles: true }));

    await NS().storage.add({ body: '안녕하세요' });
    await handle.refresh();

    const spy = vi.spyOn(NS().inserter, 'insert').mockResolvedValue('paste');
    handle.shadow.querySelector('.item .pick').click();
    await new Promise((r) => setTimeout(r, 0));

    expect(spy).toHaveBeenCalledWith(editor, '안녕하세요');
    spy.mockRestore();
  });

  it('호스트가 제거되면 다시 붙인다', async () => {
    boot();
    document.getElementById('tsnip-host').remove();

    // MutationObserver를 깨우기 위한 DOM 변경
    document.body.appendChild(document.createElement('div'));
    await new Promise((r) => setTimeout(r, 50));

    expect(document.getElementById('tsnip-host')).not.toBeNull();
  });

  it('destroy는 관찰자를 끊어 더 이상 다시 붙이지 않는다', async () => {
    const handle = boot();
    handle.destroy();
    booted = null;

    document.body.appendChild(document.createElement('div'));
    await new Promise((r) => setTimeout(r, 50));

    expect(document.getElementById('tsnip-host')).toBeNull();
  });
});
