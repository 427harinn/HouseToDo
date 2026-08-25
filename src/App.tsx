import { FormEvent, useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { ChangeEvent } from "react";
import type { ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight, Ellipsis, House, Image as ImageIcon, MessageCircle, ShoppingCart, Undo2, X } from "lucide-react";
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
  reorderShoppingItems,
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
import { visiblePurchasedShoppingItems as filterVisiblePurchasedShoppingItems } from "./lib/shopping-visibility";
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
  restoreTaskRecord,
  restoreCalendarTaskRecord,
  updateTask,
  updateTaskTemplate,
  type Task,
  type CalendarShoppingItem,
  type CalendarCompletedRecord,
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
import { MOTION_MS } from "./motion/constants";
import { usePrefersReducedMotion } from "./hooks/usePrefersReducedMotion";
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
  string;

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
    month: "numeric",
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
    (nextRoute: string, replace = false) => {
      if (`${window.location.pathname}${window.location.search}` !== nextRoute) {
        const state = { route: nextRoute };
        if (replace) window.history.replaceState(state, "", nextRoute);
        else window.history.pushState(state, "", nextRoute);
      }
      const nextUrl = new URL(nextRoute, window.location.origin);
      setRoute(parseRoute(nextUrl.pathname));
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
  if (route.name === "/shopping") return <ShoppingM4ListScreen {...shellProps} targetItemId={new URLSearchParams(window.location.search).get("item")} />;
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
  onNavigate,
  showBottomNavigation = true
}: {
  current: "/home" | "/calendar" | "/tasks" | "/shopping" | "/settings/members";
  children: ReactNode;
  onNavigate: (route: NavigationPath) => void;
  showBottomNavigation?: boolean;
}) {
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);

  return (
    <div className="app-shell app-shell--with-nav">
      <main className="app-shell__viewport">{children}</main>
      {showBottomNavigation ? <>
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
      </> : null}
    </div>
  );
}

