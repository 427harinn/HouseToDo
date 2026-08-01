import { FormEvent, useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { login, logout, me, register } from "./api/auth";
import { ApiError, apiMessage } from "./api/client";
import { getDashboardToday, type DashboardToday } from "./api/dashboard";
import { listShoppingItems } from "./api/shopping";
import {
  createHousehold,
  createInvite,
  getCurrentHousehold,
  joinHousehold,
  listMembers
} from "./api/households";
import {
  changeTaskState,
  createTask,
  deactivateTask,
  getTask,
  listTaskHistory,
  listTasks,
  listTodayTasks,
  listWeekTasks,
  updateTask,
  type CreateTaskInput,
  type NotificationSlot,
  type Task,
  type TaskAssignmentType,
  type TaskDisplayStatus,
  type TaskRecord,
  type TaskRecurrenceType,
  type TodayTask,
  type WeeklyTask
} from "./api/tasks";
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
import {
  assignmentLabels,
  formatSchedule,
  formatWeekdays,
  notificationLabels,
  recurrenceLabels,
  statusLabels,
  weekdayLabels
} from "./task-labels";
import type {
  AuthState,
  AuthUser,
  CreatedInvite,
  Household,
  HouseholdMember,
  HouseholdState
} from "./types";

type StaticRoute =
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
  | "/tasks/new"
  | "/shopping";

type Route =
  | { name: StaticRoute }
  | { name: "/tasks/:taskId"; taskId: string }
  | { name: "/tasks/:taskId/edit"; taskId: string }
  | { name: "/tasks/:taskId/respond"; taskId: string };

type NavigationPath =
  | "/home"
  | "/tasks"
  | "/tasks/new"
  | "/shopping"
  | "/settings/members"
  | `/tasks/${string}`
  | `/tasks/${string}/edit`
  | `/tasks/${string}/respond`;

type FormErrors = Record<string, string>;

const staticRoutes = new Set<StaticRoute>([
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
  "/tasks/new",
  "/shopping"
]);

const parseRoute = (pathname: string): Route => {
  if (staticRoutes.has(pathname as StaticRoute)) return { name: pathname as StaticRoute };
  const taskEdit = pathname.match(/^\/tasks\/([^/]+)\/edit$/);
  if (taskEdit) return { name: "/tasks/:taskId/edit", taskId: decodeURIComponent(taskEdit[1]) };
  const taskRespond = pathname.match(/^\/tasks\/([^/]+)\/respond$/);
  if (taskRespond) return { name: "/tasks/:taskId/respond", taskId: decodeURIComponent(taskRespond[1]) };
  const taskDetail = pathname.match(/^\/tasks\/([^/]+)$/);
  if (taskDetail) return { name: "/tasks/:taskId", taskId: decodeURIComponent(taskDetail[1]) };
  return { name: "/" };
};

const isAuthRoute = (route: Route) =>
  route.name === "/login" || route.name === "/register" || route.name === "/guest";

const isOnboardingRoute = (route: Route) =>
  route.name === "/onboarding" ||
  route.name === "/household/create" ||
  route.name === "/household/join";

const isAppRoute = (route: Route) =>
  route.name === "/home" ||
  route.name === "/settings/members" ||
  route.name === "/tasks" ||
  route.name === "/tasks/new" ||
  route.name === "/shopping" ||
  route.name.startsWith("/tasks/:taskId");

const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
const normalizeInviteCode = (code: string) => code.trim();

const todayInTokyo = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const addDays = (dateKey: string, days: number) => {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const weekStartFor = (dateKey: string, weekStartsOn: number) => {
  const date = new Date(`${dateKey}T00:00:00Z`);
  const diff = (date.getUTCDay() - weekStartsOn + 7) % 7;
  return addDays(dateKey, -diff);
};

const formatDate = (dateKey: string) =>
  new Intl.DateTimeFormat("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Tokyo"
  }).format(new Date(`${dateKey}T00:00:00+09:00`));

const formatDateTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("ja-JP", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Tokyo"
      }).format(new Date(value))
    : "";

const actorName = (actor: { displayName: string | null } | null) => actor?.displayName ?? "メンバー";

const taskIcon = (type: TaskRecurrenceType) =>
  type === "daily" ? "↻" : type === "scheduled" ? "□" : "✓";

const apiErrorMessage = (error: unknown) => {
  if (error instanceof ApiError && error.code === "NETWORK_ERROR") {
    return "通信に失敗しました。接続を確認して、もう一度お試しください。";
  }
  if (error instanceof ApiError && error.code === "NOT_FOUND") {
    return "このタスクは見つかりませんでした。削除または無効化された可能性があります。";
  }
  if (error instanceof ApiError && error.code === "CONFLICT") {
    return "このタスクは別のメンバーが先に操作しました。最新状態を確認してください。";
  }
  return apiMessage(error);
};

const taskActionScope = (task: Task | TodayTask | WeeklyTask, household: Household) => {
  if (task.recurrenceType === "weekly") {
    return { targetWeekStart: weekStartFor(todayInTokyo(), household.weekStartsOn) };
  }
  return { targetDate: todayInTokyo() };
};

