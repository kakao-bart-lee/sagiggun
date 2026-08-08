(() => {
  const NS = (globalThis.TSNIP = globalThis.TSNIP || {});
  const HOST_ID = 'tsnip-host';
  const LABEL_MAX = 24;

  const TEMPLATE = `
<button class="tab" type="button" aria-expanded="false">문구</button>
<section class="panel" hidden>
  <header class="head">
    <h1>저장된 문구</h1>
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
</section>`;

  function labelFor(snippet) {
    const title = (snippet.title || '').trim();
    if (title) return title;
    const firstLine = (snippet.body || '').trim().split('\n')[0];
    return firstLine.length > LABEL_MAX
      ? firstLine.slice(0, LABEL_MAX) + '…'
      : firstLine;
  }

  function mount({ storage, getTarget, insert, doc = document }) {
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

    let editingId = null;

    function setStatus(message, kind = '') {
      statusEl.textContent = message || '';
      statusEl.className = 'status' + (kind ? ' ' + kind : '');
    }

    function updateTargetState() {
      const hasTarget = !!getTarget();
      root.classList.toggle('no-target', !hasTarget);
      if (!hasTarget) setStatus('입력창을 먼저 클릭하세요.', 'warn');
      else if (statusEl.classList.contains('warn')) setStatus('');
    }

    function resetForm() {
      editingId = null;
      titleInput.value = '';
      bodyInput.value = '';
      cancelBtn.hidden = true;
      saveBtn.textContent = '저장';
    }

    async function refresh() {
      const snippets = await storage.list();
      listEl.textContent = '';

      if (!snippets.length) {
        const empty = doc.createElement('li');
        empty.className = 'empty';
        empty.textContent = '저장된 문구가 없습니다.';
        listEl.appendChild(empty);
        return;
      }

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
          setStatus('입력창을 먼저 클릭하세요.', 'warn');
          return;
        }
        const how = await insert(target, snippet.body);
        if (how === 'clipboard') {
          setStatus('삽입에 실패해 클립보드에 복사했습니다. 직접 붙여넣어 주세요.', 'warn');
        } else if (how === 'failed') {
          setStatus('삽입에 실패했습니다.', 'error');
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
        await storage.remove(id);
        if (editingId === id) resetForm();
        await refresh();
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
      if (editingId) {
        await storage.update(editingId, { title: titleInput.value, body });
      } else {
        await storage.add({ title: titleInput.value, body });
      }
      resetForm();
      await refresh();
      setStatus('저장했습니다.', 'ok');
    });

    cancelBtn.addEventListener('click', resetForm);
    tabBtn.addEventListener('click', () => setOpen(panelEl.hidden));
    $('.close').addEventListener('click', () => setOpen(false));

    // 저장된 열림 상태 복원
    storage.isOpen().then((open) => {
      if (open) setOpen(true);
    });

    return {
      host,
      shadow,
      refresh,
      updateTargetState,
      setOpen,
      destroy() {
        host.remove();
      },
    };
  }

  NS.panel = { mount, labelFor, HOST_ID };
})();
