import { describe, it, expect, beforeEach } from 'vitest';
import '../src/content/detector.js';

const detector = () => globalThis.TSNIP.detector;

function makeEditor({ inDialog = false } = {}) {
  const el = document.createElement('div');
  el.setAttribute('contenteditable', 'true');
  el.setAttribute('data-lexical-editor', 'true');
  el.setAttribute('role', 'textbox');
  if (inDialog) {
    const dlg = document.createElement('div');
    dlg.setAttribute('role', 'dialog');
    dlg.appendChild(el);
    document.body.appendChild(dlg);
  } else {
    document.body.appendChild(el);
  }
  return el;
}

describe('detector.isEditor', () => {
  it('세 속성을 모두 갖춘 요소만 에디터로 본다', () => {
    expect(detector().isEditor(makeEditor())).toBe(true);
  });

  it('data-lexical-editor가 없으면 에디터가 아니다', () => {
    const el = document.createElement('div');
    el.setAttribute('contenteditable', 'true');
    el.setAttribute('role', 'textbox');
    document.body.appendChild(el);
    expect(detector().isEditor(el)).toBe(false);
  });

  it('요소가 아닌 값에도 안전하다', () => {
    expect(detector().isEditor(null)).toBe(false);
    expect(detector().isEditor(document.createTextNode('x'))).toBe(false);
  });
});

describe('detector.createTracker', () => {
  it('에디터가 없으면 null을 돌려준다', () => {
    const t = detector().createTracker();
    expect(t.getTarget()).toBeNull();
  });

  it('에디터가 하나뿐이면 그것을 고른다', () => {
    const dm = makeEditor();
    const t = detector().createTracker();
    expect(t.getTarget()).toBe(dm);
  });

  it('둘 이상이고 포커스 이력이 없으면 다이얼로그 안쪽을 고른다', () => {
    makeEditor();
    const composer = makeEditor({ inDialog: true });
    const t = detector().createTracker();
    expect(t.getTarget()).toBe(composer);
  });

  it('마지막으로 포커스된 에디터를 우선한다', () => {
    const dm = makeEditor();
    makeEditor({ inDialog: true });
    const t = detector().createTracker();
    t.start();
    dm.dispatchEvent(new Event('focusin', { bubbles: true }));
    expect(t.getTarget()).toBe(dm);
  });

  it('포커스된 에디터가 DOM에서 사라지면 다음 후보로 넘어간다', () => {
    const dm = makeEditor();
    const composer = makeEditor({ inDialog: true });
    const t = detector().createTracker();
    t.start();
    composer.dispatchEvent(new Event('focusin', { bubbles: true }));
    expect(t.getTarget()).toBe(composer);

    composer.closest('[role="dialog"]').remove();
    expect(t.getTarget()).toBe(dm);
  });

  it('에디터가 아닌 곳의 focusin은 무시한다', () => {
    const dm = makeEditor();
    const t = detector().createTracker();
    t.start();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(new Event('focusin', { bubbles: true }));
    expect(t.getTarget()).toBe(dm);
  });

  it('onChange 구독자에게 대상 변경을 알린다', () => {
    const dm = makeEditor();
    const t = detector().createTracker();
    t.start();
    const seen = [];
    t.onChange((target) => seen.push(target));
    dm.dispatchEvent(new Event('focusin', { bubbles: true }));
    expect(seen).toEqual([dm]);
  });

  it('notifyDomChanged가 구독자를 다시 호출한다', () => {
    makeEditor();
    const t = detector().createTracker();
    t.start();
    let calls = 0;
    t.onChange(() => calls++);
    t.notifyDomChanged();
    expect(calls).toBe(1);
  });

  it('stop 이후에는 focusin을 추적하지 않는다', () => {
    const dm = makeEditor();
    const composer = makeEditor({ inDialog: true });
    const t = detector().createTracker();
    t.start();
    t.stop();
    dm.dispatchEvent(new Event('focusin', { bubbles: true }));
    expect(t.getTarget()).toBe(composer);
  });
});
