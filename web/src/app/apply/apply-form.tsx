'use client';

import { useState } from 'react';

const fieldClass = 'rounded-[8px] border-2 border-edge bg-field p-3 text-sm text-on-card';
const labelClass = 'text-xs font-bold text-muted-on-card';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[12px] border-2 border-edge bg-card p-5 text-on-card">
      <h2 className="mb-4 text-base font-extrabold">{title}</h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

export function ApplyForm() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [photoNames, setPhotoNames] = useState<string[]>([]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);

    const photos = form.getAll('photos').filter((v) => v instanceof File && v.size > 0);
    if (photos.length < 2) {
      setError('사진을 2장 이상 올려주세요.');
      return;
    }

    setBusy(true);
    setError('');
    const res = await fetch('/api/public/apply', { method: 'POST', body: form });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? '신청에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <p className="rounded-[12px] border-2 border-edge bg-card p-6 text-sm font-bold leading-relaxed text-on-card">
        신청이 접수됐어요! 🎉
        <br />
        주인장이 내용을 확인하고 소개글을 다듬어 게시한 뒤, 스레드 DM으로 알려드릴게요.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <Section title="누구를 소개할까요?">
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name="applicantType" value="SELF" defaultChecked /> 본인
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="applicantType" value="FRIEND" /> 친구 대신 신청
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>연락받을 스레드 핸들 (필수)</span>
          <input name="handle" className={fieldClass} placeholder="@my_threads" maxLength={60} required />
        </label>
      </Section>

      <Section title="🤍 본인 소개">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>성별</span>
            <select name="gender" className={fieldClass} required>
              <option value="">선택</option>
              <option value="F">여성</option>
              <option value="M">남성</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>출생연도</span>
            <input
              name="birthYear"
              className={fieldClass}
              inputMode="numeric"
              placeholder="2000"
              pattern="[0-9]{4}"
              required
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>키(cm)</span>
            <input
              name="heightCm"
              className={fieldClass}
              inputMode="numeric"
              placeholder="173"
              pattern="[0-9]{3}"
              required
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>지역</span>
            <input name="region" className={fieldClass} placeholder="수원" maxLength={100} required />
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>직업</span>
          <input name="job" className={fieldClass} placeholder="직장인" maxLength={100} required />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>취미 (콤마로 구분)</span>
          <input
            name="hobbies"
            className={fieldClass}
            placeholder="운동, 야구 관람, 사진 찍기"
            maxLength={500}
            required
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>본인 어필 1 (필수)</span>
          <input name="appeal1" className={fieldClass} placeholder="다정하다" maxLength={300} required />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>본인 어필 2</span>
          <input name="appeal2" className={fieldClass} placeholder="연락이 빠르다" maxLength={300} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>본인 어필 3</span>
          <input name="appeal3" className={fieldClass} placeholder="안정형이다" maxLength={300} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>사진 2장 이상 (주인장만 확인)</span>
          <input
            type="file"
            name="photos"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className={fieldClass}
            onChange={(e) =>
              setPhotoNames(Array.from(e.currentTarget.files ?? []).map((f) => f.name))
            }
          />
          {photoNames.length > 0 && (
            <span className="text-xs text-muted-on-card">
              {photoNames.length}장 선택됨 — {photoNames.join(', ')}
            </span>
          )}
        </label>
      </Section>

      <Section title="💛 원하는 이상형">
        <label className="flex flex-col gap-1">
          <span className={labelClass}>키</span>
          <input name="idealHeight" className={fieldClass} placeholder="ex. 175 이상" maxLength={200} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>얼굴 느낌</span>
          <input
            name="idealVibe"
            className={fieldClass}
            placeholder="ex. 두부, 강아지, 고양이, 토끼상 등"
            maxLength={200}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>내적 (성격, 취미 등)</span>
          <input
            name="idealInner"
            className={fieldClass}
            placeholder="ex. 다정하고 연락 잘 되는 분"
            maxLength={300}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>나이차이</span>
          <input
            name="idealAgeGap"
            className={fieldClass}
            placeholder="ex. 위로 2살, 아래로 3살 가능"
            maxLength={200}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>가능한 지역이나 거리 (콤마로 구분)</span>
          <input
            name="idealRegions"
            className={fieldClass}
            placeholder="ex. 경기 남부, 서울"
            maxLength={200}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>이건 절대 안 돼요 (콤마로 구분)</span>
          <input
            name="dealBreakers"
            className={fieldClass}
            placeholder="ex. 흡연, 심한 문신"
            maxLength={300}
          />
        </label>
      </Section>

      <Section title="확인해 주세요">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="adultConfirmed" required className="mt-0.5" />
          <span>성인입니다. 미성년자가 아님을 확인합니다. (필수)</span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="privacyConsented" required className="mt-0.5" />
          <span>
            입력한 정보와 사진을 소개 목적으로 수집·이용하는 데 동의합니다. 연결이 끝나거나
            요청하면 삭제됩니다. (필수)
          </span>
        </label>
      </Section>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-12 items-center justify-center rounded-[10px] border-2 border-yellow bg-ink-elevated px-6 py-3 text-[15px] font-bold text-yellow shadow-[0_0_0_2px_var(--ink),0_0_0_4px_var(--yellow)] hover:bg-yellow hover:text-ink disabled:opacity-40"
        >
          {busy ? '신청 중…' : '신청하기'}
        </button>
        {error && <p className="text-sm font-bold text-telop-red">{error}</p>}
      </div>
    </form>
  );
}
