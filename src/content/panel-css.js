(() => {
  const NS = (globalThis.TSNIP = globalThis.TSNIP || {});

  NS.css = `
:host { all: initial; }

.root {
  position: fixed;
  top: 96px;
  right: 0;
  z-index: 2147483647;
  display: flex;
  align-items: flex-start;
  font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo",
    "Malgun Gothic", "Segoe UI", sans-serif;
  font-size: 13px;
  line-height: 1.5;
  color: #f5f5f5;
}

.tab {
  writing-mode: vertical-rl;
  padding: 14px 6px;
  background: #181818;
  color: #f5f5f5;
  border: 1px solid #303030;
  border-right: 0;
  border-radius: 8px 0 0 8px;
  cursor: pointer;
  font: inherit;
  letter-spacing: 2px;
}
.tab:hover { background: #242424; }

.panel {
  width: 300px;
  max-height: 70vh;
  overflow-y: auto;
  background: #181818;
  border: 1px solid #303030;
  border-right: 0;
  border-radius: 12px 0 0 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  padding: 12px;
  box-sizing: border-box;
}
.panel[hidden] { display: none; }

.head { display: flex; align-items: center; justify-content: space-between; }
.head h1 { margin: 0; font-size: 14px; font-weight: 600; }
.close {
  background: none; border: 0; color: #999;
  font-size: 18px; cursor: pointer; padding: 0 4px;
}
.close:hover { color: #f5f5f5; }

.status { margin: 8px 0; min-height: 18px; font-size: 12px; color: #999; }
.status.ok { color: #4ba3f2; }
.status.warn { color: #e8b64c; }
.status.error { color: #f2645a; }

.list { list-style: none; margin: 0 0 12px; padding: 0; }
.list .empty { color: #777; padding: 12px 4px; text-align: center; }

.item { display: flex; gap: 4px; margin-bottom: 4px; }
.item .pick {
  flex: 1; min-width: 0;
  text-align: left;
  padding: 8px 10px;
  background: #242424;
  color: #f5f5f5;
  border: 1px solid #303030;
  border-radius: 8px;
  cursor: pointer;
  font: inherit;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.item .pick:hover { background: #2f2f2f; }
.item .edit, .item .del {
  background: none; border: 0; color: #888;
  cursor: pointer; padding: 0 6px; font-size: 13px;
}
.item .edit:hover, .item .del:hover { color: #f5f5f5; }

.root.no-target .item .pick { opacity: 0.45; cursor: not-allowed; }

.form { display: flex; flex-direction: column; gap: 6px;
  border-top: 1px solid #303030; padding-top: 10px; }
.form input, .form textarea {
  background: #101010;
  border: 1px solid #303030;
  border-radius: 8px;
  padding: 8px;
  color: #f5f5f5;
  font: inherit;
  resize: vertical;
  box-sizing: border-box;
  width: 100%;
}
.form input:focus, .form textarea:focus { outline: 1px solid #4ba3f2; }

.actions { display: flex; gap: 6px; }
.actions button {
  flex: 1; padding: 8px; border-radius: 8px;
  border: 1px solid #303030; cursor: pointer; font: inherit;
}
.actions .save { background: #f5f5f5; color: #101010; border-color: #f5f5f5; }
.actions .cancel { background: none; color: #999; }
.actions .cancel[hidden] { display: none; }
`;
})();