export function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname));
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });
  const [household, setHousehold] = useState<HouseholdState>({ status: "idle" });
  const [guestMode, setGuestMode] = useState(false);

  const navigate = useCallback((nextRoute: NavigationPath | StaticRoute, replace = false) => {
    if (window.location.pathname !== nextRoute) {
      const state = { route: nextRoute };
      if (replace) window.history.replaceState(state, "", nextRoute);
      else window.history.pushState(state, "", nextRoute);
    }
    setRoute(parseRoute(nextRoute));
  }, []);

  const refreshHousehold = useCallback(async (signal?: AbortSignal) => {
    setHousehold({ status: "loading" });
    try {
      const result = await getCurrentHousehold(signal);
      setHousehold(result.household ? { status: "ready", household: result.household } : { status: "none" });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (error instanceof ApiError && error.code === "UNAUTHENTICATED") {
        setAuth({ status: "unauthenticated" });
        setHousehold({ status: "idle" });
        navigate("/login", true);
        return;
      }
      setHousehold({ status: "error", message: apiErrorMessage(error) });
    }
  }, [navigate]);

  const completeAuth = async (user: AuthUser) => {
    setAuth({ status: "authenticated", user });
    setGuestMode(false);
    await refreshHousehold();
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
      if (route.name !== "/guest") navigate("/guest", true);
      return;
    }
    if (auth.status === "loading") return;
    if (auth.status === "unauthenticated") {
      if (!isAuthRoute(route)) navigate("/login", true);
      return;
    }
    if (household.status === "idle" || household.status === "loading") return;
    if (route.name === "/" || isAuthRoute(route)) {
      navigate(household.status === "ready" ? "/home" : "/onboarding", true);
      return;
    }
    if (household.status === "none" && isAppRoute(route)) navigate("/onboarding", true);
    if (household.status === "ready" && isOnboardingRoute(route)) navigate("/home", true);
  }, [auth.status, guestMode, household.status, navigate, route]);

  if (guestMode) return <GuestScreen onNavigate={navigate} onExit={() => setGuestMode(false)} />;
  if (auth.status === "loading") return <LoadingScreen message="ログイン状態を確認しています" />;
  if (auth.status === "unauthenticated") {
    if (route.name === "/register") return <RegisterScreen onRegister={completeAuth} onNavigate={navigate} />;
    if (route.name === "/guest") return <GuestScreen onNavigate={navigate} onExit={() => navigate("/login")} />;
    return <LoginScreen onGuest={() => setGuestMode(true)} onLogin={completeAuth} onNavigate={navigate} />;
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
          <Button variant="secondary" onClick={() => void signOut()}>ログアウト</Button>
        </div>
      </main>
    );
  }
  if (household.status === "none") {
    if (route.name === "/household/create") {
      return <CreateHouseholdScreen onCreated={(next) => {
        setHousehold({ status: "ready", household: next });
        navigate("/home", true);
      }} onNavigate={navigate} />;
    }
    if (route.name === "/household/join") {
      return <JoinHouseholdScreen onJoined={(next) => {
        setHousehold({ status: "ready", household: next });
        navigate("/home", true);
      }} onNavigate={navigate} />;
    }
    return <OnboardingScreen user={auth.user} onNavigate={navigate} onLogout={() => void signOut()} />;
  }

  const shellProps = {
    household: household.household,
    onNavigate: navigate,
    onLogout: () => void signOut(),
    user: auth.user
  };
  if (route.name === "/settings/members") return <MembersScreen {...shellProps} />;
  if (route.name === "/tasks") return <TaskListScreen {...shellProps} />;
  if (route.name === "/tasks/new") return <TaskFormScreen {...shellProps} mode="create" />;
  if (route.name === "/tasks/:taskId/edit") return <TaskFormScreen {...shellProps} mode="edit" taskId={route.taskId} />;
  if (route.name === "/tasks/:taskId") return <TaskDetailScreen {...shellProps} taskId={route.taskId} compact={false} />;
  if (route.name === "/tasks/:taskId/respond") return <TaskDetailScreen {...shellProps} taskId={route.taskId} compact />;
  if (route.name === "/shopping") return <ShoppingSoonScreen onNavigate={navigate} />;
  return <HomeScreen {...shellProps} />;
}

function LoginScreen({ onGuest, onLogin, onNavigate }: {
  onGuest: () => void;
  onLogin: (user: AuthUser) => Promise<void>;
  onNavigate: (route: StaticRoute) => void;
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
      setMessage(apiErrorMessage(error));
      if (error instanceof ApiError && error.details) setErrors(error.details);
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <main className="app-shell auth-layout">
      <PageHeader title={APP_NAME} description="家のことを、ふたりで軽く見渡せるように。" />
      <Card>
        <form className="stack" onSubmit={(event) => void submit(event)}>
          <FormField id="login-email" label="メールアドレス" error={errors.email}>
            <TextInput autoComplete="email" error={errors.email} id="login-email" onChange={setEmail} value={email} />
          </FormField>
          <FormField id="login-password" label="パスワード" error={errors.password}>
            <PasswordInput autoComplete="current-password" error={errors.password} id="login-password" onChange={setPassword} value={password} />
          </FormField>
          <ErrorMessage message={message} />
          <Button disabled={submitting} type="submit">{submitting ? <InlineLoading /> : "ログイン"}</Button>
        </form>
      </Card>
      <div className="secondary-actions">
        <Button variant="secondary" onClick={() => onNavigate("/register")}>新規登録</Button>
        <Button variant="ghost" onClick={onGuest}>ゲストで試す</Button>
      </div>
    </main>
  );
}

