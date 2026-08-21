import type { ReactNode } from "react";

type NavigationPath =
  | "/home"
  | "/calendar"
  | "/tasks"
  | "/shopping"
  | "/settings/members";

type ButtonProps = {
  children: ReactNode;
  type?: "button" | "submit";
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  "aria-label"?: string;
  onClick?: () => void;
};

export function Button({
  children,
  type = "button",
  variant = "primary",
  disabled = false,
  "aria-label": ariaLabel,
  onClick
}: ButtonProps) {
  return (
    <button
      className={`button button--${variant}`}
      disabled={disabled}
      aria-label={ariaLabel}
      onClick={onClick}
      type={type}
    >
      {children}
    </button>
  );
}

type FormFieldProps = {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
};

export function FormField({ id, label, error, children }: FormFieldProps) {
  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

type InputProps = {
  id: string;
  value: string;
  placeholder?: string;
  autoComplete?: string;
  error?: string;
  onChange: (value: string) => void;
};

export function TextInput(props: InputProps) {
  return (
    <input
      aria-describedby={props.error ? `${props.id}-error` : undefined}
      aria-invalid={props.error ? "true" : "false"}
      autoComplete={props.autoComplete}
      id={props.id}
      onChange={(event) => props.onChange(event.target.value)}
      placeholder={props.placeholder}
      type="text"
      value={props.value}
    />
  );
}

export function PasswordInput(props: InputProps) {
  return (
    <input
      aria-describedby={props.error ? `${props.id}-error` : undefined}
      aria-invalid={props.error ? "true" : "false"}
      autoComplete={props.autoComplete}
      id={props.id}
      onChange={(event) => props.onChange(event.target.value)}
      placeholder={props.placeholder}
      type="password"
      value={props.value}
    />
  );
}

export function Card({
  children,
  className = ""
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`card ${className}`.trim()}>{children}</section>;
}

export function AppLogo() {
  return (
    <div className="app-logo" aria-label="おうちTodo">
      <span>家</span>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <AppLogo />
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {action}
    </header>
  );
}

export function LoadingScreen({ message = "読み込み中です" }: { message?: string }) {
  return (
    <main className="app-shell app-shell--center">
      <div className="loader" aria-hidden="true" />
      <p role="status">{message}</p>
    </main>
  );
}

export function InlineLoading({ label = "送信中" }: { label?: string }) {
  return <span aria-live="polite">{label}</span>;
}

export function ErrorMessage({ message }: { message?: string }) {
  return message ? (
    <p className="message message--error" role="alert">
      {message}
    </p>
  ) : null;
}

export function SuccessMessage({ message }: { message?: string }) {
  return message ? (
    <p className="message message--success" role="status">
      {message}
    </p>
  ) : null;
}

export function EmptyState({
  title,
  description
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}

export function MemberAvatar({
  name,
  color,
  imageUrl
}: {
  name: string;
  color?: string | null;
  imageUrl?: string | null;
}) {
  const initial = name.trim().charAt(0) || "?";
  return (
    <span className="member-avatar" style={{ backgroundColor: color ?? undefined }}>
      {imageUrl ? <img src={imageUrl} alt="" /> : initial}
    </span>
  );
}

export function GuestBanner() {
  return (
    <div className="guest-banner" role="status">
      ゲストモードです。表示中のデータはサンプルで、実際の家庭には保存されません。
    </div>
  );
}

export function BottomNavigation({
  current,
  onNavigate
}: {
  current: NavigationPath;
  onNavigate: (path: NavigationPath) => void;
}) {
  const items: Array<{ path: NavigationPath; label: string }> = [
    { path: "/home", label: "ホーム" },
    { path: "/calendar", label: "カレンダー" },
    { path: "/tasks", label: "タスク" },
    { path: "/shopping", label: "買い物" },
    { path: "/settings/members", label: "設定" }
  ];

  return (
    <nav className="bottom-nav" aria-label="主要画面">
      {items.map((item) => (
        <button
          aria-current={current === item.path ? "page" : undefined}
          key={item.path}
          onClick={() => onNavigate(item.path)}
          type="button"
        >
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
