import type { ReactNode } from "react";
import { CalendarDays, Ellipsis, House, Plus, ShoppingCart } from "lucide-react";

type NavigationPath =
  | "/home"
  | "/calendar"
  | "/shopping"
  | "/other";

type ButtonProps = {
  children: ReactNode;
  className?: string;
  type?: "button" | "submit";
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  "aria-label"?: string;
  onClick?: () => void;
};

export function Button({
  children,
  className = "",
  type = "button",
  variant = "primary",
  disabled = false,
  "aria-label": ariaLabel,
  onClick
}: ButtonProps) {
  return (
    <button
      className={`button button--${variant} ${className}`.trim()}
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
  className?: string;
  children: ReactNode;
};

export function FormField({ id, label, error, className = "", children }: FormFieldProps) {
  return (
    <div className={`form-field ${className}`.trim()}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? (
        <p className="field-error" id={`${id}-error`} role="alert">
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

export function BottomNavigation({
  current,
  onNavigate,
  addOpen,
  onAdd
}: {
  current: NavigationPath;
  onNavigate: (path: NavigationPath) => void;
  addOpen?: boolean;
  onAdd?: () => void;
}) {
  const isAddOpen = addOpen ?? false;
  const items = [
    { path: "/home" as const, label: "ホーム", Icon: House },
    { path: "/calendar" as const, label: "カレンダー", Icon: CalendarDays },
    { path: "/shopping" as const, label: "買い物", Icon: ShoppingCart },
    { path: "/other" as const, label: "その他", Icon: Ellipsis }
  ];

  return (
    <nav className="bottom-nav" aria-label="主要画面">
      <div className="bottom-nav__items">
        <NavigationButton item={items[0]} current={current} onNavigate={onNavigate} />
        <NavigationButton item={items[1]} current={current} onNavigate={onNavigate} />
        <button
          aria-expanded={isAddOpen}
          aria-haspopup="dialog"
          aria-label="追加"
          className="bottom-nav__button bottom-nav__add motion-pressable"
          data-testid="bottom-nav-add"
          onClick={onAdd}
          type="button"
        >
          <Plus aria-hidden="true" strokeWidth={1.8} />
        </button>
        <NavigationButton item={items[2]} current={current} onNavigate={onNavigate} />
        <NavigationButton item={items[3]} current={current} onNavigate={onNavigate} />
      </div>
    </nav>
  );
}

function NavigationButton({
  item,
  current,
  onNavigate
}: {
  item: { path: NavigationPath; label: string; Icon: typeof House };
  current: NavigationPath;
  onNavigate: (path: NavigationPath) => void;
}) {
  const isCurrent = current === item.path;
  const Icon = item.Icon;
  return (
    <button
      aria-current={isCurrent ? "page" : undefined}
      aria-label={item.label}
      className={`bottom-nav__button motion-pressable${isCurrent ? " is-current" : ""}`}
      onClick={() => onNavigate(item.path)}
      type="button"
    >
      <Icon aria-hidden="true" strokeWidth={1.8} />
    </button>
  );
}
