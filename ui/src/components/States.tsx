export function LoadingState({
  label = "正在读取本地报告…",
}: {
  label?: string;
}) {
  return (
    <div className="state-panel" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}

export function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="state-panel state-error" role="alert">
      <span className="state-icon" aria-hidden="true">
        !
      </span>
      <div>
        <h2>读取失败</h2>
        <p>{message}</p>
        {retry === undefined ? null : (
          <button
            className="button button-secondary"
            type="button"
            onClick={retry}
          >
            重试
          </button>
        )}
      </div>
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="state-panel">
      <span className="state-icon state-icon-empty" aria-hidden="true">
        ○
      </span>
      <div>
        <h2>{title}</h2>
        <p>{body}</p>
      </div>
    </div>
  );
}
