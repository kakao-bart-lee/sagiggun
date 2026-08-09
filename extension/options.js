const baseInput = document.getElementById('apiBaseUrl');
const tokenInput = document.getElementById('apiToken');
const statusEl = document.getElementById('status');
const saveBtn = document.getElementById('save');

async function load() {
  const data = await chrome.storage.local.get(['apiBaseUrl', 'apiToken']);
  baseInput.value = data.apiBaseUrl || 'http://127.0.0.1:3000';
  tokenInput.value = data.apiToken || '';
}

saveBtn.addEventListener('click', async () => {
  const apiBaseUrl = baseInput.value.trim().replace(/\/$/, '');
  const apiToken = tokenInput.value.trim();
  if (!apiBaseUrl || apiToken.length < 16) {
    statusEl.textContent = 'URL과 토큰(16자+)을 확인하세요.';
    return;
  }

  try {
    let origin = apiBaseUrl;
    try {
      origin = new URL(apiBaseUrl).origin + '/*';
    } catch {
      statusEl.textContent = 'URL 형식이 올바르지 않습니다.';
      return;
    }
    if (chrome.permissions?.request) {
      await chrome.permissions.request({ origins: [origin] });
    }
  } catch (err) {
    console.warn(err);
  }

  await chrome.storage.local.set({ apiBaseUrl, apiToken });
  statusEl.textContent = '저장했습니다.';
});

load();
