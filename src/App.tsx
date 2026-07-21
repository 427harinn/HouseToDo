import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { login, logout, me, register } from "./api/auth";
import { ApiError, apiMessage } from "./api/client";
import {
  createHousehold,
  createInvite,
  getCurrentHousehold,
  joinHousehold,
  listMembers
} from "./api/households";
import {
  BottomNavigation,
  Button,
  Card,
  EmptyState,
  ErrorMessage,
  FormField,
  GuestBanner,
  InlineLoading,
  LoadingScreen,
  MemberAvatar,
  PageHeader,
  PasswordInput,
  SuccessMessage,
  TextInput
} from "./components/ui";
import { APP_NAME } from "./constants";
import type {
  AuthState,
  AuthUser,
  CreatedInvite,
  Household,
  HouseholdMember,
  HouseholdState
} from "./types";

type Route =
  | "/"
  | "/login"
  | "/register"
  | "/guest"
  | "/onboarding"
  | "/household/create"
  | "/household/join"
  | "/home"
  | "/settings/members"
  | "/tasks"
  | "/shopping";

type FormErrors = Record<string, string>;

const routes = new Set<Route>([
  "/",
  "/login",
  "/register",
  "/guest",
  "/onboarding",
  "/household/create",
  "/household/join",
  "/home",
  "/settings/members",
  "/tasks",
  "/shopping"
]);

const parseRoute = (pathname: string): Route =>
  routes.has(pathname as Route) ? (pathname as Route) : "/";

const isAuthRoute = (route: Route) =>
  route === "/login" || route === "/register" || route === "/guest";

const isOnboardingRoute = (route: Route) =>
  route === "/onboarding" ||
  route === "/household/create" ||
  route === "/household/join";

const isAppRoute = (route: Route) =>
  route === "/home" ||
  route === "/settings/members" ||
  route === "/tasks" ||
  route === "/shopping";

const validateEmail = (email: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tokyo"
  }).format(new Date(value));

const normalizeInviteCode = (code: string) => code.trim();

