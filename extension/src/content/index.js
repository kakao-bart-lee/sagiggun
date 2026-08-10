(() => {
  const NS = (globalThis.TSNIP = globalThis.TSNIP || {});

  function boot(doc = document) {
    if (globalThis.__tsnipBooted) return null;
    if (!NS.storage || !NS.detector || !NS.inserter || !NS.panel || !NS.css) {
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
        api: NS.api,
        collector: NS.collector,
        doc,
      });
    }

    tracker.onChange((target) => handle.updateTargetState(target));

    // Threads는 SPA라 DOM이 끊임없이 바뀐다. 프레임 단위로 합쳐서 처리한다.
    let scheduled = false;
    let rafId = null;
    let destroyed = false;
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      rafId = requestAnimationFrame(() => {
        scheduled = false;
        rafId = null;
        // destroy() 이후에 큐에 남아 있던 rAF가 뒤늦게 실행되어 이미
        // 정리된 tracker를 참조하는 좀비 패널을 되살리지 않도록 막는다.
        if (destroyed) return;
        if (!doc.getElementById(NS.panel.HOST_ID)) handle = mountPanel();
        // 패널이 닫혀 있으면 대상 안내가 화면에 보이지도 않으니 매 프레임
        // getTarget() 스캔 + DOM 갱신을 돌릴 이유가 없다. 열릴 때는
        // setOpen()이 refresh()와 updateTargetState()를 직접 불러 최신
        // 상태로 맞춘다.
        if (handle.isOpen) tracker.notifyDomChanged();
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
      setSide: (side) => handle.setSide(side),
      destroy() {
        if (destroyed) return;
        destroyed = true;
        observer.disconnect();
        // cancelAnimationFrame 하나만 믿지 않는다 — jsdom과 실제 브라우저의
        // 동작 차이에 기대지 않도록 destroyed 플래그로도 이중 차단한다.
        if (rafId !== null) cancelAnimationFrame(rafId);
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
