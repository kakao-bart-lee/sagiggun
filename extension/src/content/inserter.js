(() => {
  const NS = (globalThis.TSNIP = globalThis.TSNIP || {});

  function readText(editor) {
    const lexical = editor.__lexicalTextContent;
    return typeof lexical === 'string' ? lexical : editor.textContent;
  }

  // Lexical은 삽입을 다음 틱에 reconcile한다. 즉시 읽으면 빈 문자열이 나온다.
  const defaultWait = () =>
    new Promise((resolve) => setTimeout(resolve, 0));

  // 1순위. execCommand와 달리 줄바꿈을 보존한다.
  const pasteStrategy = {
    name: 'paste',
    run(editor, text) {
      if (
        typeof DataTransfer !== 'function' ||
        typeof ClipboardEvent !== 'function'
      ) {
        return false;
      }
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      editor.dispatchEvent(
        new ClipboardEvent('paste', {
          clipboardData: dt,
          bubbles: true,
          cancelable: true,
        })
      );
      return true;
    },
  };

  // 2순위. 줄바꿈을 삼키므로 paste가 실패했을 때만 쓴다.
  const execCommandStrategy = {
    name: 'execCommand',
    run(editor, text) {
      if (typeof document.execCommand !== 'function') return false;
      return document.execCommand('insertText', false, text) !== false;
    },
  };

  async function insert(editor, text, opts = {}) {
    if (!editor || !text) return 'failed';

    const strategies = opts.strategies || [pasteStrategy, execCommandStrategy];
    const wait = opts.wait || defaultWait;

    // 정상 경로에서는 mousedown preventDefault 덕분에 이미 포커스가 있다.
    // 패널 자체 입력 필드를 거쳐 온 경우를 위한 안전망.
    if (document.activeElement !== editor && typeof editor.focus === 'function') {
      editor.focus();
    }

    for (const strategy of strategies) {
      const before = readText(editor);
      let attempted;
      try {
        attempted = strategy.run(editor, text) !== false;
      } catch (err) {
        console.warn('[TSNIP] 삽입 전략 실패:', strategy.name, err);
        attempted = false;
      }
      if (!attempted) continue;

      await wait();
      if (readText(editor) !== before) return strategy.name;

      // 실패 판정의 대가가 "무반응"이 아니라 "중복 삽입"이다(다음 전략이
      // 같은 텍스트를 한 번 더 넣는다). paste가 실제로는 성공했는데
      // reconcile이 한 틱 늦어 오탐하는 상황에 대비해 한 번 더 기다렸다가
      // 다시 확인한다. 그래도 변화가 없을 때만 다음 전략으로 내려간다.
      await wait();
      if (readText(editor) !== before) return strategy.name;
    }

    try {
      await navigator.clipboard.writeText(text);
      return 'clipboard';
    } catch (err) {
      console.warn('[TSNIP] 클립보드 복사 실패', err);
      return 'failed';
    }
  }

  NS.inserter = { insert, readText, pasteStrategy, execCommandStrategy };
})();
