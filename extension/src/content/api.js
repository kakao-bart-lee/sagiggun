(() => {
  const NS = (globalThis.TSNIP = globalThis.TSNIP || {});

  async function getConfig(storage) {
    const cfg = storage?.getOpsConfig
      ? await storage.getOpsConfig()
      : { apiBaseUrl: '', apiToken: '' };
    return cfg;
  }

  async function request(storage, path, init = {}) {
    const { apiBaseUrl, apiToken } = await getConfig(storage);
    if (!apiBaseUrl || !apiToken) {
      throw new Error('확장 옵션에서 API URL과 OPS_API_TOKEN을 설정하세요.');
    }
    const headers = new Headers(init.headers || {});
    headers.set('Authorization', `Bearer ${apiToken}`);
    if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    const res = await fetch(`${apiBaseUrl}${path}`, { ...init, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `요청 실패 (${res.status})`);
    }
    return data;
  }

  async function createProfile(storage, { sourceHandle, rawText }) {
    return request(storage, '/api/profiles', {
      method: 'POST',
      body: JSON.stringify({ sourceHandle, rawText }),
    });
  }

  async function uploadPhotos(storage, profileId, files) {
    if (!files.length) return { saved: [], failed: [] };
    const form = new FormData();
    for (const file of files) form.append('photos', file);
    return request(storage, `/api/profiles/${profileId}/photos`, {
      method: 'POST',
      body: form,
    });
  }

  async function listDeliveries(storage, query = {}) {
    const params = new URLSearchParams();
    if (query.status) params.set('status', query.status);
    if (query.handle) params.set('handle', query.handle.replace(/^@/, ''));
    const q = params.toString();
    return request(storage, `/api/deliveries${q ? `?${q}` : ''}`);
  }

  async function patchDelivery(storage, id, status) {
    return request(storage, `/api/deliveries/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  NS.api = {
    getConfig,
    createProfile,
    uploadPhotos,
    listDeliveries,
    patchDelivery,
  };
})();
