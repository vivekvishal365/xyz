export function PageHeader({
  eyebrow,
  title,
  lede,
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
}) {
  return (
    <header className="mb-7">
      {eyebrow ? (
        <p className="mb-1.5 font-mono text-[11px] uppercase tracking-[0.13em] text-ink-3">
          {eyebrow}
        </p>
      ) : null}
      <h1 className="text-balance text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
      {lede ? <p className="mt-2 max-w-[62ch] text-ink-2">{lede}</p> : null}
    </header>
  );
}