function RegisterScreen({ onRegister, onNavigate }: {
  onRegister: (user: AuthUser) => Promise<void>;
  onNavigate: (route: StaticRoute) => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors: FormErrors = {};
    if (displayName.trim().length === 0 || displayName.trim().length > 80) nextErrors.displayName = "表示名は1〜80文字で入力してください。";
    if (!validateEmail(email)) nextErrors.email = "メールアドレスの形式を確認してください。";
    if (password.length < 12 || password.length > 128) nextErrors.password = "パスワードは12〜128文字で入力してください。";
    setErrors(nextErrors);
    setMessage("");
    if (Object.keys(nextErrors).length > 0) return;
    setSubmitting(true);
    try {
      const result = await register({ displayName: displayName.trim(), email: email.trim(), password });
      await onRegister(result.user);
    } catch (error) {
      setMessage(apiErrorMessage(error));
      if (error instanceof ApiError && error.details) setErrors(error.details);
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <main className="app-shell auth-layout">
      <PageHeader title="新規登録" description="登録後、そのまま家庭の作成または参加へ進みます。" />
      <Card>
        <form className="stack" onSubmit={(event) => void submit(event)}>
          <FormField id="register-name" label="表示名" error={errors.displayName}>
            <TextInput autoComplete="name" error={errors.displayName} id="register-name" onChange={setDisplayName} value={displayName} />
          </FormField>
          <FormField id="register-email" label="メールアドレス" error={errors.email}>
            <TextInput autoComplete="email" error={errors.email} id="register-email" onChange={setEmail} value={email} />
          </FormField>
          <FormField id="register-password" label="パスワード" error={errors.password}>
            <PasswordInput autoComplete="new-password" error={errors.password} id="register-password" onChange={setPassword} value={password} />
          </FormField>
          <ErrorMessage message={message} />
          <Button disabled={submitting} type="submit">{submitting ? <InlineLoading /> : "登録する"}</Button>
        </form>
      </Card>
      <Button variant="ghost" onClick={() => onNavigate("/login")}>ログインへ戻る</Button>
    </main>
  );
}

function OnboardingScreen({ user, onNavigate, onLogout }: {
  user: AuthUser;
  onNavigate: (route: StaticRoute) => void;
  onLogout: () => void;
}) {
  return (
    <main className="app-shell">
      <PageHeader title="家庭をはじめましょう" description={`${user.displayName}さん、まず使う家庭を選びます。`} />
      <div className="choice-grid">
        <Card className="choice-card">
          <h2>新しい家庭を作る</h2>
          <p>あなたが owner になり、あとから招待コードでメンバーを招待できます。</p>
          <Button onClick={() => onNavigate("/household/create")}>作成へ進む</Button>
        </Card>
        <Card className="choice-card">
          <h2>招待コードで参加する</h2>
          <p>家族から共有されたコードを入力して、同じ家庭に参加します。</p>
          <Button variant="secondary" onClick={() => onNavigate("/household/join")}>参加へ進む</Button>
        </Card>
      </div>
      <Button variant="ghost" onClick={onLogout}>ログアウト</Button>
    </main>
  );
}

function CreateHouseholdScreen({ onCreated, onNavigate }: {
  onCreated: (household: Household) => void;
  onNavigate: (route: StaticRoute) => void;
}) {
  const [name, setName] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    const nextErrors: FormErrors = {};
    if (trimmed.length === 0 || trimmed.length > 80) nextErrors.name = "家庭名は1〜80文字で入力してください。";
    setErrors(nextErrors);
    setMessage("");
    if (Object.keys(nextErrors).length > 0) return;
    setSubmitting(true);
    try {
      const result = await createHousehold(trimmed);
      onCreated(result.household);
    } catch (error) {
      setMessage(apiErrorMessage(error));
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
            <TextInput autoComplete="organization" error={errors.name} id="household-name" onChange={setName} placeholder="例: わが家" value={name} />
          </FormField>
          <ErrorMessage message={message} />
          <Button disabled={submitting} type="submit">{submitting ? <InlineLoading /> : "家庭を作成"}</Button>
        </form>
      </Card>
      <Button variant="ghost" onClick={() => onNavigate("/onboarding")}>選択に戻る</Button>
    </main>
  );
}

function JoinHouseholdScreen({ onJoined, onNavigate }: {
  onJoined: (household: Household) => void;
  onNavigate: (route: StaticRoute) => void;
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
      setMessage(apiErrorMessage(error));
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
            <TextInput autoComplete="one-time-code" error={errors.code} id="invite-code" onChange={setCode} placeholder="ABCD-EFGH-IJKL" value={code} />
          </FormField>
          <ErrorMessage message={message} />
          <Button disabled={submitting} type="submit">{submitting ? <InlineLoading /> : "参加する"}</Button>
        </form>
      </Card>
      <Button variant="ghost" onClick={() => onNavigate("/onboarding")}>選択に戻る</Button>
    </main>
  );
}

function AppFrame({ current, children, onNavigate }: {
  current: "/home" | "/tasks" | "/shopping" | "/settings/members";
  children: ReactNode;
  onNavigate: (route: NavigationPath) => void;
}) {
  return (
    <main className="app-shell app-shell--with-nav">
      {children}
      <BottomNavigation current={current} onNavigate={onNavigate} />
    </main>
  );
}

function useDashboardData() {
  const [data, setData] = useState<DashboardToday | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setMessage("");
    try {
      setData(await getDashboardToday(undefined, signal));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage(apiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      controller.abort();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);
  return { data, loading, message, refresh };
}

function HomeScreen({ household, user, onNavigate, onLogout }: {
  household: Household;
  user: AuthUser;
  onNavigate: (route: NavigationPath) => void;
  onLogout: () => void;
}) {
  const { data, loading, message, refresh } = useDashboardData();
  const todayTasks = data?.todayTasks ?? [];
  const weeklyTasks = data?.weeklyTasks ?? [];
  const undone = (data?.summary.pending ?? 0) + (data?.summary.inProgress ?? 0);
  const nowTasks = todayTasks.filter((task) => task.status === "pending" || task.status === "in_progress").slice(0, 3);
  return (
    <AppFrame current="/home" onNavigate={onNavigate}>
      <PageHeader
        title="ホーム"
        description={`${household.name} / ${user.displayName}さん`}
        action={<Button variant="ghost" onClick={onLogout}>ログアウト</Button>}
      />
      <ErrorMessage message={message} />
      <section className="dashboard-hero">
        <div>
          <p>{formatDate(data?.date ?? todayInTokyo())}</p>
          <h2>{data?.household.name ?? household.name}</h2>
          <p>{data?.members.map((member) => member.displayName).join("・") ?? "メンバー確認中"}</p>
        </div>
        <div className="summary-count">
          <span>今日の未完了</span>
          <strong>{loading ? "..." : `${undone}件`}</strong>
        </div>
      </section>
      <div className="section-heading">
        <h2>今やること</h2>
        <Button variant="ghost" onClick={() => void refresh()}>更新</Button>
      </div>
      <TaskCardList tasks={nowTasks} members={data?.members ?? []} emptyTitle="今すぐのタスクはありません" onNavigate={onNavigate} />
      <SectionCard title="今日のタスク" loading={loading}>
        <TaskCardList tasks={todayTasks} members={data?.members ?? []} emptyTitle="今日のタスクはありません" emptyDescription="ゆっくり過ごしましょう" onNavigate={onNavigate} />
      </SectionCard>
      <SectionCard title="今週のタスク" loading={loading}>
        {weeklyTasks.length === 0 ? (
          <EmptyState title="今週中のタスクはありません" description="必要なときにタスクを追加できます。" />
        ) : (
          <div className="task-list">
            {weeklyTasks.map((task) => <WeeklyTaskCard key={task.id} task={task} onNavigate={onNavigate} />)}
          </div>
        )}
      </SectionCard>
      <SectionCard title="買い物" loading={loading}>
        <div className="shopping-preview">
          <strong>未購入 {data?.shopping.pendingCount ?? 0}件</strong>
          {(data?.shopping.previewItems ?? []).length > 0 ? (
            <ul>
              {data!.shopping.previewItems.map((item) => (
                <li key={item.id}>{item.name}{item.quantity ? ` / ${item.quantity}` : ""}</li>
              ))}
            </ul>
          ) : (
            <p>今のところ買うものはありません。</p>
          )}
          <Button variant="secondary" onClick={() => onNavigate("/shopping")}>買い物を確認</Button>
        </div>
      </SectionCard>
    </AppFrame>
  );
}

function SectionCard({ title, loading, children }: { title: string; loading?: boolean; children: ReactNode }) {
  return (
    <Card>
      <div className="section-heading">
        <h2>{title}</h2>
        {loading ? <span>読み込み中</span> : null}
      </div>
      {children}
    </Card>
  );
}

function TaskCardList({ tasks, members, emptyTitle, emptyDescription = "時間のあるときに確認しましょう。", onNavigate }: {
  tasks: TodayTask[];
  members: Array<Pick<HouseholdMember, "userId" | "displayName" | "color">>;
  emptyTitle: string;
  emptyDescription?: string;
  onNavigate: (route: NavigationPath) => void;
}) {
  if (tasks.length === 0) return <EmptyState title={emptyTitle} description={emptyDescription} />;
  return (
    <div className="task-list">
      {tasks.map((task) => <TodayTaskCard key={task.id} task={task} members={members} onNavigate={onNavigate} />)}
    </div>
  );
}

function TodayTaskCard({ task, members, onNavigate }: {
  task: TodayTask;
  members: Array<Pick<HouseholdMember, "userId" | "displayName" | "color">>;
  onNavigate: (route: NavigationPath) => void;
}) {
  const assignedMember = task.assignedUserId ? members.find((member) => member.userId === task.assignedUserId) : null;
  return (
    <button className="task-card" onClick={() => onNavigate(`/tasks/${task.id}`)} type="button">
      <span className="task-icon" aria-hidden="true">{taskIcon(task.recurrenceType)}</span>
      <span className="task-card__body">
        <strong>{task.title}</strong>
        <small>{formatSchedule(task.scheduledTime)} / 担当: {assignedMember?.displayName ?? assignmentLabels[task.assignmentType]}</small>
        {task.actedBy ? <small>{statusLabels[task.status]}: {actorName(task.actedBy)}</small> : null}
      </span>
      <StatusBadge status={task.status} />
    </button>
  );
}

function WeeklyTaskCard({ task, onNavigate }: { task: WeeklyTask; onNavigate: (route: NavigationPath) => void }) {
  const progress = task.targetCount > 0 ? Math.min(task.completedCount / task.targetCount, 1) * 100 : 0;
  return (
    <button className="task-card" onClick={() => onNavigate(`/tasks/${task.id}`)} type="button">
      <span className="task-icon" aria-hidden="true">{taskIcon(task.recurrenceType)}</span>
      <span className="task-card__body">
        <strong>{task.title}</strong>
        <small>{task.completedCount} / {task.targetCount}回完了 ・ あと{task.remainingCount}回</small>
        <span className="progress"><span style={{ width: `${progress}%` }} /></span>
      </span>
      <StatusBadge status={task.status} />
    </button>
  );
}

function StatusBadge({ status }: { status: TaskDisplayStatus }) {
  return <span className={`status-badge status-badge--${status}`}>{statusLabels[status]}</span>;
}

function TaskListScreen({ onNavigate, onLogout }: {
  household: Household;
  user: AuthUser;
  onNavigate: (route: NavigationPath) => void;
  onLogout: () => void;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setMessage("");
    try {
      const result = await listTasks(true, signal);
      setTasks(result.tasks);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage(apiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);
  const groups: Array<[string, Task[]]> = [
    ["毎日のタスク", tasks.filter((task) => task.active && task.recurrenceType === "daily")],
    ["曜日指定タスク", tasks.filter((task) => task.active && task.recurrenceType === "scheduled")],
    ["今週中のタスク", tasks.filter((task) => task.active && task.recurrenceType === "weekly")],
    ["無効なタスク", tasks.filter((task) => !task.active)]
  ];
  return (
    <AppFrame current="/tasks" onNavigate={onNavigate}>
      <PageHeader title="タスク" description="家事の登録と編集" action={<Button variant="ghost" onClick={onLogout}>ログアウト</Button>} />
      <ErrorMessage message={message} />
      <Button onClick={() => onNavigate("/tasks/new")}>＋ タスクを追加</Button>
      {loading ? <p role="status">タスクを読み込んでいます。</p> : groups.map(([title, items]) => (
        <Card key={title}>
          <div className="section-heading"><h2>{title}</h2><span>{items.length}件</span></div>
          {items.length === 0 ? <EmptyState title={`${title}はありません`} description="必要になったら追加できます。" /> : (
            <div className="task-list">
              {items.map((task) => <TaskManagementCard key={task.id} task={task} onNavigate={onNavigate} onChanged={() => void refresh()} />)}
            </div>
          )}
        </Card>
      ))}
    </AppFrame>
  );
}

function TaskManagementCard({ task, onNavigate, onChanged }: {
  task: Task;
  onNavigate: (route: NavigationPath) => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const disable = async () => {
    if (!window.confirm("このタスクを今後の一覧に表示しないようにします。過去の履歴は残ります。")) return;
    setBusy(true);
    try {
      await deactivateTask(task.id);
      onChanged();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="management-card">
      <div>
        <strong>{task.title}</strong>
        <small>{recurrenceLabels[task.recurrenceType]} / {formatWeekdays(task.weekdays)} / {formatSchedule(task.scheduledTime)}</small>
        <small>{assignmentLabels[task.assignmentType]} / {notificationLabels[task.notificationSlot]} / {task.active ? "有効" : "無効"}</small>
      </div>
      <div className="inline-actions">
        <Button variant="ghost" onClick={() => onNavigate(`/tasks/${task.id}`)}>詳細</Button>
        <Button variant="secondary" onClick={() => onNavigate(`/tasks/${task.id}/edit`)}>編集</Button>
        {task.active ? <Button variant="danger" disabled={busy} onClick={() => void disable()}>{busy ? "処理中" : "無効化"}</Button> : null}
      </div>
    </div>
  );
}

const defaultForm: CreateTaskInput = {
  title: "",
  description: null,
  recurrenceType: "daily",
  assignmentType: "anyone",
  assignedUserId: null,
  scheduledTime: null,
  notificationSlot: "none",
  weekdays: [],
  weeklyTargetCount: null
};

function TaskFormScreen({ household, mode, taskId, onNavigate }: {
  household: Household;
  user: AuthUser;
  mode: "create" | "edit";
  taskId?: string;
  onNavigate: (route: NavigationPath) => void;
  onLogout: () => void;
}) {
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [form, setForm] = useState<CreateTaskInput>(defaultForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(mode === "edit");
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    listMembers(controller.signal).then((result) => setMembers(result.members)).catch(() => undefined);
    if (mode === "edit" && taskId) {
      getTask(taskId, controller.signal)
        .then((result) => setForm(taskToInput(result.task)))
        .catch((error) => setMessage(apiErrorMessage(error)))
        .finally(() => setLoading(false));
    }
    return () => controller.abort();
  }, [mode, taskId]);
  const setField = <K extends keyof CreateTaskInput>(key: K, value: CreateTaskInput[K]) => {
    setForm((current) => normalizeTaskInput({ ...current, [key]: value }));
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors = validateTaskForm(form);
    setErrors(nextErrors);
    setMessage("");
    if (Object.keys(nextErrors).length > 0) return;
    setSubmitting(true);
    try {
      const payload = normalizeTaskInput(form);
      const result = mode === "edit" && taskId ? await updateTask(taskId, payload) : await createTask(payload);
      onNavigate(`/tasks/${result.task.id}`);
    } catch (error) {
      setMessage(apiErrorMessage(error));
      if (error instanceof ApiError && error.details) setErrors(error.details);
    } finally {
      setSubmitting(false);
    }
  };
  if (loading) return <LoadingScreen message="タスクを読み込んでいます" />;
  return (
    <AppFrame current="/tasks" onNavigate={onNavigate}>
      <PageHeader title={mode === "create" ? "タスクを追加" : "タスクを編集"} description={household.name} />
      <Card>
        <form className="stack" aria-busy={submitting} onSubmit={(event) => void submit(event)}>
          <ErrorMessage message={message} />
          <FormField id="task-title" label="タイトル（必須）" error={errors.title}>
            <TextInput id="task-title" error={errors.title} value={form.title} onChange={(value) => setField("title", value)} />
          </FormField>
          <FormField id="task-description" label="説明" error={errors.description}>
            <textarea id="task-description" value={form.description ?? ""} onChange={(event) => setField("description", event.target.value || null)} />
          </FormField>
          <SelectField id="task-type" label="タスク種別" value={form.recurrenceType} onChange={(value) => setField("recurrenceType", value as TaskRecurrenceType)}>
            <option value="daily">毎日のタスク</option>
            <option value="scheduled">曜日指定タスク</option>
            <option value="weekly">今週中のタスク</option>
          </SelectField>
          <SelectField id="task-assignment" label="担当" value={form.assignmentType} onChange={(value) => setField("assignmentType", value as TaskAssignmentType)}>
            <option value="anyone">どちらでも</option>
            <option value="specific">特定のメンバー</option>
          </SelectField>
          {form.assignmentType === "specific" ? (
            <SelectField id="task-assignee" label="担当メンバー（必須）" value={form.assignedUserId ?? ""} error={errors.assignedUserId} onChange={(value) => setField("assignedUserId", value || null)}>
              <option value="">選択してください</option>
              {members.map((member) => <option key={member.userId} value={member.userId}>{member.displayName}</option>)}
            </SelectField>
          ) : null}
          {form.recurrenceType !== "weekly" ? (
            <FormField id="task-time" label="予定時刻" error={errors.scheduledTime}>
              <input id="task-time" type="time" value={form.scheduledTime ?? ""} onChange={(event) => setField("scheduledTime", event.target.value || null)} aria-describedby={errors.scheduledTime ? "task-time-error" : undefined} />
            </FormField>
          ) : null}
          <SelectField id="task-notification" label="通知枠" value={form.notificationSlot} onChange={(value) => setField("notificationSlot", value as NotificationSlot)}>
            <option value="none">通知なし</option>
            <option value="morning">朝</option>
            <option value="night">夜</option>
          </SelectField>
          {form.recurrenceType === "scheduled" ? (
            <div className="form-field">
              <span className="field-label">対象曜日（必須）</span>
              <div className="weekday-picker" aria-describedby={errors.weekdays ? "task-weekdays-error" : undefined}>
                {weekdayLabels.map((label, day) => {
                  const selected = form.weekdays.includes(day);
                  return <button aria-pressed={selected} key={label} onClick={() => setField("weekdays", selected ? form.weekdays.filter((item) => item !== day) : [...form.weekdays, day])} type="button">{selected ? "✓ " : ""}{label}</button>;
                })}
              </div>
              {errors.weekdays ? <p className="field-error" id="task-weekdays-error">{errors.weekdays}</p> : null}
            </div>
          ) : null}
          {form.recurrenceType === "weekly" ? (
            <FormField id="task-weekly-count" label="週内必要回数（1〜7）" error={errors.weeklyTargetCount}>
              <input id="task-weekly-count" min="1" max="7" type="number" value={form.weeklyTargetCount ?? 1} onChange={(event) => setField("weeklyTargetCount", Number(event.target.value))} />
            </FormField>
          ) : null}
          <Button disabled={submitting} type="submit">{submitting ? <InlineLoading /> : "保存する"}</Button>
        </form>
      </Card>
    </AppFrame>
  );
}

function SelectField({ id, label, value, error, onChange, children }: {
  id: string;
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <FormField id={id} label={label} error={error}>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)} aria-describedby={error ? `${id}-error` : undefined} aria-invalid={error ? "true" : "false"}>
        {children}
      </select>
    </FormField>
  );
}

const taskToInput = (task: Task): CreateTaskInput => normalizeTaskInput({
  title: task.title,
  description: task.description,
  recurrenceType: task.recurrenceType,
  assignmentType: task.assignmentType,
  assignedUserId: task.assignedUserId,
  scheduledTime: task.scheduledTime,
  notificationSlot: task.notificationSlot,
  weekdays: task.weekdays,
  weeklyTargetCount: task.weeklyTargetCount
});

const normalizeTaskInput = (input: CreateTaskInput): CreateTaskInput => ({
  ...input,
  title: input.title,
  description: input.description?.trim() ? input.description.trim() : null,
  assignedUserId: input.assignmentType === "specific" ? input.assignedUserId : null,
  scheduledTime: input.recurrenceType === "weekly" ? null : input.scheduledTime,
  weekdays: input.recurrenceType === "scheduled" ? [...new Set(input.weekdays)].sort((a, b) => a - b) : [],
  weeklyTargetCount: input.recurrenceType === "weekly" ? input.weeklyTargetCount ?? 1 : null
});

const validateTaskForm = (input: CreateTaskInput) => {
  const errors: FormErrors = {};
  if (input.title.trim().length === 0) errors.title = "タイトルを入力してください。";
  if (input.title.trim().length > 100) errors.title = "タイトルは100文字以内で入力してください。";
  if (input.scheduledTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.scheduledTime)) errors.scheduledTime = "時刻はHH:mmで入力してください。";
  if (input.assignmentType === "specific" && !input.assignedUserId) errors.assignedUserId = "担当メンバーを選択してください。";
  if (input.recurrenceType === "scheduled" && input.weekdays.length === 0) errors.weekdays = "曜日を1つ以上選択してください。";
  if (input.recurrenceType === "weekly" && (!input.weeklyTargetCount || input.weeklyTargetCount < 1 || input.weeklyTargetCount > 7)) errors.weeklyTargetCount = "1〜7回で入力してください。";
  return errors;
};

function TaskDetailScreen({ household, user, taskId, compact, onNavigate }: {
  household: Household;
  user: AuthUser;
  taskId: string;
  compact: boolean;
  onNavigate: (route: NavigationPath) => void;
  onLogout: () => void;
}) {
  const [task, setTask] = useState<Task | null>(null);
  const [todayTask, setTodayTask] = useState<TodayTask | null>(null);
  const [weeklyTask, setWeeklyTask] = useState<WeeklyTask | null>(null);
  const [history, setHistory] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [skipNote, setSkipNote] = useState("");
  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const detail = await getTask(taskId, signal);
      setTask(detail.task);
      setLoading(false);
      const [today, week, records] = await Promise.all([
        listTodayTasks(undefined, signal),
        listWeekTasks(undefined, signal),
        listTaskHistory(taskId, 10, signal)
      ]);
      setTodayTask(today.tasks.find((item) => item.id === taskId) ?? null);
      setWeeklyTask(week.tasks.find((item) => item.id === taskId) ?? null);
      setHistory(records.records);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage(apiErrorMessage(error));
      setLoading(false);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [taskId]);
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);
  const scopedTask = weeklyTask ?? todayTask;
  const visibleTask = task ? { ...(scopedTask ?? {}), ...task } : scopedTask;
  const status = scopedTask?.status ?? "pending";
  const actedBy = todayTask?.actedBy ?? weeklyTask?.latestAction?.actedBy ?? null;
  const runAction = async (action: "start" | "complete" | "skip" | "reset") => {
    if (!visibleTask) return;
    if (action === "reset" && !window.confirm("この記録を取り消して未完了に戻しますか？")) return;
    setBusyAction(action);
    setMessage("");
    setSuccess("");
    try {
      await changeTaskState(visibleTask.id, action, { ...taskActionScope(visibleTask, household), note: action === "skip" ? skipNote : null });
      setSuccess(action === "reset" ? "未完了に戻しました。" : "状態を更新しました。");
      setSkipNote("");
      await refresh();
    } catch (error) {
      setMessage(apiErrorMessage(error));
      await refresh();
    } finally {
      setBusyAction(null);
    }
  };
  if (loading) return <LoadingScreen message="タスクを読み込んでいます" />;
  if (!visibleTask) {
    return <AppFrame current="/tasks" onNavigate={onNavigate}><ErrorMessage message={message || "このタスクは見つかりませんでした。"} /></AppFrame>;
  }
  const mine = actedBy?.userId === user.id;
  const otherInProgress = status === "in_progress" && !mine;
  return (
    <AppFrame current="/tasks" onNavigate={onNavigate}>
      <PageHeader title={compact ? "タスク回答" : "タスク詳細"} description={household.name} />
      <ErrorMessage message={message} />
      <SuccessMessage message={success} />
      <Card>
        <div className="detail-title">
          <span className="task-icon" aria-hidden="true">{taskIcon(visibleTask.recurrenceType)}</span>
          <div><h2>{visibleTask.title}</h2><StatusBadge status={status} /></div>
        </div>
        {visibleTask.description ? <p>{visibleTask.description}</p> : null}
        <dl className="detail-grid">
          <div><dt>種別</dt><dd>{recurrenceLabels[visibleTask.recurrenceType]}</dd></div>
          <div><dt>曜日</dt><dd>{formatWeekdays(visibleTask.weekdays)}</dd></div>
          <div><dt>予定</dt><dd>{formatSchedule(visibleTask.scheduledTime)}</dd></div>
          <div><dt>通知</dt><dd>{notificationLabels[visibleTask.notificationSlot]}</dd></div>
          <div><dt>担当</dt><dd>{assignmentLabels[visibleTask.assignmentType]}</dd></div>
          {actedBy ? <div><dt>対応者</dt><dd>{actorName(actedBy)}</dd></div> : null}
        </dl>
      </Card>
      <Card>
        <h2>操作</h2>
        {otherInProgress ? <p>{actorName(actedBy)}さんが対応中です。</p> : null}
        {status === "completed" && actedBy ? <p>{actorName(actedBy)}さんが{formatDateTime(todayTask?.completedAt ?? weeklyTask?.latestAction?.completedAt ?? null)}に完了しました。</p> : null}
        {status === "skipped" && actedBy ? <p>{actorName(actedBy)}さんが今日はパスしました。</p> : null}
        <div className="stack">
          {status !== "completed" && !otherInProgress ? <Button disabled={busyAction !== null} onClick={() => void runAction("complete")}>{busyAction === "complete" ? <InlineLoading /> : "完了しました"}</Button> : null}
          {status === "pending" ? <Button variant="secondary" disabled={busyAction !== null} onClick={() => void runAction("start")}>今からやります</Button> : null}
          {(status === "pending" || (status === "in_progress" && mine)) ? (
            <>
              <FormField id="skip-note" label="パス理由（任意）">
                <textarea id="skip-note" maxLength={500} value={skipNote} onChange={(event) => setSkipNote(event.target.value)} />
              </FormField>
              <Button variant="ghost" disabled={busyAction !== null} onClick={() => void runAction("skip")}>パスする</Button>
            </>
          ) : null}
          {(status === "in_progress" && mine) || status === "completed" || status === "skipped" ? (
            <Button variant="danger" disabled={busyAction !== null} onClick={() => void runAction("reset")}>対応を取り消す</Button>
          ) : null}
          {!compact ? <Button variant="secondary" onClick={() => onNavigate(`/tasks/${visibleTask.id}/edit`)}>編集する</Button> : null}
        </div>
      </Card>
      {!compact ? <HistoryCard records={history} /> : null}
    </AppFrame>
  );
}

