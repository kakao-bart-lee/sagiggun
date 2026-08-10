import { describe, it, expect, vi, beforeEach } from 'vitest';
import '../src/content/panel-css.js';
import '../src/content/storage.js';
import '../src/content/panel.js';

const panel = () => globalThis.TSNIP.panel;
const storage = () => globalThis.TSNIP.storage;

function mountWith({ target = null, insert = vi.fn(async () => 'paste') } = {}) {
  const handle = panel().mount({
    storage: storage(),
    getTarget: () => target,
    insert,
  });
  return { handle, insert, $: (sel) => handle.shadow.querySelector(sel),
           $$: (sel) => Array.from(handle.shadow.querySelectorAll(sel)) };
}

function mountWithOps({ target = document.createElement('div'), toHandle = 'sam' } = {}) {
  const api = {
    listDeliveries: vi.fn(async () => ({ items: [{ id: 'd1', toHandle, body: '전달 문구' }] })),
    patchDelivery: vi.fn(async () => ({ status: 'INSERTED' })),
  };
  const collector = { scrapeThread: vi.fn(() => ({ handle: 'sam' })) };
  const insert = vi.fn(async () => 'paste');
  const handle = panel().mount({
    storage: storage(),
    getTarget: () => target,
    insert,
    api,
    collector,
  });
  return { handle, api, collector, insert, $: (sel) => handle.shadow.querySelector(sel) };
}

describe('panel.mount', () => {
  it('documentElement에 shadow 호스트를 붙인다', () => {
    const { handle } = mountWith();
    expect(handle.host.parentElement).toBe(document.documentElement);
    expect(handle.host.id).toBe('tsnip-host');
    expect(handle.shadow.mode).toBe('open');
  });

  it('두 번 마운트해도 호스트는 하나만 남는다', () => {
    mountWith();
    mountWith();
    expect(document.querySelectorAll('#tsnip-host')).toHaveLength(1);
  });

  it('destroy는 호스트를 제거한다', () => {
    const { handle } = mountWith();
    handle.destroy();
    expect(document.getElementById('tsnip-host')).toBeNull();
  });
});

describe('panel 열고 닫기', () => {
  it('처음에는 닫혀 있다', async () => {
    const { $ } = mountWith();
    await new Promise((r) => setTimeout(r, 0));
    expect($('.panel').hidden).toBe(true);
  });

  it('탭 버튼을 누르면 열리고 상태가 저장된다', async () => {
    const { $ } = mountWith();
    $('.tab').click();
    await new Promise((r) => setTimeout(r, 0));
    expect($('.panel').hidden).toBe(false);
    expect($('.tab').getAttribute('aria-expanded')).toBe('true');
    expect(await storage().isOpen()).toBe(true);
  });

  it('열린 상태에서 닫기 버튼을 누르면 닫힌다', async () => {
    const { $ } = mountWith();
    $('.tab').click();
    await new Promise((r) => setTimeout(r, 0));
    $('.close').click();
    await new Promise((r) => setTimeout(r, 0));
    expect($('.panel').hidden).toBe(true);
    expect(await storage().isOpen()).toBe(false);
  });
});

describe('문구 목록', () => {
  it('비어 있으면 안내 문구를 보여준다', async () => {
    const { handle, $ } = mountWith();
    await handle.refresh();
    expect($('.list .empty')).not.toBeNull();
  });

  it('제목이 있으면 제목을, 없으면 본문 첫 줄을 보여준다', async () => {
    await storage().add({ title: '인사말', body: '안녕하세요' });
    await storage().add({ body: '제목 없는 문구\n둘째 줄' });
    const { handle, $$ } = mountWith();
    await handle.refresh();
    const labels = $$('.item .pick').map((b) => b.textContent);
    expect(labels).toEqual(['인사말', '제목 없는 문구']);
  });

  it('긴 본문 첫 줄은 잘라서 보여준다', async () => {
    await storage().add({ body: '가'.repeat(50) });
    const { handle, $ } = mountWith();
    await handle.refresh();
    expect($('.item .pick').textContent.endsWith('…')).toBe(true);
    expect($('.item .pick').textContent.length).toBeLessThanOrEqual(25);
  });

  it('문구 버튼의 title 속성에 본문 전체가 들어간다', async () => {
    await storage().add({ title: '짧은 제목', body: '첫째 줄\n둘째 줄' });
    const { handle, $ } = mountWith();
    await handle.refresh();
    expect($('.item .pick').title).toBe('첫째 줄\n둘째 줄');
  });
});