export function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname));
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });
  const [household, setHousehold] = useState<HouseholdState>({ status: "idle" });
  const [guestMode, setGuestMode] = useState(false);

  const navigate = useCallback((nextRoute: Route, replace = false) => {
    if (window.location.pathname !== nextRoute) {
      const state = { route: nextRoute };
      if (replace) {
        window.history.replaceState(state, "", nextRoute);
      } else {
        window.history.pushState(state, "", nextRoute);
      }
    }
    setRoute(nextRoute);
  }, []);

  const refreshHousehold = useCallback(async (signal?: AbortSignal) => {
    setHousehold({ status: "loading" });
    try {
      const result = await getCurrentHousehold(signal);
      setHousehold(
        result.household
          ? { status: "ready", household: result.household }
          : { status: "none" }
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (error instanceof ApiError && error.code === "UNAUTHENTICATED") {
        setAuth({ status: "unauthenticated" });
        setHousehold({ status: "idle" });
        navigate("/login", true);
        return;
      }
      setHousehold({ status: "error", message: apiMessage(error) });
    }
  }, [navigate]);

  const completeAuth = async (user: AuthUser) => {
    setAuth({ status: "authenticated", user });
    setGuestMode(false);
    await refreshHousehold();
  };

  const completeHousehold = (nextHousehold: Household) => {
    setHousehold({ status: "ready", household: nextHousehold });
    navigate("/home", true);
  };

  const signOut = async () => {
    try {
      await logout();
    } finally {
      setAuth({ status: "unauthenticated" });
      setHousehold({ status: "idle" });
      setGuestMode(false);
      navigate("/login", true);
    }
  };

  useEffect(() => {
    const onPopState = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    me(controller.signal)
      .then((result) => {
        setAuth({ status: "authenticated", user: result.user });
        return refreshHousehold(controller.signal);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setAuth({ status: "unauthenticated" });
        setHousehold({ status: "idle" });
      });

    return () => controller.abort();
  }, [refreshHousehold]);

  useEffect(() => {
    if (guestMode) {
      if (route !== "/guest") navigate("/guest", true);
      return;
    }

    if (auth.status === "loading") return;

    if (auth.status === "unauthenticated") {
      if (!isAuthRoute(route)) navigate("/login", true);
      return;
    }

    if (household.status === "idle" || household.status === "loading") return;

    if (route === "/" || isAuthRoute(route)) {
      navigate(household.status === "ready" ? "/home" : "/onboarding", true);
      return;
    }

    if (household.status === "none" && isAppRoute(route)) {
      navigate("/onboarding", true);
      return;
    }

    if (household.status === "ready" && isOnboardingRoute(route)) {
      navigate("/home", true);
    }
  }, [auth.status, guestMode, household.status, navigate, route]);

  if (guestMode) {
    return <GuestScreen onNavigate={navigate} onExit={() => setGuestMode(false)} />;
  }

  if (auth.status === "loading") {
    return <LoadingScreen message="ログイン状態を確認しています" />;
  }

  if (auth.status === "unauthenticated") {
    if (route === "/register") {
      return <RegisterScreen onRegister={completeAuth} onNavigate={navigate} />;
    }
    if (route === "/guest") {
      return <GuestScreen onNavigate={navigate} onExit={() => navigate("/login")} />;
    }
    return (
      <LoginScreen
        onGuest={() => setGuestMode(true)}
        onLogin={completeAuth}
        onNavigate={navigate}
      />
    );
  }

  if (household.status === "idle" || household.status === "loading") {
    return <LoadingScreen message="家庭の情報を確認しています" />;
  }

  if (household.status === "error") {
    return (
      <main className="app-shell">
        <PageHeader title="確認できませんでした" description={household.message} />
        <div className="stack">
          <Button onClick={() => void refreshHousehold()}>もう一度確認する</Button>
          <Button variant="secondary" onClick={() => void signOut()}>
            ログアウト
          </Button>
        </div>
      </main>
    );
  }

  if (household.status === "none") {
    if (route === "/household/create") {
      return <CreateHouseholdScreen onCreated={completeHousehold} onNavigate={navigate} />;
    }
    if (route === "/household/join") {
      return <JoinHouseholdScreen onJoined={completeHousehold} onNavigate={navigate} />;
    }
    return (
      <OnboardingScreen
        user={auth.user}
        onNavigate={navigate}
        onLogout={() => void signOut()}
      />
    );
  }

  if (route === "/settings/members") {
    return (
      <MembersScreen
        household={household.household}
        onNavigate={navigate}
        onLogout={() => void signOut()}
      />
    );
  }

  return (
    <HomeScreen
      household={household.household}
      onNavigate={navigate}
      onLogout={() => void signOut()}
      user={auth.user}
    />
  );
}

function LoginScreen({
  onGuest,
  onLogin,
  onNavigate
}: {
  onGuest: () => void;
  onLogin: (user: AuthUser) => Promise<void>;
  onNavigate: (route: Route) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors: FormErrors = {};
    if (!validateEmail(email)) nextErrors.email = "メールアドレスの形式を確認してください。";
    if (!password) nextErrors.password = "パスワードを入力してください。";
    setErrors(nextErrors);
    setMessage("");
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      const result = await login({ email: email.trim(), password });
      await onLogin(result.user);
    } catch (error) {
      setMessage(apiMessage(error));
      if (error instanceof ApiError && error.details) setErrors(error.details);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="app-shell auth-layout">
      <PageHeader
        title={APP_NAME}
        description="家のことを、ふたりで軽く見渡せるように。"
      />
      <Card>
        <form className="stack" onSubmit={(event) => void submit(event)}>
          <FormField id="login-email" label="メールアドレス" error={errors.email}>
            <TextInput
              autoComplete="email"
              error={errors.email}
              id="login-email"
              onChange={setEmail}
              value={email}
            />
          </FormField>
          <FormField id="login-password" label="パスワード" error={errors.password}>
            <PasswordInput
              autoComplete="current-password"
              error={errors.password}
              id="login-password"
              onChange={setPassword}
              value={password}
            />
          </FormField>
          <ErrorMessage message={message} />
          <Button disabled={submitting} type="submit">
            {submitting ? <InlineLoading /> : "ログイン"}
          </Button>
        </form>
      </Card>
      <div className="secondary-actions">
        <Button variant="secondary" onClick={() => onNavigate("/register")}>
          新規登録
        </Button>
        <Button variant="ghost" onClick={onGuest}>
          ゲストで試す
        </Button>
      </div>
    </main>
  );
}

