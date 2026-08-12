import Link from 'next/link';
import { cn } from '@/lib/ui';
import { LogoutButton } from '@/components/logout-button';

export function AdminTopBar({ right }: { right?: React.ReactNode }) {
  return (
    <header className="mb-8 flex items-center justify-between gap-4">
      <Link href="/admin" className="text-[22px] font-extrabold tracking-tight text-fog">
        Some Love
      </Link>
      <nav className="flex items-center gap-4 text-sm text-fog-muted">
        <Link href="/admin" className="hover:text-fog">
          목록
        </Link>
        <Link href="/admin/inquiries" className="hover:text-fog">
          받은 관심
        </Link>
        <Link href="/admin/deliveries" className="hover:text-fog">
          보낼 메시지
        </Link>
        <Link href="/admin/settings" className="hover:text-fog">
          설정
        </Link>
        {right}
        <LogoutButton />
      </nav>
    </header>
  );
}

const stampTone = {
  yellow:
    'border-yellow bg-ink-elevated text-yellow shadow-[0_0_0_2px_var(--ink),0_0_0_4px_var(--yellow)] hover:bg-yellow hover:text-ink',
  red: 'border-telop-red bg-ink-elevated text-telop-red shadow-[0_0_0_2px_var(--ink),0_0_0_4px_var(--red)] hover:bg-telop-red hover:text-ink',
  blue: 'border-telop-blue bg-ink-elevated text-telop-blue shadow-[0_0_0_2px_var(--ink),0_0_0_4px_var(--blue)] hover:bg-telop-blue hover:text-ink',
  // ghost는 어두운 잉크 바닥과 밝은 종이 패널(bg-card) 양쪽에 쓰인다. 고정 색(text-fog)을
  // 쓰면 패널 안에서 밝은 회색 위 밝은 회색이 되어 글씨가 사라진다(추출 저장·취소·거절 등).
  // 주변 문맥의 색을 물려받게 해서 두 표면에서 모두 읽히게 한다 — 잉크 위에서는 fog,
  // 패널 안에서는 on-card가 상속된다.
  ghost: 'border-edge bg-transparent text-inherit hover:border-current',
} as const;

export function StampButton({
  children,
  className,
  tone = 'yellow',
  type = 'button',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: 'yellow' | 'red' | 'blue' | 'ghost';
}) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex min-h-12 items-center justify-center rounded-[10px] border-2 px-5 py-3 text-[15px] font-bold disabled:opacity-40',
        stampTone[tone],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function StampLink({
  href,
  children,
  className,
  tone = 'yellow',
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  tone?: 'yellow' | 'red' | 'blue' | 'ghost';
}) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex min-h-12 items-center justify-center rounded-[10px] border-2 px-5 py-3 text-[15px] font-bold',
        stampTone[tone],
        className
      )}
    >
      {children}
    </Link>
  );
}

export function StatusSeal({
  label,
  tone,
  className,
}: {
  label: string;
  tone: 'yellow' | 'red' | 'blue';
  className?: string;
}) {
  const ring = {
    yellow: 'border-yellow text-yellow',
    red: 'border-telop-red text-telop-red',
    blue: 'border-telop-blue text-telop-blue',
  } as const;

  return (
    <span
      className={cn(
        'inline-flex h-11 min-w-11 items-center justify-center rounded-full border-2 bg-ink-elevated px-2 text-[11px] font-extrabold tracking-tight',
        ring[tone],
        className
      )}
    >
      {label}
    </span>
  );
}

export function AccessionCard({
  href,
  index,
  handle,
  meta,
  statusLabel,
  tone,
  selected,
  thumbSrc,
}: {
  href: string;
  index: number;
  handle: string;
  meta: string;
  statusLabel: string;
  tone: 'yellow' | 'red' | 'blue';
  selected?: boolean;
  thumbSrc?: string | null;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'relative flex w-[148px] shrink-0 flex-col gap-2 rounded-[10px] border-2 bg-card p-3 text-on-card',
        selected ? 'border-telop-blue' : 'border-edge'
      )}
    >
      <div className="flex items-center justify-between text-[11px] font-bold text-muted-on-card">
        <span>{String(index).padStart(3, '0')}</span>
        <span className="h-2 w-2 rounded-full bg-muted-on-card/40" />
      </div>
      <div className="aspect-[4/3] overflow-hidden rounded-[6px] bg-thumb">
        {thumbSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbSrc} alt="" className="h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="min-h-[2.6em]">
        <div className="truncate text-[13px] font-bold text-on-card">@{handle}</div>
        <div className="truncate text-[11px] text-muted-on-card">{meta}</div>
      </div>
      <div className="flex justify-end">
        <StatusSeal label={statusLabel} tone={tone} />
      </div>
    </Link>
  );
}

export function Panel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-[12px] border-2 border-edge bg-card p-5 text-on-card', className)}>
      {children}
    </div>
  );
}

export function SessionStrip({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[32px] font-extrabold leading-tight tracking-tight text-fog">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-fog-muted">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">{children}</div>
    </section>
  );
}