describe('문구 삽입', () => {
  it('문구 버튼의 mousedown 기본동작을 막는다', async () => {
    await storage().add({ body: '안녕하세요' });
    const target = document.createElement('div');
    const { handle, $ } = mountWith({ target });
    await handle.refresh();

    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    $('.item .pick').dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('수정·삭제 버튼의 mousedown은 막지 않는다', async () => {
    await storage().add({ body: '안녕하세요' });
    const { handle, $ } = mountWith();
    await handle.refresh();

    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    $('.item .edit').dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('클릭하면 대상 에디터에 본문을 삽입한다', async () => {
    await storage().add({ title: '인사', body: '첫째 줄\n둘째 줄' });
    const target = document.createElement('div');
    const insert = vi.fn(async () => 'paste');
    const { handle, $ } = mountWith({ target, insert });
    await handle.refresh();

    $('.item .pick').click();
    await new Promise((r) => setTimeout(r, 0));
    expect(insert).toHaveBeenCalledWith(target, '첫째 줄\n둘째 줄');
  });

  it('대상이 없으면 삽입하지 않고 안내한다', async () => {
    await storage().add({ body: '안녕하세요' });
    const insert = vi.fn();
    const { handle, $ } = mountWith({ target: null, insert });
    await handle.refresh();

    $('.item .pick').click();
    await new Promise((r) => setTimeout(r, 0));
    expect(insert).not.toHaveBeenCalled();
    expect($('.status').textContent).toContain('입력창');
  });

  it('클립보드 폴백이 쓰이면 붙여넣기를 안내한다', async () => {
    await storage().add({ body: '안녕하세요' });
    const { handle, $ } = mountWith({
      target: document.createElement('div'),
      insert: vi.fn(async () => 'clipboard'),
    });
    await handle.refresh();

    $('.item .pick').click();
    await new Promise((r) => setTimeout(r, 0));
    expect($('.status').textContent).toContain('클립보드');
  });

  it('execCommand 폴백이 쓰이고 본문이 여러 줄이면 줄바꿈 유실을 경고한다', async () => {
    await storage().add({ body: '첫째 줄\n둘째 줄' });
    const { handle, $ } = mountWith({
      target: document.createElement('div'),
      insert: vi.fn(async () => 'execCommand'),
    });
    await handle.refresh();

    $('.item .pick').click();
    await new Promise((r) => setTimeout(r, 0));
    expect($('.status').textContent).toContain('줄바꿈');
    expect($('.status').className).toContain('warn');
  });

  it('execCommand 폴백이 쓰여도 본문이 한 줄이면 일반 성공으로 안내한다', async () => {
    await storage().add({ body: '한 줄짜리 문구' });
    const { handle, $ } = mountWith({
      target: document.createElement('div'),
      insert: vi.fn(async () => 'execCommand'),
    });
    await handle.refresh();

    $('.item .pick').click();
    await new Promise((r) => setTimeout(r, 0));
    expect($('.status').textContent).not.toContain('줄바꿈');
    expect($('.status').className).toContain('ok');
  });

  it('삽입이 완전히 실패하면 실패를 안내한다', async () => {
    await storage().add({ body: '안녕하세요' });
    const { handle, $ } = mountWith({
      target: document.createElement('div'),
      insert: vi.fn(async () => 'failed'),
    });
    await handle.refresh();

    $('.item .pick').click();
    await new Promise((r) => setTimeout(r, 0));
    expect($('.status').textContent).toContain('실패');
    expect($('.status').className).toContain('error');
  });
});

describe('문구 CRUD', () => {
  it('폼을 제출하면 문구가 추가된다', async () => {
    const { handle, $ } = mountWith();
    await handle.refresh();
    $('.f-title').value = '인사';
    $('.f-body').value = '안녕하세요';
    $('.form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 0));

    const list = await storage().list();
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe('인사');
  });

  it('본문이 비면 저장하지 않는다', async () => {
    const { handle, $ } = mountWith();
    await handle.refresh();
    $('.f-body').value = '   ';
    $('.form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(await storage().list()).toHaveLength(0);
  });

  it('수정 버튼을 누르면 폼에 값이 채워지고, 제출 시 갱신된다', async () => {
    const sn = await storage().add({ title: '원본', body: '원본 본문' });
    const { handle, $ } = mountWith();
    await handle.refresh();

    $('.item .edit').click();
    await new Promise((r) => setTimeout(r, 0));
    expect($('.f-body').value).toBe('원본 본문');

    $('.f-body').value = '수정된 본문';
    $('.form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 0));

    const list = await storage().list();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(sn.id);
    expect(list[0].body).toBe('수정된 본문');
  });

  it('삭제 버튼을 누르면 확인 후 목록에서 사라진다', async () => {
    await storage().add({ body: '지울 문구' });
    const { handle, $ } = mountWith();
    await handle.refresh();
    vi.stubGlobal('confirm', vi.fn(() => true));

    $('.item .del').click();
    await new Promise((r) => setTimeout(r, 0));
    expect(await storage().list()).toHaveLength(0);
    vi.unstubAllGlobals();
  });
});

describe('삭제 확인 절차', () => {
  it('삭제 전에 어떤 문구가 지워지는지 담은 확인 메시지를 띄운다', async () => {
    await storage().add({ title: '확인용 제목', body: '지울 문구' });
    const { handle, $ } = mountWith();
    await handle.refresh();
    const confirmSpy = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmSpy);

    $('.item .del').click();
    await new Promise((r) => setTimeout(r, 0));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy.mock.calls[0][0]).toContain('확인용 제목');
    vi.unstubAllGlobals();
  });

  it('확인하면 삭제된다', async () => {
    await storage().add({ body: '지울 문구' });
    const { handle, $ } = mountWith();
    await handle.refresh();
    vi.stubGlobal('confirm', vi.fn(() => true));

    $('.item .del').click();
    await new Promise((r) => setTimeout(r, 0));

    expect(await storage().list()).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it('취소하면 아무것도 지워지지 않고, 취소했다는 안내가 뜬다', async () => {
    // 브라우저가 "이 페이지에서 추가 대화상자를 표시하지 않음"으로
    // confirm()을 영구히 false로 묶어버릴 수 있다. 그때 아무 안내 없이
    // return만 하면 사용자에게는 삭제가 계속 조용히 실패하는 것처럼
    // 보인다 — 그래서 취소 경로에도 상태 문구가 있어야 한다.
    await storage().add({ body: '남을 문구' });
    const { handle, $ } = mountWith();
    await handle.refresh();
    vi.stubGlobal('confirm', vi.fn(() => false));

    $('.item .del').click();
    await new Promise((r) => setTimeout(r, 0));

    expect(await storage().list()).toHaveLength(1);
    expect($('.status').textContent).not.toContain('삭제했습니다');
    expect($('.status').textContent).toContain('취소');
    vi.unstubAllGlobals();
  });
});

describe('저장/삭제 실패 처리', () => {
  it('추가 저장이 실패하면 오류를 안내하고 성공으로 보고하지 않는다', async () => {
    const { handle, $ } = mountWith();
    await handle.refresh();
    const addSpy = vi.spyOn(storage(), 'add').mockRejectedValue(new Error('저장 실패'));

    $('.f-body').value = '저장 안 될 문구';
    $('.form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 0));

    expect($('.status').textContent).toContain('실패');
    expect($('.status').className).toContain('error');
    expect($('.status').textContent).not.toContain('저장했습니다');
    addSpy.mockRestore();
  });

  it('수정 저장이 실패하면 오류를 안내한다', async () => {
    const sn = await storage().add({ body: '원본' });
    const { handle, $ } = mountWith();
    await handle.refresh();
    $('.item .edit').click();
    await new Promise((r) => setTimeout(r, 0));
    const updateSpy = vi
      .spyOn(storage(), 'update')
      .mockRejectedValue(new Error('저장 실패'));

    $('.f-body').value = '수정 시도';
    $('.form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 0));

    expect($('.status').textContent).toContain('실패');
    expect($('.status').className).toContain('error');
    updateSpy.mockRestore();
  });

  it('삭제가 실패하면 오류를 안내하고 성공으로 보고하지 않는다', async () => {
    await storage().add({ body: '지울 문구' });
    const { handle, $ } = mountWith();
    await handle.refresh();
    vi.stubGlobal('confirm', vi.fn(() => true));
    const removeSpy = vi
      .spyOn(storage(), 'remove')
      .mockRejectedValue(new Error('삭제 실패'));

    $('.item .del').click();
    await new Promise((r) => setTimeout(r, 0));

    expect($('.status').textContent).toContain('실패');
    expect($('.status').className).toContain('error');
    expect($('.status').textContent).not.toContain('삭제했습니다');
    removeSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('수정 대상이 이미 사라졌으면(update가 null) 성공으로 보고하지 않는다', async () => {
    // 다른 탭에서 같은 문구를 먼저 지운 상황을 흉내낸다: update()는
    // 예외 없이 "찾을 수 없음"을 뜻하는 null을 돌려준다.
    const sn = await storage().add({ body: '원본' });
    const { handle, $ } = mountWith();
    await handle.refresh();
    $('.item .edit').click();
    await new Promise((r) => setTimeout(r, 0));
    const updateSpy = vi.spyOn(storage(), 'update').mockResolvedValue(null);

    $('.f-body').value = '수정 시도';
    $('.form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 0));

    expect($('.status').textContent).not.toContain('저장했습니다');
    expect($('.status').className).toContain('error');
    updateSpy.mockRestore();
  });

  it('삭제 대상이 이미 사라졌으면(remove가 false) 성공으로 보고하지 않는다', async () => {
    // 다른 탭에서 같은 문구를 먼저 지운 상황을 흉내낸다.
    await storage().add({ body: '지울 문구' });
    const { handle, $ } = mountWith();
    await handle.refresh();
    vi.stubGlobal('confirm', vi.fn(() => true));
    const removeSpy = vi.spyOn(storage(), 'remove').mockResolvedValue(false);

    $('.item .del').click();
    await new Promise((r) => setTimeout(r, 0));

    expect($('.status').textContent).not.toContain('삭제했습니다');
    expect($('.status').className).toContain('error');
    removeSpy.mockRestore();
    vi.unstubAllGlobals();
  });
});

describe('패널 좌/우 위치', () => {
  it('기본 위치는 오른쪽이다', async () => {
    const { $ } = mountWith();
    await new Promise((r) => setTimeout(r, 0));
    expect($('.root').classList.contains('side-left')).toBe(false);
  });

  it('setSide("left")를 호출하면 side-left 클래스가 붙고 저장된다', async () => {
    const { handle, $ } = mountWith();
    await handle.setSide('left');
    expect($('.root').classList.contains('side-left')).toBe(true);
    expect(await storage().getSide()).toBe('left');
  });

  it('setSide("right")를 호출하면 side-left 클래스가 떨어진다', async () => {
    const { handle, $ } = mountWith();
    await handle.setSide('left');
    await handle.setSide('right');
    expect($('.root').classList.contains('side-left')).toBe(false);
    expect(await storage().getSide()).toBe('right');
  });

  it('저장된 위치가 left면 마운트 시 복원된다', async () => {
    await storage().setSide('left');
    const { $ } = mountWith();
    await new Promise((r) => setTimeout(r, 0));
    expect($('.root').classList.contains('side-left')).toBe(true);
  });

  it('전환 버튼을 클릭하면 위치가 토글된다', async () => {
    const { $ } = mountWith();
    // .side는 패널 안에 있어 패널이 열려야 실제로 클릭 가능하다.
    $('.tab').click();
    await new Promise((r) => setTimeout(r, 0));
    $('.side').click();
    await new Promise((r) => setTimeout(r, 0));
    expect($('.root').classList.contains('side-left')).toBe(true);

    $('.side').click();
    await new Promise((r) => setTimeout(r, 0));
    expect($('.root').classList.contains('side-left')).toBe(false);
  });

  it('전환 버튼의 aria-label이 현재 위치에 따라 바뀐다', async () => {
    const { $ } = mountWith();
    $('.tab').click();
    await new Promise((r) => setTimeout(r, 0));
    expect($('.side').getAttribute('aria-label')).toBe('왼쪽으로 옮기기');

    $('.side').click();
    await new Promise((r) => setTimeout(r, 0));
    expect($('.side').getAttribute('aria-label')).toBe('오른쪽으로 옮기기');
  });

  it('left/right가 아닌 값을 setSide에 넣으면 right로 정규화된다', async () => {
    const { handle, $ } = mountWith();
    await handle.setSide('left');
    await handle.setSide('center');
    expect($('.root').classList.contains('side-left')).toBe(false);
    expect(await storage().getSide()).toBe('right');
  });
});

describe('updateTargetState', () => {
  it('대상이 없으면 no-target 클래스를 붙인다', () => {
    const { handle } = mountWith({ target: null });
    handle.updateTargetState();
    expect(handle.shadow.querySelector('.root').classList.contains('no-target')).toBe(true);
  });

  it('대상이 있으면 no-target 클래스를 뗀다', () => {
    const { handle } = mountWith({ target: document.createElement('div') });
    handle.updateTargetState();
    expect(handle.shadow.querySelector('.root').classList.contains('no-target')).toBe(false);
  });

  it('no-target 경고는 대상이 생기면 여전히 지워진다', () => {
    let target = null;
    const handle = panel().mount({
      storage: storage(),
      getTarget: () => target,
      insert: vi.fn(async () => 'paste'),
    });
    const $ = (sel) => handle.shadow.querySelector(sel);

    handle.updateTargetState();
    expect($('.status').textContent).toContain('입력창');

    target = document.createElement('div');
    handle.updateTargetState();
    expect($('.status').textContent).toBe('');
  });

  it('클립보드 폴백 안내는 대상이 있는 채로 updateTargetState가 다시 불려도 남아 있는다', async () => {
    await storage().add({ body: '안녕하세요' });
    const target = document.createElement('div');
    const handle = panel().mount({
      storage: storage(),
      getTarget: () => target,
      insert: vi.fn(async () => 'clipboard'),
    });
    const $ = (sel) => handle.shadow.querySelector(sel);
    await handle.refresh();

    $('.item .pick').click();
    await new Promise((r) => setTimeout(r, 0));
    expect($('.status').textContent).toContain('클립보드');

    // 포커스 변화 등으로 updateTargetState가 다시 호출돼도(대상은 여전히
    // 있음) 클립보드 안내는 no-target 경고가 아니므로 지워지면 안 된다.
    handle.updateTargetState();
    expect($('.status').textContent).toContain('클립보드');
  });
});

describe('전달 큐 수신자 경계', () => {
  it('현재 대화 핸들로만 큐를 조회한다', async () => {
    await storage().setOpsConfig({ apiBaseUrl: 'https://ops.example', apiToken: 'x'.repeat(16) });
    const { handle, api } = mountWithOps();
    await handle.refresh();
    expect(api.listDeliveries).toHaveBeenCalledWith(
      storage(),
      { status: 'PENDING', handle: 'sam' }
    );
  });

  it('전달 항목에 종류 라벨을 보여준다', async () => {
    await storage().setOpsConfig({ apiBaseUrl: 'https://ops.example', apiToken: 'x'.repeat(16) });
    const target = document.createElement('div');
    const api = {
      listDeliveries: vi.fn(async () => ({
        items: [{ id: 'd1', toHandle: 'sam', body: '문구', kind: 'SPEC_REQUEST' }],
      })),
      patchDelivery: vi.fn(),
    };
    const collector = { scrapeThread: vi.fn(() => ({ handle: 'sam' })) };
    const handle = panel().mount({
      storage: storage(),
      getTarget: () => target,
      insert: vi.fn(async () => 'paste'),
      api,
      collector,
    });
    await handle.refresh();
    expect(handle.shadow.querySelector('.dmeta').textContent).toContain('스펙 문의');
  });

  it('현재 대화와 다른 수신자 문구는 삽입하지 않는다', async () => {
    await storage().setOpsConfig({ apiBaseUrl: 'https://ops.example', apiToken: 'x'.repeat(16) });
    const { handle, $, insert, api } = mountWithOps({ toHandle: 'other' });
    await handle.refresh();
    $('.dlist .d-insert').click();
    await new Promise((r) => setTimeout(r, 0));
    expect(insert).not.toHaveBeenCalled();
    expect(api.patchDelivery).not.toHaveBeenCalled();
    expect($('.ops-status').textContent).toContain('다른 전달 문구');
  });
});

describe('관심 접수', () => {
  function mountWithInquiry({ handle: chatHandle = 'sam', createInquiry } = {}) {
    const api = {
      listDeliveries: vi.fn(async () => ({ items: [] })),
      patchDelivery: vi.fn(),
      createInquiry:
        createInquiry ?? vi.fn(async () => ({ inquiry: { id: 'inq1' }, reused: false })),
    };
    const collector = { scrapeThread: vi.fn(() => ({ handle: chatHandle })) };
    const handle = panel().mount({
      storage: storage(),
      getTarget: () => document.createElement('div'),
      insert: vi.fn(async () => 'paste'),
      api,
      collector,
    });
    return { handle, api, $: (sel) => handle.shadow.querySelector(sel) };
  }

  it('번호를 넣고 누르면 현재 대화 핸들로 관심을 접수한다', async () => {
    const { api, $ } = mountWithInquiry();
    $('.inq-seq').value = '67';
    $('.inq-add').click();
    await new Promise((r) => setTimeout(r, 0));
    expect(api.createInquiry).toHaveBeenCalledWith(storage(), {
      targetSeq: 67,
      fromHandle: 'sam',
    });
    expect($('.ops-status').textContent).toContain('관심 접수됨');
    expect($('.inq-seq').value).toBe('');
  });

  it('번호가 비었거나 숫자가 아니면 접수하지 않는다', async () => {
    const { api, $ } = mountWithInquiry();
    $('.inq-seq').value = 'abc';
    $('.inq-add').click();
    await new Promise((r) => setTimeout(r, 0));
    expect(api.createInquiry).not.toHaveBeenCalled();
    expect($('.ops-status').textContent).toContain('게시 번호');
  });

  it('현재 대화 상대를 못 찾으면 접수하지 않는다', async () => {
    const { api, $ } = mountWithInquiry({ handle: '' });
    $('.inq-seq').value = '67';
    $('.inq-add').click();
    await new Promise((r) => setTimeout(r, 0));
    expect(api.createInquiry).not.toHaveBeenCalled();
    expect($('.ops-status').textContent).toContain('대화 상대');
  });

  it('이미 열린 문의면 재사용 안내를 보여준다', async () => {
    const { $ } = mountWithInquiry({
      createInquiry: vi.fn(async () => ({ inquiry: { id: 'inq1' }, reused: true })),
    });
    $('.inq-seq').value = '67';
    $('.inq-add').click();
    await new Promise((r) => setTimeout(r, 0));
    expect($('.ops-status').textContent).toContain('이미 진행 중');
  });
});