function RegisterScreen({
  onRegister,
  onNavigate
}: {
  onRegister: (user: AuthUser) => Promise<void>;
  onNavigate: (route: Route) => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedName = displayName.trim();
    const nextErrors: FormErrors = {};
    if (trimmedName.length === 0 || trimmedName.length > 80) {
      nextErrors.displayName = "表示名は1から80文字で入力してください。";
    }
    if (!validateEmail(email)) nextErrors.email = "メールアドレスの形式を確認してください。";
    if (password.length < 12 || password.length > 128) {
      nextErrors.password = "パスワードは12から128文字で入力してください。";
    }
    setErrors(nextErrors);
    setMessage("");
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      const result = await register({
        displayName: trimmedName,
        email: email.trim(),
        password
      });
      await onRegister(result.user);
    } catch (error) {
      setMessage(apiMessage(error));
      if (error instanceof ApiError && error.details) setErrors(error.details);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="app-shell auth-layout">
      <PageHeader
        title="新規登録"
        description="登録後はそのまま家庭の作成または参加へ進みます。"
      />
      <Card>
        <form className="stack" onSubmit={(event) => void submit(event)}>
          <FormField id="register-name" label="表示名" error={errors.displayName}>
            <TextInput
              autoComplete="name"
              error={errors.displayName}
              id="register-name"
              onChange={setDisplayName}
              value={displayName}
            />
          </FormField>
          <FormField id="register-email" label="メールアドレス" error={errors.email}>
            <TextInput
              autoComplete="email"
              error={errors.email}
              id="register-email"
              onChange={setEmail}
              value={email}
            />
          </FormField>
          <FormField id="register-password" label="パスワード" error={errors.password}>
            <PasswordInput
              autoComplete="new-password"
              error={errors.password}
              id="register-password"
              onChange={setPassword}
              value={password}
            />
          </FormField>
          <ErrorMessage message={message} />
          <Button disabled={submitting} type="submit">
            {submitting ? <InlineLoading /> : "登録する"}
          </Button>
        </form>
      </Card>
      <Button variant="ghost" onClick={() => onNavigate("/login")}>
        ログインへ戻る
      </Button>
    </main>
  );
}

function OnboardingScreen({
  user,
  onNavigate,
  onLogout
}: {
  user: AuthUser;
  onNavigate: (route: Route) => void;
  onLogout: () => void;
}) {
  return (
    <main className="app-shell">
      <PageHeader
        title="家庭をはじめましょう"
        description={`${user.displayName}さん、まずは使う家庭を選びます。`}
      />
      <div className="choice-grid">
        <Card className="choice-card">
          <h2>新しい家庭を作る</h2>
          <p>あなたが owner になり、あとから招待コードでメンバーを招待できます。</p>
          <Button onClick={() => onNavigate("/household/create")}>作成へ進む</Button>
        </Card>
        <Card className="choice-card">
          <h2>招待コードで参加する</h2>
          <p>家族から共有されたコードを入力して、同じ家庭に参加します。</p>
          <Button variant="secondary" onClick={() => onNavigate("/household/join")}>
            参加へ進む
          </Button>
        </Card>
      </div>
      <Button variant="ghost" onClick={onLogout}>
        ログアウト
      </Button>
    </main>
  );
}