function CalendarScreen({ household, onNavigate }: { household: Household; user: AuthUser; onNavigate: (route: NavigationPath) => void; onLogout: () => void }) {
  const queryDate = new URLSearchParams(window.location.search).get("date");
  const initialDate = queryDate && /^\d{4}-\d{2}-\d{2}$/.test(queryDate) ? queryDate : null;
  const today = todayInTimezone(household.timezone);
  const [visibleMonth, setVisibleMonth] = useState(`${(initialDate ?? today).slice(0, 7)}-01`);
  const [selectedDate, setSelectedDate] = useState<string | null>(initialDate);
  const [data, setData] = useState<Awaited<ReturnType<typeof listCalendarTasks>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [monthOffset, setMonthOffset] = useState(0);
  const [monthDragging, setMonthDragging] = useState(false);
  const monthStart = useRef<{ x: number; y: number } | null>(null);
  const suppressMonthClick = useRef(false);
  const [monthDirection, setMonthDirection] = useState<"next" | "previous" | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const gridStart = addDays(visibleMonth, -new Date(`${visibleMonth}T00:00:00Z`).getUTCDay());
  const gridEnd = addDays(gridStart, 41);
  const gridDates = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  const requestedDate = selectedDate ?? today;
  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setMessage("");
    try { setData(await listCalendarTasks(gridStart, gridEnd, requestedDate, signal)); }
    catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) setMessage(apiErrorMessage(error)); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [gridStart, gridEnd, requestedDate]);
  useEffect(() => { const controller = new AbortController(); void refresh(controller.signal); return () => controller.abort(); }, [refresh]);
  const moveMonth = (amount: number) => {
    const next = new Date(`${visibleMonth}T00:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + amount, 1);
    setMonthDirection(amount > 0 ? "next" : "previous");
    window.setTimeout(() => setMonthDirection(null), reducedMotion ? 0 : MOTION_MS.large);
    setVisibleMonth(`${next.toISOString().slice(0, 7)}-01`);
  };
  const openDate = (date: string) => { setSelectedDate(date); onNavigate(`/calendar?date=${encodeURIComponent(date)}`); };
  const goToday = () => setVisibleMonth(`${(data?.today ?? today).slice(0, 7)}-01`);
  const pointerDown = (event: ReactPointerEvent<HTMLElement>) => { monthStart.current = { x: event.clientX, y: event.clientY }; suppressMonthClick.current = false; setMonthDragging(true); };
  const pointerMove = (event: ReactPointerEvent<HTMLElement>) => { if (!monthStart.current) return; const dx = event.clientX - monthStart.current.x; const dy = event.clientY - monthStart.current.y; if (Math.abs(dx) > Math.abs(dy)) setMonthOffset(Math.max(-96, Math.min(96, dx))); };
  const pointerUp = (event: ReactPointerEvent<HTMLElement>) => { if (!monthStart.current) return; const dx = event.clientX - monthStart.current.x; const dy = event.clientY - monthStart.current.y; monthStart.current = null; setMonthDragging(false); setMonthOffset(0); if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy)) { suppressMonthClick.current = true; moveMonth(dx < 0 ? 1 : -1); } };
  const marker = (date: string) => data?.dates[date] ?? { fixedCount: 0, fixedCompletedCount: 0, fixedSkippedCount: 0, shoppingCount: 0, purchasedShoppingCount: 0, tasks: [] };
  return <AppFrame current="/calendar" onNavigate={onNavigate}><ErrorMessage message={message ? `Calendarを取得できませんでした。${message}` : ""} /><main className="calendar-page" aria-busy={loading}><header className="calendar-header"><div className="calendar-header__title-row"><button type="button" className="calendar-icon-button" aria-label="前の月" onClick={() => moveMonth(-1)}><ChevronLeft /></button><h1>{formatCalendarMonth(visibleMonth)}</h1><button type="button" className="calendar-icon-button" aria-label="次の月" onClick={() => moveMonth(1)}><ChevronRight /></button></div><div className="calendar-header__today-row"><button type="button" className="calendar-today-button" onClick={goToday}>今日</button></div></header><section className={`calendar-month-grid${monthDirection ? ` is-month-transitioning-${monthDirection}` : ""}`} role="grid" aria-label={`${formatCalendarMonth(visibleMonth)}のカレンダー`} data-swipe-dragging={monthDragging ? "true" : "false"} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { monthStart.current = null; setMonthDragging(false); setMonthOffset(0); }} onClickCapture={(event) => { if (!suppressMonthClick.current) return; event.preventDefault(); event.stopPropagation(); suppressMonthClick.current = false; }} style={{ "--month-swipe-offset": `${monthOffset}px` } as CSSProperties}><div className="calendar-weekday-row" aria-hidden="true">{["日", "月", "火", "水", "木", "金", "土"].map((label, index) => <span key={label} className={index === 0 ? "is-sunday" : index === 6 ? "is-saturday" : ""}>{label}</span>)}</div><div className="calendar-grid-body">{gridDates.map((date) => { const item = marker(date); const inMonth = date.slice(0, 7) === visibleMonth.slice(0, 7); const day = new Date(`${date}T00:00:00Z`).getUTCDay(); const names = item.tasks.slice(0, 2); const more = Math.max(0, item.tasks.length - names.length); return <div key={date} className={`calendar-day-cell${inMonth ? "" : " is-outside-month"}${item.shoppingCount ? " has-shopping" : ""}`} role="gridcell" tabIndex={0} aria-label={`${formatCalendarDateLong(date)}${item.tasks.length ? `、タスク${item.tasks.length}件` : ""}${item.shoppingCount ? `、買い物${item.shoppingCount}件` : ""}`} onClick={() => openDate(date)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openDate(date); } }}><span className={`calendar-day-number calendar-day-number--${day}${date === (data?.today ?? today) ? " is-today" : ""}`}>{Number(date.slice(8, 10))}</span><div className="calendar-day-tasks">{names.map((task) => <button type="button" key={task.id} className={`calendar-day-task${task.deadline ? " is-deadline" : ""}`} title={task.title} onClick={(event) => { event.stopPropagation(); openDate(date); }}>{task.title}</button>)}{more ? <button type="button" className="calendar-day-more" onClick={(event) => { event.stopPropagation(); openDate(date); }}>+{more}</button> : null}</div>{item.shoppingCount ? <span className="calendar-day-shopping" aria-hidden="true"><ShoppingCart /><span>{item.shoppingCount}</span></span> : null}</div>; })}</div></section><p className="calendar-status" role="status" aria-live="polite">{loading && !data ? "カレンダーを読み込んでいます。" : ""}</p></main>{selectedDate ? <CalendarDateSheet household={household} date={selectedDate} data={data} loading={loading} onClose={() => { setSelectedDate(null); onNavigate("/calendar"); }} onNavigateDate={(next) => { setSelectedDate(next); onNavigate(`/calendar?date=${encodeURIComponent(next)}`); }} onRefresh={refresh} onNavigate={onNavigate} /> : null}</AppFrame>;
}

const calendarWeekdays = ["日", "月", "火", "水", "木", "金", "土"] as const;
function formatCalendarDateLong(dateKey: string) { const date = new Date(`${dateKey}T00:00:00Z`); return `${date.getUTCMonth() + 1}月${date.getUTCDate()}日 ${calendarWeekdays[date.getUTCDay()]}曜日`; }
function calendarTaskActionScope(task: TodayTask, date: string) { return task.modelRecurrenceType === "once" ? { targetDate: task.targetDate ?? date, calendarDate: date } : { targetDate: date, calendarDate: date }; }

/* eslint-disable @typescript-eslint/no-misused-promises */
function CalendarDateSheet({ household, date, data, loading, onClose, onNavigateDate, onRefresh, onNavigate }: { household: Household; date: string; data: Awaited<ReturnType<typeof listCalendarTasks>> | null; loading: boolean; onClose: () => void; onNavigateDate: (date: string) => void; onRefresh: () => Promise<void>; onNavigate: (route: NavigationPath) => void }) {
  void household;
  const reducedMotion = usePrefersReducedMotion();
  const [offset, setOffset] = useState(0); const [dragging, setDragging] = useState(false); const [completedOpen, setCompletedOpen] = useState(false); const [completingIds, setCompletingIds] = useState<Set<string>>(new Set()); const [passingIds, setPassingIds] = useState<Set<string>>(new Set()); const [restoringIds, setRestoringIds] = useState<Set<string>>(new Set()); const [direction, setDirection] = useState<"next" | "previous" | null>(null); const [statusMessage, setStatusMessage] = useState(""); const start = useRef<{ x: number; y: number } | null>(null); const suppressClick = useRef(false);
  useEffect(() => { setCompletedOpen(false); }, [date]);
  const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, reducedMotion ? 0 : ms));
  const moveDate = (amount: number) => { setDirection(amount > 0 ? "next" : "previous"); window.setTimeout(() => setDirection(null), reducedMotion ? 0 : MOTION_MS.large); onNavigateDate(addDays(date, amount)); };
  const complete = async (task: TodayTask) => { if (completingIds.has(task.id) || passingIds.has(task.id) || restoringIds.has(task.id)) return; setCompletingIds((ids) => new Set(ids).add(task.id)); try { await changeTaskState(task.id, "complete", calendarTaskActionScope(task, date)); await wait(MOTION_MS.completion); await onRefresh(); } catch (error) { setStatusMessage(apiErrorMessage(error)); await onRefresh(); } finally { setCompletingIds((ids) => { const next = new Set(ids); next.delete(task.id); return next; }); } };
  const pass = async (task: TodayTask) => { if (completingIds.has(task.id) || passingIds.has(task.id) || restoringIds.has(task.id)) return; setPassingIds((ids) => new Set(ids).add(task.id)); try { await changeTaskState(task.id, "skip", calendarTaskActionScope(task, date)); await wait(MOTION_MS.pass); await onRefresh(); } catch (error) { setStatusMessage(apiErrorMessage(error)); await onRefresh(); } finally { setPassingIds((ids) => { const next = new Set(ids); next.delete(task.id); return next; }); } };
  const restore = async (record: CalendarCompletedRecord) => { if (completingIds.has(record.taskId) || passingIds.has(record.taskId) || restoringIds.has(record.taskId)) return; setRestoringIds((ids) => new Set(ids).add(record.taskId)); try { await restoreCalendarTaskRecord(record.taskId, record.id, date); await wait(MOTION_MS.restore); await onRefresh(); } catch (error) { setStatusMessage(apiErrorMessage(error)); await onRefresh(); } finally { setRestoringIds((ids) => { const next = new Set(ids); next.delete(record.taskId); return next; }); } };
  const direct = data?.selected.fixed ?? []; const period = [...(data?.selected.weeklyFlexible ?? []), ...(data?.selected.monthlyFlexible ?? [])].sort((a, b) => (a.deadlineDate ?? "").localeCompare(b.deadlineDate ?? "")); const completed = data?.selected.completed ?? [];
  return <div className="calendar-date-layer"><button type="button" className="calendar-date-backdrop" aria-label="背景を閉じる" onClick={onClose} /><section role="dialog" aria-modal="true" aria-labelledby="calendar-date-sheet-title" className={`calendar-date-sheet${dragging ? " is-swipe-dragging" : ""}${direction ? ` is-date-transitioning-${direction}` : ""}`} onPointerDown={(event) => { event.stopPropagation(); start.current = { x: event.clientX, y: event.clientY }; setDragging(true); }} onPointerMove={(event) => { if (!start.current) return; const dx = event.clientX - start.current.x; const dy = event.clientY - start.current.y; if (Math.abs(dx) > Math.abs(dy)) setOffset(Math.max(-88, Math.min(88, dx))); }} onPointerUp={(event) => { if (!start.current) return; const dx = event.clientX - start.current.x; const dy = event.clientY - start.current.y; start.current = null; setDragging(false); setOffset(0); if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy)) { suppressClick.current = true; moveDate(dx < 0 ? 1 : -1); } }} onPointerCancel={() => { start.current = null; setDragging(false); setOffset(0); }} onClickCapture={(event) => { if (!suppressClick.current) return; event.preventDefault(); event.stopPropagation(); suppressClick.current = false; }}><div className="calendar-date-sheet__handle" aria-hidden="true" /><header className="calendar-date-sheet__header"><button type="button" className="calendar-date-sheet__close" onClick={onClose}><X /><span>閉じる</span></button><div className="calendar-date-sheet__nav" aria-label="日付を移動"><button type="button" aria-label="前の日" onClick={() => moveDate(-1)}><ChevronLeft /></button><button type="button" aria-label="次の日" onClick={() => moveDate(1)}><ChevronRight /></button></div></header><div className="calendar-date-sheet__content" style={{ "--date-swipe-offset": `${offset}px` } as CSSProperties}><h2 id="calendar-date-sheet-title">{formatCalendarDateLong(date)}</h2><CalendarDateSection title="この日" tasks={direct} completingIds={completingIds} passingIds={passingIds} restoringIds={restoringIds} onComplete={complete} onEdit={(task) => onNavigate(`/tasks/${task.id}/edit?origin=calendar&calendarDate=${date}`)} onPass={pass} /><CalendarDateSection title="期間中" tasks={period} completingIds={completingIds} passingIds={passingIds} restoringIds={restoringIds} onComplete={complete} onEdit={(task) => onNavigate(`/tasks/${task.id}/edit?origin=calendar&calendarDate=${date}`)} onPass={pass} />{completed.length ? <section className="home-completed calendar-completed-section"><button className="home-completed__history-toggle" type="button" aria-expanded={completedOpen} onClick={() => setCompletedOpen((open) => !open)}><span>完了済み {completed.length}</span><ChevronRight className={completedOpen ? "is-open" : ""} /></button>{completedOpen ? <div className="home-history__list home-completed__list">{completed.map((record) => <CalendarHistoryRow key={record.id} record={record} busy={restoringIds.has(record.taskId)} onEdit={() => onNavigate(`/tasks/${record.taskId}/edit?origin=calendar&calendarDate=${date}`)} onRestore={() => void restore(record)} />)}</div> : null}</section> : null}{data?.selected.shopping.length ? <section className="calendar-shopping-section"><h3>買うもの</h3><div className="calendar-shopping-list">{data.selected.shopping.map((item) => <button key={item.id} type="button" className="calendar-shopping-row" aria-label={`${item.name}${item.quantity ? ` ${item.quantity}` : ""}`} onClick={() => onNavigate(`/shopping?item=${item.id}`)}><span>{item.name}</span>{item.quantity ? <span>{item.quantity}</span> : null}</button>)}</div></section> : null}<p className="calendar-status" role="status" aria-live="polite">{statusMessage}{loading && data ? "読み込み中" : ""}</p></div></section></div>;
}

/* eslint-enable @typescript-eslint/no-misused-promises */
function CalendarDateSection({ title, tasks, completingIds, passingIds, restoringIds, onComplete, onEdit, onPass }: { title: string; tasks: TodayTask[]; completingIds: Set<string>; passingIds: Set<string>; restoringIds: Set<string>; onComplete: (task: TodayTask) => void; onEdit: (task: TodayTask) => void; onPass: (task: TodayTask) => void }) { return <section className="calendar-date-section"><h3>{title}</h3>{tasks.length ? <div className="calendar-detail-task-list">{tasks.map((task) => <CalendarDetailTask key={task.id} task={task} completing={completingIds.has(task.id)} passing={passingIds.has(task.id)} restoring={restoringIds.has(task.id)} onComplete={() => onComplete(task)} onEdit={() => onEdit(task)} onPass={() => onPass(task)} />)}</div> : <p className="calendar-date-section__empty">なし</p>}</section>; }
function CalendarDetailTask({ task, completing, passing, restoring, onComplete, onEdit, onPass }: { task: TodayTask; completing: boolean; passing: boolean; restoring: boolean; onComplete: () => void; onEdit: () => void; onPass: () => void }) { const [actionsOpen, setActionsOpen] = useState(false); const start = useRef<{ x: number; y: number } | null>(null); const suppress = useRef(false); const busy = completing || passing || restoring; return <div className={`calendar-detail-task${actionsOpen ? " is-actions-open" : ""}${completing ? " is-completing" : ""}${passing ? " is-passing" : ""}${restoring ? " is-restoring" : ""}`} onPointerDown={(event) => { event.stopPropagation(); start.current = { x: event.clientX, y: event.clientY }; }} onPointerUp={(event) => { event.stopPropagation(); if (!start.current) return; const dx = event.clientX - start.current.x; const dy = event.clientY - start.current.y; start.current = null; if (dx < -48 && Math.abs(dx) > Math.abs(dy)) { suppress.current = true; setActionsOpen(true); } }} onPointerCancel={(event) => { event.stopPropagation(); start.current = null; }} onClickCapture={(event) => { if (!suppress.current) return; if ((event.target as Element).closest(".calendar-detail-task__actions")) { suppress.current = false; return; } event.preventDefault(); event.stopPropagation(); suppress.current = false; }}><button type="button" className="calendar-detail-task__main" disabled={busy} onClick={onComplete}><span className={`calendar-detail-task__check${completing ? " is-completing" : ""}`} aria-hidden="true">{completing ? <Check /> : null}</span><span>{task.title}</span></button><button type="button" className="calendar-detail-task__more" aria-label={`${task.title}の操作`} aria-expanded={actionsOpen} hidden={actionsOpen} onClick={() => setActionsOpen((open) => !open)}><Ellipsis /></button>{actionsOpen ? <div className="calendar-detail-task__actions"><button type="button" onClick={onEdit}>編集</button><button type="button" className="is-pass" onClick={onPass}>パス</button></div> : null}</div>; }
function CalendarHistoryRow({ record, busy, onEdit, onRestore }: { record: CalendarCompletedRecord; busy: boolean; onEdit: () => void; onRestore: () => void }) { const avatar = record.actualCompleter; return <HomeSwipeRow actionsOpenInitially={false} busy={busy} onEdit={record.taskActive ? onEdit : undefined} onSecondary={onRestore} secondaryLabel="戻す" restoreOnly={!record.taskActive} rowClassName="calendar-history-row"><div className="m2-home__row-main m2-home__history-main"><span className="m2-home__row-details"><span className="m2-home__task-title">{record.title}</span></span>{avatar.displayName ? <HomeAvatar member={avatar} label="完了者" /> : null}</div></HomeSwipeRow>; }

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function LegacyCalendarScreen({
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
  onNavigate
}: {
  household: Household;
  user: AuthUser;
  onNavigate: (route: NavigationPath) => void;
  onLogout: () => void;
}) {
  const { data, loading, message, refresh } = useDashboardData();
  const prefersReducedMotion = usePrefersReducedMotion();
  const [completedOpen, setCompletedOpen] = useState(false);
  const [passedOpen, setPassedOpen] = useState(false);
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set());
  const [passingIds, setPassingIds] = useState<Set<string>>(new Set());
  const [restoringIds, setRestoringIds] = useState<Set<string>>(new Set());
  const [statusMessage, setStatusMessage] = useState("");
  const today = data?.date ?? todayInTimezone(household.timezone);
  const activeTasks = (data?.homeTasks ?? data?.todayTasks ?? []).filter(
    (task) => task.status === "pending" || task.status === "in_progress"
  );
  const completed = data?.completedRecords ?? [];
  const passed = data?.passedRecords ?? [];
  const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, prefersReducedMotion ? 0 : ms));
  const setActionId = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string, busy: boolean) => setter((current) => {
    const next = new Set(current);
    if (busy) next.add(id); else next.delete(id);
    return next;
  });
  const isBusy = (id: string) => completingIds.has(id) || passingIds.has(id) || restoringIds.has(id);
  const complete = async (task: TodayTask) => {
    if (isBusy(task.id)) return;
    setActionId(setCompletingIds, task.id, true);
    setStatusMessage("");
    const request = changeTaskState(task.id, "complete", homeTaskActionScope(task, household));
    try {
      await Promise.all([request, wait(MOTION_MS.completion)]);
      await refresh();
    } catch (error) {
      setStatusMessage(apiErrorMessage(error));
      await refresh();
    } finally {
      setActionId(setCompletingIds, task.id, false);
    }
  };
  const pass = async (task: TodayTask) => {
    if (isBusy(task.id)) return;
    setActionId(setPassingIds, task.id, true);
    setStatusMessage(`「${task.title}」をパスしました`);
    try {
      await Promise.all([
        changeTaskState(task.id, "skip", homeTaskActionScope(task, household)),
        wait(MOTION_MS.pass)
      ]);
      await refresh();
    } catch (error) {
      setStatusMessage(apiErrorMessage(error));
      await refresh();
    } finally {
      setActionId(setPassingIds, task.id, false);
    }
  };
  const restore = async (record: DashboardToday["completedRecords"][number]) => {
    if (isBusy(record.taskId)) return;
    setActionId(setRestoringIds, record.taskId, true);
    try {
      await Promise.all([restoreTaskRecord(record.taskId, record.id), wait(MOTION_MS.restore)]);
      setStatusMessage(`「${record.title}」を戻しました`);
      await refresh();
    } catch (error) {
      setStatusMessage(apiErrorMessage(error));
      await refresh();
    } finally {
      setActionId(setRestoringIds, record.taskId, false);
    }
  };
  const editRecord = (record: DashboardToday["completedRecords"][number]) => onNavigate(`/tasks/${record.taskId}/edit`);
  return (
    <AppFrame current="/home" onNavigate={onNavigate}>
      <main className="m2-home" aria-busy={loading}>
        <header className="m2-home__header">
          <p>{formatHomeDate(today)}</p>
          <h1>やること</h1>
        </header>
        <ErrorMessage message={message} />
        {activeTasks.length > 0 ? (
          <section className="m2-home__task-list" aria-label="やること一覧">
            {activeTasks.map((task) => (
              <HomeSwipeRow
                key={task.id}
                actionsOpenInitially={false}
                busy={isBusy(task.id)}
                onEdit={() => onNavigate(`/tasks/${task.id}/edit`)}
                onSecondary={() => void pass(task)}
                secondaryLabel="パス"
                rowClassName={restoringIds.has(task.id) ? "is-restoring-row" : completingIds.has(task.id) ? "is-completing-row" : passingIds.has(task.id) ? "is-passing-row" : ""}
              >
                <button className="m2-home__row-main" type="button" disabled={isBusy(task.id)} onClick={() => void complete(task)} aria-label={`${task.title}を完了`}>
                  <span className={`m2-home__check m2-home__check--${homeTaskScope(task)}${completingIds.has(task.id) ? " is-completing" : ""}`} aria-hidden="true">
                    {completingIds.has(task.id) ? <Check /> : null}
                  </span>
                  <span className="m2-home__row-details">
                    <span className="m2-home__task-title">{task.title}</span>
                    <span className="m2-home__deadline">{formatHomeDeadline(task, today)}</span>
                  </span>
                  {homeMemberForTask(task, data?.members ?? []) ? <HomeAvatar member={homeMemberForTask(task, data?.members ?? [])!} label="担当" /> : null}
                </button>
              </HomeSwipeRow>
            ))}
          </section>
        ) : (
          <section className="m2-home__empty" aria-label="やることなし">
            <span className="m2-home__empty-illustration" aria-hidden="true"><House /><Check /></span>
            <p>やることはありません</p>
          </section>
        )}
        {completed.length > 0 ? (
          <section className="m2-home__history m2-home__history--completed">
            <button className="m2-home__history-toggle" type="button" aria-expanded={completedOpen} onClick={() => setCompletedOpen((open) => !open)}>
              <span>完了済み {completed.length}</span><ChevronRight aria-hidden="true" className={completedOpen ? "is-open" : ""} />
            </button>
            {completedOpen ? <div className="m2-home__history-list">{completed.map((record) => <HomeHistoryRow key={record.id} record={record} busy={restoringIds.has(record.taskId)} onEdit={() => editRecord(record)} onRestore={() => void restore(record)} />)}</div> : null}
          </section>
        ) : null}
        {passed.length > 0 ? (
          <section className="m2-home__history m2-home__history--passed">
            <button className="m2-home__history-toggle" type="button" aria-expanded={passedOpen} onClick={() => setPassedOpen((open) => !open)}>
              <span>パス済み {passed.length}</span><ChevronRight aria-hidden="true" className={passedOpen ? "is-open" : ""} />
            </button>
            {passedOpen ? <div className="m2-home__history-list">{passed.map((record) => <HomeHistoryRow key={record.id} record={record} busy={restoringIds.has(record.taskId)} onEdit={() => editRecord(record)} onRestore={() => void restore(record)} passed />)}</div> : null}
          </section>
        ) : null}
        <button className="m2-home__shopping" type="button" onClick={() => onNavigate("/shopping")}>
          <span>買い物 {data?.shopping.pendingCount ?? 0}件</span><ChevronRight aria-hidden="true" />
        </button>
        <p className="m2-home__status" role="status" aria-live="polite">{statusMessage}</p>
      </main>
    </AppFrame>
  );
}

function homeTaskActionScope(task: TodayTask, household: Household) {
  const today = todayInTimezone(household.timezone);
  if (task.modelRecurrenceType === "once") return { targetDate: task.targetDate ?? today };
  if (!task.modelRecurrenceType && task.recurrenceType === "weekly") return { targetWeekStart: weekStartFor(today, household.weekStartsOn) };
  return { targetDate: today };
}

function homeTaskScope(task: TodayTask): "date" | "week" | "month" | "none" | "overdue" {
  if (task.overdue) return "overdue";
  const hasDeadline = Boolean(task.deadlineDate ?? (task.modelRecurrenceType === "once" ? task.targetDate : null) ?? task.deadlineTime ?? task.scheduledTime);
  if (!hasDeadline) return "none";
  if (task.modelRecurrenceType === "weekly_flexible") return "week";
  if (task.modelRecurrenceType === "monthly_flexible") return "month";
  if (task.modelRecurrenceType || task.recurrenceType === "daily" || task.recurrenceType === "scheduled") return "date";
  return "none";
}

function formatHomeDate(dateKey: string) {
  const parts = new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", weekday: "long", timeZone: "UTC" }).formatToParts(new Date(`${dateKey}T00:00:00Z`));
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
  return `${month}月${day}日 ${weekday}`;
}

function formatHomeDeadline(task: TodayTask, today: string) {
  const date = task.deadlineDate ?? (task.modelRecurrenceType === "once" ? task.targetDate : null);
  const time = task.deadlineTime ?? task.scheduledTime;
  if (!date && !time) return "締切なし";
  if (!date) return `${time}まで`;
  if (date === today && !time) return "今日中";
  const dateLabel = date === today ? "" : `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
  if (date !== today && homeTaskScope(task) === "week") {
    return `${new Intl.DateTimeFormat("ja-JP", { weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`))}曜${time ? ` ${time}` : ""}まで`;
  }
  return `${dateLabel}${time ? (dateLabel ? ` ${time}` : time) : ""}まで`;
}

function homeMemberForTask(task: TodayTask, members: DashboardToday["members"]) {
  return task.assignedUserId ? members.find((member) => member.userId === task.assignedUserId) ?? null : null;
}

function HomeAvatar({ member, label }: { member: { displayName: string | null; color?: string | null; avatarUrl?: string | null }; label: string }) {
  const name = member.displayName ?? "メンバー";
  return <span className="m2-home__avatar" role="img" aria-label={`${label}: ${name}`}>{member.avatarUrl ? <img src={member.avatarUrl} alt="" /> : name.slice(0, 1)}</span>;
}

function HomeSwipeRow({ children, actionsOpenInitially, busy, onEdit, onSecondary, secondaryLabel, rowClassName = "", restoreOnly = false }: { children: ReactNode; actionsOpenInitially: boolean; busy: boolean; onEdit?: () => void; onSecondary: () => void; secondaryLabel: string; rowClassName?: string; restoreOnly?: boolean }) {
  const actionWidth = restoreOnly ? 72 : 136;
  const [actionsOpen, setActionsOpen] = useState(actionsOpenInitially);
  const [offset, setOffset] = useState(actionsOpenInitially ? -actionWidth : 0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const vertical = useRef(false);
  const horizontal = useRef(false);
  const suppressClick = useRef(false);
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!start.current || vertical.current) return;
    const dx = event.clientX - start.current.x;
    const dy = event.clientY - start.current.y;
    if (!horizontal.current && Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) {
      vertical.current = true;
      setDragging(false);
      setOffset(actionsOpen ? -actionWidth : 0);
      return;
    }
    if (Math.abs(dx) > 8) horizontal.current = true;
    if (horizontal.current) {
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setDragging(true);
      setOffset(Math.max(-actionWidth, Math.min(0, (actionsOpen ? -actionWidth : 0) + dx)));
    }
  };
  const end = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    const dx = event.clientX - start.current.x;
    const dy = event.clientY - start.current.y;
    const wasVertical = vertical.current || Math.abs(dy) > Math.abs(dx);
    start.current = null;
    vertical.current = false;
    horizontal.current = false;
    setDragging(false);
    if (wasVertical) { setOffset(actionsOpen ? -actionWidth : 0); return; }
    if (-dx > 48) { suppressClick.current = true; setActionsOpen(true); setOffset(-actionWidth); }
    else if (dx > 24 && actionsOpen) { suppressClick.current = true; setActionsOpen(false); setOffset(0); }
    else setOffset(actionsOpen ? -actionWidth : 0);
  };
  const clickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!suppressClick.current) return;
    if (event.target instanceof Element && event.target.closest(".m2-home__actions")) { suppressClick.current = false; return; }
    event.preventDefault(); event.stopPropagation(); suppressClick.current = false;
  };
  return <div className={`m2-home__row ${actionsOpen ? "is-actions-open" : ""} ${dragging ? "is-dragging" : ""} ${rowClassName}`} onPointerDown={(event) => { event.stopPropagation(); start.current = { x: event.clientX, y: event.clientY }; setDragging(false); }} onPointerMove={(event) => { event.stopPropagation(); move(event); }} onPointerUp={(event) => { event.stopPropagation(); end(event); }} onPointerCancel={(event) => { event.stopPropagation(); start.current = null; vertical.current = false; horizontal.current = false; setDragging(false); setOffset(actionsOpen ? -actionWidth : 0); }} onClickCapture={clickCapture}>
    <div className="m2-home__row-content" style={{ "--m2-swipe-offset": `${offset}px` } as CSSProperties}>
      {children}
      <button type="button" className="m2-home__more" aria-label="操作" aria-expanded={actionsOpen} onClick={() => { const next = !actionsOpen; setActionsOpen(next); setOffset(next ? -actionWidth : 0); }}><Ellipsis aria-hidden="true" /></button>
    </div>
    <div className={`m2-home__actions ${restoreOnly ? "is-restore-only" : ""}`} aria-label="操作メニュー"><span aria-hidden="true" />{!restoreOnly && onEdit ? <button type="button" onClick={onEdit}>編集</button> : null}<button type="button" className="is-secondary" disabled={busy} onClick={onSecondary}>{secondaryLabel}</button></div>
  </div>;
}

function HomeHistoryRow({ record, busy, onEdit, onRestore, passed = false }: { record: DashboardToday["completedRecords"][number]; busy: boolean; onEdit: () => void; onRestore: () => void; passed?: boolean }) {
  const deleted = !record.taskActive;
  const member = passed ? record.assignedUser : record.actualCompleter;
  return <HomeSwipeRow actionsOpenInitially={false} busy={busy} onEdit={deleted ? undefined : onEdit} onSecondary={onRestore} secondaryLabel="戻す" restoreOnly={deleted} rowClassName={busy ? "is-restoring-row" : ""}>
    <div className="m2-home__row-main m2-home__history-main"><span className="m2-home__row-details"><span className="m2-home__task-title">{record.title}</span></span>{member?.displayName ? <HomeAvatar member={member} label={passed ? "担当" : "完了者"} /> : null}</div>
  </HomeSwipeRow>;
}

// Kept for the legacy direct route surface until the planned route cleanup milestone.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function LegacyHomeScreen({
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

function TaskFormScreen(props: {
  household: Household;
  user: AuthUser;
  mode: "create" | "edit" | "template-edit";
  taskId?: string;
  templateId?: string;
  onNavigate: (route: NavigationPath) => void;
  onLogout: () => void;
}) {
  if (props.mode === "template-edit") return <LegacyTaskFormScreen {...props} />;
  return <M2TaskFormScreen household={props.household} user={props.user} mode={props.mode} taskId={props.taskId} onNavigate={props.onNavigate} onLogout={props.onLogout} />;
}

type M2TaskSheet = "repeat" | "assignee" | "reuse" | "delete" | null;

const m2RepeatOptions: Array<{ value: TaskFormRecurrence; label: string }> = [
  { value: "once", label: "今回だけ" },
  { value: "daily", label: "毎日" },
  { value: "weekly_fixed", label: "曜日を決める" },
  { value: "monthly_fixed", label: "毎月○日" },
  { value: "weekly_flexible", label: "今週のどこか" },
  { value: "monthly_flexible", label: "今月のどこか" }
];

function m2RepeatLabel(form: TaskFormState) {
  if (form.recurrence === "legacy_weekly") return `週に${form.weeklyTargetCount}回（旧形式）`;
  const option = m2RepeatOptions.find((item) => item.value === form.recurrence)?.label ?? "毎日";
  if (form.recurrence === "weekly_fixed" && form.weekdays.length > 0) return form.weekdays.map((day) => weekdayLabels[day]).join("・");
  if (form.recurrence === "monthly_fixed") return `毎月${form.monthlyDayOfMonth ?? 1}日`;
  return option;
}

function M2TaskFormScreen({ household, mode, taskId, onNavigate }: { household: Household; user: AuthUser; mode: "create" | "edit"; taskId?: string; onNavigate: (route: NavigationPath) => void; onLogout: () => void }) {
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [recentTasks, setRecentTasks] = useState<Task[]>([]);
  const [form, setForm] = useState<TaskFormState>(() => ({ ...defaultTaskForm(), startDate: todayInTimezone(household.timezone), targetDate: todayInTimezone(household.timezone) }));
  const [originalForm, setOriginalForm] = useState<TaskFormState | null>(null);
  const [sheet, setSheet] = useState<M2TaskSheet>(null);
  const [reuseQuery, setReuseQuery] = useState("");
  const [lastCompleted, setLastCompleted] = useState<string | null>(null);
  const [errors, setErrors] = useState<TaskFormErrors>({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const today = todayInTimezone(household.timezone);
  const returnSearch = new URLSearchParams(window.location.search);
  const calendarReturnDate = returnSearch.get("origin") === "calendar" && /^\d{4}-\d{2}-\d{2}$/.test(returnSearch.get("calendarDate") ?? "") ? returnSearch.get("calendarDate") : null;
  const returnRoute = calendarReturnDate ? `/calendar?date=${encodeURIComponent(calendarReturnDate)}` : "/home";

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      listMembers(controller.signal),
      mode === "create" ? listRecentTaskDefinitions(8, controller.signal) : Promise.resolve({ tasks: [] as Task[] }),
      mode === "edit" && taskId ? getTask(taskId, controller.signal) : Promise.resolve(null),
      mode === "edit" && taskId
        ? listTaskHistory(taskId, 100, controller.signal).catch((error) => {
            if (error instanceof DOMException && error.name === "AbortError") throw error;
            return { records: [] as TaskRecord[] };
          })
        : Promise.resolve({ records: [] as TaskRecord[] })
    ]).then(([memberResult, recentResult, taskResult, historyResult]) => {
      setMembers(memberResult.members);
      setRecentTasks(recentResult.tasks);
      if (taskResult && "task" in taskResult) {
        const next = taskToFormState(taskResult.task);
        setForm(next);
        setOriginalForm(next);
      }
      const latest = historyResult.records.filter((record) => record.status === "completed" && record.completedAt).sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)))[0];
      setLastCompleted(latest?.completedAt ?? null);
    }).catch((error) => {
      if (!(error instanceof DOMException && error.name === "AbortError")) setMessage(apiErrorMessage(error));
    }).finally(() => setLoading(false));
    return () => controller.abort();
  }, [mode, taskId]);

  const setField = <K extends keyof TaskFormState>(key: K, value: TaskFormState[K]) => {
    setForm((current) => normalizeTaskForm({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };
  const dateValue = form.recurrence === "once" ? form.targetDate : form.startDate;
  const updateDate = (value: string) => {
    if (form.recurrence === "once") setForm((current) => ({ ...current, startDate: value, targetDate: value }));
    else setField("startDate", value);
  };
  const chooseRepeat = (value: TaskFormRecurrence) => {
    setForm((current) => changeTaskFormRecurrence(current, value));
    if (value !== "weekly_fixed" && value !== "monthly_fixed") setSheet(null);
  };
  const selectReuse = (task: Task) => {
    const next = taskToFormState(task);
    setForm({ ...next, startDate: today, targetDate: next.recurrence === "once" ? today : "" });
    setErrors({});
    setMessage("以前の項目を反映しました");
    setSheet(null);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    const nextErrors = validateTaskFormState(form);
    setErrors(nextErrors);
    setMessage("");
    if (Object.keys(nextErrors).length > 0) return;
    setSubmitting(true);
    try {
      const payload = taskFormToPayload(form);
      const originalPayload = originalForm ? taskFormToPayload(originalForm) : null;
      const patch = originalPayload ? Object.fromEntries(Object.entries(payload).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(originalPayload[key as keyof typeof originalPayload]))) : payload;
      if (mode === "edit" && taskId) await updateTask(taskId, patch);
      else await createTask(payload);
      onNavigate(returnRoute);
    } catch (error) {
      setMessage(apiErrorMessage(error));
      if (error instanceof ApiError && error.details) setErrors(error.details);
    } finally {
      setSubmitting(false);
    }
  };
  const confirmDelete = async () => {
    if (!taskId || deleting) return;
    setDeleting(true);
    setMessage("");
    try {
      await deactivateTask(taskId);
      onNavigate(returnRoute);
    } catch (error) {
      setMessage(apiErrorMessage(error));
      setDeleting(false);
    }
  };
  const filteredRecent = recentTasks.filter((task) => `${task.title}${recurrenceDescription(task)}`.toLocaleLowerCase().includes(reuseQuery.trim().toLocaleLowerCase()));
  const selectedMember = form.assignedUserId ? members.find((member) => member.userId === form.assignedUserId) ?? null : null;
  if (loading) return <LoadingScreen message="家事を読み込んでいます" />;
  return (
    <AppFrame current="/home" onNavigate={onNavigate} showBottomNavigation={false}>
      <main className="m2-task-form-page">
        <header className="m2-task-form__header">
          <button type="button" className="m2-task-form__back" aria-label="戻る" onClick={() => onNavigate(returnRoute)}><ChevronLeft aria-hidden="true" /><span>戻る</span></button>
          <h1>{mode === "create" ? "家事を追加" : "家事を編集"}</h1>
          <span aria-hidden="true" />
        </header>
        {lastCompleted ? <p className="m2-task-form__last">前回：{formatLastCompletion(lastCompleted, household.timezone)}</p> : null}
        {mode === "create" ? <button type="button" className="m2-task-form__reuse-trigger" onClick={() => setSheet("reuse")}><span>以前の項目から選ぶ</span><ChevronRight aria-hidden="true" /></button> : null}
        <form className="m2-task-form" aria-busy={submitting || deleting} onSubmit={(event) => void submit(event)}>
          <ErrorMessage message={message} />
          <FormField id="m2-task-title" label="家事名" error={errors.title}><TextInput id="m2-task-title" value={form.title} error={errors.title} onChange={(value) => setField("title", value)} placeholder="家事名を入力" /></FormField>
          <button className="m2-task-form__row m2-task-form__row--button" type="button" aria-label={`繰り返し: ${m2RepeatLabel(form)}`} onClick={() => setSheet("repeat")}><span>繰り返し</span><span className="m2-task-form__row-current"><span>{m2RepeatLabel(form)}</span><ChevronRight aria-hidden="true" /></span></button>
          {form.recurrence === "legacy_weekly" ? <div className="legacy-task-notice" role="note"><strong>週に{form.weeklyTargetCount}回（旧形式）</strong><span>回数の意味を変えずに編集します。新しい繰り返しへ自動変換しません。</span></div> : null}
          <FormField id="m2-task-start-date" label="開始日" error={errors.startDate}><input id="m2-task-start-date" type="date" value={form.startDate || today} onChange={(event) => setField("startDate", event.target.value)} aria-invalid={errors.startDate ? "true" : "false"} /></FormField>
          <label className="m2-task-form__toggle"><span>終日</span><span className="m2-task-form__toggle-current">{form.deadlineTime ? "オフ" : "オン"}</span><span className={`m2-task-form__switch${!form.deadlineTime ? " is-on" : ""}`}><input className="m2-task-form__switch-input" type="checkbox" checked={!form.deadlineTime} aria-label="終日" onChange={(event) => setField("deadlineTime", event.target.checked ? "" : "09:00")} /><span className="m2-task-form__switch-track" aria-hidden="true"><span /></span></span></label>
          <div className={`m2-task-form__date-grid${!form.deadlineTime ? " m2-task-form__date-grid--all-day" : ""}`}>
            <FormField id="m2-task-date" label="日付" error={errors.targetDate}><input id="m2-task-date" type="date" value={dateValue || today} onChange={(event) => updateDate(event.target.value)} aria-invalid={errors.targetDate ? "true" : "false"} /></FormField>
            {form.deadlineTime ? <FormField id="m2-task-time" label="時刻" error={errors.deadlineTime}><input id="m2-task-time" type="time" value={form.deadlineTime} onChange={(event) => setField("deadlineTime", event.target.value)} /></FormField> : null}
          </div>
          {form.deadlineTime ? <div className="m2-task-form__compact-field"><label htmlFor="m2-task-notification">通知</label><select id="m2-task-notification" value={form.notificationOffsetMinutes === null ? "none" : String(form.notificationOffsetMinutes)} aria-invalid={errors.notificationOffsetMinutes ? "true" : "false"} aria-describedby={errors.notificationOffsetMinutes ? "m2-task-notification-error" : undefined} onChange={(event) => setField("notificationOffsetMinutes", event.target.value === "none" ? null : Number(event.target.value))}><option value="none">通知なし</option><option value="0">時刻ちょうど</option><option value="5">5分前</option><option value="10">10分前</option><option value="30">30分前</option><option value="60">1時間前</option><option value="120">2時間前</option></select>{errors.notificationOffsetMinutes ? <p className="field-error" id="m2-task-notification-error">{errors.notificationOffsetMinutes}</p> : null}</div> : null}
          <button type="button" className="m2-task-form__row" aria-label={`担当: ${selectedMember?.displayName ?? "誰でも"}`} onClick={() => setSheet("assignee")}><span>担当</span><span className="m2-task-form__row-current"><strong className="m2-task-form__assignee">{selectedMember ? <>{selectedMember.avatarUrl ? <img src={selectedMember.avatarUrl} alt="" /> : <span>{selectedMember.displayName.slice(0, 1)}</span>}{selectedMember.displayName}</> : "誰でも"}</strong><ChevronRight aria-hidden="true" /></span></button>
          <FormField id="m2-task-description" label="メモ" error={errors.description}><textarea id="m2-task-description" rows={2} value={form.description} onChange={(event) => setField("description", event.target.value)} placeholder="メモを入力" /></FormField>
          <div className={`m2-task-form__actions${mode === "edit" ? " m2-task-form__actions--edit" : ""}`}><button type="submit" className="m2-task-form__save" disabled={submitting}>{submitting ? "保存中…" : "保存"}</button>{mode === "edit" ? <button type="button" className="m2-task-form__delete" onClick={() => setSheet("delete")}>この家事を削除</button> : null}</div>
        </form>
        <BottomSheet open={sheet === "repeat"} title="繰り返し" onClose={() => setSheet(null)}><div className="m2-task-sheet__list">{m2RepeatOptions.map((option) => <button key={option.value} type="button" onClick={() => chooseRepeat(option.value)}><span>{option.label}</span>{form.recurrence === option.value ? <Check aria-hidden="true" /> : null}</button>)}{form.recurrence === "weekly_fixed" ? <div className="m2-task-sheet__detail"><span>曜日を選択</span><div className="m2-task-sheet__weekdays">{weekdayLabels.map((label, day) => <button key={label} type="button" aria-pressed={form.weekdays.includes(day)} onClick={() => setField("weekdays", form.weekdays.includes(day) ? form.weekdays.filter((item) => item !== day) : [...form.weekdays, day])}>{label}</button>)}</div><button type="button" className="m2-task-sheet__confirm" disabled={form.weekdays.length === 0} onClick={() => setSheet(null)}>決定</button></div> : null}{form.recurrence === "monthly_fixed" ? <div className="m2-task-sheet__detail"><FormField id="m2-month-day" label="毎月の日" error={errors.monthlyDayOfMonth}><input id="m2-month-day" type="number" min="1" max="31" value={form.monthlyDayOfMonth ?? 1} onChange={(event) => setField("monthlyDayOfMonth", Number(event.target.value))} /></FormField><button type="button" className="m2-task-sheet__confirm" onClick={() => setSheet(null)}>決定</button></div> : null}</div></BottomSheet>
        <BottomSheet open={sheet === "assignee"} title="担当" onClose={() => setSheet(null)}><div className="m2-task-sheet__list"><button type="button" onClick={() => { setForm((current) => ({ ...current, assignmentType: "anyone", assignedUserId: null })); setSheet(null); }}><span>誰でも</span>{form.assignmentType === "anyone" ? <Check aria-hidden="true" /> : null}</button>{members.map((member) => <button key={member.userId} type="button" onClick={() => { setForm((current) => ({ ...current, assignmentType: "specific", assignedUserId: member.userId })); setSheet(null); }}><span className="m2-task-form__assignee">{member.avatarUrl ? <img src={member.avatarUrl} alt="" /> : <span>{member.displayName.slice(0, 1)}</span>}{member.displayName}</span>{form.assignedUserId === member.userId ? <Check aria-hidden="true" /> : null}</button>)}</div></BottomSheet>
        <BottomSheet open={sheet === "reuse"} title="以前の項目から選ぶ" onClose={() => setSheet(null)}><div className="m2-task-sheet__reuse"><input aria-label="以前の項目を検索" placeholder="検索" value={reuseQuery} onChange={(event) => setReuseQuery(event.target.value)} />{filteredRecent.length > 0 ? <div className="m2-task-sheet__list">{filteredRecent.map((task) => <button key={task.id} type="button" onClick={() => selectReuse(task)}><span><strong>{task.title}</strong><small>{recurrenceDescription(task)}</small></span></button>)}</div> : <p>見つかりませんでした</p>}</div></BottomSheet>
        <BottomSheet open={sheet === "delete"} title="家事を削除しますか？" onClose={() => setSheet(null)}><div className="m2-task-sheet__delete"><p>この家事を削除します。</p><button type="button" className="m2-task-form__delete" disabled={deleting} onClick={() => void confirmDelete()}>削除する</button><button type="button" className="m2-task-sheet__cancel" onClick={() => setSheet(null)}>キャンセル</button></div></BottomSheet>
      </main>
    </AppFrame>
  );
}

function formatLastCompletion(value: string, timezone: string) {
  return new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", timeZone: timezone }).format(new Date(value));
}

function LegacyTaskFormScreen({
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

const visiblePurchasedShoppingItems = (items: ShoppingItem[], now = Date.now()) =>
  filterVisiblePurchasedShoppingItems(items, now);

function ShoppingM4ListScreen({
  household,
  onNavigate,
  targetItemId
}: {
  household: Household;
  user: AuthUser;
  onNavigate: (route: NavigationPath) => void;
  onLogout: () => void;
  targetItemId?: string | null;
}) {
  const { pending, purchased, members, loading, message, setMessage, refresh } = useShoppingData();
  const [orderedPending, setOrderedPending] = useState<ShoppingItem[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [purchasedOpen, setPurchasedOpen] = useState(false);
  const [actionsOpenId, setActionsOpenId] = useState<string | null>(null);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const visiblePurchased = visiblePurchasedShoppingItems(purchased);

  useEffect(() => setOrderedPending(pending), [pending]);

  useEffect(() => {
    if (!targetItemId || loading) return;
    const target = document.querySelector<HTMLElement>(`[data-shopping-m4-id="${CSS.escape(targetItemId)}"]`);
    if (!target) return;
    const isPurchased = visiblePurchasedShoppingItems(purchased).some((item) => item.id === targetItemId);
    if (isPurchased) setPurchasedOpen(true);
    setExpandedId(targetItemId);
    window.requestAnimationFrame(() => target.scrollIntoView({ block: "center", behavior: "smooth" }));
  }, [loading, targetItemId, pending, purchased]);

  const toggleExpanded = (itemId: string) => {
    setExpandedId((current) => (current === itemId ? null : itemId));
    setActionsOpenId(null);
  };

  const runPurchase = async (item: ShoppingItem, action: "purchase" | "unpurchase") => {
    setBusyItem(item.id);
    setMessage("");
    setStatus("");
    try {
      if (action === "purchase") await purchaseShoppingItem(item.id);
      else await unpurchaseShoppingItem(item.id);
      setExpandedId(null);
      setPurchasedOpen(action === "unpurchase" ? false : false);
      await refresh();
      setStatus(action === "purchase" ? `「${item.name}」を購入済みに移しました` : `「${item.name}」を未購入に戻しました`);
    } catch (error) {
      setMessage(shoppingErrorMessage(error));
      await refresh();
    } finally {
      setBusyItem(null);
    }
  };

  const reorderAround = (dragId: string, overId: string, clientY: number, rowTop: number, rowHeight: number) => {
    if (dragId === overId) return;
    setOrderedPending((current) => {
      const from = current.findIndex((item) => item.id === dragId);
      const over = current.findIndex((item) => item.id === overId);
      if (from < 0 || over < 0) return current;
      const after = clientY >= rowTop + rowHeight / 2;
      if ((from < over && !after) || (from > over && after)) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      const destination = from < over ? over : over;
      next.splice(destination, 0, moved);
      setDragOverId(overId);
      return next;
    });
  };

  const finishReorder = async () => {
    const ids = orderedPending.map((item) => item.id);
    setDraggingId(null);
    setDragOverId(null);
    if (ids.join(",") === pending.map((item) => item.id).join(",")) return;
    try {
      await reorderShoppingItems(ids);
      await refresh();
      setStatus("並び順を更新しました");
    } catch (error) {
      setMessage(shoppingErrorMessage(error));
      await refresh();
    }
  };

  return (
    <AppFrame current="/shopping" onNavigate={onNavigate}>
      <main className="shopping-m4" aria-busy={loading}>
        <header className="shopping-m4__header"><h1>買い物</h1></header>
        <ErrorMessage message={message} />
        {orderedPending.length > 0 ? (
          <section className="shopping-m4__list" aria-label="未購入の買い物一覧">
            {orderedPending.map((item) => (
              <ShoppingM4Row
                key={item.id}
                item={item}
                members={members}
                timezone={household.timezone}
                expanded={expandedId === item.id}
                actionsOpen={actionsOpenId === item.id}
                dragging={draggingId === item.id}
                dragOver={dragOverId === item.id}
                busy={busyItem === item.id}
                onToggle={() => toggleExpanded(item.id)}
                onPurchase={() => void runPurchase(item, "purchase")}
                onRestore={() => void runPurchase(item, "unpurchase")}
                onEdit={() => onNavigate(`/shopping/items/${item.id}/edit`)}
                onActionsOpen={() => { setActionsOpenId(item.id); setExpandedId(null); }}
                onActionsClose={() => setActionsOpenId(null)}
                onDragStart={() => { setDraggingId(item.id); setActionsOpenId(null); setExpandedId(null); }}
                onDragOver={(overId, clientY, rowTop, rowHeight) => reorderAround(item.id, overId, clientY, rowTop, rowHeight)}
                onDragEnd={() => void finishReorder()}
              />
            ))}
          </section>
        ) : loading ? (
          <p className="shopping-m4__loading" role="status">買い物リストを読み込んでいます。</p>
        ) : (
          <section className="shopping-m4__empty" aria-label="買うものなし">
            <ShoppingCart aria-hidden="true" /><p>買うものはありません</p>
          </section>
        )}
        <section className="shopping-m4__purchased" aria-label="購入済み">
          <button type="button" className="shopping-m4__purchased-toggle" aria-expanded={purchasedOpen} onClick={() => setPurchasedOpen((open) => !open)}>
            <span>購入済み {visiblePurchased.length}件</span><ChevronRight aria-hidden="true" className={purchasedOpen ? "is-open" : ""} />
          </button>
          {purchasedOpen ? visiblePurchased.map((item) => (
            <ShoppingM4Row
              key={item.id}
              item={item}
              members={members}
              timezone={household.timezone}
              purchased
              expanded={expandedId === item.id}
              actionsOpen={false}
              dragging={false}
              dragOver={false}
              busy={busyItem === item.id}
              onToggle={() => toggleExpanded(item.id)}
              onPurchase={() => void runPurchase(item, "purchase")}
              onRestore={() => void runPurchase(item, "unpurchase")}
              onEdit={() => undefined}
              onActionsOpen={() => undefined}
              onActionsClose={() => undefined}
              onDragStart={() => undefined}
              onDragOver={() => undefined}
              onDragEnd={() => undefined}
            />
          )) : null}
        </section>
        <p className="shopping-m4__status" role="status" aria-live="polite">{status}</p>
      </main>
    </AppFrame>
  );
}

function ShoppingM4Row({
  item,
  members,
  timezone,
  purchased = false,
  expanded,
  actionsOpen,
  dragging,
  dragOver,
  busy,
  onToggle,
  onPurchase,
  onRestore,
  onEdit,
  onActionsOpen,
  onActionsClose,
  onDragStart,
  onDragOver,
  onDragEnd
}: {
  item: ShoppingItem;
  members: HouseholdMember[];
  timezone: string;
  purchased?: boolean;
  expanded: boolean;
  actionsOpen: boolean;
  dragging: boolean;
  dragOver: boolean;
  busy: boolean;
  onToggle: () => void;
  onPurchase: () => void;
  onRestore: () => void;
  onEdit: () => void;
  onActionsOpen: () => void;
  onActionsClose: () => void;
  onDragStart: () => void;
  onDragOver: (overId: string, clientY: number, rowTop: number, rowHeight: number) => void;
  onDragEnd: () => void;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const longPress = useRef<number | null>(null);
  const gesture = useRef<"swipe" | "vertical" | "reorder" | null>(null);
  const suppressClick = useRef(false);
  const dragStarted = useRef(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [swiping, setSwiping] = useState(false);

  useEffect(() => setSwipeOffset(actionsOpen ? -80 : 0), [actionsOpen]);
  const clearLongPress = () => { if (longPress.current !== null) window.clearTimeout(longPress.current); longPress.current = null; };
  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    start.current = { x: event.clientX, y: event.clientY };
    gesture.current = null;
    dragStarted.current = false;
    setSwiping(false);
    clearLongPress();
    if (!purchased) longPress.current = window.setTimeout(() => {
      if (!start.current || gesture.current) return;
      gesture.current = "reorder";
      dragStarted.current = true;
      onDragStart();
    }, 360);
  };
  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (dragStarted.current) {
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-shopping-m4-id]");
      if (target) {
        const bounds = target.getBoundingClientRect();
        onDragOver(target.dataset.shoppingM4Id ?? item.id, event.clientY, bounds.top, bounds.height);
      }
      return;
    }
    const origin = start.current;
    if (!origin) return;
    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;
    if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) { gesture.current = "swipe"; clearLongPress(); }
    if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) { gesture.current = "vertical"; clearLongPress(); setSwiping(false); setSwipeOffset(actionsOpen ? -80 : 0); return; }
    if (!purchased && gesture.current === "swipe") { setSwiping(true); setSwipeOffset(Math.max(-80, Math.min(0, dx))); }
    if (Math.abs(dx) > 12 || Math.abs(dy) > 12) clearLongPress();
  };
  const handlePointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    clearLongPress();
    const origin = start.current;
    start.current = null;
    setSwiping(false);
    if (dragStarted.current) { dragStarted.current = false; suppressClick.current = true; onDragEnd(); return; }
    const currentGesture = gesture.current;
    gesture.current = null;
    if (!origin || currentGesture === "vertical") { setSwipeOffset(actionsOpen ? -80 : 0); return; }
    if (!purchased && origin.x - event.clientX > 48) { suppressClick.current = true; setSwipeOffset(-80); onActionsOpen(); }
    else if (!purchased && event.clientX - origin.x > 24 && actionsOpen) { suppressClick.current = true; setSwipeOffset(0); onActionsClose(); }
    else setSwipeOffset(actionsOpen ? -80 : 0);
  };
  const handleClickCapture = (event: ReactMouseEvent<HTMLElement>) => {
    if (!suppressClick.current) return;
    if (event.target instanceof Element && event.target.closest(".shopping-m4__actions")) { suppressClick.current = false; return; }
    event.preventDefault(); event.stopPropagation(); suppressClick.current = false;
  };
  const purchaserName = item.purchasedBy?.displayName ?? memberName(members, item.purchasedBy?.userId) ?? "メンバー";
  const imageSrc = item.image ? getShoppingItemImageUrl(item.id, item.image.updatedAt) : null;
  return (
    <article className={`shopping-m4__row${expanded ? " is-expanded" : ""}${actionsOpen ? " is-actions-open" : ""}${dragging ? " is-dragging" : ""}${dragOver ? " is-drag-over" : ""}${swiping ? " is-swiping" : ""}`} data-shopping-m4-id={item.id} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={() => { clearLongPress(); start.current = null; if (dragStarted.current) onDragEnd(); dragStarted.current = false; setSwiping(false); }} onClickCapture={handleClickCapture}>
      <div className="shopping-m4__row-content" style={{ "--shopping-m4-swipe": `${swipeOffset}px` } as CSSProperties}>
        <button type="button" className="shopping-m4__row-main" aria-expanded={expanded} onClick={onToggle}>
          <span className="shopping-m4__row-details">
            <span className="shopping-m4__name">{item.name}</span>
            {purchased ? <span className="shopping-m4__purchase-meta">{item.purchasedAt ? shoppingPurchaseDateTime(item.purchasedAt, timezone) : "購入済み"}</span> : item.plannedPurchaseDate ? <span className="shopping-m4__planned">{formatShoppingPlannedDate(item.plannedPurchaseDate)}予定</span> : null}
          </span>
          {!purchased && item.note ? <span className="shopping-m4__indicator" role="img" aria-label="メモあり"><MessageCircle aria-hidden="true" /></span> : null}
          {!purchased && item.image ? <span className="shopping-m4__indicator" role="img" aria-label="写真あり"><ImageIcon aria-hidden="true" /></span> : null}
          {item.quantity ? <span className="shopping-m4__quantity">{item.quantity}</span> : null}
          {purchased ? <span className="shopping-m4__avatar" role="img" aria-label={`購入者: ${purchaserName}`}>{purchaserName.charAt(0) || "?"}</span> : null}
        </button>
      </div>
      {!purchased && actionsOpen ? <div className="shopping-m4__actions" aria-label={`${item.name}の操作メニュー`}><button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={onEdit}>編集</button></div> : null}
      {expanded ? <div className="shopping-m4__expanded">
        <button type="button" className="shopping-m4__primary" disabled={busy} onClick={purchased ? onRestore : onPurchase}>{purchased ? <Undo2 aria-hidden="true" /> : null}{purchased ? "戻す" : busy ? "購入中…" : "購入"}</button>
        {item.note ? <div className="shopping-m4__detail"><span>メモ</span><p>{item.note}</p></div> : null}
        {imageSrc ? <div className="shopping-m4__detail"><span>写真</span><img src={imageSrc} alt={`${item.name}の写真`} onError={(event) => { event.currentTarget.hidden = true; }} /></div> : null}
        {!purchased && item.plannedPurchaseDate ? <div className="shopping-m4__planned-detail">購入予定日 {formatShoppingPlannedDate(item.plannedPurchaseDate)}</div> : null}
      </div> : null}
      {!purchased && actionsOpen ? <button type="button" className="shopping-m4__actions-dismiss" onClick={onActionsClose} aria-label="操作を閉じる">閉じる</button> : null}
    </article>
  );
}

// Retained below for the legacy direct implementation during the M7 route cleanup.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ShoppingListScreen({
  household,
  onNavigate,
  targetItemId
}: {
  household: Household;
  user: AuthUser;
  onNavigate: (route: NavigationPath) => void;
  onLogout: () => void;
  targetItemId?: string | null;
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

  useEffect(() => {
    if (!targetItemId || loading) return;
    document.querySelector(`[data-shopping-item-id="${CSS.escape(targetItemId)}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [loading, pending, purchased, targetItemId]);

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
              <div className={item.id === targetItemId ? "shopping-item-target" : undefined} data-shopping-item-id={item.id} key={item.id}>
                <ShoppingItemCard
                  busy={busyItem === item.id}
                  item={item}
                  members={members}
                  timezone={household.timezone}
                  onDelete={() => void runItemAction(item.id, "delete")}
                  onEdit={() => onNavigate(`/shopping/items/${item.id}/edit`)}
                  onOpen={() => onNavigate(`/shopping/items/${item.id}`)}
                  onPrimary={() => void runItemAction(item.id, "purchase")}
                />
              </div>
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
                  <div className={item.id === targetItemId ? "shopping-item-target" : undefined} data-shopping-item-id={item.id} key={item.id}>
                    <ShoppingItemCard
                      busy={busyItem === item.id}
                      item={item}
                      members={members}
                      timezone={household.timezone}
                      onDelete={() => void runItemAction(item.id, "delete")}
                      onEdit={() => onNavigate(`/shopping/items/${item.id}/edit`)}
                      onOpen={() => onNavigate(`/shopping/items/${item.id}`)}
                      onPrimary={() => void runItemAction(item.id, "unpurchase")}
                    />
                  </div>
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
  void household;
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
  const [deleteOpen, setDeleteOpen] = useState(false);
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
      onNavigate(`/shopping?item=${encodeURIComponent(result.item.id)}`);
    } catch (error) {
      setMessage(shoppingErrorMessage(error));
      if (error instanceof ApiError && error.details) setErrors(error.details);
    } finally {
      setSubmitting(false);
    }
  };
  if (loading) return <LoadingScreen message="商品を読み込んでいます。" />;
  return (
    <AppFrame current="/shopping" onNavigate={onNavigate} showBottomNavigation={false}>
      <header className="shopping-m4-form-header">
        <button type="button" className="shopping-m4-form-back" aria-label="戻る" onClick={() => onNavigate("/shopping")}><ChevronLeft aria-hidden="true" /><span>戻る</span></button>
        <h1>{mode === "create" ? "買い物を追加" : "買い物を編集"}</h1>
      </header>
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
      <form
          className="shopping-m4-form"
          aria-busy={submitting}
          onSubmit={(event) => void submit(event)}
        >
          <ErrorMessage message={message} />
          <FormField id="shopping-name" label="商品名" error={errors.name}>
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
              placeholder="例：1本"
              value={form.quantity ?? ""}
              onChange={(value) => setField("quantity", value)}
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
          </FormField>
          <FormField id="shopping-note" label="メモ" error={errors.note}>
            <textarea
              id="shopping-note"
              aria-describedby={errors.note ? "shopping-note-error" : undefined}
              aria-invalid={errors.note ? "true" : "false"}
              maxLength={500}
              placeholder="メモを入力"
              value={form.note ?? ""}
              onChange={(event) => setField("note", event.target.value)}
            />
          </FormField>
          <div className="shopping-image-field" aria-live="polite">
            <label htmlFor="shopping-image">写真</label>
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
          {mode === "edit" ? <Button variant="danger" disabled={submitting} onClick={() => setDeleteOpen(true)}>削除</Button> : null}
        </form>
      <BottomSheet open={deleteOpen} title="買い物を削除しますか？" onClose={() => setDeleteOpen(false)}>
        <div className="shopping-m4-delete-confirm">
          <p>この商品を削除します。</p>
          <Button variant="danger" onClick={() => { if (!itemId) return; setSubmitting(true); void deleteShoppingItem(itemId).then(() => onNavigate("/shopping")).catch((error) => setMessage(shoppingErrorMessage(error))).finally(() => setSubmitting(false)); }}>削除する</Button>
          <Button variant="secondary" onClick={() => setDeleteOpen(false)}>キャンセル</Button>
        </div>
      </BottomSheet>
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
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const candidates = [
    ...recentItems.map((item) => ({ key: `recent-${item.createdAt}-${item.name}`, name: item.name, quantity: item.quantity, note: item.note, select: () => onRecentSelect(item) })),
    ...templates.slice(0, 8).map((item) => ({ key: `template-${item.id}`, name: item.name, quantity: item.quantity, note: item.note, select: () => onTemplateSelect(item) }))
  ];
  const filtered = candidates.filter((item) => `${item.name}${item.quantity ?? ""}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return (
    <>
      <button type="button" className="shopping-m4-reuse-trigger" onClick={() => setOpen(true)}><span>以前の項目から選ぶ</span><ChevronRight aria-hidden="true" /></button>
      <BottomSheet open={open} title="以前の項目から選ぶ" onClose={() => setOpen(false)}>
        <div className="shopping-m4-reuse-sheet">
          <input aria-label="以前の買い物を検索" placeholder="検索" value={query} onChange={(event) => setQuery(event.target.value)} />
          <div className="shopping-m4-reuse-list">{filtered.map((item) => <button key={item.key} type="button" onClick={() => { item.select(); setOpen(false); }}><span>{item.name}</span>{item.quantity ? <small>{item.quantity}</small> : null}</button>)}{filtered.length === 0 ? <p>見つかりませんでした</p> : null}</div>
        </div>
      </BottomSheet>
    </>
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
  onNavigate: (route: string) => void;
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
