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

  it('예약된 rAF가 실행되기 전에 destroy()가 호출되면 패널을 되살리지 않는다', async () => {
    const handle = boot();

    // mutation을 일으켜 MutationObserver 콜백이 rAF를 예약하게 한다.
    document.body.appendChild(document.createElement('div'));
    // MutationObserver 콜백은 마이크로태스크로 실행되므로, 매크로태스크로
    // 넘어가 마이크로태스크 큐가 비워질 때까지 기다린다. 이 시점에는
    // rAF가 "예약"만 됐고 아직 실행되지는 않았어야 한다.
    await new Promise((r) => setTimeout(r, 0));

    // rAF가 실행되기 전에 destroy() 호출 — 이게 레이스의 핵심 순서다.
    handle.destroy();
    booted = null;

    // 예약된 rAF가 (취소되지 않았다면) 실행될 시간을 준다.
    await new Promise((r) => setTimeout(r, 100));

    expect(document.getElementById('tsnip-host')).toBeNull();
  });

  it('destroy()를 두 번 호출해도 안전하다', () => {
    const handle = boot();
    expect(() => {
      handle.destroy();
      handle.destroy();
    }).not.toThrow();
    booted = null;
    expect(document.getElementById('tsnip-host')).toBeNull();
  });

  it('패널이 닫혀 있으면 DOM 변경이 있어도 대상 안내가 갱신되지 않는다', async () => {
    const handle = boot();
    // 패널은 기본적으로 닫힌 채로 시작한다(저장된 열림 상태 없음).
    document.body.appendChild(document.createElement('div'));
    await new Promise((r) => setTimeout(r, 50));
    expect(handle.shadow.querySelector('.status').textContent).toBe('');
  });

  it('패널이 열려 있으면 DOM 변경 시 대상 안내가 갱신된다(기존 동작 유지)', async () => {
    // setOpen(true) 자체가 updateTargetState()를 불러 mutation 전에 이미
    // 상태를 채워버리면, 이 테스트는 rAF → notifyDomChanged 경로를 전혀
    // 지나가지 않고도 통과해 버려 아무것도 잠그지 못한다. 그래서 에디터가
    // "있는" 상태로 열어 처음에는 경고가 없음을 먼저 확인하고, 그 다음
    // 에디터를 DOM에서 제거하는 실제 mutation으로 경고가 나타나는지 본다.
    // 이 전이는 mutation → rAF → notifyDomChanged → emit →
    // updateTargetState(null) 체인을 통해서만 만들어진다.
    const editor = makeEditor();
    const handle = boot();
    await handle.setOpen(true);

    expect(handle.shadow.querySelector('.status').textContent).toBe('');
    expect(
      handle.shadow.querySelector('.root').classList.contains('no-target')
    ).toBe(false);

    editor.remove();
    await new Promise((r) => setTimeout(r, 50));

    expect(handle.shadow.querySelector('.status').textContent).toContain('입력창');
    expect(
      handle.shadow.querySelector('.root').classList.contains('no-target')
    ).toBe(true);
  });

  it('NS.css가 없으면 부팅을 건너뛴다', () => {
    const saved = NS().css;
    delete NS().css;
    try {
      expect(NS().boot()).toBeNull();
      expect(document.getElementById('tsnip-host')).toBeNull();
    } finally {
      // 단언이 실패해도 반드시 복원한다 — 안 그러면 이후 모든 테스트가
      // NS.css 없이 부팅을 시도해 원인 불명으로 줄줄이 깨진다.
      NS().css = saved;
    }
  });
});