function CreateHouseholdScreen({
  onCreated,
  onNavigate
}: {
  onCreated: (household: Household) => void;
  onNavigate: (route: Route) => void;
}) {
  const [name, setName] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    const nextErrors: FormErrors = {};
    if (trimmed.length === 0 || trimmed.length > 80) {
      nextErrors.name = "家庭名は1から80文字で入力してください。";
    }
    setErrors(nextErrors);
    setMessage("");
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      const result = await createHousehold(trimmed);
      onCreated(result.household);
    } catch (error) {
      setMessage(apiMessage(error));
      if (error instanceof ApiError && error.details) setErrors(error.details);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="app-shell auth-layout">
      <PageHeader title="家庭を作成" description="あとからメンバーを招待できます。" />
      <Card>
        <form className="stack" onSubmit={(event) => void submit(event)}>
          <FormField id="household-name" label="家庭名" error={errors.name}>
            <TextInput
              autoComplete="organization"
              error={errors.name}
              id="household-name"
              onChange={setName}
              placeholder="例: わが家"
              value={name}
            />
          </FormField>
          <ErrorMessage message={message} />
          <Button disabled={submitting} type="submit">
            {submitting ? <InlineLoading /> : "家庭を作成"}
          </Button>
        </form>
      </Card>
      <Button variant="ghost" onClick={() => onNavigate("/onboarding")}>
        選択に戻る
      </Button>
    </main>
  );
}

function JoinHouseholdScreen({
  onJoined,
  onNavigate
}: {
  onJoined: (household: Household) => void;
  onNavigate: (route: Route) => void;
}) {
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const normalized = normalizeInviteCode(code);
    const nextErrors: FormErrors = {};
    if (normalized.length === 0) nextErrors.code = "招待コードを入力してください。";
    setErrors(nextErrors);
    setMessage("");
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      const result = await joinHousehold(normalized);
      onJoined(result.household);
    } catch (error) {
      setMessage(apiMessage(error));
      if (error instanceof ApiError && error.details) setErrors(error.details);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="app-shell auth-layout">
      <PageHeader title="家庭へ参加" description="共有された招待コードを入力してください。" />
      <Card>
        <form className="stack" onSubmit={(event) => void submit(event)}>
          <FormField id="invite-code" label="招待コード" error={errors.code}>
            <TextInput
              autoComplete="one-time-code"
              error={errors.code}
              id="invite-code"
              onChange={setCode}
              placeholder="ABCD-EFGH-IJKL"
              value={code}
            />
          </FormField>
          <ErrorMessage message={message} />
          <Button disabled={submitting} type="submit">
            {submitting ? <InlineLoading /> : "参加する"}
          </Button>
        </form>
      </Card>
      <Button variant="ghost" onClick={() => onNavigate("/onboarding")}>
        選択に戻る
      </Button>
    </main>
  );
}

function HomeScreen({
  household,
  user,
  onNavigate,
  onLogout
}: {
  household: Household;
  user: AuthUser;
  onNavigate: (route: Route) => void;
  onLogout: () => void;
}) {
  const today = useMemo(
    () =>
      new Intl.DateTimeFormat("ja-JP", {
        dateStyle: "full",
        timeZone: "Asia/Tokyo"
      }).format(new Date()),
    []
  );

  return (
    <main className="app-shell app-shell--with-nav">
      <PageHeader
        title="ホーム"
        description={`${household.name} / ${user.displayName}さん`}
        action={
          <Button variant="ghost" onClick={() => void onLogout()}>
            ログアウト
          </Button>
        }
      />
      <div className="home-summary">
        <p>{today}</p>
        <h2>{household.name}</h2>
        <p>あなたの権限: {household.role === "owner" ? "owner" : "member"}</p>
      </div>
      <div className="content-grid">
        <Card>
          <h2>今日のタスク</h2>
          <EmptyState
            title="まだタスクは登録されていません"
            description="タスク機能は次のフェーズで追加します。"
          />
        </Card>
        <Card>
          <h2>買い物リスト</h2>
          <EmptyState
            title="買い物機能は準備中です"
            description="今は家庭とメンバー管理だけを操作できます。"
          />
        </Card>
        <Card>
          <h2>設定</h2>
          <p>メンバー一覧と招待コードを確認できます。</p>
          <Button variant="secondary" onClick={() => onNavigate("/settings/members")}>
            メンバー管理へ
          </Button>
        </Card>
      </div>
      <BottomNavigation current="/home" onNavigate={onNavigate} />
    </main>
  );
}

