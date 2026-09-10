export function RequestError({ message, retry }: { message: string | null; retry?: () => void }) {
  if (!message) return null;
  const text = /unable to reach|connection|failed to fetch/i.test(message)
    ? "Unable to reach the server. Please try again."
    : "Request failed. Please try again.";
  return <div role="alert" className="my-3 flex items-center gap-3 rounded-xl border border-[var(--error)] bg-[var(--error-bg)] p-3 text-sm text-[var(--error)]">
    <span>{text}</span>
    {retry && <button type="button" onClick={retry} className="shrink-0 font-semibold underline">Try again</button>}
  </div>;
}
