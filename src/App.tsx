import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { ReactNode } from "react";
import { login, logout, me, register } from "./api/auth";
import { deleteProfileImage, uploadProfileImage } from "./api/account";
import { ApiError, apiMessage } from "./api/client";
import {
  getNotificationSettings,
  getVapidPublicKey,
  registerPushSubscription,
  sendTestPushNotification,
  unregisterPushSubscription,
  updateNotificationSettings,
  type NotificationSettings
} from "./api/notifications";
import { getDashboardToday, type DashboardToday } from "./api/dashboard";
import { imageUploadErrorMessage } from "./api/image-errors";
import { getCurrentImageUsage, type ImageUsage } from "./api/image-usage";
import {
  addShoppingItemFromTemplate,
  clearPurchasedItems,
  createShoppingItem,
  createShoppingTemplate,
  deleteShoppingItem,
  deleteShoppingTemplate,
  getShoppingItem,
  getShoppingItemImageUrl,
  getShoppingTemplate,
  listShoppingItems,
  listRecentShoppingItems,
  listShoppingTemplates,
  purchaseShoppingItem,
  unpurchaseShoppingItem,
  updateShoppingItem,
  updateShoppingTemplate,
  uploadShoppingItemImage,
  deleteShoppingItemImage,
  type CreateShoppingItemInput,
  type CreateShoppingTemplateInput,
  type ShoppingItem,
  type ShoppingRecentItem,
  type ShoppingTemplate,
  type UpdateShoppingItemInput,
  type UpdateShoppingTemplateInput
} from "./api/shopping";
import { processShoppingImage, type ProcessedImage } from "./lib/image-processing";
import { formatDateTime as formatDateTimeInTimezone } from "./lib/format";
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
  createTaskTemplate,
  deactivateTask,
  deactivateTaskTemplate,
  getTask,
  getTaskTemplate,
  listRecentTaskDefinitions,
  listTaskHistory,
  listTasks,
  listTaskTemplates,
  listCalendarTasks,
  listTodayTasks,
  listWeekTasks,
  updateTask,
  updateTaskTemplate,
  type Task,
  type CalendarShoppingItem,
  type TaskTemplate,
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
import { BottomSheet } from "./components/BottomSheet";
import { APP_NAME } from "./constants";
import {
  assignmentLabels,
  formatSchedule,
  notificationLabels,
  statusLabels,
  weekdayLabels
} from "./task-labels";
import {
  changeTaskFormRecurrence,
  defaultTaskForm,
  normalizeTaskForm,
  notificationPresetLabel,
  recurrenceDescription,
  taskFormToPayload,
  taskFormToTemplatePayload,
  taskToFormState,
  taskTemplateToFormState,
  taskToTemplatePayload,
  validateTaskFormState,
  type TaskFormErrors,
  type TaskFormRecurrence,
  type TaskFormState
} from "./task-model-ui";
import type {
  AuthState,
  AuthUser,
  CreatedInvite,
  Household,
  HouseholdMember,
  HouseholdState
} from "./types";
import { formatBytes } from "./lib/format";
import { getBrowserCapabilities, type BrowserCapabilities } from "./lib/capabilities";
import { urlBase64ToUint8Array } from "./lib/vapid";

type StaticRoute =
  | "/"
  | "/login"
  | "/register"
  | "/guest"
  | "/onboarding"
  | "/household/create"
  | "/household/join"
  | "/home"
  | "/calendar"
  | "/settings/members"
  | "/tasks"
  | "/tasks/new"
  | "/tasks/templates"
  | "/shopping"
  | "/shopping/new"
  | "/shopping/templates"
  | "/shopping/templates/new";

type Route =
  | { name: StaticRoute }
  | { name: "/tasks/:taskId"; taskId: string }
  | { name: "/tasks/:taskId/edit"; taskId: string }
  | { name: "/tasks/:taskId/respond"; taskId: string }
  | { name: "/tasks/templates/:templateId/edit"; templateId: string }
  | { name: "/shopping/items/:itemId"; itemId: string }
  | { name: "/shopping/items/:itemId/edit"; itemId: string }
  | { name: "/shopping/templates/:templateId/edit"; templateId: string };

type NavigationPath =
  | "/home"
  | "/calendar"
  | "/tasks"
  | "/tasks/new"
  | "/tasks/templates"
  | "/shopping"
  | "/shopping/new"
  | "/shopping/templates"
  | "/shopping/templates/new"
  | "/settings/members"
  | `/tasks/${string}`
  | `/tasks/${string}/edit`
  | `/tasks/${string}/respond`
  | `/tasks/templates/${string}/edit`
  | `/shopping/items/${string}`
  | `/shopping/items/${string}/edit`
  | `/shopping/templates/${string}/edit`;

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
  "/calendar",
  "/settings/members",
  "/tasks",
  "/tasks/new",
  "/tasks/templates",
  "/shopping",
  "/shopping/new",
  "/shopping/templates",
  "/shopping/templates/new"
]);

const parseRoute = (pathname: string): Route => {
  if (staticRoutes.has(pathname as StaticRoute))
    return { name: pathname as StaticRoute };
  const taskEdit = pathname.match(/^\/tasks\/([^/]+)\/edit$/);
  if (taskEdit)
    return { name: "/tasks/:taskId/edit", taskId: decodeURIComponent(taskEdit[1]) };
  const taskTemplateEdit = pathname.match(/^\/tasks\/templates\/([^/]+)\/edit$/);
  if (taskTemplateEdit)
    return {
      name: "/tasks/templates/:templateId/edit",
      templateId: decodeURIComponent(taskTemplateEdit[1])
    };
  const taskRespond = pathname.match(/^\/tasks\/([^/]+)\/respond$/);
  if (taskRespond)
    return {
      name: "/tasks/:taskId/respond",
      taskId: decodeURIComponent(taskRespond[1])
    };
  const taskDetail = pathname.match(/^\/tasks\/([^/]+)$/);
  if (taskDetail)
    return { name: "/tasks/:taskId", taskId: decodeURIComponent(taskDetail[1]) };
  const shoppingItemEdit = pathname.match(/^\/shopping\/items\/([^/]+)\/edit$/);
  if (shoppingItemEdit)
    return {
      name: "/shopping/items/:itemId/edit",
      itemId: decodeURIComponent(shoppingItemEdit[1])
    };
  const shoppingItemDetail = pathname.match(/^\/shopping\/items\/([^/]+)$/);
  if (shoppingItemDetail)
    return {
      name: "/shopping/items/:itemId",
      itemId: decodeURIComponent(shoppingItemDetail[1])
    };
  const shoppingTemplateEdit = pathname.match(/^\/shopping\/templates\/([^/]+)\/edit$/);
  if (shoppingTemplateEdit)
    return {
      name: "/shopping/templates/:templateId/edit",
      templateId: decodeURIComponent(shoppingTemplateEdit[1])
    };
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
  route.name === "/calendar" ||
  route.name === "/settings/members" ||
  route.name === "/tasks" ||
  route.name === "/tasks/new" ||
  route.name === "/tasks/templates" ||
  route.name === "/shopping" ||
  route.name === "/shopping/new" ||
  route.name === "/shopping/templates" ||
  route.name === "/shopping/templates/new" ||
  route.name.startsWith("/shopping/items/:itemId") ||
  route.name.startsWith("/shopping/templates/:templateId") ||
  route.name.startsWith("/tasks/:taskId");

const validateEmail = (email: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
const normalizeInviteCode = (code: string) => code.trim();

const todayInTimezone = (timezone = "Asia/Tokyo") => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const todayInTokyo = () => todayInTimezone("Asia/Tokyo");

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
    timeZone: "UTC"
  }).format(new Date(`${dateKey}T00:00:00Z`));

