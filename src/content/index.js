(() => {
  const NS = (globalThis.TSNIP = globalThis.TSNIP || {});

  function boot(doc = document) {
    if (globalThis.__tsnipBooted) return null;
    if (!NS.storage || !NS.detector || !NS.inserter || !NS.panel) {
      console.warn('[TSNIP] 모듈 로드 실패 — 부팅을 건너뜁니다.');
      return null;
    }
    globalThis.__tsnipBooted = true;

    const tracker = NS.detector.createTracker(doc);
    tracker.start();

    let handle = mountPanel();

    function mountPanel() {
      return NS.panel.mount({
        storage: NS.storage,
        getTarget: () => tracker.getTarget(),
        insert: (editor, text) => NS.inserter.insert(editor, text),
        doc,
      });
    }

    tracker.onChange(() => handle.updateTargetState());

    // Threads는 SPA라 DOM이 끊임없이 바뀐다. 프레임 단위로 합쳐서 처리한다.
    let scheduled = false;
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        if (!doc.getElementById(NS.panel.HOST_ID)) handle = mountPanel();
        tracker.notifyDomChanged();
      });
    });
    observer.observe(doc.body, { childList: true, subtree: true });

    return {
      get host() {
        return handle.host;
      },
      get shadow() {
        return handle.shadow;
      },
      refresh: (...args) => handle.refresh(...args),
      updateTargetState: () => handle.updateTargetState(),
      setOpen: (open) => handle.setOpen(open),
      destroy() {
        observer.disconnect();
        tracker.stop();
        handle.destroy();
        globalThis.__tsnipBooted = false;
      },
    };
  }

  NS.boot = boot;

  // chrome.runtime.id는 실제 확장 컨텍스트에서만 존재한다.
  // 테스트(jsdom)에서는 자동 부팅하지 않고 boot()을 직접 호출한다.
  if (globalThis.chrome?.runtime?.id && globalThis.document?.body) boot();
})();