function MembersScreen({
  household,
  onNavigate,
  onLogout
}: {
  household: Household;
  onNavigate: (route: Route) => void;
  onLogout: () => void;
}) {
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [invite, setInvite] = useState<CreatedInvite | null>(null);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    listMembers(controller.signal)
      .then((result) => setMembers(result.members))
      .catch((error: unknown) => setMessage(apiMessage(error)))
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const issueInvite = async () => {
    setIssuing(true);
    setMessage("");
    setSuccess("");
    try {
      const result = await createInvite();
      setInvite(result.invite);
    } catch (error) {
      setMessage(apiMessage(error));
    } finally {
      setIssuing(false);
    }
  };

  const copyInvite = async () => {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite.code);
      setSuccess("招待コードをコピーしました。");
    } catch {
      setMessage("コピーできませんでした。コードを選択してコピーしてください。");
    }
  };

  return (
    <main className="app-shell app-shell--with-nav">
      <PageHeader
        title="メンバー管理"
        description={`${household.name} / ${household.role}`}
        action={
          <Button variant="ghost" onClick={onLogout}>
            ログアウト
          </Button>
        }
      />
      <ErrorMessage message={message} />
      <SuccessMessage message={success} />
      <Card>
        <div className="section-heading">
          <h2>メンバー</h2>
          <span>{loading ? "確認中" : `${members.length}人`}</span>
        </div>
        {loading ? (
          <p role="status">メンバーを読み込んでいます。</p>
        ) : (
          <ul className="member-list">
            {members.map((member) => (
              <li key={member.userId}>
                <MemberAvatar color={member.color} name={member.displayName} />
                <div>
                  <strong>{member.displayName}</strong>
                  <span>
                    {member.role} / {formatDateTime(member.joinedAt)} 参加
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <h2>招待コード</h2>
        {household.role === "owner" ? (
          <div className="stack">
            <p>発行したコードは一度だけ表示されます。</p>
            <Button disabled={issuing} onClick={() => void issueInvite()}>
              {issuing ? <InlineLoading label="発行中" /> : "招待コードを発行"}
            </Button>
            {invite ? (
              <div className="invite-box">
                <span>招待コード</span>
                <strong>{invite.code}</strong>
                <span>有効期限: {formatDateTime(invite.expiresAt)}</span>
                <Button variant="secondary" onClick={() => void copyInvite()}>
                  コピー
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <p>招待コードを発行できるのは owner だけです。</p>
        )}
      </Card>
      <BottomNavigation current="/settings/members" onNavigate={onNavigate} />
    </main>
  );
}

function GuestScreen({
  onNavigate,
  onExit
}: {
  onNavigate: (route: Route) => void;
  onExit: () => void;
}) {
  return (
    <main className="app-shell app-shell--with-nav">
      <PageHeader
        title="ゲスト"
        description="サンプルの仮ホームを確認できます。"
        action={
          <Button variant="ghost" onClick={onExit}>
            終了
          </Button>
        }
      />
      <GuestBanner />
      <div className="home-summary">
        <p>今日</p>
        <h2>サンプルの家庭</h2>
        <p>メンバー 2人</p>
      </div>
      <div className="content-grid">
        <Card>
          <h2>今日のタスク</h2>
          <EmptyState
            title="サンプル表示です"
            description="実データへの保存は、ログイン後の画面で行います。"
          />
        </Card>
        <Card>
          <h2>買い物リスト</h2>
          <p>買い物機能は準備中です。</p>
        </Card>
      </div>
      <BottomNavigation current="/home" onNavigate={onNavigate} />
    </main>
  );
}
