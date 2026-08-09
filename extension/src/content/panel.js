(() => {
  const NS = (globalThis.TSNIP = globalThis.TSNIP || {});
  const HOST_ID = 'tsnip-host';
  const LABEL_MAX = 24;

  const TEMPLATE = `
<button class="tab" type="button" aria-expanded="false">문구</button>
<section class="panel" hidden>
  <header class="head">
    <h1>저장된 문구</h1>
    <button class="side" type="button" aria-label="왼쪽으로 옮기기">⇄</button>
    <button class="close" type="button" aria-label="닫기">&times;</button>
  </header>
  <p class="status" role="status"></p>
  <ul class="list"></ul>
  <form class="form">
    <input class="f-title" type="text" placeholder="제목 (선택)" />
    <textarea class="f-body" rows="3" placeholder="문구 내용"></textarea>
    <div class="actions">
      <button class="save" type="submit">저장</button>
      <button class="cancel" type="button" hidden>취소</button>
    </div>
  </form>
  <section class="ops">
    <h2>운영 (수집·전달)</h2>
    <button class="collect" type="button">이 대화 수집</button>
    <p class="ops-status" role="status"></p>
    <ul class="dlist"></ul>
  </section>
</section>`;

  function labelFor(snippet) {
    const title = (snippet.title || '').trim();
    if (title) return title;
    const firstLine = (snippet.body || '').trim().split('\n')[0];
    return firstLine.length > LABEL_MAX
      ? firstLine.slice(0, LABEL_MAX) + '…'
      : firstLine;
  }

  function mount({ storage, getTarget, insert, doc = document, api, collector }) {
    doc.getElementById(HOST_ID)?.remove();

    const host = doc.createElement('div');
    host.id = HOST_ID;
    const shadow = host.attachShadow({ mode: 'open' });

    const style = doc.createElement('style');
    style.textContent = NS.css || '';
    shadow.appendChild(style);

    const root = doc.createElement('div');
    root.className = 'root';
    root.innerHTML = TEMPLATE;
    shadow.appendChild(root);
    doc.documentElement.appendChild(host);

    const $ = (sel) => root.querySelector(sel);
    const tabBtn = $('.tab');
    const panelEl = $('.panel');
    const listEl = $('.list');
    const statusEl = $('.status');
    const formEl = $('.form');
    const titleInput = $('.f-title');
    const bodyInput = $('.f-body');
    const cancelBtn = $('.cancel');
    const saveBtn = $('.save');
    const sideBtn = $('.side');
    const collectBtn = $('.collect');
    const opsStatusEl = $('.ops-status');
    const dlistEl = $('.dlist');
    const opsApi = api || NS.api;
    const opsCollector = collector || NS.collector;

    let editingId = null;

    // statusEl.dataset.source로 이 메시지를 누가 띄웠는지 표시해 둔다.
    // updateTargetState()는 자신이 띄운 'no-target' 경고만 지워야 하고,
    // 클립보드 폴백 안내 같은 다른 warn 메시지는 대상이 생겨도 남아 있어야
    // 사용자가 안내를 읽을 시간을 확보한다.
    function setStatus(message, kind = '', source = '') {
      const text = message || '';
      const className = 'status' + (kind ? ' ' + kind : '');
      // 이미 같은 상태면 DOM에 다시 쓰지 않는다. no-target 경고처럼 같은
      // 메시지가 프레임마다 반복 호출될 수 있는 경로가 있어서다.
      if (
        statusEl.textContent === text &&
        statusEl.className === className &&
        statusEl.dataset.source === source
      ) {
        return;
      }
      statusEl.textContent = text;
      statusEl.className = className;
      statusEl.dataset.source = source;
    }

    function setOpsStatus(message, kind = '') {
      opsStatusEl.textContent = message || '';
      opsStatusEl.className = 'ops-status' + (kind ? ' ' + kind : '');
    }

    // target을 미리 계산해 넘길 수 있게 해서, 이미 getTarget()을 돌린
    // 호출자(예: detector의 notifyDomChanged)가 같은 프레임에 두 번 돌리지
    // 않아도 되게 한다. 안 넘기면 기존처럼 직접 계산한다.
    function updateTargetState(target = getTarget()) {
      const hasTarget = !!target;
      root.classList.toggle('no-target', !hasTarget);
      if (!hasTarget) setStatus('입력창을 먼저 클릭하세요.', 'warn', 'no-target');
      else if (statusEl.dataset.source === 'no-target') setStatus('');
    }

    function resetForm() {
      editingId = null;
      titleInput.value = '';
      bodyInput.value = '';
      cancelBtn.hidden = true;
      saveBtn.textContent = '저장';
    }

    async function refreshDeliveries() {
      dlistEl.textContent = '';
      if (!opsApi || !storage.getOpsConfig) {
        const empty = doc.createElement('li');
        empty.className = 'empty';
        empty.textContent = 'API 모듈이 없습니다.';
        dlistEl.appendChild(empty);
        return;
      }
      const cfg = await storage.getOpsConfig();
      if (!cfg.apiBaseUrl || !cfg.apiToken) {
        const empty = doc.createElement('li');
        empty.className = 'empty';
        empty.textContent = '옵션에서 API URL·토큰을 설정하세요.';
        dlistEl.appendChild(empty);
        return;
      }
      try {
        const data = await opsApi.listDeliveries(storage, { status: 'PENDING' });
        const items = data.items || [];
        if (!items.length) {
          const empty = doc.createElement('li');
          empty.className = 'empty';
          empty.textContent = '대기 중인 전달이 없습니다.';
          dlistEl.appendChild(empty);
          return;
        }
        for (const item of items) {
          const li = doc.createElement('li');
          li.className = 'ditem';
          li.dataset.id = item.id;

          const meta = doc.createElement('div');
          meta.className = 'dmeta';
          meta.textContent = '@' + (item.toHandle || '');

          const body = doc.createElement('pre');
          body.className = 'dbody';
          body.textContent = item.body || '';

          const actions = doc.createElement('div');
          actions.className = 'dactions';

          const insertBtn = doc.createElement('button');
          insertBtn.type = 'button';
          insertBtn.className = 'd-insert';
          insertBtn.textContent = '삽입';

          const doneBtn = doc.createElement('button');
          doneBtn.type = 'button';
          doneBtn.className = 'd-done';
          doneBtn.textContent = '완료';

          actions.append(insertBtn, doneBtn);
          li.append(meta, body, actions);
          dlistEl.appendChild(li);
        }
      } catch (err) {
        const empty = doc.createElement('li');
        empty.className = 'empty';
        empty.textContent = err.message || '전달 큐를 불러오지 못했습니다.';
        dlistEl.appendChild(empty);
      }
    }

    async function refresh() {
      const snippets = await storage.list();
      listEl.textContent = '';

      if (!snippets.length) {
        const empty = doc.createElement('li');
        empty.className = 'empty';
        empty.textContent = '저장된 문구가 없습니다.';
        listEl.appendChild(empty);
      } else {
        for (const snippet of snippets) {
          const item = doc.createElement('li');
          item.className = 'item';
          item.dataset.id = snippet.id;

          const pick = doc.createElement('button');
          pick.type = 'button';
          pick.className = 'pick';
          pick.textContent = labelFor(snippet);
          pick.title = snippet.body;

          const edit = doc.createElement('button');
          edit.type = 'button';
          edit.className = 'edit';
          edit.textContent = '✎';
          edit.setAttribute('aria-label', '수정');

          const del = doc.createElement('button');
          del.type = 'button';
          del.className = 'del';
          del.textContent = '🗑';
          del.setAttribute('aria-label', '삭제');

          item.append(pick, edit, del);
          listEl.appendChild(item);
        }
      }
      await refreshDeliveries();
    }

    async function setSide(side) {
      const normalized = side === 'left' ? 'left' : 'right';
      root.classList.toggle('side-left', normalized === 'left');
      sideBtn.setAttribute(
        'aria-label',
        normalized === 'left' ? '오른쪽으로 옮기기' : '왼쪽으로 옮기기'
      );
      await storage.setSide(normalized);
    }

    async function setOpen(open) {
      panelEl.hidden = !open;
      tabBtn.setAttribute('aria-expanded', String(open));
      await storage.setOpen(open);
      if (open) {
        await refresh();
        updateTargetState();
      }
    }

    // 이 preventDefault가 이 확장의 핵심이다.
    // 없으면 클릭하는 순간 컴포저의 포커스와 커서 위치가 날아간다.
    listEl.addEventListener('mousedown', (event) => {
      if (event.target.closest('.pick')) event.preventDefault();
    });
    dlistEl.addEventListener('mousedown', (event) => {
      if (event.target.closest('.d-insert')) event.preventDefault();
    });

    collectBtn.addEventListener('click', async () => {
      if (!opsCollector || !opsApi) {
        setOpsStatus('수집 모듈이 없습니다.', 'error');
        return;
      }
      setOpsStatus('수집 중…');
      try {
        const result = await opsCollector.collectAndUpload({
          storage,
          api: opsApi,
          doc,
        });
        setOpsStatus(
          `수집됨 @${result.handle}` +
            (result.photoFailed ? ` · 사진 ${result.photoFailed}장 실패` : '') +
            ` → ${result.adminUrl}`,
          'ok'
        );
      } catch (err) {
        setOpsStatus(err.message || '수집 실패', 'error');
      }
    });

    dlistEl.addEventListener('click', async (event) => {
      const clicked = event.target;
      const item = clicked.closest('.ditem');
      if (!item) return;
      const id = item.dataset.id;
      const bodyEl = item.querySelector('.dbody');
      const body = bodyEl?.textContent || '';

      if (clicked.closest('.d-insert')) {
        const target = getTarget();
        if (!target) {
          setOpsStatus('입력창을 먼저 클릭하세요.', 'warn');
          return;
        }
        const how = await insert(target, body);
        if (how === 'failed') {
          setOpsStatus('삽입 실패', 'error');
          return;
        }
        try {
          await opsApi.patchDelivery(storage, id, 'INSERTED');
          setOpsStatus(
            how === 'clipboard'
              ? '클립보드에 복사 · 삽입됨 표시. 붙여넣고 직접 보내세요.'
              : '삽입했습니다. Threads에서 보내기를 누르세요.',
            how === 'clipboard' ? 'warn' : 'ok'
          );
          await refreshDeliveries();
        } catch (err) {
          setOpsStatus(err.message || '상태 갱신 실패', 'error');
        }
        return;
      }

      if (clicked.closest('.d-done')) {
        try {
          await opsApi.patchDelivery(storage, id, 'DONE');
          setOpsStatus('완료 처리했습니다.', 'ok');
          await refreshDeliveries();
        } catch (err) {
          setOpsStatus(err.message || '완료 처리 실패', 'error');
        }
      }
    });

    listEl.addEventListener('click', async (event) => {
      // event.target을 await 이후에 다시 읽으면 안 된다. dispatch가 끝나면
      // currentTarget이 null이 되고, 이후 target 게터가 재계산되면서 (shadow
      // DOM 리타게팅) 전혀 다른 요소(호스트 등)를 가리키게 될 수 있다.
      // 그래서 클릭 시점에 필요한 값을 전부 동기적으로 캡처해 둔다.
      const clicked = event.target;
      const item = clicked.closest('.item');
      if (!item) return;

      const isPick = !!clicked.closest('.pick');
      const isEdit = !!clicked.closest('.edit');
      const isDel = !!clicked.closest('.del');
      const id = item.dataset.id;

      const snippets = await storage.list();
      const snippet = snippets.find((s) => s.id === id);
      if (!snippet) return;

      if (isPick) {
        const target = getTarget();
        if (!target) {
          setStatus('입력창을 먼저 클릭하세요.', 'warn', 'no-target');
          return;
        }
        const how = await insert(target, snippet.body);
        if (how === 'clipboard') {
          setStatus('삽입에 실패해 클립보드에 복사했습니다. 직접 붙여넣어 주세요.', 'warn');
        } else if (how === 'failed') {
          setStatus('삽입에 실패했습니다.', 'error');
        } else if (how === 'execCommand' && snippet.body.includes('\n')) {
          // execCommand 폴백은 줄바꿈을 삼킨다(inserter.js 참고). 여러 줄
          // 문구가 한 줄로 붙었을 수 있으니 성공으로 보고하지 않고 경고한다.
          // 단일 줄 문구는 잃을 줄바꿈이 없으므로 일반 성공 처리로 둔다.
          setStatus('삽입했지만 줄바꿈이 사라졌을 수 있습니다.', 'warn');
        } else {
          setStatus('삽입했습니다.', 'ok');
        }
        return;
      }

      if (isEdit) {
        editingId = id;
        titleInput.value = snippet.title;
        bodyInput.value = snippet.body;
        cancelBtn.hidden = false;
        saveBtn.textContent = '수정';
        bodyInput.focus();
        return;
      }

      if (isDel) {
        // 삽입 버튼(.pick) 바로 옆 같은 행에 있는 작은 타깃이라 오클릭하기
        // 쉽고, 되돌릴 방법도 없다(내보내기·동기화 없음). 확인 없이는 지우지
        // 않는다.
        const confirmed = globalThis.confirm(
          `"${labelFor(snippet)}" 문구를 삭제할까요?`
        );
        if (!confirmed) {
          // 취소를 안내한다. 그냥 return만 하면, 브라우저가 "이 페이지에서
          // 추가 대화상자를 표시하지 않음"으로 confirm()을 영구히 false로
          // 묶어버린 경우 사용자에게 아무 설명 없이 삭제가 계속 안 먹히는
          // 것처럼 보인다.
          setStatus('삭제를 취소했습니다.', 'warn');
          return;
        }
        let removed;
        try {
          removed = await storage.remove(id);
        } catch (err) {
          console.warn('[TSNIP] 문구 삭제 실패', err);
          setStatus('삭제에 실패했습니다. 다시 시도해 주세요.', 'error');
          return;
        }
        if (editingId === id) resetForm();
        await refresh();
        // remove()는 실제로 지운 항목이 없으면(예: 다른 탭에서 이미 지운
        // 문구) 예외 없이 false를 돌려준다. 이 경우도 성공으로 보고하면
        // 안 된다.
        if (!removed) {
          setStatus('삭제할 문구를 찾을 수 없습니다.', 'error');
          return;
        }
        setStatus('삭제했습니다.', 'ok');
      }
    });

    formEl.addEventListener('submit', async (event) => {
      event.preventDefault();
      const body = bodyInput.value.trim();
      if (!body) {
        setStatus('문구 내용을 입력하세요.', 'warn');
        return;
      }
      let updated = true;
      try {
        if (editingId) {
          // update()는 대상이 이미 없으면(예: 다른 탭에서 지운 문구)
          // 예외 없이 null을 돌려준다. 이것도 성공으로 보고하면 안 된다.
          updated = !!(await storage.update(editingId, {
            title: titleInput.value,
            body,
          }));
        } else {
          await storage.add({ title: titleInput.value, body });
        }
      } catch (err) {
        console.warn('[TSNIP] 문구 저장 실패', err);
        setStatus('저장에 실패했습니다. 다시 시도해 주세요.', 'error');
        return;
      }
      resetForm();
      await refresh();
      if (!updated) {
        setStatus('수정할 문구를 찾을 수 없습니다.', 'error');
        return;
      }
      setStatus('저장했습니다.', 'ok');
    });

    cancelBtn.addEventListener('click', resetForm);
    tabBtn.addEventListener('click', () => setOpen(panelEl.hidden));
    $('.close').addEventListener('click', () => setOpen(false));
    sideBtn.addEventListener('click', () => {
      setSide(root.classList.contains('side-left') ? 'right' : 'left');
    });

    // 저장된 열림 상태 복원
    storage.isOpen().then((open) => {
      if (open) setOpen(true);
    });

    // 저장된 좌/우 위치 복원
    storage.getSide().then((side) => {
      if (side === 'left') setSide('left');
    });

    return {
      host,
      shadow,
      refresh,
      updateTargetState,
      setOpen,
      setSide,
      // index.js가 rAF 루프에서 패널이 닫혀 있을 때 대상 갱신을 건너뛰는
      // 데 쓴다. mount()의 필수 반환 계약(host/shadow/refresh/
      // updateTargetState/setOpen/setSide/destroy)에 더해진 항목이다.
      get isOpen() {
        return !panelEl.hidden;
      },
      destroy() {
        host.remove();
      },
    };
  }

  NS.panel = { mount, labelFor, HOST_ID };
})();
