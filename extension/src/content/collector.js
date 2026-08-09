(() => {
  const NS = (globalThis.TSNIP = globalThis.TSNIP || {});

  function normalizeHandle(raw) {
    if (!raw) return '';
    return String(raw)
      .trim()
      .replace(/^@/, '')
      .split(/[\s/]/)[0]
      .replace(/[^a-zA-Z0-9._]/g, '');
  }

  /**
   * Threads DM 대화에서 상대 핸들·본문·이미지 URL을 best-effort로 뽑는다.
   * DOM이 바뀌면 빈 결과가 나올 수 있다.
   */
  function scrapeThread(doc = document) {
    const handle =
      normalizeHandle(
        doc.querySelector('header a[href*="/@"]')?.textContent ||
          doc.querySelector('a[href*="/@"] span')?.textContent ||
          ''
      ) ||
      normalizeHandle(
        (doc.querySelector('title')?.textContent || '').match(/@([a-zA-Z0-9._]+)/)?.[1]
      );

    const bubbles = Array.from(
      doc.querySelectorAll('[data-pressable-container], [role="row"], article, div[dir="auto"]')
    );
    const texts = [];
    const seen = new Set();
    for (const el of bubbles) {
      const t = (el.innerText || el.textContent || '').trim();
      if (t.length < 8 || t.length > 4000) continue;
      if (seen.has(t)) continue;
      // UI chrome 걸러내기
      if (/^(보내기|Send|메시지|Message)/i.test(t)) continue;
      seen.add(t);
      texts.push(t);
      if (texts.length >= 40) break;
    }

    const rawText = texts.join('\n\n').trim();

    const imageUrls = Array.from(doc.querySelectorAll('img[src^="http"]'))
      .map((img) => img.currentSrc || img.src)
      .filter((src) => /cdninstagram|fbcdn|scontent|threads/i.test(src))
      .slice(0, 10);

    return { handle, rawText, imageUrls };
  }

  async function fetchImagesAsFiles(urls) {
    const files = [];
    for (let i = 0; i < urls.length; i += 1) {
      try {
        const res = await fetch(urls[i]);
        if (!res.ok) continue;
        const blob = await res.blob();
        const type = blob.type || 'image/jpeg';
        if (!type.startsWith('image/')) continue;
        files.push(new File([blob], `dm-${i + 1}.jpg`, { type }));
      } catch {
        /* CDN CORS/만료 — 관리자에서 보완 */
      }
    }
    return files;
  }

  async function collectAndUpload({ storage, api, doc = document }) {
    const scraped = scrapeThread(doc);
    if (!scraped.handle) {
      throw new Error('대화 상대 핸들을 찾지 못했습니다.');
    }
    if (!scraped.rawText) {
      throw new Error('대화 본문을 찾지 못했습니다. 원문을 복사해 관리자에 붙여넣으세요.');
    }

    try {
      await navigator.clipboard?.writeText?.(scraped.rawText);
    } catch {
      /* ignore */
    }

    const created = await api.createProfile(storage, {
      sourceHandle: scraped.handle,
      rawText: scraped.rawText,
    });
    const profileId = created.profile?.id || created.id;
    if (!profileId) throw new Error('프로필 id를 받지 못했습니다.');

    const files = await fetchImagesAsFiles(scraped.imageUrls);
    let photoResult = { saved: [], failed: [] };
    if (files.length) {
      try {
        photoResult = await api.uploadPhotos(storage, profileId, files);
      } catch (err) {
        photoResult = { saved: [], failed: [{ reason: String(err.message || err) }] };
      }
    }

    const { apiBaseUrl } = await api.getConfig(storage);
    return {
      profileId,
      handle: scraped.handle,
      adminUrl: `${apiBaseUrl}/admin/profiles/${profileId}`,
      photoSaved: photoResult.saved?.length ?? 0,
      photoFailed: photoResult.failed?.length ?? 0,
      duplicate: !!(created.duplicates && created.duplicates.length),
    };
  }

  NS.collector = { scrapeThread, fetchImagesAsFiles, collectAndUpload, normalizeHandle };
})();
