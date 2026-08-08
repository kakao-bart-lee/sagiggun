(() => {
  const NS = (globalThis.TSNIP = globalThis.TSNIP || {});

  // 클래스명은 해시라 쓸 수 없고, aria-placeholder는 UI 언어에 따라 달라진다.
  // 구조적 속성만으로 식별한다.
  const EDITOR_SELECTOR =
    '[contenteditable="true"][data-lexical-editor="true"][role="textbox"]';

  function isEditor(node) {
    return !!(
      node &&
      node.nodeType === 1 &&
      typeof node.matches === 'function' &&
      node.matches(EDITOR_SELECTOR)
    );
  }

  function findEditors(root = document) {
    return Array.from(root.querySelectorAll(EDITOR_SELECTOR));
  }

  function createTracker(doc = document) {
    let lastFocused = null;
    const listeners = new Set();

    function getTarget() {
      if (lastFocused && lastFocused.isConnected) return lastFocused;
      lastFocused = null;

      const editors = findEditors(doc);
      const inDialog = editors.filter((el) => el.closest('[role="dialog"]'));
      if (inDialog.length) return inDialog[inDialog.length - 1];
      if (editors.length === 1) return editors[0];
      return null;
    }

    function emit() {
      const target = getTarget();
      listeners.forEach((cb) => cb(target));
    }

    function onFocusIn(event) {
      if (!isEditor(event.target)) return;
      lastFocused = event.target;
      emit();
    }

    return {
      start() {
        doc.addEventListener('focusin', onFocusIn, true);
      },
      stop() {
        doc.removeEventListener('focusin', onFocusIn, true);
        listeners.clear();
        lastFocused = null;
      },
      getTarget,
      notifyDomChanged: emit,
      onChange(cb) {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
    };
  }

  NS.detector = { EDITOR_SELECTOR, isEditor, findEditors, createTracker };
})();