function HistoryCard({ records }: { records: TaskRecord[] }) {
  return (
    <Card>
      <h2>最近の履歴</h2>
      {records.length === 0 ? <EmptyState title="まだ履歴はありません" description="操作するとここに表示されます。" /> : (
        <ul className="history-list">
          {records.map((record) => (
            <li key={record.id}>
              <strong>{actorName(record.actedBy)}さんが{statusLabels[record.status]}しました</strong>
              <span>{record.targetDate ?? record.targetWeekStart} / {formatDateTime(record.updatedAt)}</span>
              {record.note ? <p>理由: {record.note}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function MembersScreen({ household, onNavigate, onLogout }: {
  household: Household;
  user: AuthUser;
  onNavigate: (route: NavigationPath) => void;
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
    listMembers(controller.signal).then((result) => setMembers(result.members)).catch((error) => setMessage(apiErrorMessage(error))).finally(() => setLoading(false));
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
      setMessage(apiErrorMessage(error));
    } finally {
      setIssuing(false);
    }
  };
  return (
    <AppFrame current="/settings/members" onNavigate={onNavigate}>
      <PageHeader title="メンバー管理" description={`${household.name} / ${household.role}`} action={<Button variant="ghost" onClick={onLogout}>ログアウト</Button>} />
      <ErrorMessage message={message} />
      <SuccessMessage message={success} />
      <Card>
        <div className="section-heading"><h2>メンバー</h2><span>{loading ? "確認中" : `${members.length}人`}</span></div>
        {loading ? <p role="status">メンバーを読み込んでいます。</p> : (
          <ul className="member-list">
            {members.map((member) => (
              <li key={member.userId}>
                <MemberAvatar color={member.color} name={member.displayName} />
                <div><strong>{member.displayName}</strong><span>{member.role} / {formatDateTime(member.joinedAt)} 参加</span></div>
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
            <Button disabled={issuing} onClick={() => void issueInvite()}>{issuing ? <InlineLoading label="発行中" /> : "招待コードを発行"}</Button>
            {invite ? <div className="invite-box"><span>招待コード</span><strong>{invite.code}</strong><span>有効期限: {formatDateTime(invite.expiresAt)}</span><Button variant="secondary" onClick={() => {
              void navigator.clipboard.writeText(invite.code).then(() => setSuccess("招待コードをコピーしました。")).catch(() => setMessage("コピーできませんでした。"));
            }}>コピー</Button></div> : null}
          </div>
        ) : <p>招待コードを発行できるのは owner だけです。</p>}
      </Card>
    </AppFrame>
  );
}

function ShoppingSoonScreen({ onNavigate }: { onNavigate: (route: NavigationPath) => void }) {
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    listShoppingItems(controller.signal)
      .then((result) => setPendingCount(result.pending.length))
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setMessage(apiErrorMessage(error));
      });
    return () => controller.abort();
  }, []);
  return (
    <AppFrame current="/shopping" onNavigate={onNavigate}>
      <PageHeader title="買い物" description="買い物画面は次のフェーズで追加します。" />
      <ErrorMessage message={message} />
      <Card>
        <EmptyState
          title="買い物API接続済み"
          description={`未購入件数: ${pendingCount === null ? "確認中" : `${pendingCount}件`}。本格的な買い物画面は次のフェーズで実装予定です。`}
        />
      </Card>
    </AppFrame>
  );
}

function GuestScreen({ onNavigate, onExit }: {
  onNavigate: (route: NavigationPath | StaticRoute) => void;
  onExit: () => void;
}) {
  return (
    <main className="app-shell app-shell--with-nav">
      <PageHeader title="ゲスト" description="サンプルのホームを確認できます。" action={<Button variant="ghost" onClick={onExit}>終了</Button>} />
      <GuestBanner />
      <section className="dashboard-hero">
        <div><p>{formatDate(todayInTokyo())}</p><h2>サンプルの家庭</h2><p>たくや・さやか</p></div>
        <div className="summary-count"><span>今日の未完了</span><strong>2件</strong></div>
      </section>
      <Card>
        <h2>今日のタスク</h2>
        <div className="task-list">
          <button className="task-card" type="button"><span className="task-icon">↻</span><span className="task-card__body"><strong>インコのごはんを交換</strong><small>夜 21:00 / 担当: どちらでも</small></span><StatusBadge status="pending" /></button>
          <button className="task-card" type="button"><span className="task-icon">□</span><span className="task-card__body"><strong>ゴミ出し</strong><small>朝 8:00 / 担当: どちらでも</small></span><StatusBadge status="completed" /></button>
        </div>
      </Card>
      <BottomNavigation current="/home" onNavigate={onNavigate as (path: "/home" | "/tasks" | "/shopping" | "/settings/members") => void} />
    </main>
  );
}