const formatShoppingPlannedDate = (dateKey: string) =>
  new Intl.DateTimeFormat("ja-JP", {
    month: "long",
    day: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${dateKey}T00:00:00Z`));

const formatCalendarDate = (dateKey: string) =>
  new Intl.DateTimeFormat("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "UTC"
  }).format(new Date(`${dateKey}T00:00:00Z`));

const formatCalendarMonth = (monthKey: string) =>
  new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    timeZone: "UTC"
  }).format(new Date(`${monthKey.slice(0, 7)}-01T00:00:00Z`));

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

const actorName = (actor: { displayName: string | null } | null) =>
  actor?.displayName ?? "メンバー";

const taskDeadlineLabel = (task: Task): string => {
  const time = task.deadlineTime ? ` ${task.deadlineTime}まで` : "";
  if (task.modelRecurrenceType === "weekly_flexible")
    return `${weekdayLabels[task.weeklyDeadlineWeekday ?? 0]}曜${time || "まで"}`;
  if (task.modelRecurrenceType === "monthly_flexible")
    return `${task.monthlyDeadlineType === "day_of_month" ? `${task.monthlyDayOfMonth}日` : "月末"}${time || "まで"}`;
  if (task.modelRecurrenceType === "once" && task.targetDate)
    return `${formatDate(task.targetDate)}${time}`;
  return task.deadlineTime ? `${task.deadlineTime}まで` : "設定なし";
};

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
  if (task.modelRecurrenceType)
    return {
      targetDate:
        task.modelRecurrenceType === "once"
          ? (task.targetDate ?? todayInTokyo())
          : todayInTokyo()
    };
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

  const navigate = useCallback(
    (nextRoute: NavigationPath | StaticRoute, replace = false) => {
      if (window.location.pathname !== nextRoute) {
        const state = { route: nextRoute };
        if (replace) window.history.replaceState(state, "", nextRoute);
        else window.history.pushState(state, "", nextRoute);
      }
      setRoute(parseRoute(nextRoute));
    },
    []
  );

  const refreshHousehold = useCallback(
    async (signal?: AbortSignal) => {
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
        setHousehold({ status: "error", message: apiErrorMessage(error) });
      }
    },
    [navigate]
  );

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
    if (household.status === "ready" && isOnboardingRoute(route))
      navigate("/home", true);
  }, [auth.status, guestMode, household.status, navigate, route]);

  if (guestMode)
    return <GuestScreen onNavigate={navigate} onExit={() => setGuestMode(false)} />;
  if (auth.status === "loading")
    return <LoadingScreen message="ログイン状態を確認しています" />;
  if (auth.status === "unauthenticated") {
    if (route.name === "/register")
      return <RegisterScreen onRegister={completeAuth} onNavigate={navigate} />;
    if (route.name === "/guest")
      return <GuestScreen onNavigate={navigate} onExit={() => navigate("/login")} />;
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
    if (route.name === "/household/create") {
      return (
        <CreateHouseholdScreen
          onCreated={(next) => {
            setHousehold({ status: "ready", household: next });
            navigate("/home", true);
          }}
          onNavigate={navigate}
        />
      );
    }
    if (route.name === "/household/join") {
      return (
        <JoinHouseholdScreen
          onJoined={(next) => {
            setHousehold({ status: "ready", household: next });
            navigate("/home", true);
          }}
          onNavigate={navigate}
        />
      );
    }
    return (
      <OnboardingScreen
        user={auth.user}
        onNavigate={navigate}
        onLogout={() => void signOut()}
      />
    );
  }

  const shellProps = {
    household: household.household,
    onNavigate: navigate,
    onLogout: () => void signOut(),
    user: auth.user
  };
  if (route.name === "/settings/members") return <MembersScreen {...shellProps} />;
  if (route.name === "/calendar") return <CalendarScreen {...shellProps} />;
  if (route.name === "/tasks") return <TaskListScreen {...shellProps} />;
  if (route.name === "/tasks/new")
    return <TaskFormScreen {...shellProps} mode="create" />;
  if (route.name === "/tasks/templates")
    return <TaskTemplateListScreen {...shellProps} />;
  if (route.name === "/tasks/templates/:templateId/edit")
    return (
      <TaskFormScreen
        {...shellProps}
        mode="template-edit"
        templateId={route.templateId}
      />
    );
  if (route.name === "/tasks/:taskId/edit")
    return <TaskFormScreen {...shellProps} mode="edit" taskId={route.taskId} />;
  if (route.name === "/tasks/:taskId")
    return <TaskDetailScreen {...shellProps} taskId={route.taskId} compact={false} />;
  if (route.name === "/tasks/:taskId/respond")
    return <TaskDetailScreen {...shellProps} taskId={route.taskId} compact />;
  if (route.name === "/shopping") return <ShoppingListScreen {...shellProps} />;
  if (route.name === "/shopping/new")
    return <ShoppingItemFormScreen {...shellProps} mode="create" />;
  if (route.name === "/shopping/items/:itemId")
    return <ShoppingItemDetailScreen {...shellProps} itemId={route.itemId} />;
  if (route.name === "/shopping/items/:itemId/edit")
    return <ShoppingItemFormScreen {...shellProps} mode="edit" itemId={route.itemId} />;
  if (route.name === "/shopping/templates")
    return <ShoppingTemplateListScreen {...shellProps} />;
  if (route.name === "/shopping/templates/new")
    return <ShoppingTemplateFormScreen {...shellProps} mode="create" />;
  if (route.name === "/shopping/templates/:templateId/edit")
    return (
      <ShoppingTemplateFormScreen
        {...shellProps}
        mode="edit"
        templateId={route.templateId}
      />
    );
  return <HomeScreen {...shellProps} />;
}

function LoginScreen({
  onGuest,
  onLogin,
  onNavigate
}: {
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
    if (!validateEmail(email))
      nextErrors.email = "メールアドレスの形式を確認してください。";
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
    if (displayName.trim().length === 0 || displayName.trim().length > 80)
      nextErrors.displayName = "表示名は1〜80文字で入力してください。";
    if (!validateEmail(email))
      nextErrors.email = "メールアドレスの形式を確認してください。";
    if (password.length < 12 || password.length > 128)
      nextErrors.password = "パスワードは12〜128文字で入力してください。";
    setErrors(nextErrors);
    setMessage("");
    if (Object.keys(nextErrors).length > 0) return;
    setSubmitting(true);
    try {
      const result = await register({
        displayName: displayName.trim(),
        email: email.trim(),
        password
      });
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
      <PageHeader
        title="新規登録"
        description="登録後、そのまま家庭の作成または参加へ進みます。"
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
  onNavigate: (route: StaticRoute) => void;
  onLogout: () => void;
}) {
  return (
    <main className="app-shell">
      <PageHeader
        title="家庭をはじめましょう"
        description={`${user.displayName}さん、まず使う家庭を選びます。`}
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
    if (trimmed.length === 0 || trimmed.length > 80)
      nextErrors.name = "家庭名は1〜80文字で入力してください。";
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
      <PageHeader
        title="家庭へ参加"
        description="共有された招待コードを入力してください。"
      />
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

function AppFrame({
  current,
  children,
  onNavigate
}: {
  current: "/home" | "/calendar" | "/tasks" | "/shopping" | "/settings/members";
  children: ReactNode;
  onNavigate: (route: NavigationPath) => void;
}) {
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);

  return (
    <div className="app-shell app-shell--with-nav">
      <main className="app-shell__viewport">{children}</main>
      <BottomNavigation
        addOpen={isAddSheetOpen}
        current={current}
        onAdd={() => setIsAddSheetOpen(true)}
        onNavigate={onNavigate}
      />
      <BottomSheet
        open={isAddSheetOpen}
        title="追加"
        onClose={() => setIsAddSheetOpen(false)}
      >
        <div className="add-action-sheet__options">
          <button
            type="button"
            className="add-action-sheet__option motion-pressable"
            onClick={() => {
              setIsAddSheetOpen(false);
              onNavigate("/tasks/new");
            }}
          >
            家事
          </button>
          <button
            type="button"
            className="add-action-sheet__option motion-pressable"
            onClick={() => {
              setIsAddSheetOpen(false);
              onNavigate("/shopping/new");
            }}
          >
            買い物
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}

function CalendarScreen({
  household,
  onNavigate,
  onLogout
}: {
  household: Household;
  user: AuthUser;
  onNavigate: (route: NavigationPath) => void;
  onLogout: () => void;
}) {
  const initialDate = (() => {
    const queryDate = new URLSearchParams(window.location.search).get("date");
    return queryDate && /^\d{4}-\d{2}-\d{2}$/.test(queryDate)
      ? queryDate
      : todayInTimezone(household.timezone);
  })();
  const [visibleMonth, setVisibleMonth] = useState(`${initialDate.slice(0, 7)}-01`);
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [data, setData] = useState<Awaited<
    ReturnType<typeof listCalendarTasks>
  > | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const gridStart = addDays(
    visibleMonth,
    -(
      (new Date(`${visibleMonth}T00:00:00Z`).getUTCDay() - household.weekStartsOn + 7) %
      7
    )
  );
  const gridEnd = addDays(gridStart, 41);
  const gridDates = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setMessage("");
      try {
        const result = await listCalendarTasks(
          gridStart,
          gridEnd,
          selectedDate,
          signal
        );
        setData(result);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setMessage(apiErrorMessage(error));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [gridStart, gridEnd, selectedDate]
  );

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  const moveMonth = (offset: number) => {
    const current = new Date(`${visibleMonth}T00:00:00Z`);
    current.setUTCMonth(current.getUTCMonth() + offset);
    const next = current.toISOString().slice(0, 7) + "-01";
    setVisibleMonth(next);
    setSelectedDate(next);
  };
  const goToday = () => {
    const today = data?.today ?? todayInTimezone(household.timezone);
    setVisibleMonth(`${today.slice(0, 7)}-01`);
    setSelectedDate(today);
  };
  const marker = (date: string) =>
    data?.dates[date] ?? {
      fixedCount: 0,
      fixedCompletedCount: 0,
      fixedSkippedCount: 0,
      shoppingCount: 0,
      purchasedShoppingCount: 0
    };
  const selectedTitle =
    selectedDate === (data?.today ?? todayInTimezone(household.timezone))
      ? "今日のタスク"
      : `${formatCalendarDate(selectedDate)}のタスク`;
  const flexibleLabel =
    selectedDate === (data?.today ?? todayInTimezone(household.timezone));

  return (
    <AppFrame current="/calendar" onNavigate={onNavigate}>
      <PageHeader
        title="カレンダー"
        description={household.name}
        action={
          <Button variant="ghost" onClick={onLogout}>
            ログアウト
          </Button>
        }
      />
      <ErrorMessage
        message={message ? `Calendarを取得できませんでした。${message}` : ""}
      />
      <Card className="calendar-card">
        <div className="calendar-toolbar">
          <Button variant="ghost" onClick={() => moveMonth(-1)} aria-label="前月">
            ‹
          </Button>
          <h2>{formatCalendarMonth(visibleMonth)}</h2>
          <Button variant="ghost" onClick={() => moveMonth(1)} aria-label="次月">
            ›
          </Button>
        </div>
        <div className="calendar-toolbar__sub">
          <span>{loading ? "更新中…" : ""}</span>
          <Button variant="secondary" onClick={goToday}>
            今日
          </Button>
        </div>
        <div className="calendar-weekdays" aria-hidden="true">
          {Array.from(
            { length: 7 },
            (_, index) => weekdayLabels[(household.weekStartsOn + index) % 7]
          ).map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        <div
          className="calendar-grid"
          role="grid"
          aria-label={`${formatCalendarMonth(visibleMonth)}のカレンダー`}
        >
          {gridDates.map((date) => {
            const item = marker(date);
            const inMonth = date.slice(0, 7) === visibleMonth.slice(0, 7);
            const isToday =
              date === (data?.today ?? todayInTimezone(household.timezone));
            const isSelected = date === selectedDate;
            return (
              <button
                className={`calendar-cell${inMonth ? "" : " calendar-cell--outside"}${isToday ? " calendar-cell--today" : ""}${isSelected ? " calendar-cell--selected" : ""}`}
                key={date}
                type="button"
                role="gridcell"
                aria-current={isToday ? "date" : undefined}
                aria-label={`${formatCalendarDate(date)}、タスク${item.fixedCount}件、買うもの${item.shoppingCount}件`}
                aria-pressed={isSelected}
                onClick={() => {
                  setSelectedDate(date);
                  setVisibleMonth(`${date.slice(0, 7)}-01`);
                }}
              >
                <span className="calendar-cell__date">{Number(date.slice(8, 10))}</span>
                <span className="calendar-cell__markers">
                  {item.fixedCount > 0 ? (
                    <span
                      className="calendar-cell__marker"
                      aria-label={`固定タスク${item.fixedCount}件`}
                    >
                      {item.fixedCount}
                    </span>
                  ) : (
                    <span
                      className="calendar-cell__marker calendar-cell__marker--empty"
                      aria-hidden="true"
                    />
                  )}
                  {item.shoppingCount > 0 ? (
                    <span
                      className="calendar-cell__shopping-marker"
                      aria-label={`買うもの${item.shoppingCount}件`}
                    >
                      <span aria-hidden="true">買</span>
                      {item.shoppingCount}
                    </span>
                  ) : null}
                </span>
                {item.fixedCompletedCount > 0 ? (
                  <span
                    className="calendar-cell__complete"
                    aria-label={`完了${item.fixedCompletedCount}件`}
                  >
                    ✓
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </Card>
      <Card className="calendar-detail">
        <h2>{selectedTitle}</h2>
        {data ? (
          <>
            <CalendarSection
              title="固定タスク"
              tasks={data.selected.fixed}
              onNavigate={onNavigate}
              emptyTitle="固定タスクはありません"
            />
            <CalendarSection
              title={flexibleLabel ? "今週中" : "この週のタスク"}
              tasks={data.selected.weeklyFlexible}
              onNavigate={onNavigate}
              emptyTitle="週のタスクはありません"
              contextLabel={flexibleLabel ? "今週中" : "この週のタスク"}
            />
            <CalendarSection
              title={flexibleLabel ? "今月中" : "この期間のタスク"}
              tasks={data.selected.monthlyFlexible}
              onNavigate={onNavigate}
              emptyTitle="月のタスクはありません"
              contextLabel={flexibleLabel ? "今月中" : "この期間のタスク"}
            />
            {data.selected.shopping.length > 0 ? (
              <CalendarShoppingSection
                items={data.selected.shopping}
                onNavigate={onNavigate}
                timezone={household.timezone}
              />
            ) : null}
          </>
        ) : (
          <p role="status">カレンダーを読み込んでいます。</p>
        )}
      </Card>
    </AppFrame>
  );
}

function CalendarShoppingSection({
  items,
  onNavigate,
  timezone
}: {
  items: CalendarShoppingItem[];
  onNavigate: (route: NavigationPath) => void;
  timezone: string;
}) {
  return (
    <section className="calendar-detail__section" aria-label="買うもの">
      <div className="section-heading">
        <h3>買うもの</h3>
        <span>{items.length}件</span>
      </div>
      <div className="calendar-shopping-list">
        {items.map((item) => {
          const purchased = item.status === "purchased";
          const plannedLabel = item.plannedPurchaseDate
            ? `${formatShoppingPlannedDate(item.plannedPurchaseDate)}予定`
            : "予定日未定";
          return (
            <button
              className={`calendar-shopping-item${purchased ? " calendar-shopping-item--purchased" : ""}`}
              key={item.id}
              onClick={() => onNavigate(`/shopping/items/${item.id}`)}
              type="button"
              aria-label={`${item.name}、${purchased ? "購入済み" : "未購入"}、${plannedLabel}、詳細を開く`}
            >
              <span className="calendar-shopping-item__icon" aria-hidden="true">
                {purchased ? "✓" : "買"}
              </span>
              <span className="calendar-shopping-item__body">
                <strong>{item.name}</strong>
                {[item.quantity, item.note].filter(Boolean).length > 0 ? (
                  <small>
                    {[item.quantity, item.note].filter(Boolean).join(" / ")}
                  </small>
                ) : null}
                <small>{plannedLabel}</small>
                <small className="calendar-shopping-item__status">
                  {purchased ? "購入済み" : "未購入"}
                </small>
                {purchased && item.purchasedAt ? (
                  <small>
                    購入日時 {shoppingPurchaseDateTime(item.purchasedAt, timezone)}
                  </small>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function CalendarSection({
  title,
  tasks,
  onNavigate,
  emptyTitle,
  contextLabel
}: {
  title: string;
  tasks: TodayTask[];
  onNavigate: (route: NavigationPath) => void;
  emptyTitle: string;
  contextLabel?: string;
}) {
  return (
    <section className="calendar-detail__section" aria-label={title}>
      <div className="section-heading">
        <h3>{title}</h3>
        <span>{tasks.length}件</span>
      </div>
      <TaskCardList
        tasks={tasks}
        members={[]}
        emptyTitle={emptyTitle}
        onNavigate={onNavigate}
        contextLabel={contextLabel}
      />
    </section>
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

function HomeScreen({
  household,
  user,
  onNavigate,
  onLogout
}: {
  household: Household;
  user: AuthUser;
  onNavigate: (route: NavigationPath) => void;
  onLogout: () => void;
}) {
  const { data, loading, message, refresh } = useDashboardData();
  const todayTasks = data?.todayTasks ?? [];
  const weeklyTasks = data?.weeklyTasks ?? [];
  const fixedTodayTasks = todayTasks.filter(
    (task) =>
      task.modelRecurrenceType !== "weekly_flexible" &&
      task.modelRecurrenceType !== "monthly_flexible"
  );
  const weeklyFlexibleTasks = todayTasks.filter(
    (task) => task.modelRecurrenceType === "weekly_flexible"
  );
  const monthlyFlexibleTasks = todayTasks.filter(
    (task) => task.modelRecurrenceType === "monthly_flexible"
  );
  const legacyWeeklyTasks = weeklyTasks.filter(
    (task) => task.modelRecurrenceType !== "weekly_flexible"
  );
  const undone = (data?.summary.pending ?? 0) + (data?.summary.inProgress ?? 0);
  const nowTasks = todayTasks
    .filter((task) => task.status === "pending" || task.status === "in_progress")
    .slice(0, 3);
  return (
    <AppFrame current="/home" onNavigate={onNavigate}>
      <PageHeader
        title="ホーム"
        description={`${household.name} / ${user.displayName}さん`}
        action={
          <Button variant="ghost" onClick={onLogout}>
            ログアウト
          </Button>
        }
      />
      <ErrorMessage message={message} />
      <section className="dashboard-hero">
        <div>
          <p>{formatDate(data?.date ?? todayInTokyo())}</p>
          <h2>{data?.household.name ?? household.name}</h2>
          <p>
            {data?.members.map((member) => member.displayName).join("・") ??
              "メンバー確認中"}
          </p>
        </div>
        <div className="summary-count">
          <span>今日の未完了</span>
          <strong>{loading ? "..." : `${undone}件`}</strong>
        </div>
      </section>
      <div className="section-heading">
        <h2>今やること</h2>
        <Button variant="ghost" onClick={() => void refresh()}>
          更新
        </Button>
      </div>
      <TaskCardList
        tasks={nowTasks}
        members={data?.members ?? []}
        emptyTitle="今すぐのタスクはありません"
        onNavigate={onNavigate}
      />
      <SectionCard title="今日のタスク" loading={loading}>
        <TaskCardList
          tasks={fixedTodayTasks}
          members={data?.members ?? []}
          emptyTitle="今日のタスクはありません"
          emptyDescription="ゆっくり過ごしましょう"
          onNavigate={onNavigate}
        />
      </SectionCard>
      <SectionCard title="今週中" loading={loading}>
        <TaskCardList
          tasks={weeklyFlexibleTasks}
          members={data?.members ?? []}
          emptyTitle="今週中のタスクはありません"
          onNavigate={onNavigate}
        />
      </SectionCard>
      <SectionCard title="今月中" loading={loading}>
        <TaskCardList
          tasks={monthlyFlexibleTasks}
          members={data?.members ?? []}
          emptyTitle="今月中のタスクはありません"
          onNavigate={onNavigate}
        />
      </SectionCard>
      {legacyWeeklyTasks.length > 0 ? (
        <SectionCard title="週に複数回（旧形式）" loading={loading}>
          {legacyWeeklyTasks.length === 0 ? (
            <EmptyState
              title="今週中のタスクはありません"
              description="必要なときにタスクを追加できます。"
            />
          ) : (
            <div className="task-list">
              {legacyWeeklyTasks.map((task) => (
                <WeeklyTaskCard key={task.id} task={task} onNavigate={onNavigate} />
              ))}
            </div>
          )}
        </SectionCard>
      ) : null}
      <SectionCard title="買い物" loading={loading}>
        <div className="shopping-preview">
          <strong>未購入 {data?.shopping.pendingCount ?? 0}件</strong>
          {(data?.shopping.previewItems ?? []).length > 0 ? (
            <ul>
              {data!.shopping.previewItems.map((item) => (
                <li key={item.id}>
                  {item.name}
                  {item.quantity ? ` / ${item.quantity}` : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p>今のところ買うものはありません。</p>
          )}
          <Button variant="secondary" onClick={() => onNavigate("/shopping")}>
            買い物を確認
          </Button>
        </div>
      </SectionCard>
    </AppFrame>
  );
}

function SectionCard({
  title,
  loading,
  children
}: {
  title: string;
  loading?: boolean;
  children: ReactNode;
}) {
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

function TaskCardList({
  tasks,
  members,
  emptyTitle,
  emptyDescription = "時間のあるときに確認しましょう。",
  onNavigate,
  contextLabel
}: {
  tasks: TodayTask[];
  members: Array<Pick<HouseholdMember, "userId" | "displayName" | "color">>;
  emptyTitle: string;
  emptyDescription?: string;
  onNavigate: (route: NavigationPath) => void;
  contextLabel?: string;
}) {
  if (tasks.length === 0)
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  return (
    <div className="task-list">
      {tasks.map((task) => (
        <TodayTaskCard
          key={task.id}
          task={task}
          members={members}
          onNavigate={onNavigate}
          contextLabel={contextLabel}
        />
      ))}
    </div>
  );
}

function TodayTaskCard({
  task,
  members,
  onNavigate,
  contextLabel
}: {
  task: TodayTask;
  members: Array<Pick<HouseholdMember, "userId" | "displayName" | "color">>;
  onNavigate: (route: NavigationPath) => void;
  contextLabel?: string;
}) {
  const assignedMember = task.assignedUserId
    ? members.find((member) => member.userId === task.assignedUserId)
    : null;
  return (
    <button
      className="task-card"
      onClick={() => onNavigate(`/tasks/${task.id}`)}
      type="button"
    >
      <span className="task-icon" aria-hidden="true">
        {taskIcon(task.recurrenceType)}
      </span>
      <span className="task-card__body">
        <strong>{task.title}</strong>
        <small>
          {contextLabel ??
            (task.modelRecurrenceType === "weekly_flexible"
              ? "今週中"
              : task.modelRecurrenceType === "monthly_flexible"
                ? "今月中"
                : formatSchedule(task.deadlineTime ?? task.scheduledTime))}{" "}
          / 担当: {assignedMember?.displayName ?? assignmentLabels[task.assignmentType]}
        </small>
        {task.deadlineDate ? (
          <small>
            {formatDate(task.deadlineDate)}{" "}
            {task.deadlineTime ? `${task.deadlineTime}まで` : ""}
          </small>
        ) : null}
        {(task.completedCount ?? 0) > 0 &&
        (task.modelRecurrenceType === "weekly_flexible" ||
          task.modelRecurrenceType === "monthly_flexible") ? (
          <small>{task.completedCount}回実施</small>
        ) : null}
        {task.overdue ? <small className="overdue-label">期限超過</small> : null}
        {task.actedBy ? (
          <small>
            {statusLabels[task.status]}: {actorName(task.actedBy)}
          </small>
        ) : null}
      </span>
      <StatusBadge status={task.status} overdue={task.overdue} />
    </button>
  );
}

function WeeklyTaskCard({
  task,
  onNavigate
}: {
  task: WeeklyTask;
  onNavigate: (route: NavigationPath) => void;
}) {
  const progress =
    task.targetCount > 0
      ? Math.min(task.completedCount / task.targetCount, 1) * 100
      : 0;
  return (
    <button
      className="task-card"
      onClick={() => onNavigate(`/tasks/${task.id}`)}
      type="button"
    >
      <span className="task-icon" aria-hidden="true">
        {taskIcon(task.recurrenceType)}
      </span>
      <span className="task-card__body">
        <strong>{task.title}</strong>
        <small>
          {task.completedCount} / {task.targetCount}回完了 ・ あと{task.remainingCount}
          回
        </small>
        <span className="progress">
          <span style={{ width: `${progress}%` }} />
        </span>
      </span>
      <StatusBadge status={task.status} />
    </button>
  );
}

function StatusBadge({
  status,
  overdue = false
}: {
  status: TaskDisplayStatus;
  overdue?: boolean;
}) {
  return (
    <span className={`status-badge status-badge--${overdue ? "overdue" : status}`}>
      {overdue ? "期限超過" : statusLabels[status]}
    </span>
  );
}

function TaskListScreen({
  onNavigate,
  onLogout
}: {
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
    [
      "今回だけ",
      tasks.filter((task) => task.active && task.modelRecurrenceType === "once")
    ],
    [
      "毎日",
      tasks.filter((task) => task.active && task.modelRecurrenceType === "daily")
    ],
    [
      "曜日を決める",
      tasks.filter((task) => task.active && task.modelRecurrenceType === "weekly_fixed")
    ],
    [
      "毎月○日",
      tasks.filter(
        (task) => task.active && task.modelRecurrenceType === "monthly_fixed"
      )
    ],
    [
      "週1回・日付不定",
      tasks.filter(
        (task) => task.active && task.modelRecurrenceType === "weekly_flexible"
      )
    ],
    [
      "月1回・日付不定",
      tasks.filter(
        (task) => task.active && task.modelRecurrenceType === "monthly_flexible"
      )
    ],
    [
      "週に複数回（旧形式）",
      tasks.filter(
        (task) =>
          task.active && !task.modelRecurrenceType && task.recurrenceType === "weekly"
      )
    ],
    ["無効なタスク", tasks.filter((task) => !task.active)]
  ];
  return (
    <AppFrame current="/tasks" onNavigate={onNavigate}>
      <PageHeader
        title="タスク"
        description="家事の登録と編集"
        action={
          <div className="inline-actions">
            <Button variant="secondary" onClick={() => onNavigate("/tasks/templates")}>
              テンプレート
            </Button>
            <Button variant="ghost" onClick={onLogout}>
              ログアウト
            </Button>
          </div>
        }
      />
      <ErrorMessage message={message} />
      <Button onClick={() => onNavigate("/tasks/new")}>＋ タスクを追加</Button>
      {loading ? (
        <p role="status">タスクを読み込んでいます。</p>
      ) : (
        groups.map(([title, items]) => (
          <Card key={title}>
            <div className="section-heading">
              <h2>{title}</h2>
              <span>{items.length}件</span>
            </div>
            {items.length === 0 ? (
              <EmptyState
                title={`${title}はありません`}
                description="必要になったら追加できます。"
              />
            ) : (
              <div className="task-list">
                {items.map((task) => (
                  <TaskManagementCard
                    key={task.id}
                    task={task}
                    onNavigate={onNavigate}
                    onChanged={() => void refresh()}
                  />
                ))}
              </div>
            )}
          </Card>
        ))
      )}
    </AppFrame>
  );
}

function TaskManagementCard({
  task,
  onNavigate,
  onChanged
}: {
  task: Task;
  onNavigate: (route: NavigationPath) => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const disable = async () => {
    if (
      !window.confirm(
        "このタスクを今後の一覧に表示しないようにします。過去の履歴は残ります。"
      )
    )
      return;
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
        <small>{recurrenceDescription(task)}</small>
        <small>
          {assignmentLabels[task.assignmentType]} /{" "}
          {task.modelRecurrenceType
            ? notificationPresetLabel(task.notificationOffsetMinutes ?? null)
            : notificationLabels[task.notificationSlot]}{" "}
          / {task.active ? "有効" : "無効"}
        </small>
      </div>
      <div className="inline-actions">
        <Button variant="ghost" onClick={() => onNavigate(`/tasks/${task.id}`)}>
          詳細
        </Button>
        <Button
          variant="secondary"
          onClick={() => onNavigate(`/tasks/${task.id}/edit`)}
        >
          編集
        </Button>
        {task.active ? (
          <Button variant="danger" disabled={busy} onClick={() => void disable()}>
            {busy ? "処理中" : "無効化"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function TaskFormScreen({
  household,
  mode,
  taskId,
  templateId,
  onNavigate
}: {
  household: Household;
  user: AuthUser;
  mode: "create" | "edit" | "template-edit";
  taskId?: string;
  templateId?: string;
  onNavigate: (route: NavigationPath) => void;
  onLogout: () => void;
}) {
  const templateMode = mode === "template-edit";
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [recentTasks, setRecentTasks] = useState<Task[]>([]);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [form, setForm] = useState<TaskFormState>(() => defaultTaskForm());
  const [originalForm, setOriginalForm] = useState<TaskFormState | null>(null);
  const [errors, setErrors] = useState<TaskFormErrors>({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(mode !== "create");
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    listMembers(controller.signal)
      .then((result) => setMembers(result.members))
      .catch(() => undefined);
    if (mode === "create") {
      Promise.all([
        listRecentTaskDefinitions(8, controller.signal),
        listTaskTemplates(controller.signal)
      ])
        .then(([recent, templateResult]) => {
          setRecentTasks(recent.tasks);
          setTemplates(templateResult.templates.filter((template) => template.active));
        })
        .catch((error) => {
          if (!(error instanceof DOMException && error.name === "AbortError"))
            setMessage(apiErrorMessage(error));
        })
        .finally(() => setLoading(false));
    }
    if (mode === "edit" && taskId) {
      getTask(taskId, controller.signal)
        .then((result) => {
          const next = taskToFormState(result.task);
          setForm(next);
          setOriginalForm(next);
        })
        .catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setMessage(apiErrorMessage(error));
        })
        .finally(() => setLoading(false));
    }
    if (templateMode && templateId) {
      getTaskTemplate(templateId, controller.signal)
        .then((result) => {
          const next = taskTemplateToFormState(result.template);
          setForm(next);
          setOriginalForm(next);
        })
        .catch((error) => {
          if (!(error instanceof DOMException && error.name === "AbortError"))
            setMessage(apiErrorMessage(error));
        })
        .finally(() => setLoading(false));
    }
    return () => controller.abort();
  }, [mode, taskId, templateId, templateMode]);
  const setField = <K extends keyof TaskFormState>(key: K, value: TaskFormState[K]) => {
    setForm((current) => normalizeTaskForm({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors = validateTaskFormState(form, { template: templateMode });
    setErrors(nextErrors);
    setMessage("");
    if (Object.keys(nextErrors).length > 0) return;
    setSubmitting(true);
    try {
      if (templateMode && templateId) {
        const payload = taskFormToTemplatePayload(form);
        const originalPayload = originalForm
          ? taskFormToTemplatePayload(originalForm)
          : null;
        const patch = originalPayload
          ? Object.fromEntries(
              Object.entries(payload).filter(
                ([key, value]) =>
                  JSON.stringify(value) !==
                  JSON.stringify(originalPayload[key as keyof typeof originalPayload])
              )
            )
          : payload;
        await updateTaskTemplate(templateId, patch);
        onNavigate("/tasks/templates");
      } else {
        const payload = taskFormToPayload(form);
        const originalPayload = originalForm ? taskFormToPayload(originalForm) : null;
        const patch = originalPayload
          ? Object.fromEntries(
              Object.entries(payload).filter(
                ([key, value]) =>
                  JSON.stringify(value) !==
                  JSON.stringify(originalPayload[key as keyof typeof originalPayload])
              )
            )
          : payload;
        const result =
          mode === "edit" && taskId
            ? await updateTask(taskId, patch)
            : await createTask(payload);
        onNavigate(`/tasks/${result.task.id}`);
      }
    } catch (error) {
      setMessage(apiErrorMessage(error));
      if (error instanceof ApiError && error.details) setErrors(error.details);
    } finally {
      setSubmitting(false);
    }
  };
  if (loading) return <LoadingScreen message="タスクを読み込んでいます" />;
  const applyReuseForm = (next: TaskFormState) => {
    const assigneeAvailable =
      !next.assignedUserId ||
      members.some((member) => member.userId === next.assignedUserId);
    setForm({
      ...next,
      startDate: "",
      targetDate: "",
      assignedUserId: assigneeAvailable ? next.assignedUserId : null
    });
    setErrors(
      assigneeAvailable ? {} : { assignedUserId: "担当メンバーを選択してください。" }
    );
  };
  return (
    <AppFrame current="/tasks" onNavigate={onNavigate}>
      <PageHeader
        title={
          mode === "create"
            ? "タスクを追加"
            : templateMode
              ? "テンプレートを編集"
              : "タスクを編集"
        }
        description={household.name}
      />
      {mode === "create" ? (
        <TaskReusePanel
          recentTasks={recentTasks}
          templates={templates}
          onRecentSelect={(task) => applyReuseForm(taskToFormState(task))}
          onTemplateSelect={(template) =>
            applyReuseForm(taskTemplateToFormState(template))
          }
        />
      ) : null}
      <Card>
        <form
          className="stack"
          aria-busy={submitting}
          onSubmit={(event) => void submit(event)}
        >
          <ErrorMessage message={message} />
          <FormField id="task-title" label="タスク名（必須）" error={errors.title}>
            <TextInput
              id="task-title"
              error={errors.title}
              value={form.title}
              onChange={(value) => setField("title", value)}
            />
          </FormField>
          <FormField id="task-description" label="説明" error={errors.description}>
            <textarea
              id="task-description"
              value={form.description}
              onChange={(event) => setField("description", event.target.value)}
            />
          </FormField>
          {form.recurrence === "legacy_weekly" ? (
            <div className="legacy-task-notice" role="note">
              <strong>週に{form.weeklyTargetCount}回（旧形式）</strong>
              <span>
                回数の意味を変えずに編集します。新しい「週1回・日付不定」には自動変換しません。
              </span>
            </div>
          ) : (
            <SelectField
              id="task-type"
              label="繰り返し"
              value={form.recurrence}
              onChange={(value) =>
                setForm((current) =>
                  changeTaskFormRecurrence(current, value as TaskFormRecurrence)
                )
              }
            >
              <option value="once">今回だけ</option>
              <option value="daily">毎日</option>
              <option value="weekly_fixed">曜日を決める</option>
              <option value="monthly_fixed">毎月○日</option>
              <option value="weekly_flexible">週1回・日付不定</option>
              <option value="monthly_flexible">月1回・日付不定</option>
            </SelectField>
          )}
          {form.recurrence === "weekly_flexible" ? (
            <p className="field-hint">週の中で1回やれば完了です。</p>
          ) : null}
          {form.recurrence === "monthly_flexible" ? (
            <p className="field-hint">月の中で1回やれば完了です。</p>
          ) : null}
          {!templateMode && form.recurrence === "once" ? (
            <FormField
              id="task-target-date"
              label="実施日（必須）"
              error={errors.targetDate}
            >
              <input
                id="task-target-date"
                type="date"
                value={form.targetDate}
                aria-describedby={
                  errors.targetDate ? "task-target-date-error" : undefined
                }
                aria-invalid={errors.targetDate ? "true" : "false"}
                onChange={(event) => setField("targetDate", event.target.value)}
              />
            </FormField>
          ) : !templateMode && form.recurrence !== "legacy_weekly" ? (
            <FormField id="task-start-date" label="開始日" error={errors.startDate}>
              <input
                id="task-start-date"
                type="date"
                value={form.startDate}
                onChange={(event) => setField("startDate", event.target.value)}
              />
              <span className="field-hint">未指定なら今日から</span>
            </FormField>
          ) : null}
          {form.recurrence === "weekly_fixed" ? (
            <div className="form-field">
              <span className="field-label" id="task-weekdays-label">
                曜日（必須）
              </span>
              <div
                className="weekday-picker"
                role="group"
                aria-labelledby="task-weekdays-label"
                aria-describedby={errors.weekdays ? "task-weekdays-error" : undefined}
              >
                {weekdayLabels.map((label, day) => {
                  const selected = form.weekdays.includes(day);
                  return (
                    <button
                      aria-pressed={selected}
                      key={label}
                      type="button"
                      onClick={() =>
                        setField(
                          "weekdays",
                          selected
                            ? form.weekdays.filter((item) => item !== day)
                            : [...form.weekdays, day]
                        )
                      }
                    >
                      {selected ? "✓ " : ""}
                      {label}
                    </button>
                  );
                })}
              </div>
              {errors.weekdays ? (
                <p className="field-error" id="task-weekdays-error">
                  {errors.weekdays}
                </p>
              ) : null}
            </div>
          ) : null}
          {form.recurrence === "monthly_fixed" ? (
            <FormField
              id="task-monthly-day"
              label="実施日（1〜31日）"
              error={errors.monthlyDayOfMonth}
            >
              <input
                id="task-monthly-day"
                type="number"
                min="1"
                max="31"
                value={form.monthlyDayOfMonth ?? ""}
                aria-describedby={
                  errors.monthlyDayOfMonth ? "task-monthly-day-error" : undefined
                }
                onChange={(event) =>
                  setField(
                    "monthlyDayOfMonth",
                    event.target.value ? Number(event.target.value) : null
                  )
                }
              />
              <span className="field-hint">
                その月に日付がない場合は月末になります。
              </span>
            </FormField>
          ) : null}
          {form.recurrence === "weekly_flexible" ? (
            <SelectField
              id="task-weekly-deadline"
              label="締め切り曜日（今週いつまでにやるか）"
              value={String(form.weeklyDeadlineWeekday)}
              error={errors.weeklyDeadlineWeekday}
              onChange={(value) => setField("weeklyDeadlineWeekday", Number(value))}
            >
              {weekdayLabels.map((label, day) => (
                <option key={label} value={day}>
                  {label}曜日
                </option>
              ))}
            </SelectField>
          ) : null}
          {form.recurrence === "monthly_flexible" ? (
            <fieldset
              className="choice-field"
              aria-describedby={
                errors.monthlyDayOfMonth ? "task-monthly-rule-error" : undefined
              }
            >
              <legend>締め切り日</legend>
              <label>
                <input
                  type="radio"
                  name="monthly-deadline"
                  checked={form.monthlyDeadlineType === "month_end"}
                  onChange={() => setField("monthlyDeadlineType", "month_end")}
                />
                月末
              </label>
              <label>
                <input
                  type="radio"
                  name="monthly-deadline"
                  checked={form.monthlyDeadlineType === "day_of_month"}
                  onChange={() => setField("monthlyDeadlineType", "day_of_month")}
                />
                日付指定
              </label>
              {form.monthlyDeadlineType === "day_of_month" ? (
                <input
                  id="task-monthly-deadline-day"
                  type="number"
                  min="1"
                  max="31"
                  aria-label="締め切り日の日付"
                  value={form.monthlyDayOfMonth ?? ""}
                  onChange={(event) =>
                    setField(
                      "monthlyDayOfMonth",
                      event.target.value ? Number(event.target.value) : null
                    )
                  }
                />
              ) : null}
              {errors.monthlyDayOfMonth ? (
                <p className="field-error" id="task-monthly-rule-error">
                  {errors.monthlyDayOfMonth}
                </p>
              ) : null}
            </fieldset>
          ) : null}
          {form.recurrence === "legacy_weekly" ? (
            <>
              <FormField
                id="task-weekly-count"
                label="週内必要回数（2〜7）"
                error={errors.weeklyTargetCount}
              >
                <input
                  id="task-weekly-count"
                  min="2"
                  max="7"
                  type="number"
                  value={form.weeklyTargetCount}
                  onChange={(event) =>
                    setField("weeklyTargetCount", Number(event.target.value))
                  }
                />
              </FormField>
              <FormField id="task-notification-time" label="通知時刻（旧形式）">
                <input
                  id="task-notification-time"
                  type="time"
                  value={form.legacyNotificationTime}
                  onChange={(event) =>
                    setField("legacyNotificationTime", event.target.value)
                  }
                />
              </FormField>
            </>
          ) : (
            <>
              <FormField
                id="task-deadline-time"
                label="締め切り時刻"
                error={errors.deadlineTime}
              >
                <input
                  id="task-deadline-time"
                  type="time"
                  value={form.deadlineTime}
                  onChange={(event) =>
                    setForm((current) =>
                      normalizeTaskForm({
                        ...current,
                        deadlineTime: event.target.value,
                        notificationOffsetMinutes: event.target.value
                          ? current.notificationOffsetMinutes
                          : null
                      })
                    )
                  }
                />
              </FormField>
              <SelectField
                id="task-notification-offset"
                label="通知"
                value={
                  form.notificationOffsetMinutes === null
                    ? "none"
                    : String(form.notificationOffsetMinutes)
                }
                error={errors.notificationOffsetMinutes}
                disabled={!form.deadlineTime}
                onChange={(value) =>
                  setField(
                    "notificationOffsetMinutes",
                    value === "none" ? null : Number(value)
                  )
                }
              >
                <option value="none">通知なし</option>
                <option value="0">締め切り時刻</option>
                <option value="5">5分前</option>
                <option value="10">10分前</option>
                <option value="30">30分前</option>
                <option value="60">1時間前</option>
                <option value="120">2時間前</option>
              </SelectField>
              {!form.deadlineTime ? (
                <p className="field-hint">
                  通知を使うには締め切り時刻を設定してください。
                </p>
              ) : null}
            </>
          )}
          <SelectField
            id="task-assignment"
            label="担当"
            value={form.assignmentType}
            onChange={(value) =>
              setField("assignmentType", value as TaskFormState["assignmentType"])
            }
          >
            <option value="anyone">どちらでも</option>
            <option value="specific">特定のメンバー</option>
          </SelectField>
          {form.assignmentType === "specific" ? (
            <SelectField
              id="task-assignee"
              label="担当メンバー（必須）"
              value={form.assignedUserId ?? ""}
              error={errors.assignedUserId}
              onChange={(value) => setField("assignedUserId", value || null)}
            >
              <option value="">選択してください</option>
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.displayName}
                </option>
              ))}
            </SelectField>
          ) : null}
          <Button disabled={submitting} type="submit">
            {submitting ? <InlineLoading /> : "保存する"}
          </Button>
          {templateMode ? (
            <Button variant="ghost" onClick={() => onNavigate("/tasks/templates")}>
              一覧へ戻る
            </Button>
          ) : null}
        </form>
      </Card>
    </AppFrame>
  );
}

function SelectField({
  id,
  label,
  value,
  error,
  onChange,
  children,
  hidden,
  disabled
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  children: ReactNode;
  hidden?: boolean;
  disabled?: boolean;
}) {
  return (
    <div hidden={hidden}>
      <FormField id={id} label={label} error={error}>
        <select
          id={id}
          disabled={disabled}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={error ? `${id}-error` : undefined}
          aria-invalid={error ? "true" : "false"}
        >
          {children}
        </select>
      </FormField>
    </div>
  );
}

function taskTemplateRecurrenceDescription(template: TaskTemplate): string {
  return recurrenceDescription({
    modelRecurrenceType: template.modelRecurrenceType,
    recurrenceType: template.modelRecurrenceType,
    weekdays: template.weekdays,
    monthlyDayOfMonth: template.monthlyDayOfMonth,
    weeklyDeadlineWeekday: template.weeklyDeadlineWeekday,
    monthlyDeadlineType: template.monthlyDeadlineType
  });
}

function TaskReusePanel({
  recentTasks,
  templates,
  onRecentSelect,
  onTemplateSelect
}: {
  recentTasks: Task[];
  templates: TaskTemplate[];
  onRecentSelect: (task: Task) => void;
  onTemplateSelect: (template: TaskTemplate) => void;
}) {
  return (
    <div className="task-reuse-grid">
      <Card className="task-reuse-card">
        <div className="section-heading">
          <h2>最近使ったタスク</h2>
          <span>{recentTasks.length}件</span>
        </div>
        {recentTasks.length === 0 ? (
          <p className="field-hint">作成したタスクがここに表示されます。</p>
        ) : (
          <div className="task-reuse-list">
            {recentTasks.map((task) => (
              <button
                className="task-reuse-item"
                key={task.id}
                type="button"
                onClick={() => onRecentSelect(task)}
              >
                <strong>{task.title}</strong>
                <small>{recurrenceDescription(task)}</small>
              </button>
            ))}
          </div>
        )}
      </Card>
      <Card className="task-reuse-card">
        <div className="section-heading">
          <h2>テンプレート</h2>
          <span>{templates.length}件</span>
        </div>
        {templates.length === 0 ? (
          <p className="field-hint">タスク詳細から設定を保存できます。</p>
        ) : (
          <div className="task-reuse-list">
            {templates.map((template) => (
              <button
                className="task-reuse-item"
                key={template.id}
                type="button"
                onClick={() => onTemplateSelect(template)}
              >
                <strong>{template.title}</strong>
                <small>
                  {taskTemplateRecurrenceDescription(template)}
                  {template.deadlineTime ? ` / ${template.deadlineTime}まで` : ""}
                </small>
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function TaskDetailScreen({
  household,
  user,
  taskId,
  compact,
  onNavigate
}: {
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
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
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
    },
    [taskId]
  );
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);
  const scopedTask = todayTask ?? weeklyTask;
  const visibleTask = task ? { ...(scopedTask ?? {}), ...task } : scopedTask;
  const status = scopedTask?.status ?? "pending";
  const actedBy = todayTask?.actedBy ?? weeklyTask?.latestAction?.actedBy ?? null;
  const runAction = async (action: "start" | "complete" | "skip" | "reset") => {
    if (!visibleTask) return;
    if (
      action === "reset" &&
      !window.confirm("この記録を取り消して未完了に戻しますか？")
    )
      return;
    setBusyAction(action);
    setMessage("");
    setSuccess("");
    try {
      await changeTaskState(visibleTask.id, action, {
        ...taskActionScope(visibleTask, household),
        note: action === "skip" ? skipNote : null
      });
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
  const saveAsTemplate = async () => {
    if (!task) return;
    const payload = taskToTemplatePayload(task);
    if (!payload) return;
    setBusyAction("template");
    setMessage("");
    try {
      await createTaskTemplate(payload);
      onNavigate("/tasks/templates");
    } catch (error) {
      setMessage(apiErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  };
  if (loading) return <LoadingScreen message="タスクを読み込んでいます" />;
  if (!visibleTask) {
    return (
      <AppFrame current="/tasks" onNavigate={onNavigate}>
        <ErrorMessage message={message || "このタスクは見つかりませんでした。"} />
      </AppFrame>
    );
  }
  const mine = actedBy?.userId === user.id;
  const otherInProgress = status === "in_progress" && !mine;
  return (
    <AppFrame current="/tasks" onNavigate={onNavigate}>
      <PageHeader
        title={compact ? "タスク回答" : "タスク詳細"}
        description={household.name}
      />
      <ErrorMessage message={message} />
      <SuccessMessage message={success} />
      <Card>
        <div className="detail-title">
          <span className="task-icon" aria-hidden="true">
            {taskIcon(visibleTask.recurrenceType)}
          </span>
          <div>
            <h2>{visibleTask.title}</h2>
            <StatusBadge status={status} overdue={Boolean(todayTask?.overdue)} />
          </div>
        </div>
        {visibleTask.description ? <p>{visibleTask.description}</p> : null}
        <dl className="detail-grid">
          <div>
            <dt>繰り返し</dt>
            <dd>{recurrenceDescription(visibleTask)}</dd>
          </div>
          {visibleTask.startDate ? (
            <div>
              <dt>開始日</dt>
              <dd>{formatDate(visibleTask.startDate)}</dd>
            </div>
          ) : null}
          <div>
            <dt>締め切り</dt>
            <dd>
              {visibleTask.modelRecurrenceType
                ? taskDeadlineLabel(visibleTask)
                : formatSchedule(visibleTask.scheduledTime)}
            </dd>
          </div>
          <div>
            <dt>通知</dt>
            <dd>
              {visibleTask.modelRecurrenceType
                ? notificationPresetLabel(visibleTask.notificationOffsetMinutes ?? null)
                : notificationLabels[visibleTask.notificationSlot]}
            </dd>
          </div>
          {(todayTask?.completedCount ?? 0) > 0 &&
          (visibleTask.modelRecurrenceType === "weekly_flexible" ||
            visibleTask.modelRecurrenceType === "monthly_flexible") ? (
            <div>
              <dt>今期の実施</dt>
              <dd>{todayTask?.completedCount}回実施</dd>
            </div>
          ) : null}
          {todayTask?.overdue ? (
            <div>
              <dt>状態</dt>
              <dd className="overdue-label">期限超過</dd>
            </div>
          ) : null}
          <div>
            <dt>担当</dt>
            <dd>{assignmentLabels[visibleTask.assignmentType]}</dd>
          </div>
          {actedBy ? (
            <div>
              <dt>対応者</dt>
              <dd>{actorName(actedBy)}</dd>
            </div>
          ) : null}
        </dl>
      </Card>
      <Card>
        <h2>操作</h2>
        {otherInProgress ? <p>{actorName(actedBy)}さんが対応中です。</p> : null}
        {status === "completed" && actedBy ? (
          <p>
            {actorName(actedBy)}さんが
            {formatDateTime(
              todayTask?.completedAt ?? weeklyTask?.latestAction?.completedAt ?? null
            )}
            に完了しました。
          </p>
        ) : null}
        {status === "skipped" && actedBy ? (
          <p>{actorName(actedBy)}さんが今日はパスしました。</p>
        ) : null}
        <div className="stack">
          {(status !== "completed" ||
            visibleTask.modelRecurrenceType === "weekly_flexible" ||
            visibleTask.modelRecurrenceType === "monthly_flexible") &&
          !otherInProgress ? (
            <Button
              disabled={busyAction !== null}
              onClick={() => void runAction("complete")}
            >
              {busyAction === "complete" ? (
                <InlineLoading />
              ) : status === "completed" ? (
                "もう一度実施"
              ) : (
                "完了しました"
              )}
            </Button>
          ) : null}
          {status === "pending" ? (
            <Button
              variant="secondary"
              disabled={busyAction !== null}
              onClick={() => void runAction("start")}
            >
              今からやります
            </Button>
          ) : null}
          {status === "pending" || (status === "in_progress" && mine) ? (
            <>
              <FormField id="skip-note" label="パス理由（任意）">
                <textarea
                  id="skip-note"
                  maxLength={500}
                  value={skipNote}
                  onChange={(event) => setSkipNote(event.target.value)}
                />
              </FormField>
              <Button
                variant="ghost"
                disabled={busyAction !== null}
                onClick={() => void runAction("skip")}
              >
                パスする
              </Button>
            </>
          ) : null}
          {(status === "in_progress" && mine) ||
          status === "completed" ||
          status === "skipped" ? (
            <Button
              variant="danger"
              disabled={busyAction !== null}
              onClick={() => void runAction("reset")}
            >
              対応を取り消す
            </Button>
          ) : null}
          {!compact ? (
            <Button
              variant="secondary"
              onClick={() => onNavigate(`/tasks/${visibleTask.id}/edit`)}
            >
              編集する
            </Button>
          ) : null}
          {!compact && visibleTask.modelRecurrenceType ? (
            <Button
              variant="ghost"
              disabled={busyAction !== null}
              onClick={() => void saveAsTemplate()}
            >
              {busyAction === "template" ? <InlineLoading /> : "テンプレートとして保存"}
            </Button>
          ) : null}
        </div>
      </Card>
      {!compact ? (
        <HistoryCard
          records={history}
          onEdit={() => onNavigate(`/tasks/${taskId}/edit`)}
        />
      ) : null}
    </AppFrame>
  );
}

function HistoryCard({
  records,
  onEdit
}: {
  records: TaskRecord[];
  onEdit: () => void;
}) {
  return (
    <Card>
      <h2>最近の履歴</h2>
      <Button variant="secondary" onClick={onEdit}>
        元のタスク設定を編集
      </Button>
      {records.length === 0 ? (
        <EmptyState
          title="まだ履歴はありません"
          description="操作するとここに表示されます。"
        />
      ) : (
        <ul className="history-list">
          {records.map((record) => (
            <li key={record.id}>
              <strong>
                {actorName(record.actedBy)}さんが{statusLabels[record.status]}しました
              </strong>
              <span>
                {record.targetDate ?? record.targetWeekStart} /{" "}
                {formatDateTime(record.updatedAt)}
              </span>
              {record.note ? <p>理由: {record.note}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function TaskTemplateListScreen({
  household,
  onNavigate
}: {
  household: Household;
  user: AuthUser;
  onNavigate: (route: NavigationPath) => void;
  onLogout: () => void;
}) {
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const result = await listTaskTemplates(signal);
      setTemplates(result.templates.filter((template) => template.active));
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        setMessage(apiErrorMessage(error));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);
  const deactivate = async (template: TaskTemplate) => {
    if (
      !window.confirm(
        "このテンプレートを無効化しますか？作成済みのタスクには影響しません。"
      )
    )
      return;
    setBusy(template.id);
    setMessage("");
    setSuccess("");
    try {
      await deactivateTaskTemplate(template.id);
      await refresh();
      setSuccess("テンプレートを無効化しました。");
    } catch (error) {
      setMessage(apiErrorMessage(error));
    } finally {
      setBusy(null);
    }
  };
  return (
    <AppFrame current="/tasks" onNavigate={onNavigate}>
      <PageHeader
        title="タスクテンプレート"
        description={household.name}
        action={<Button onClick={() => onNavigate("/tasks/new")}>タスクを追加</Button>}
      />
      <ErrorMessage message={message} />
      <SuccessMessage message={success} />
      <Card>
        {loading ? (
          <p role="status">テンプレートを読み込んでいます。</p>
        ) : templates.length === 0 ? (
          <EmptyState
            title="テンプレートはまだありません"
            description="タスク詳細から設定を保存できます。"
          />
        ) : (
          <div className="template-list">
            {templates.map((template) => (
              <article className="management-card" key={template.id}>
                <div>
                  <strong>{template.title}</strong>
                  <small>{taskTemplateRecurrenceDescription(template)}</small>
                  <small>
                    {template.deadlineTime ? `${template.deadlineTime}まで / ` : ""}
                    {notificationPresetLabel(template.notificationOffsetMinutes)}
                  </small>
                </div>
                <div className="inline-actions">
                  <Button onClick={() => onNavigate("/tasks/new")}>
                    作成画面で使う
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => onNavigate(`/tasks/templates/${template.id}/edit`)}
                  >
                    編集
                  </Button>
                  <Button
                    variant="danger"
                    disabled={busy === template.id}
                    onClick={() => void deactivate(template)}
                  >
                    無効化
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </Card>
      <Button variant="ghost" onClick={() => onNavigate("/tasks")}>
        タスク一覧へ戻る
      </Button>
    </AppFrame>
  );
}

function MembersScreen({
  household,
  user,
  onNavigate,
  onLogout
}: {
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
    listMembers(controller.signal)
      .then((result) => setMembers(result.members))
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setMessage(apiErrorMessage(error));
      })
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
      setMessage(apiErrorMessage(error));
    } finally {
      setIssuing(false);
    }
  };
  return (
    <AppFrame current="/settings/members" onNavigate={onNavigate}>
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
                <MemberAvatar
                  color={member.color}
                  imageUrl={member.avatarUrl}
                  name={member.displayName}
                />
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
      <ProfileImageSection user={user} />
      <ImageUsageSection />
      <NotificationSettingsSection />
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
                <Button
                  variant="secondary"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(invite.code)
                      .then(() => setSuccess("招待コードをコピーしました。"))
                      .catch(() => setMessage("コピーできませんでした。"));
                  }}
                >
                  コピー
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <p>招待コードを発行できるのは owner だけです。</p>
        )}
      </Card>
    </AppFrame>
  );
}

function ProfileImageSection({ user }: { user: AuthUser }) {
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl]
  );
  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setMessage("");
    setSuccess("");
    const nextPreview = URL.createObjectURL(file);
    setPreviewUrl(nextPreview);
    try {
      const processed = await processShoppingImage(file);
      setBusy(true);
      const result = await uploadProfileImage(processed);
      setAvatarUrl(result.avatarUrl);
      setSuccess("プロフィール画像を保存しました。");
    } catch (error) {
      setMessage(
        error instanceof Error && error.message === "source-image-too-large"
          ? "元画像は10MB以下にしてください。"
          : "プロフィール画像を保存できませんでした。JPEG/PNG/WebP、10MB以下の画像を選択してください。要求形式へ変換できない画像は使用できません。"
      );
    } finally {
      setBusy(false);
      setPreviewUrl(null);
      URL.revokeObjectURL(nextPreview);
    }
  };
  const remove = async () => {
    setBusy(true);
    setMessage("");
    setSuccess("");
    try {
      await deleteProfileImage();
      setAvatarUrl(null);
      setSuccess("プロフィール画像を削除しました。");
    } catch (error) {
      setMessage(apiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <div className="section-heading">
        <h2>プロフィール画像</h2>
        <span>{avatarUrl ? "設定済み" : "未設定"}</span>
      </div>
      <div className="profile-image-row">
        <MemberAvatar name={user.displayName} imageUrl={previewUrl ?? avatarUrl} />
        <div className="stack">
          <p className="field-hint">
            JPEG / PNG /
            WebP、元画像10MB以下。保存時はWebP・最大1MB・1280pxに変換します。
          </p>
          <label
            className="button button--secondary profile-image-picker"
            htmlFor="profile-image-input"
          >
            画像を選択
          </label>
          <input
            id="profile-image-input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => void choose(event)}
            disabled={busy}
          />
          {avatarUrl ? (
            <Button variant="ghost" disabled={busy} onClick={() => void remove()}>
              初期状態に戻す
            </Button>
          ) : null}
        </div>
      </div>
      <ErrorMessage message={message} />
      <SuccessMessage message={success} />
    </Card>
  );
}

type NotificationUiState = "unsupported" | "default" | "denied" | "enabled";

const getNotificationRegistration =
  async (): Promise<ServiceWorkerRegistration | null> => {
    if (typeof navigator === "undefined" || !navigator.serviceWorker?.getRegistration)
      return null;
    return (await navigator.serviceWorker.getRegistration()) ?? null;
  };

function NotificationSettingsSection() {
  const [capabilities, setCapabilities] = useState<BrowserCapabilities>(() =>
    getBrowserCapabilities()
  );
  const [state, setState] = useState<NotificationUiState>("default");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [summary, setSummary] = useState<NotificationSettings>({
    eveningSummaryEnabled: false,
    eveningSummaryTime: "21:00",
    morningSummaryEnabled: false,
    morningSummaryTime: "09:00",
    timezone: "Asia/Tokyo"
  });
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [testPushState, setTestPushState] = useState<
    "idle" | "sending" | "success" | "error"
  >("idle");
  const testPushVisible =
    import.meta.env.DEV ||
    (typeof window !== "undefined" &&
      window.location.hostname === "house-to-do-staging.427harinn.workers.dev");
  const refresh = useCallback(async () => {
    const next = getBrowserCapabilities();
    setCapabilities(next);
    if (
      !next.serviceWorkerSupported ||
      !next.pushManagerSupported ||
      !next.notificationSupported
    ) {
      setState("unsupported");
      return;
    }
    if (next.notificationPermission === "denied") {
      setState("denied");
      return;
    }
    const registration = await getNotificationRegistration();
    const subscription = registration?.pushManager
      ? await registration.pushManager.getSubscription()
      : null;
    setState(subscription ? "enabled" : "default");
  }, []);

  useEffect(() => {
    void refresh().catch(() => setState("unsupported"));
    void getNotificationSettings()
      .then(setSummary)
      .catch(() => undefined);
  }, [refresh]);

  const saveSummary = async () => {
    setSummaryBusy(true);
    try {
      setSummary(await updateNotificationSettings(summary));
    } catch (error) {
      setMessage(
        error instanceof ApiError
          ? apiMessage(error)
          : "通知設定を保存できませんでした。"
      );
    } finally {
      setSummaryBusy(false);
    }
  };

  const enable = async () => {
    setBusy(true);
    setMessage("");
    try {
      const current = getBrowserCapabilities();
      if (
        !current.serviceWorkerSupported ||
        !current.pushManagerSupported ||
        !current.notificationSupported
      ) {
        setState("unsupported");
        return;
      }
      const registration = await getNotificationRegistration();
      if (!registration) throw new Error("service-worker-unavailable");
      const permission = await Notification.requestPermission();
      if (permission === "denied") {
        setState("denied");
        setMessage("ブラウザ設定から通知を許可してください。");
        return;
      }
      if (permission !== "granted") {
        setState("default");
        return;
      }
      const { publicKey } = await getVapidPublicKey();
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey)
        }));
      try {
        await registerPushSubscription(subscription);
      } catch (error) {
        if (!existing) {
          try {
            await subscription.unsubscribe();
          } catch {
            /* best-effort compensation; endpoint is never logged */
          }
        }
        throw error;
      }
      setState("enabled");
    } catch (error) {
      setMessage(
        error instanceof ApiError
          ? apiMessage(error)
          : "通知の設定に失敗しました。もう一度お試しください。"
      );
      setState("default");
    } finally {
      setBusy(false);
      setCapabilities(getBrowserCapabilities());
    }
  };

  const disable = async () => {
    setBusy(true);
    setMessage("");
    try {
      const registration = await getNotificationRegistration();
      const subscription = registration?.pushManager
        ? await registration.pushManager.getSubscription()
        : null;
      if (subscription) {
        await unregisterPushSubscription(subscription.endpoint);
        try {
          await subscription.unsubscribe();
        } catch {
          setState("default");
          throw new Error("browser-unsubscribe-failed");
        }
      }
      setState("default");
    } catch (error) {
      setMessage(
        error instanceof ApiError
          ? apiMessage(error)
          : "通知をオフにできませんでした。もう一度お試しください。"
      );
    } finally {
      setBusy(false);
      setCapabilities(getBrowserCapabilities());
    }
  };

  const sendTest = async () => {
    setTestPushState("sending");
    setMessage("");
    try {
      const result = await sendTestPushNotification();
      setTestPushState(result.sent > 0 ? "success" : "error");
      setMessage(
        result.sent > 0
          ? "テスト通知を送信しました。"
          : "テスト通知を送信できませんでした。"
      );
    } catch (error) {
      setTestPushState("error");
      setMessage(
        error instanceof ApiError
          ? apiMessage(error)
          : "テスト通知を送信できませんでした。"
      );
    }
  };

  const status =
    state === "unsupported"
      ? "このブラウザでは通知を利用できません"
      : state === "denied"
        ? "許可されていません"
        : state === "enabled"
          ? "通知ON"
          : "未設定";
  return (
    <Card>
      <div className="section-heading">
        <h2>通知</h2>
        <span>{status}</span>
      </div>
      {capabilities.homeScreenInstallRequired ? (
        <p className="form-note">
          iPhoneで通知を利用するには、HouseToDoをホーム画面に追加してください。
        </p>
      ) : null}
      {state === "denied" ? (
        <p className="form-note">ブラウザ設定から通知を許可してください。</p>
      ) : null}
      {message ? <ErrorMessage message={message} /> : null}
      {state === "enabled" ? (
        <Button disabled={busy} variant="secondary" onClick={() => void disable()}>
          {busy ? <InlineLoading /> : "通知をオフにする"}
        </Button>
      ) : state !== "unsupported" && state !== "denied" ? (
        <Button disabled={busy} onClick={() => void enable()}>
          {busy ? <InlineLoading /> : "通知を有効にする"}
        </Button>
      ) : null}
      {testPushVisible && state === "enabled" ? (
        <Button
          disabled={busy || testPushState === "sending"}
          variant="secondary"
          onClick={() => void sendTest()}
        >
          {testPushState === "sending" ? <InlineLoading /> : "テスト通知を送る"}
        </Button>
      ) : null}
      <div className="stack notification-summary-settings">
        <h3>朝のまとめ通知</h3>
        <label>
          <input
            type="checkbox"
            checked={summary.morningSummaryEnabled}
            onChange={(event) =>
              setSummary({ ...summary, morningSummaryEnabled: event.target.checked })
            }
          />{" "}
          有効にする
        </label>
        <label>
          時刻{" "}
          <input
            type="time"
            value={summary.morningSummaryTime}
            onChange={(event) =>
              setSummary({ ...summary, morningSummaryTime: event.target.value })
            }
          />
        </label>
        <h3>夜のまとめ通知</h3>
        <label>
          <input
            type="checkbox"
            checked={summary.eveningSummaryEnabled}
            onChange={(event) =>
              setSummary({ ...summary, eveningSummaryEnabled: event.target.checked })
            }
          />{" "}
          有効にする
        </label>
        <label>
          時刻{" "}
          <input
            type="time"
            value={summary.eveningSummaryTime}
            onChange={(event) =>
              setSummary({ ...summary, eveningSummaryTime: event.target.value })
            }
          />
        </label>
        <label>
          タイムゾーン{" "}
          <input
            value={summary.timezone}
            onChange={(event) =>
              setSummary({ ...summary, timezone: event.target.value })
            }
          />
        </label>
        <Button
          variant="secondary"
          disabled={summaryBusy}
          onClick={() => void saveSummary()}
        >
          {summaryBusy ? <InlineLoading /> : "朝/夜まとめ設定を保存"}
        </Button>
      </div>
    </Card>
  );
}

const usageRatio = (value: number, limit: number) => (limit > 0 ? value / limit : 0);

const usageWarning = (value: number, limit: number, label: string) => {
  const ratio = usageRatio(value, limit);
  if (ratio >= 1) return `${label}の上限に達しています。`;
  if (ratio >= 0.8) return `${label}の使用量が上限に近づいています。`;
  return "";
};

function ImageUsageMetric({
  label,
  value,
  warning
}: {
  label: string;
  value: string;
  warning?: string;
}) {
  return (
    <div
      className={`image-usage-metric${warning ? " image-usage-metric--warning" : ""}`}
    >
      <span>{label}</span>
      <strong>{value}</strong>
      {warning ? <p role="status">{warning}</p> : null}
    </div>
  );
}

function ImageUsageSection() {
  const [usage, setUsage] = useState<ImageUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setMessage("");
    try {
      setUsage(await getCurrentImageUsage(signal));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage("画像使用量を取得できませんでした。");
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
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      controller.abort();
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  return (
    <Card className="image-usage-card">
      <div className="section-heading">
        <h2>画像ストレージ</h2>
        {loading ? <span>確認中</span> : null}
      </div>
      {loading && !usage ? <p role="status">画像使用量を読み込んでいます…</p> : null}
      {message ? (
        <div className="stack image-usage-error">
          <ErrorMessage message={message} />
          <Button variant="secondary" onClick={() => void refresh()}>
            再試行
          </Button>
        </div>
      ) : null}
      {usage ? (
        <>
          <div className="image-usage-grid">
            <ImageUsageMetric
              label="画像数"
              value={`${usage.activeCount} / ${usage.activeCountLimit} 枚`}
              warning={usageWarning(
                usage.activeCount,
                usage.activeCountLimit,
                "画像数"
              )}
            />
            <ImageUsageMetric
              label="使用容量"
              value={`${formatBytes(usage.activeBytes)} / ${formatBytes(usage.activeBytesLimit)}`}
              warning={usageWarning(
                usage.activeBytes,
                usage.activeBytesLimit,
                "使用容量"
              )}
            />
            <ImageUsageMetric
              label="保存容量"
              value={`${usage.storedBytesKnown ? formatBytes(usage.storedBytes) : "確認中"} / ${formatBytes(usage.storedBytesLimit)}`}
              warning={
                usage.storedBytesKnown
                  ? usageWarning(usage.storedBytes, usage.storedBytesLimit, "保存容量")
                  : ""
              }
            />
            <ImageUsageMetric
              label="本日のアップロード"
              value={`${usage.dailyUploadCount} / ${usage.dailyUploadLimit} 回`}
              warning={usageWarning(
                usage.dailyUploadCount,
                usage.dailyUploadLimit,
                "本日のアップロード"
              )}
            />
          </div>
          {usage.reservedCount > 0 || usage.reservedBytes > 0 ? (
            <p className="image-usage-note">
              アップロード処理中
              {usage.reservedCount > 0 ? `: ${usage.reservedCount}件` : ""}
            </p>
          ) : null}
          {usage.pendingCleanupBytes > 0 ? (
            <p className="image-usage-note">
              削除処理待ち: {formatBytes(usage.pendingCleanupBytes)}
            </p>
          ) : null}
          {usage.pendingCleanupUnknownCount > 0 || !usage.storedBytesKnown ? (
            <p className="image-usage-note" role="status">
              削除処理待ちの画像があるため、保存容量を正確に確認できません。
            </p>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

function shoppingErrorMessage(error: unknown) {
  const imageMessage = imageUploadErrorMessage(error);
  if (imageMessage) return imageMessage;
  if (error instanceof ApiError && error.code === "NOT_FOUND") {
    return "この商品は見つかりませんでした。すでに削除された可能性があります。";
  }
  if (error instanceof ApiError && error.code === "SHOPPING_TEMPLATE_NOT_ACTIVE") {
    return "この「よく買うもの」は利用できません。画面を更新してください。";
  }
  if (error instanceof ApiError && error.code === "NETWORK_ERROR") {
    return "通信に失敗しました。接続を確認して、もう一度お試しください。";
  }
  return (
    apiMessage(error) || "処理に失敗しました。時間をおいて、もう一度お試しください。"
  );
}

const emptyShoppingForm: CreateShoppingItemInput = {
  name: "",
  quantity: null,
  note: null,
  plannedPurchaseDate: null
};

const normalizeShoppingForm = <
  T extends {
    name: string;
    quantity?: string | null;
    note?: string | null;
    plannedPurchaseDate?: string | null;
  }
>(
  form: T
): T => ({
  ...form,
  name: form.name.trim(),
  quantity: form.quantity?.trim() ? form.quantity.trim() : null,
  note: form.note?.trim() ? form.note.trim() : null,
  plannedPurchaseDate: form.plannedPurchaseDate?.trim()
    ? form.plannedPurchaseDate.trim()
    : null
});

const validateShoppingForm = (form: CreateShoppingItemInput) => {
  const errors: FormErrors = {};
  const normalized = normalizeShoppingForm(form);
  if (normalized.name.length === 0) errors.name = "商品名を入力してください。";
  if (normalized.name.length > 100)
    errors.name = "商品名は100文字以内で入力してください。";
  if ((normalized.quantity?.length ?? 0) > 50)
    errors.quantity = "数量は50文字以内で入力してください。";
  if ((normalized.note?.length ?? 0) > 500)
    errors.note = "メモは500文字以内で入力してください。";
  if (
    normalized.plannedPurchaseDate &&
    !/^\d{4}-\d{2}-\d{2}$/.test(normalized.plannedPurchaseDate)
  )
    errors.plannedPurchaseDate = "購入予定日を正しく入力してください。";
  return errors;
};

const memberName = (members: HouseholdMember[], userId: string | null | undefined) =>
  members.find((member) => member.userId === userId)?.displayName ??
  (userId ? "メンバー" : "");

const shoppingPurchaseDateTime = (value: string | null, timezone: string) =>
  formatDateTimeInTimezone(value, timezone);

function useShoppingData() {
  const [pending, setPending] = useState<ShoppingItem[]>([]);
  const [purchased, setPurchased] = useState<ShoppingItem[]>([]);
  const [templates, setTemplates] = useState<ShoppingTemplate[]>([]);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setMessage("");
    try {
      const [itemsResult, templatesResult, membersResult] = await Promise.all([
        listShoppingItems(signal),
        listShoppingTemplates(signal),
        listMembers(signal)
      ]);
      setPending(itemsResult.pending);
      setPurchased(itemsResult.purchased);
      setTemplates(templatesResult.templates.filter((template) => template.active));
      setMembers(membersResult.members);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage(shoppingErrorMessage(error));
    } finally {
      if (!signal?.aborted) setLoading(false);
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
  return {
    pending,
    purchased,
    templates,
    members,
    loading,
    message,
    setMessage,
    refresh
  };
}

function ShoppingListScreen({
  household,
  onNavigate
}: {
  household: Household;
  user: AuthUser;
  onNavigate: (route: NavigationPath) => void;
  onLogout: () => void;
}) {
  const {
    pending,
    purchased,
    templates,
    members,
    loading,
    message,
    setMessage,
    refresh
  } = useShoppingData();
  const [success, setSuccess] = useState("");
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [busyTemplate, setBusyTemplate] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [showPurchased, setShowPurchased] = useState(true);

  const runItemAction = async (
    itemId: string,
    action: "purchase" | "unpurchase" | "delete"
  ) => {
    if (
      action === "delete" &&
      !window.confirm(
        "この商品を買い物リストから削除しますか？\n削除すると元に戻せません。"
      )
    )
      return;
    setBusyItem(itemId);
    setMessage("");
    setSuccess("");
    try {
      if (action === "purchase") await purchaseShoppingItem(itemId);
      if (action === "unpurchase") await unpurchaseShoppingItem(itemId);
      if (action === "delete") await deleteShoppingItem(itemId);
      await refresh();
      setSuccess(
        action === "purchase"
          ? "購入済みにしました。"
          : action === "unpurchase"
            ? "未購入へ戻しました。"
            : "商品を削除しました。"
      );
    } catch (error) {
      setMessage(shoppingErrorMessage(error));
      await refresh();
    } finally {
      setBusyItem(null);
    }
  };

  const addFromTemplate = async (template: ShoppingTemplate) => {
    setBusyTemplate(template.id);
    setMessage("");
    setSuccess("");
    try {
      await addShoppingItemFromTemplate(template.id);
      await refresh();
      setSuccess(`${template.name}を買い物リストへ追加しました。`);
    } catch (error) {
      setMessage(shoppingErrorMessage(error));
      await refresh();
    } finally {
      setBusyTemplate(null);
    }
  };

  const clearPurchased = async () => {
    if (
      !window.confirm(
        "購入済みの商品をリストから削除します。\nこの操作は元に戻せません。"
      )
    )
      return;
    setClearing(true);
    setMessage("");
    setSuccess("");
    try {
      const result = await clearPurchasedItems();
      await refresh();
      setSuccess(`購入済みの商品を${result.clearedCount}件整理しました。`);
    } catch (error) {
      setMessage(shoppingErrorMessage(error));
      await refresh();
    } finally {
      setClearing(false);
    }
  };

  return (
    <AppFrame current="/shopping" onNavigate={onNavigate}>
      <PageHeader
        title="買い物リスト"
        description={`${household.name} / ${loading ? "読み込み中" : pending.length === 0 ? "買うものはありません" : `あと${pending.length}つ`}`}
        action={
          <Button variant="ghost" onClick={() => void refresh()}>
            更新
          </Button>
        }
      />
      <div className="shopping-actions">
        <Button onClick={() => onNavigate("/shopping/new")}>商品を追加</Button>
        <Button variant="secondary" onClick={() => onNavigate("/shopping/templates")}>
          よく買うもの
        </Button>
      </div>
      <ErrorMessage message={message} />
      <SuccessMessage message={success} />

      <Card>
        <div className="section-heading">
          <h2>テンプレートから追加</h2>
          <span>{templates.length}件</span>
        </div>
        {templates.length === 0 ? (
          <EmptyState
            title="よく買うものはまだありません"
            description="よく買う商品を登録すると、ここから追加できます。"
          />
        ) : (
          <div className="template-chip-list">
            {templates.slice(0, 8).map((template) => (
              <button
                aria-label={`${template.name}を買い物リストへ追加`}
                disabled={busyTemplate === template.id}
                key={template.id}
                onClick={() => void addFromTemplate(template)}
                type="button"
              >
                + {template.name}
                {template.quantity ? <small>{template.quantity}</small> : null}
              </button>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div className="section-heading">
          <h2>未購入</h2>
          <span>{pending.length}件</span>
        </div>
        {loading ? (
          <p role="status">買い物リストを読み込んでいます。</p>
        ) : pending.length === 0 ? (
          <EmptyState
            title="買うものはありません"
            description="追加された商品はここに表示されます。"
          />
        ) : (
          <div className="shopping-item-list">
            {pending.map((item) => (
              <ShoppingItemCard
                busy={busyItem === item.id}
                item={item}
                key={item.id}
                members={members}
                timezone={household.timezone}
                onDelete={() => void runItemAction(item.id, "delete")}
                onEdit={() => onNavigate(`/shopping/items/${item.id}/edit`)}
                onOpen={() => onNavigate(`/shopping/items/${item.id}`)}
                onPrimary={() => void runItemAction(item.id, "purchase")}
              />
            ))}
          </div>
        )}
      </Card>

      <Card>
        <button
          aria-expanded={showPurchased}
          className="collapse-toggle"
          onClick={() => setShowPurchased((value) => !value)}
          type="button"
        >
          <span>購入済み {purchased.length}件</span>
          <span aria-hidden="true">{showPurchased ? "⌄" : "›"}</span>
        </button>
        {showPurchased ? (
          purchased.length === 0 ? (
            <EmptyState
              title="購入済みはありません"
              description="購入済みにした商品はここで確認できます。"
            />
          ) : (
            <>
              <div className="shopping-item-list shopping-item-list--purchased">
                {purchased.map((item) => (
                  <ShoppingItemCard
                    busy={busyItem === item.id}
                    item={item}
                    key={item.id}
                    members={members}
                    timezone={household.timezone}
                    onDelete={() => void runItemAction(item.id, "delete")}
                    onEdit={() => onNavigate(`/shopping/items/${item.id}/edit`)}
                    onOpen={() => onNavigate(`/shopping/items/${item.id}`)}
                    onPrimary={() => void runItemAction(item.id, "unpurchase")}
                  />
                ))}
              </div>
              <Button
                variant="danger"
                disabled={clearing}
                onClick={() => void clearPurchased()}
              >
                {clearing ? <InlineLoading label="整理中" /> : "購入済みを整理"}
              </Button>
            </>
          )
        ) : null}
      </Card>
    </AppFrame>
  );
}

function ShoppingItemCard({
  item,
  members,
  timezone,
  busy,
  onPrimary,
  onOpen,
  onEdit,
  onDelete
}: {
  item: ShoppingItem;
  members: HouseholdMember[];
  timezone: string;
  busy: boolean;
  onPrimary: () => void;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const purchased = item.status === "purchased";
  const purchaser =
    item.purchasedBy?.displayName ?? memberName(members, item.purchasedBy?.userId);
  return (
    <article className={`shopping-item ${purchased ? "shopping-item--purchased" : ""}`}>
      <button
        aria-label={
          purchased ? `${item.name}を未購入へ戻す` : `${item.name}を購入済みにする`
        }
        className="shopping-check"
        disabled={busy}
        onClick={onPrimary}
        type="button"
      >
        {busy ? "…" : purchased ? "✓" : ""}
      </button>
      <button className="shopping-item__body" onClick={onOpen} type="button">
        {item.image ? <ShoppingThumbnail item={item} /> : null}
        <strong>{item.name}</strong>
        <span>{[item.quantity, item.note].filter(Boolean).join(" / ")}</span>
        {item.plannedPurchaseDate ? (
          <small>購入予定: {formatDate(item.plannedPurchaseDate)}</small>
        ) : null}
        <small>
          {purchased && item.purchasedAt
            ? `${purchaser || "メンバー"}さんが購入 ${shoppingPurchaseDateTime(item.purchasedAt, timezone)}`
            : `追加: ${memberName(members, item.addedBy) || "メンバー"}`}
        </small>
      </button>
      <div className="shopping-item__actions">
        <button aria-label={`${item.name}を編集`} onClick={onEdit} type="button">
          編集
        </button>
        <button
          aria-label={`${item.name}を削除`}
          disabled={busy}
          onClick={onDelete}
          type="button"
        >
          削除
        </button>
      </div>
    </article>
  );
}

function ShoppingThumbnail({ item }: { item: ShoppingItem }) {
  const [failed, setFailed] = useState(false);
  if (!item.image || failed)
    return failed ? (
      <span className="shopping-item__image-error">画像を表示できません</span>
    ) : null;
  return (
    <img
      className="shopping-item__thumbnail"
      src={getShoppingItemImageUrl(item.id, item.image.updatedAt)}
      alt={`${item.name}の写真`}
      onError={() => setFailed(true)}
    />
  );
}

function ShoppingItemDetailScreen({
  itemId,
  onNavigate,
  household
}: {
  household: Household;
  user: AuthUser;
  itemId: string;
  onNavigate: (route: NavigationPath) => void;
  onLogout: () => void;
}) {
  const [item, setItem] = useState<ShoppingItem | null>(null);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      getShoppingItem(itemId, controller.signal),
      listMembers(controller.signal)
    ])
      .then(([itemResult, membersResult]) => {
        setItem(itemResult.item);
        setMembers(membersResult.members);
      })
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError"))
          setMessage(shoppingErrorMessage(error));
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [itemId]);
  if (loading) return <LoadingScreen message="商品を読み込んでいます。" />;
  if (!item)
    return (
      <AppFrame current="/shopping" onNavigate={onNavigate}>
        <ErrorMessage
          message={
            message ||
            "この商品は見つかりませんでした。すでに削除された可能性があります。"
          }
        />
      </AppFrame>
    );
  return (
    <AppFrame current="/shopping" onNavigate={onNavigate}>
      <PageHeader
        title={item.name}
        description={item.status === "purchased" ? "購入済み" : "未購入"}
      />
      <ErrorMessage message={message} />
      <Card>
        {item.image ? (
          <img
            className="shopping-detail-image"
            src={getShoppingItemImageUrl(item.id, item.image.updatedAt)}
            alt={`${item.name}の写真`}
          />
        ) : null}
        <dl className="detail-grid">
          {item.quantity ? (
            <div>
              <dt>数量</dt>
              <dd>{item.quantity}</dd>
            </div>
          ) : null}
          {item.note ? (
            <div>
              <dt>メモ</dt>
              <dd>{item.note}</dd>
            </div>
          ) : null}
          {item.plannedPurchaseDate ? (
            <div>
              <dt>購入予定日</dt>
              <dd>{formatDate(item.plannedPurchaseDate)}</dd>
            </div>
          ) : null}
          <div>
            <dt>追加者</dt>
            <dd>{memberName(members, item.addedBy) || "メンバー"}</dd>
          </div>
          {item.purchasedBy ? (
            <div>
              <dt>購入者</dt>
              <dd>
                {item.purchasedBy.displayName ??
                  memberName(members, item.purchasedBy.userId)}
              </dd>
            </div>
          ) : null}
          {item.status === "purchased" && item.purchasedAt ? (
            <div>
              <dt>購入日時</dt>
              <dd>{shoppingPurchaseDateTime(item.purchasedAt, household.timezone)}</dd>
            </div>
          ) : null}
        </dl>
        <div className="inline-actions">
          <Button
            variant="secondary"
            onClick={() => onNavigate(`/shopping/items/${item.id}/edit`)}
          >
            編集
          </Button>
          <Button variant="ghost" onClick={() => onNavigate("/shopping")}>
            一覧へ戻る
          </Button>
        </div>
      </Card>
    </AppFrame>
  );
}

const remaining = (limit: number, value: number) => Math.max(0, limit - value);

function ImageUploadUsageHint({
  mode,
  usage,
  loading
}: {
  mode: "create" | "edit";
  usage: ImageUsage | null;
  loading: boolean;
}) {
  if (loading && !usage)
    return (
      <small className="image-upload-usage">画像ストレージを確認しています…</small>
    );
  if (!usage) return null;
  const countAtLimit = usage.activeCount >= usage.activeCountLimit;
  const dailyAtLimit = usage.dailyUploadCount >= usage.dailyUploadLimit;
  const warning =
    (usage.activeCountLimit > 0 && usage.activeCount / usage.activeCountLimit >= 0.8) ||
    (usage.activeBytesLimit > 0 && usage.activeBytes / usage.activeBytesLimit >= 0.8) ||
    (usage.storedBytesKnown &&
      usage.storedBytesLimit > 0 &&
      usage.storedBytes / usage.storedBytesLimit >= 0.8);
  return (
    <div className="image-upload-usage" aria-label="画像アップロード状況">
      <span>画像ストレージ</span>
      {mode === "create" && countAtLimit ? (
        <strong className="image-upload-usage__message">
          画像の追加上限に達しています
        </strong>
      ) : (
        <>
          <span>残り画像 {remaining(usage.activeCountLimit, usage.activeCount)}枚</span>
          <span>
            本日あと {remaining(usage.dailyUploadLimit, usage.dailyUploadCount)}回
          </span>
        </>
      )}
      {dailyAtLimit ? (
        <span className="image-upload-usage__message">
          本日のアップロード上限に達しています
        </span>
      ) : null}
      {warning && (mode === "edit" || !countAtLimit) && !dailyAtLimit ? (
        <span className="image-upload-usage__message">
          画像保存容量が少なくなっています
        </span>
      ) : null}
      {!usage.storedBytesKnown ? (
        <span className="image-upload-usage__note">
          削除処理中の画像があるため、保存容量を正確に確認できません
        </span>
      ) : null}
    </div>
  );
}

function ShoppingItemFormScreen({
  household,
  mode,
  itemId,
  onNavigate
}: {
  household: Household;
  user: AuthUser;
  mode: "create" | "edit";
  itemId?: string;
  onNavigate: (route: NavigationPath) => void;
  onLogout: () => void;
}) {
  const [form, setForm] = useState<CreateShoppingItemInput>(emptyShoppingForm);
  const [recentItems, setRecentItems] = useState<ShoppingRecentItem[]>([]);
  const [templates, setTemplates] = useState<ShoppingTemplate[]>([]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [existingImage, setExistingImage] = useState<ShoppingItem["image"]>(null);
  const [selectedImage, setSelectedImage] = useState<ProcessedImage | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [imageStatus, setImageStatus] = useState<
    "idle" | "processing" | "uploading" | "deleting"
  >("idle");
  const [imageMessage, setImageMessage] = useState("");
  const [imageUsage, setImageUsage] = useState<ImageUsage | null>(null);
  const [imageUsageLoading, setImageUsageLoading] = useState(true);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const refreshImageUsage = useCallback(async (signal?: AbortSignal) => {
    setImageUsageLoading(true);
    try {
      setImageUsage(await getCurrentImageUsage(signal));
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        setImageUsage(null);
    } finally {
      if (!signal?.aborted) setImageUsageLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void refreshImageUsage(controller.signal);
    return () => controller.abort();
  }, [refreshImageUsage]);
  useEffect(() => {
    if (mode !== "edit" || !itemId) return;
    const controller = new AbortController();
    getShoppingItem(itemId, controller.signal)
      .then((result) => {
        setForm({
          name: result.item.name,
          quantity: result.item.quantity,
          note: result.item.note,
          plannedPurchaseDate: result.item.plannedPurchaseDate
        });
        setExistingImage(result.item.image);
      })
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError"))
          setMessage(shoppingErrorMessage(error));
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [mode, itemId]);
  useEffect(() => {
    if (mode !== "create") return;
    const controller = new AbortController();
    Promise.all([
      listRecentShoppingItems(8, controller.signal),
      listShoppingTemplates(controller.signal)
    ])
      .then(([recentResult, templateResult]) => {
        setRecentItems(recentResult.items);
        setTemplates(templateResult.templates.filter((template) => template.active));
      })
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError"))
          setMessage(shoppingErrorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [mode]);
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl]
  );
  const selectImage = async (file: File | undefined) => {
    if (!file) return;
    if (
      mode === "create" &&
      imageUsage &&
      imageUsage.activeCount >= imageUsage.activeCountLimit
    ) {
      setImageMessage(
        "画像数の上限に達しています。不要な画像を削除してから、もう一度お試しください。"
      );
      return;
    }
    setImageStatus("processing");
    setImageMessage("");
    try {
      const processed = await processShoppingImage(file);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setSelectedImage(processed);
      setPreviewUrl(URL.createObjectURL(processed.blob));
    } catch (error) {
      const messages: Record<string, string> = {
        "unsupported-image-type": "JPEG、PNG、WebPの画像を選択してください",
        "source-image-too-large":
          "写真のサイズが大きすぎます。10MB以下の写真を選択してください。",
        "processed-image-too-large": "画像サイズを1MB以下にしてください",
        "image-load-failed": "画像を処理できませんでした。別の画像を選択してください",
        "webp-conversion-failed":
          "画像を処理できませんでした。別の画像を選択してください"
      };
      setImageMessage(
        messages[error instanceof Error ? error.message : ""] ??
          "画像を処理できませんでした。別の画像を選択してください"
      );
    } finally {
      setImageStatus("idle");
    }
  };
  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    void selectImage(event.currentTarget.files?.[0]);
    event.currentTarget.value = "";
  };
  const removeSelectedImage = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl("");
    setSelectedImage(null);
  };
  const removeExistingImage = async () => {
    if (!itemId || !window.confirm("この写真を削除しますか？")) return;
    setImageStatus("deleting");
    setImageMessage("");
    try {
      await deleteShoppingItemImage(itemId);
      setExistingImage(null);
      await refreshImageUsage();
    } catch {
      setImageMessage("画像削除に失敗しました。もう一度お試しください。");
    } finally {
      setImageStatus("idle");
    }
  };
  const setField = <K extends keyof CreateShoppingItemInput>(
    key: K,
    value: CreateShoppingItemInput[K]
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors = validateShoppingForm(form);
    setErrors(nextErrors);
    setMessage("");
    if (Object.keys(nextErrors).length > 0) return;
    setSubmitting(true);
    try {
      const payload = normalizeShoppingForm(form) as UpdateShoppingItemInput;
      const result =
        mode === "edit" && itemId
          ? await updateShoppingItem(itemId, payload)
          : await createShoppingItem(payload as CreateShoppingItemInput);
      if (selectedImage) {
        setImageStatus("uploading");
        try {
          await uploadShoppingItemImage(result.item.id, selectedImage);
          await refreshImageUsage();
        } catch (error) {
          setMessage(shoppingErrorMessage(error));
          setImageStatus("idle");
          return;
        }
        setImageStatus("idle");
      }
      onNavigate(`/shopping/items/${result.item.id}`);
    } catch (error) {
      setMessage(shoppingErrorMessage(error));
      if (error instanceof ApiError && error.details) setErrors(error.details);
    } finally {
      setSubmitting(false);
    }
  };
  if (loading) return <LoadingScreen message="商品を読み込んでいます。" />;
  return (
    <AppFrame current="/shopping" onNavigate={onNavigate}>
      <PageHeader
        title={mode === "create" ? "商品を追加" : "商品を編集"}
        description={household.name}
      />
      {mode === "create" ? (
        <ShoppingReusePanel
          recentItems={recentItems}
          templates={templates}
          onRecentSelect={(source) => {
            setForm({
              name: source.name,
              quantity: source.quantity,
              note: source.note,
              plannedPurchaseDate: null
            });
            setErrors({});
            setMessage("");
            setSelectedImage(null);
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            setPreviewUrl("");
          }}
          onTemplateSelect={(source) => {
            setForm({
              name: source.name,
              quantity: source.quantity,
              note: source.note,
              plannedPurchaseDate: null
            });
            setErrors({});
            setMessage("");
            setSelectedImage(null);
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            setPreviewUrl("");
          }}
        />
      ) : null}
      <Card>
        <form
          className="stack"
          aria-busy={submitting}
          onSubmit={(event) => void submit(event)}
        >
          <ErrorMessage message={message} />
          <FormField id="shopping-name" label="商品名（必須）" error={errors.name}>
            <TextInput
              id="shopping-name"
              error={errors.name}
              value={form.name}
              onChange={(value) => setField("name", value)}
            />
          </FormField>
          <FormField id="shopping-quantity" label="数量" error={errors.quantity}>
            <TextInput
              id="shopping-quantity"
              error={errors.quantity}
              placeholder="1本 / 2袋 / 500ml / 適量"
              value={form.quantity ?? ""}
              onChange={(value) => setField("quantity", value)}
            />
          </FormField>
          <FormField id="shopping-note" label="メモ" error={errors.note}>
            <textarea
              id="shopping-note"
              aria-describedby={errors.note ? "shopping-note-error" : undefined}
              aria-invalid={errors.note ? "true" : "false"}
              maxLength={500}
              placeholder="いつものメーカー / セールなら2つ"
              value={form.note ?? ""}
              onChange={(event) => setField("note", event.target.value)}
            />
          </FormField>
          <FormField
            id="shopping-planned-purchase-date"
            label="購入予定日"
            error={errors.plannedPurchaseDate}
          >
            <input
              id="shopping-planned-purchase-date"
              aria-describedby={
                errors.plannedPurchaseDate
                  ? "shopping-planned-purchase-date-error"
                  : "shopping-planned-purchase-date-hint"
              }
              aria-invalid={errors.plannedPurchaseDate ? "true" : "false"}
              type="date"
              value={form.plannedPurchaseDate ?? ""}
              onChange={(event) =>
                setField("plannedPurchaseDate", event.target.value || null)
              }
            />
            <small className="field-hint" id="shopping-planned-purchase-date-hint">
              決まっていなければ空欄でOK
            </small>
          </FormField>
          <div className="shopping-image-field" aria-live="polite">
            <label htmlFor="shopping-image">商品の写真（任意）</label>
            <ImageUploadUsageHint
              mode={mode}
              usage={imageUsage}
              loading={imageUsageLoading}
            />
            {previewUrl ? (
              <img
                className="shopping-image-preview"
                src={previewUrl}
                alt={`${form.name || "商品の"}写真のプレビュー`}
              />
            ) : existingImage ? (
              <img
                className="shopping-image-preview"
                src={getShoppingItemImageUrl(itemId!, existingImage.updatedAt)}
                alt={`${form.name || "商品の"}写真`}
              />
            ) : null}
            {selectedImage ? (
              <small>
                縮小後: {(selectedImage.size / 1024).toFixed(0)}KB /{" "}
                {selectedImage.width}×{selectedImage.height}px
              </small>
            ) : null}
            <div className="shopping-image-options" aria-label="画像の追加方法">
              <Button
                disabled={
                  imageStatus !== "idle" ||
                  submitting ||
                  (mode === "create" &&
                    !!imageUsage &&
                    imageUsage.activeCount >= imageUsage.activeCountLimit)
                }
                onClick={() => libraryInputRef.current?.click()}
              >
                写真を選ぶ
              </Button>
            </div>
            <input
              ref={libraryInputRef}
              aria-label="写真ファイルを選択"
              className="shopping-image-input"
              id="shopping-image"
              accept="image/*"
              disabled={
                imageStatus !== "idle" ||
                submitting ||
                (mode === "create" &&
                  !!imageUsage &&
                  imageUsage.activeCount >= imageUsage.activeCountLimit)
              }
              onChange={handleImageChange}
              type="file"
            />
            <div className="inline-actions">
              {selectedImage ? (
                <Button
                  variant="ghost"
                  disabled={imageStatus !== "idle"}
                  onClick={removeSelectedImage}
                >
                  選択解除
                </Button>
              ) : null}
              {existingImage && !selectedImage ? (
                <Button
                  variant="danger"
                  disabled={imageStatus !== "idle" || submitting}
                  onClick={() => void removeExistingImage()}
                >
                  写真を削除
                </Button>
              ) : null}
            </div>
            {imageStatus === "processing" ? (
              <p role="status">写真を準備しています…</p>
            ) : null}
            {imageStatus === "uploading" ? (
              <p role="status">写真を保存しています…</p>
            ) : null}
            {imageStatus === "deleting" ? <p role="status">画像削除中…</p> : null}
            {imageMessage ? (
              <p className="form-error" id="shopping-image-error" role="alert">
                {imageMessage}
              </p>
            ) : null}
          </div>
          <Button disabled={submitting} type="submit">
            {submitting ? <InlineLoading /> : "保存"}
          </Button>
          <Button variant="ghost" onClick={() => onNavigate("/shopping")}>
            一覧へ戻る
          </Button>
        </form>
      </Card>
    </AppFrame>
  );
}

function ShoppingReusePanel({
  recentItems,
  templates,
  onRecentSelect,
  onTemplateSelect
}: {
  recentItems: ShoppingRecentItem[];
  templates: ShoppingTemplate[];
  onRecentSelect: (item: ShoppingRecentItem) => void;
  onTemplateSelect: (template: ShoppingTemplate) => void;
}) {
  return (
    <div className="shopping-reuse-grid">
      <Card className="shopping-reuse-card">
        <div className="section-heading">
          <h2>最近使ったもの</h2>
          <span>{recentItems.length}件</span>
        </div>
        {recentItems.length === 0 ? (
          <p className="field-hint">過去に追加した商品がここに表示されます。</p>
        ) : (
          <div className="shopping-reuse-list">
            {recentItems.map((item) => (
              <button
                className="shopping-reuse-item"
                key={`${item.name}-${item.createdAt}`}
                type="button"
                onClick={() => onRecentSelect(item)}
              >
                <strong>{item.name}</strong>
                <small>
                  {[item.quantity, item.note].filter(Boolean).join(" / ") ||
                    "数量・メモなし"}
                </small>
              </button>
            ))}
          </div>
        )}
      </Card>
      <Card className="shopping-reuse-card">
        <div className="section-heading">
          <h2>テンプレートから</h2>
          <span>{templates.length}件</span>
        </div>
        {templates.length === 0 ? (
          <p className="field-hint">よく買う商品をテンプレートに登録できます。</p>
        ) : (
          <div className="shopping-reuse-list">
            {templates.slice(0, 8).map((template) => (
              <button
                className="shopping-reuse-item"
                key={template.id}
                type="button"
                onClick={() => onTemplateSelect(template)}
              >
                <strong>{template.name}</strong>
                <small>
                  {[template.quantity, template.note].filter(Boolean).join(" / ") ||
                    "数量・メモなし"}
                </small>
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function ShoppingTemplateListScreen({
  household,
  onNavigate
}: {
  household: Household;
  user: AuthUser;
  onNavigate: (route: NavigationPath) => void;
  onLogout: () => void;
}) {
  const [templates, setTemplates] = useState<ShoppingTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const result = await listShoppingTemplates(signal);
      setTemplates(result.templates.filter((template) => template.active));
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        setMessage(shoppingErrorMessage(error));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);
  const addTemplate = async (template: ShoppingTemplate) => {
    setBusy(template.id);
    setMessage("");
    setSuccess("");
    try {
      await addShoppingItemFromTemplate(template.id);
      setSuccess(`${template.name}を買い物リストへ追加しました。`);
    } catch (error) {
      setMessage(shoppingErrorMessage(error));
      await refresh();
    } finally {
      setBusy(null);
    }
  };
  const deactivate = async (template: ShoppingTemplate) => {
    if (
      !window.confirm(
        "この商品を「よく買うもの」から削除しますか？\nすでに買い物リストへ追加した商品には影響しません。"
      )
    )
      return;
    setBusy(template.id);
    setMessage("");
    setSuccess("");
    try {
      await deleteShoppingTemplate(template.id);
      await refresh();
      setSuccess("よく買うものから削除しました。");
    } catch (error) {
      setMessage(shoppingErrorMessage(error));
      await refresh();
    } finally {
      setBusy(null);
    }
  };
  return (
    <AppFrame current="/shopping" onNavigate={onNavigate}>
      <PageHeader
        title="よく買うもの"
        description={household.name}
        action={
          <Button onClick={() => onNavigate("/shopping/templates/new")}>登録</Button>
        }
      />
      <ErrorMessage message={message} />
      <SuccessMessage message={success} />
      <Card>
        {loading ? (
          <p role="status">よく買うものを読み込んでいます。</p>
        ) : templates.length === 0 ? (
          <EmptyState
            title="よく買うものはまだありません"
            description="繰り返し買う商品を登録できます。"
          />
        ) : (
          <div className="template-list">
            {templates.map((template) => (
              <article className="management-card" key={template.id}>
                <div>
                  <strong>{template.name}</strong>
                  <small>
                    {[template.quantity, template.note].filter(Boolean).join(" / ") ||
                      "数量・メモなし"}
                  </small>
                </div>
                <div className="inline-actions">
                  <Button
                    disabled={busy === template.id}
                    onClick={() => void addTemplate(template)}
                  >
                    リストへ追加
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      onNavigate(`/shopping/templates/${template.id}/edit`)
                    }
                  >
                    編集
                  </Button>
                  <Button
                    variant="danger"
                    disabled={busy === template.id}
                    onClick={() => void deactivate(template)}
                  >
                    削除
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </Card>
      <Button variant="ghost" onClick={() => onNavigate("/shopping")}>
        買い物リストへ戻る
      </Button>
    </AppFrame>
  );
}

function ShoppingTemplateFormScreen({
  household,
  mode,
  templateId,
  onNavigate
}: {
  household: Household;
  user: AuthUser;
  mode: "create" | "edit";
  templateId?: string;
  onNavigate: (route: NavigationPath) => void;
  onLogout: () => void;
}) {
  const [form, setForm] = useState<CreateShoppingTemplateInput>(emptyShoppingForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(mode === "edit");
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    if (mode !== "edit" || !templateId) return;
    const controller = new AbortController();
    getShoppingTemplate(templateId, controller.signal)
      .then((result) =>
        setForm({
          name: result.template.name,
          quantity: result.template.quantity,
          note: result.template.note
        })
      )
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError"))
          setMessage(shoppingErrorMessage(error));
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [mode, templateId]);
  const setField = <K extends keyof CreateShoppingTemplateInput>(
    key: K,
    value: CreateShoppingTemplateInput[K]
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors = validateShoppingForm(form);
    setErrors(nextErrors);
    setMessage("");
    if (Object.keys(nextErrors).length > 0) return;
    setSubmitting(true);
    try {
      const payload = normalizeShoppingForm(form) as UpdateShoppingTemplateInput;
      await (mode === "edit" && templateId
        ? updateShoppingTemplate(templateId, payload)
        : createShoppingTemplate(payload as CreateShoppingTemplateInput));
      onNavigate("/shopping/templates");
    } catch (error) {
      setMessage(shoppingErrorMessage(error));
      if (error instanceof ApiError && error.details) setErrors(error.details);
    } finally {
      setSubmitting(false);
    }
  };
  if (loading) return <LoadingScreen message="よく買うものを読み込んでいます。" />;
  return (
    <AppFrame current="/shopping" onNavigate={onNavigate}>
      <PageHeader
        title={mode === "create" ? "よく買うものに登録" : "よく買うものを編集"}
        description={household.name}
      />
      <Card>
        <form
          className="stack"
          aria-busy={submitting}
          onSubmit={(event) => void submit(event)}
        >
          <ErrorMessage message={message} />
          {mode === "edit" ? (
            <p className="form-note">すでに追加済みの商品には反映されません。</p>
          ) : null}
          <FormField id="template-name" label="商品名（必須）" error={errors.name}>
            <TextInput
              id="template-name"
              error={errors.name}
              value={form.name}
              onChange={(value) => setField("name", value)}
            />
          </FormField>
          <FormField id="template-quantity" label="数量" error={errors.quantity}>
            <TextInput
              id="template-quantity"
              error={errors.quantity}
              placeholder="1本 / 2袋 / 500ml / 適量"
              value={form.quantity ?? ""}
              onChange={(value) => setField("quantity", value)}
            />
          </FormField>
          <FormField id="template-note" label="メモ" error={errors.note}>
            <textarea
              id="template-note"
              aria-describedby={errors.note ? "template-note-error" : undefined}
              aria-invalid={errors.note ? "true" : "false"}
              maxLength={500}
              placeholder="いつものメーカー / セールなら2つ"
              value={form.note ?? ""}
              onChange={(event) => setField("note", event.target.value)}
            />
          </FormField>
          <Button disabled={submitting} type="submit">
            {submitting ? <InlineLoading /> : "保存"}
          </Button>
          <Button variant="ghost" onClick={() => onNavigate("/shopping/templates")}>
            一覧へ戻る
          </Button>
        </form>
      </Card>
    </AppFrame>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ShoppingSoonScreen({
  onNavigate
}: {
  onNavigate: (route: NavigationPath) => void;
}) {
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

function GuestScreen({
  onNavigate,
  onExit
}: {
  onNavigate: (route: NavigationPath | StaticRoute) => void;
  onExit: () => void;
}) {
  return (
    <main className="app-shell app-shell--with-nav">
      <PageHeader
        title="ゲスト"
        description="サンプルのホームを確認できます。"
        action={
          <Button variant="ghost" onClick={onExit}>
            終了
          </Button>
        }
      />
      <GuestBanner />
      <section className="dashboard-hero">
        <div>
          <p>{formatDate(todayInTokyo())}</p>
          <h2>サンプルの家庭</h2>
          <p>たくや・さやか</p>
        </div>
        <div className="summary-count">
          <span>今日の未完了</span>
          <strong>2件</strong>
        </div>
      </section>
      <Card>
        <h2>今日のタスク</h2>
        <div className="task-list">
          <button className="task-card" type="button">
            <span className="task-icon">↻</span>
            <span className="task-card__body">
              <strong>インコのごはんを交換</strong>
              <small>夜 21:00 / 担当: どちらでも</small>
            </span>
            <StatusBadge status="pending" />
          </button>
          <button className="task-card" type="button">
            <span className="task-icon">□</span>
            <span className="task-card__body">
              <strong>ゴミ出し</strong>
              <small>朝 8:00 / 担当: どちらでも</small>
            </span>
            <StatusBadge status="completed" />
          </button>
        </div>
      </Card>
      <BottomNavigation
        current="/home"
        onNavigate={
          onNavigate as (
            path: "/home" | "/calendar" | "/tasks" | "/shopping" | "/settings/members"
          ) => void
        }
      />
    </main>
  );
}
