import { FormEvent, useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { ChangeEvent } from "react";
import type { ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight, Ellipsis, House, Image as ImageIcon, MessageCircle, ShoppingCart, X } from "lucide-react";
import { login, logout, me, register } from "./api/auth";
import { ApiError, apiMessage } from "./api/client";
import { getHomeToday, type HomeToday } from "./api/home";
import { imageUploadErrorMessage } from "./api/image-errors";
import { uploadProfileImage } from "./api/account";
import { getCurrentImageUsage, type ImageUsage } from "./api/image-usage";
import {
  createShoppingItem,
  deleteShoppingItem,
  getShoppingItem,
  getShoppingItemImageUrl,
  listShoppingItems,
  listRecentShoppingItems,
  listShoppingTemplates,
  purchaseShoppingItem,
  reorderShoppingItems,
  unpurchaseShoppingItem,
  updateShoppingItem,
  uploadShoppingItemImage,
  deleteShoppingItemImage,
  type CreateShoppingItemInput,
  type ShoppingItem,
  type ShoppingRecentItem,
  type ShoppingTemplate,
  type UpdateShoppingItemInput
} from "./api/shopping";
import { processShoppingImage, type ProcessedImage } from "./lib/image-processing";
import { formatDateTime as formatDateTimeInTimezone } from "./lib/format";
import { visiblePurchasedShoppingItems as filterVisiblePurchasedShoppingItems } from "./lib/shopping-visibility";
import {
  createHousehold,
  getCurrentHousehold,
  joinHousehold,
  listMembers,
  validateInviteCode
} from "./api/households";
import {
  changeTaskState,
  createTask,
  deactivateTask,
  getTask,
  listRecentTaskDefinitions,
  listTaskHistory,
  listCalendarTasks,
  listCalendarMarkers,
  listCalendarSelected,
  restoreTaskRecord,
  restoreCalendarTaskRecord,
  updateTask,
  type Task,
  type CalendarShoppingItem,
  type CalendarCompletedRecord,
  type CalendarMarkersResponse,
  type CalendarSelectedResponse,
  type TaskRecord,
  type TodayTask
} from "./api/tasks";
import {
  BottomNavigation,
  Button,
  ErrorMessage,
  FormField,
  InlineLoading,
  LoadingScreen,
  PageHeader,
  PasswordInput,
  TextInput
} from "./components/ui";
import { BottomSheet } from "./components/BottomSheet";
import { ProfileImagePicker } from "./components/ProfileImageCropper";
import {
  weekdayLabels
} from "./task-labels";
import {
  changeTaskFormRecurrence,
  defaultTaskForm,
  normalizeTaskForm,
  recurrenceDescription,
  taskFormToPayload,
  taskToFormState,
  validateTaskFormState,
  type TaskFormErrors,
  type TaskFormRecurrence,
  type TaskFormState
} from "./task-model-ui";
import { MOTION_MS } from "./motion/constants";
import { usePrefersReducedMotion } from "./hooks/usePrefersReducedMotion";
import { useDelayedBusyStatus } from "./hooks/useDelayedBusyStatus";
import {
  createTemporaryHistoryRecord,
  getRetainedTaskProjection,
  projectHomeData,
  serverMatchesMutation,
  type HomeMutation,
  type HomeMutationPhase,
  type HomeMutationType
} from "./home-local-first";
import {
  clearHomeSnapshots,
  homeSnapshotKey,
  readMemoryHomeSnapshot,
  readPersistentHomeSnapshot,
  writeServerConfirmedHomeSnapshot,
  type HomeSnapshotIdentity
} from "./cache/home-snapshot";
import {
  calendarDaySnapshotKey,
  calendarRangeSnapshotKey,
  getCalendarSnapshotEpoch,
  isCalendarMarkersResponse,
  isCalendarSelectedResponse,
  readMemoryCalendarDaySnapshot,
  readMemoryCalendarRangeSnapshot,
  readPersistentCalendarDaySnapshot,
  readPersistentCalendarRangeSnapshot,
  writeServerConfirmedCalendarDaySnapshot,
  writeServerConfirmedCalendarRangeSnapshot,
  clearCalendarSnapshots,
  clearMemoryCalendarSnapshots,
  type CalendarDaySnapshotIdentity,
  type CalendarRangeSnapshotIdentity
} from "./cache/calendar-snapshot";
import type {
  AuthState,
  AuthUser,
  Household,
  HouseholdMember,
  HouseholdState
} from "./types";
import { OtherLandingPage, OtherSettingsPage, type OtherSettingsPageKind } from "./pages/OtherSettingsPage";

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
  | "/other"
  | "/other/members"
  | "/other/notifications"
  | "/other/storage"
  | "/other/household"
  | "/other/account"
  | "/tasks/new"
  | "/shopping"
  | "/shopping/new";

type Route =
  | { name: StaticRoute }
  | { name: "/tasks/:taskId/edit"; taskId: string }
  | { name: "/shopping/items/:itemId/edit"; itemId: string };

type NavigationPath =
  string;

type FormErrors = Record<string, string>;

type HomeBootstrapRequest = {
  promise: Promise<HomeToday>;
  consumed: boolean;
};

const HOME_REFRESH_STATUS = "最新情報を確認しています。";
const HOME_REFRESH_STATUS_SHOW_DELAY_MS = 500;
const HOME_REFRESH_STATUS_MIN_VISIBLE_MS = 400;

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
  "/other",
  "/other/members",
  "/other/notifications",
  "/other/storage",
  "/other/household",
  "/other/account",
  "/tasks/new",
  "/shopping",
  "/shopping/new"
]);

const decodeRouteSegment = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const legacyRedirectFor = (pathname: string): string | null => {
  if (pathname === "/tasks/new") return null;
  if (pathname === "/settings/members") return "/other/members";
  if (pathname === "/tasks") return "/home";
  if (pathname === "/tasks/templates") return "/tasks/new";
  if (pathname === "/shopping/templates" || pathname === "/shopping/templates/new")
    return "/shopping/new";

  const taskTemplateEdit = pathname.match(/^\/tasks\/templates\/([^/]+)\/edit$/);
  if (taskTemplateEdit) return "/tasks/new";

  const taskRespond = pathname.match(/^\/tasks\/([^/]+)\/respond$/);
  if (taskRespond) return "/home";

  const taskDetail = pathname.match(/^\/tasks\/([^/]+)$/);
  if (taskDetail)
    return `/tasks/${encodeURIComponent(decodeRouteSegment(taskDetail[1]))}/edit`;

  const shoppingTemplateEdit = pathname.match(/^\/shopping\/templates\/([^/]+)\/edit$/);
  if (shoppingTemplateEdit) return "/shopping/new";

  const shoppingItemDetail = pathname.match(/^\/shopping\/items\/([^/]+)$/);
  if (shoppingItemDetail)
    return `/shopping?item=${encodeURIComponent(decodeRouteSegment(shoppingItemDetail[1]))}`;

  return null;
};

const replaceLegacyLocation = (pathname: string, search = "") => {
  const target = legacyRedirectFor(pathname);
  if (!target) return null;
  const current = `${pathname}${search}`;
  if (current !== target) window.history.replaceState({ route: target }, "", target);
  return new URL(target, window.location.origin);
};

const routeFromLocation = (): Route => {
  const canonical = replaceLegacyLocation(window.location.pathname, window.location.search);
  return parseRoute(canonical?.pathname ?? window.location.pathname);
};

const parseRoute = (pathname: string): Route => {
  if (staticRoutes.has(pathname as StaticRoute))
    return { name: pathname as StaticRoute };
  const taskEdit = pathname.match(/^\/tasks\/([^/]+)\/edit$/);
  if (taskEdit)
    return { name: "/tasks/:taskId/edit", taskId: decodeRouteSegment(taskEdit[1]) };
  const shoppingItemEdit = pathname.match(/^\/shopping\/items\/([^/]+)\/edit$/);
  if (shoppingItemEdit)
    return {
      name: "/shopping/items/:itemId/edit",
      itemId: decodeRouteSegment(shoppingItemEdit[1])
    };
  return { name: "/" };
};

const isAuthRoute = (route: Route) =>
  route.name === "/login" || route.name === "/register";

const isOnboardingRoute = (route: Route) =>
  route.name === "/onboarding" ||
  route.name === "/household/create" ||
  route.name === "/household/join";

const isAppRoute = (route: Route) =>
  route.name === "/home" ||
  route.name === "/calendar" ||
  route.name === "/other" ||
  route.name === "/other/members" ||
  route.name === "/other/notifications" ||
  route.name === "/other/storage" ||
  route.name === "/other/household" ||
  route.name === "/other/account" ||
  route.name === "/tasks/new" ||
  route.name === "/shopping" ||
  route.name === "/shopping/new" ||
  route.name === "/tasks/:taskId/edit" ||
  route.name === "/shopping/items/:itemId/edit";

const validateEmail = (email: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
const normalizeInviteCode = (code: string) => code.trim();
const clearFormError = (errors: FormErrors, field: string) => {
  if (!errors[field]) return errors;
  const next = { ...errors };
  delete next[field];
  return next;
};

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

const formatShoppingPlannedDate = (dateKey: string) =>
  new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${dateKey}T00:00:00Z`));

const formatCalendarMonth = (monthKey: string) =>
  new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    timeZone: "UTC"
  }).format(new Date(`${monthKey.slice(0, 7)}-01T00:00:00Z`));

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

export function App() {
  const [route, setRoute] = useState<Route>(routeFromLocation);
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });
  const [household, setHousehold] = useState<HouseholdState>({ status: "idle" });
  const [pendingInviteCode, setPendingInviteCode] = useState("");
  const [pendingRegistrationAvatar, setPendingRegistrationAvatar] = useState<ProcessedImage | null>(null);
  const [profileImageNotice, setProfileImageNotice] = useState("");
  const initialHomeRoute = useRef(route.name === "/" || route.name === "/home");
  const homeBootstrapRef = useRef<HomeBootstrapRequest | null>(null);
  const invalidateHomeBootstrap = useCallback(() => {
    homeBootstrapRef.current = null;
  }, []);

  const navigate = useCallback(
    (nextRoute: string, replace = false) => {
      const requestedUrl = new URL(nextRoute, window.location.origin);
      const canonicalPath = legacyRedirectFor(requestedUrl.pathname);
      const resolvedRoute = canonicalPath
        ? new URL(canonicalPath, window.location.origin)
        : requestedUrl;
      const resolvedNextRoute = `${resolvedRoute.pathname}${resolvedRoute.search}${resolvedRoute.hash}`;
      if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== resolvedNextRoute) {
        const state = { route: resolvedNextRoute };
        if (replace || canonicalPath) window.history.replaceState(state, "", resolvedNextRoute);
        else window.history.pushState(state, "", resolvedNextRoute);
      }
      setRoute(parseRoute(resolvedRoute.pathname));
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
    invalidateHomeBootstrap();
    setAuth({ status: "authenticated", user });
    await refreshHousehold();
  };

  const settleHouseholdAndUploadAvatar = async (
    nextHousehold: Household,
    user: AuthUser | null,
    avatar: ProcessedImage | null
  ) => {
    invalidateHomeBootstrap();
    setPendingRegistrationAvatar(null);
    setHousehold({ status: "ready", household: nextHousehold });
    if (user) setAuth({ status: "authenticated", user });
    navigate("/home", true);
    if (!user || !avatar) return;
    try {
      const uploaded = await uploadProfileImage(avatar);
      setAuth({ status: "authenticated", user: { ...user, avatarUrl: uploaded.avatarUrl } });
    } catch {
      setProfileImageNotice("プロフィール画像の保存に失敗しました。設定から再度登録できます。");
    }
  };

  const completeRegistration = async (user: AuthUser, inviteCode: string, avatar: ProcessedImage | null) => {
    invalidateHomeBootstrap();
    setAuth({ status: "authenticated", user });
    setPendingRegistrationAvatar(avatar);
    setProfileImageNotice("");
    if (!inviteCode) {
      await refreshHousehold();
      return;
    }
    setHousehold({ status: "loading" });
    try {
      const result = await joinHousehold(inviteCode);
      await settleHouseholdAndUploadAvatar(result.household, user, avatar);
    } catch (error) {
      setPendingInviteCode(inviteCode);
      setHousehold({ status: "none" });
      navigate("/household/join", true);
      if (error instanceof ApiError && error.code === "UNAUTHENTICATED") {
        setAuth({ status: "unauthenticated" });
        setHousehold({ status: "idle" });
        navigate("/login", true);
      }
    }
  };

  const signOut = async () => {
    try {
      await logout();
    } finally {
      invalidateHomeBootstrap();
      await clearHomeSnapshots();
      await clearCalendarSnapshots();
      setAuth({ status: "unauthenticated" });
      setHousehold({ status: "idle" });
      navigate("/login", true);
    }
  };

  useEffect(() => {
    const onPopState = () => setRoute(routeFromLocation());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    if (initialHomeRoute.current && !homeBootstrapRef.current) {
      const promise = getHomeToday();
      homeBootstrapRef.current = { promise, consumed: false };
      void promise.catch(() => undefined);
    }

    const authRequest = me(controller.signal);
    const householdRequest = getCurrentHousehold(controller.signal);
    void authRequest
      .then((result) => setAuth({ status: "authenticated", user: result.user }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        homeBootstrapRef.current = null;
        setAuth({ status: "unauthenticated" });
        setHousehold({ status: "idle" });
      });
    void householdRequest
      .then((result) => {
        setHousehold(
          result.household
            ? { status: "ready", household: result.household }
            : { status: "none" }
        );
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (error instanceof ApiError && error.code === "UNAUTHENTICATED") {
          homeBootstrapRef.current = null;
          setAuth({ status: "unauthenticated" });
          setHousehold({ status: "idle" });
          return;
        }
        setHousehold({ status: "error", message: apiErrorMessage(error) });
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (auth.status === "loading") return;
    if (auth.status === "unauthenticated") {
      if (!isAuthRoute(route)) navigate("/login", true);
      return;
    }
    if (household.status === "idle" || household.status === "loading") return;
    if (route.name === "/" || isAuthRoute(route)) {
      navigate(household.status === "ready" ? "/home" : "/household/create", true);
      return;
    }
    if (household.status === "none" && (isAppRoute(route) || route.name === "/guest" || route.name === "/onboarding")) navigate("/household/create", true);
    if (household.status === "ready" && (isOnboardingRoute(route) || route.name === "/guest"))
      navigate("/home", true);
  }, [auth.status, household.status, navigate, route]);

  if (auth.status === "loading")
    return <LoadingScreen message="ログイン状態を確認しています" />;
  if (auth.status === "unauthenticated") {
    if (route.name === "/register")
      return <RegisterScreen onRegister={completeRegistration} onNavigate={navigate} />;
    if (route.name !== "/login") return <LoadingScreen message="移動しています" />;
    return (
      <LoginScreen
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
            const currentUser = auth.status === "authenticated" ? auth.user : null;
            return settleHouseholdAndUploadAvatar(next, currentUser, pendingRegistrationAvatar);
          }}
          onNavigate={navigate}
        />
      );
    }
    if (route.name === "/household/join") {
      return (
        <JoinHouseholdScreen
          onJoined={(next) => {
            invalidateHomeBootstrap();
            setHousehold({ status: "ready", household: next });
            navigate("/home", true);
          }}
          initialCode={pendingInviteCode}
          onCodeConsumed={() => setPendingInviteCode("")}
          onNavigate={navigate}
        />
      );
    }
    return <LoadingScreen message="移動しています" />;
  }

  const shellProps = {
    household: household.household,
    onNavigate: navigate,
    onLogout: () => void signOut(),
    user: auth.user,
    profileImageNotice
  };
  if (route.name === "/other") {
    return (
      <AppFrame current="/other" onNavigate={navigate}>
        <OtherLandingPage onNavigate={navigate} />
      </AppFrame>
    );
  }
  const otherKinds: Partial<Record<Exclude<StaticRoute, "/other">, OtherSettingsPageKind>> = {
    "/other/members": "members",
    "/other/notifications": "notifications",
    "/other/storage": "storage",
    "/other/household": "household",
    "/other/account": "account"
  };
  const otherKind = otherKinds[route.name as keyof typeof otherKinds];
  if (otherKind) {
    return (
      <AppFrame current="/other" onNavigate={navigate} showBottomNavigation={false}>
        <OtherSettingsPage
          kind={otherKind}
          household={household.household}
          user={auth.user}
          onNavigate={navigate}
          onHouseholdUpdated={(nextHousehold) => {
            clearMemoryCalendarSnapshots();
            setHousehold({ status: "ready", household: nextHousehold });
          }}
          onUserUpdated={(nextUser) => setAuth({ status: "authenticated", user: nextUser })}
          onLogout={signOut}
        />
      </AppFrame>
    );
  }
  if (route.name === "/calendar") return <CalendarScreen {...shellProps} />;
  if (route.name === "/tasks/new")
    return <TaskFormScreen {...shellProps} mode="create" />;
  if (route.name === "/tasks/:taskId/edit")
    return <TaskFormScreen {...shellProps} mode="edit" taskId={route.taskId} />;
  if (route.name === "/shopping") return <ShoppingM4ListScreen {...shellProps} targetItemId={new URLSearchParams(window.location.search).get("item")} />;
  if (route.name === "/shopping/new")
    return <ShoppingItemFormScreen {...shellProps} mode="create" />;
  if (route.name === "/shopping/items/:itemId/edit")
    return <ShoppingItemFormScreen {...shellProps} mode="edit" itemId={route.itemId} />;
  return <HomeScreen {...shellProps} homeBootstrap={homeBootstrapRef.current} />;
}
function LoginScreen({
  onLogin,
  onNavigate
}: {
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
      if (error instanceof ApiError && error.code === "UNAUTHENTICATED") {
        setErrors({ password: "メールアドレスまたはパスワードが正しくありません" });
      } else {
        setMessage(apiErrorMessage(error));
        if (error instanceof ApiError && error.details) setErrors(error.details);
      }
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <main className="app-shell entry-page">
      <div className="entry-page__content">
        <header className="entry-page__header"><h1>ログイン</h1></header>
        <form className="entry-form" onSubmit={(event) => void submit(event)}>
          <FormField id="login-email" label="メールアドレス" error={errors.email}>
            <TextInput
              autoComplete="email"
              error={errors.email}
              id="login-email"
              onChange={(value) => {
                setEmail(value);
                setErrors((current) => clearFormError(current, "email"));
              }}
              value={email}
            />
          </FormField>
          <FormField id="login-password" label="パスワード" error={errors.password}>
            <PasswordInput
              autoComplete="current-password"
              error={errors.password}
              id="login-password"
              onChange={(value) => {
                setPassword(value);
                setErrors((current) => clearFormError(current, "password"));
              }}
              value={password}
            />
          </FormField>
          <ErrorMessage message={message} />
          <Button className="entry-primary-action" disabled={submitting} type="submit">
            {submitting ? <InlineLoading /> : "ログイン"}
          </Button>
        </form>
        <p className="entry-link-row">はじめての方は <a href="/register" onClick={(event) => { event.preventDefault(); onNavigate("/register"); }}>アカウントを作る</a></p>
      </div>
    </main>
  );
}
function RegisterScreen({
  onRegister,
  onNavigate
}: {
  onRegister: (user: AuthUser, inviteCode: string, avatar: ProcessedImage | null) => Promise<void>;
  onNavigate: (route: StaticRoute) => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [avatar, setAvatar] = useState<ProcessedImage | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const submittingRef = useRef(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submittingRef.current) return;
    const nextErrors: FormErrors = {};
    if (displayName.trim().length === 0 || displayName.trim().length > 80)
      nextErrors.displayName = "表示名は1〜80文字で入力してください。";
    if (!validateEmail(email))
      nextErrors.email = "メールアドレスの形式を確認してください。";
    if (password.length < 12 || password.length > 128)
      nextErrors.password = "パスワードは12〜128文字で入力してください。";
    setErrors(nextErrors);
    setMessage(Object.keys(nextErrors).length > 0 ? "入力内容を確認してください" : "");
    if (Object.keys(nextErrors).length > 0) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const normalizedInviteCode = normalizeInviteCode(inviteCode);
      if (normalizedInviteCode) {
        const validation = await validateInviteCode(normalizedInviteCode);
        if (!validation.valid) {
          setErrors({ inviteCode: "招待コードを確認してください" });
          return;
        }
      }
      const result = await register({
        displayName: displayName.trim(),
        email: email.trim(),
        password
      });
      await onRegister(result.user, normalizedInviteCode, avatar);
    } catch (error) {
      if (error instanceof ApiError && error.code === "CONFLICT") {
        setErrors({ email: "このメールアドレスはすでに登録されています。" });
      } else {
        setMessage(apiErrorMessage(error));
        if (error instanceof ApiError && error.details) setErrors(error.details);
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };
  return (
    <main className="app-shell entry-page">
      <div className="entry-page__content">
        <header className="entry-page__header"><h1>新規登録</h1></header>
        <form className="entry-form" onSubmit={(event) => void submit(event)}>
          <FormField id="register-name" label="表示名" error={errors.displayName}>
            <TextInput
              autoComplete="name"
              error={errors.displayName}
              id="register-name"
              onChange={(value) => {
                setDisplayName(value);
                setErrors((current) => clearFormError(current, "displayName"));
              }}
              value={displayName}
            />
          </FormField>
          <FormField id="register-email" label="メールアドレス" error={errors.email}>
            <TextInput
              autoComplete="email"
              error={errors.email}
              id="register-email"
              onChange={(value) => {
                setEmail(value);
                setErrors((current) => clearFormError(current, "email"));
              }}
              value={email}
            />
          </FormField>
          <FormField id="register-password" label="パスワード" error={errors.password}>
            <PasswordInput
              autoComplete="new-password"
              error={errors.password}
              id="register-password"
              onChange={(value) => {
                setPassword(value);
                setErrors((current) => clearFormError(current, "password"));
              }}
              value={password}
            />
          </FormField>
          <FormField id="register-invite-code" label="招待コード（任意）" error={errors.inviteCode}>
            <TextInput
              autoComplete="one-time-code"
              error={errors.inviteCode}
              id="register-invite-code"
              onChange={(value) => {
                setInviteCode(value);
                setErrors((current) => clearFormError(current, "inviteCode"));
              }}
              value={inviteCode}
            />
          </FormField>
          <div className="register-avatar-field">
            <div className="register-avatar-field__heading">
              <span>プロフィール画像（任意）</span>
              {avatar ? <span>選択済み</span> : null}
            </div>
            <ProfileImagePicker
              id="register-profile-image"
              image={avatar}
              disabled={submitting}
              onImageChange={(next) => { setAvatar(next); }}
              onProcessingChange={setAvatarBusy}
            />
            <p className="register-avatar-field__hint">登録後も画像を変更できます。</p>
          </div>
          <ErrorMessage message={message} />
          <Button className="entry-primary-action" disabled={submitting || avatarBusy} type="submit">
            {submitting ? <InlineLoading /> : "新規登録"}
          </Button>
        </form>
        <p className="entry-link-row">すでにアカウントを持っている方 <a href="/login" onClick={(event) => { event.preventDefault(); onNavigate("/login"); }}>ログイン</a></p>
      </div>
    </main>
  );
}
function CreateHouseholdScreen({
  onCreated,
  onNavigate
}: {
  onCreated: (household: Household) => void | Promise<void>;
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
    if (trimmed.length === 0 || trimmed.length > 50)
      nextErrors.name = "家庭名は1〜50文字で入力してください。";
    setErrors(nextErrors);
    setMessage("");
    if (Object.keys(nextErrors).length > 0) return;
    setSubmitting(true);
    try {
      const result = await createHousehold(trimmed);
      await onCreated(result.household);
    } catch (error) {
      setMessage(apiErrorMessage(error));
      if (error instanceof ApiError && error.details) setErrors(error.details);
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <main className="app-shell entry-page">
      <div className="entry-page__content">
        <header className="entry-page__header"><h1>家庭を作る</h1></header>
        <form className="entry-form" onSubmit={(event) => void submit(event)}>
          <FormField id="household-name" label="家庭名" error={errors.name}>
            <TextInput
              autoComplete="organization"
              error={errors.name}
              id="household-name"
              onChange={(value) => {
                setName(value);
                setErrors((current) => clearFormError(current, "name"));
              }}
              value={name}
            />
          </FormField>
          <ErrorMessage message={message} />
          <Button className="entry-primary-action" disabled={submitting} type="submit">
            {submitting ? <InlineLoading /> : "家庭を作る"}
          </Button>
        </form>
        <p className="entry-link-row">招待コードをお持ちの場合は <a href="/household/join" onClick={(event) => { event.preventDefault(); onNavigate("/household/join"); }}>招待から参加</a></p>
      </div>
    </main>
  );
}

function JoinHouseholdScreen({
  onJoined,
  onNavigate,
  initialCode = "",
  onCodeConsumed
}: {
  onJoined: (household: Household) => void;
  onNavigate: (route: StaticRoute) => void;
  initialCode?: string;
  onCodeConsumed?: () => void;
}) {
  const [code, setCode] = useState(initialCode);
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
      onCodeConsumed?.();
      onJoined(result.household);
    } catch (error) {
      if (error instanceof ApiError && ["INVALID_INVITE", "INVITE_EXPIRED", "INVITE_ALREADY_USED"].includes(error.code)) {
        setErrors({ code: "招待コードを確認してください" });
      } else {
        setMessage(apiErrorMessage(error));
        if (error instanceof ApiError && error.details) setErrors(error.details);
      }
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <main className="app-shell entry-page">
      <div className="entry-page__content">
        <header className="entry-page__header"><h1>招待から参加</h1></header>
        <form className="entry-form" onSubmit={(event) => void submit(event)}>
          <FormField id="invite-code" label="招待コード" error={errors.code}>
            <TextInput
              autoComplete="one-time-code"
              error={errors.code}
              id="invite-code"
              onChange={(value) => {
                setCode(value);
                setErrors((current) => clearFormError(current, "code"));
              }}
              value={code}
            />
          </FormField>
          <ErrorMessage message={message} />
          <Button className="entry-primary-action" disabled={submitting} type="submit">
            {submitting ? <InlineLoading /> : "参加する"}
          </Button>
        </form>
        <p className="entry-link-row">家庭を新しく作る場合は <a href="/household/create" onClick={(event) => { event.preventDefault(); onNavigate("/household/create"); }}>家庭を作る</a></p>
      </div>
    </main>
  );
}

function AppFrame({
  current,
  children,
  onNavigate,
  showBottomNavigation = true
}: {
  current: "/home" | "/calendar" | "/shopping" | "/other";
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

function CalendarScreen({ household, user, onNavigate }: { household: Household; user: AuthUser; onNavigate: (route: NavigationPath) => void; onLogout: () => void }) {
  const queryDate = new URLSearchParams(window.location.search).get("date");
  const initialDate = queryDate && /^\d{4}-\d{2}-\d{2}$/.test(queryDate) ? queryDate : null;
  const today = todayInTimezone(household.timezone);
  const initialVisibleMonth = `${(initialDate ?? today).slice(0, 7)}-01`;
  const initialGridStart = addDays(initialVisibleMonth, -new Date(`${initialVisibleMonth}T00:00:00Z`).getUTCDay());
  const initialGridEnd = addDays(initialGridStart, 41);
  const initialRangeIdentity: CalendarRangeSnapshotIdentity = { userId: user.id, householdId: household.id, timezone: household.timezone, from: initialGridStart, to: initialGridEnd };
  const initialDayIdentity: CalendarDaySnapshotIdentity | null = initialDate ? { userId: user.id, householdId: household.id, timezone: household.timezone, selectedDate: initialDate } : null;
  const initialMarkers = readMemoryCalendarRangeSnapshot(initialRangeIdentity);
  const initialSelectedData = initialDayIdentity ? readMemoryCalendarDaySnapshot(initialDayIdentity) : null;
  const [visibleMonth, setVisibleMonth] = useState(initialVisibleMonth);
  const [selectedDate, setSelectedDate] = useState<string | null>(initialDate);
  const [markerState, setMarkerState] = useState<{ key: string; data: CalendarMarkersResponse | null }>({ key: calendarRangeSnapshotKey(initialRangeIdentity), data: initialMarkers });
  const [selectedState, setSelectedState] = useState<{ key: string | null; data: CalendarSelectedResponse | null }>({ key: initialDayIdentity ? calendarDaySnapshotKey(initialDayIdentity) : null, data: initialSelectedData });
  const [markersLoading, setMarkersLoading] = useState(true);
  const [selectedLoading, setSelectedLoading] = useState(Boolean(initialDate));
  const [rangeHasAuthoritativeSync, setRangeHasAuthoritativeSync] = useState(false);
  const [dayHasAuthoritativeSync, setDayHasAuthoritativeSync] = useState(false);
  const [message, setMessage] = useState("");
  const [monthOffset, setMonthOffset] = useState(0);
  const [monthDragging, setMonthDragging] = useState(false);
  const monthGesture = useRef<{ x: number; y: number; axis: "pending" | "horizontal" | "vertical" } | null>(null);
  const suppressMonthClick = useRef(false);
  const [monthDirection, setMonthDirection] = useState<"next" | "previous" | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const gridStart = addDays(visibleMonth, -new Date(`${visibleMonth}T00:00:00Z`).getUTCDay());
  const gridEnd = addDays(gridStart, 41);
  const gridDates = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  const requestedDate = selectedDate ?? today;
  const gridKey = `${gridStart}:${gridEnd}`;
  const dayIdentity: CalendarDaySnapshotIdentity | null = selectedDate ? { userId: user.id, householdId: household.id, timezone: household.timezone, selectedDate } : null;
  const dayKey = dayIdentity ? calendarDaySnapshotKey(dayIdentity) : null;
  const markerSequence = useRef(0);
  const selectedSequence = useRef(0);
  const markerEffectKey = useRef<string | null>(null);
  const selectedEffectDate = useRef<string | null>(null);
  const currentGridKey = useRef(gridKey);
  const currentSelectedDate = useRef(selectedDate);
  const rangeAuthoritativeRef = useRef(false);
  const dayAuthoritativeRef = useRef(false);
  currentGridKey.current = gridKey;
  currentSelectedDate.current = selectedDate;
  const loadMarkers = useCallback(async () => {
    const sequence = ++markerSequence.current;
    const expectedGridKey = gridKey;
    const requestEpoch = getCalendarSnapshotEpoch();
    const identity: CalendarRangeSnapshotIdentity = { userId: user.id, householdId: household.id, timezone: household.timezone, from: gridStart, to: gridEnd };
    setMarkersLoading(true);
    try {
      const next = await listCalendarMarkers(gridStart, gridEnd);
      if (!isCalendarMarkersResponse(next) || next.from !== identity.from || next.to !== identity.to || next.timezone !== identity.timezone) throw new Error("Calendar range response was invalid");
      void writeServerConfirmedCalendarRangeSnapshot(identity, next, sequence, requestEpoch);
      if (sequence === markerSequence.current && currentGridKey.current === expectedGridKey && requestEpoch === getCalendarSnapshotEpoch()) {
        rangeAuthoritativeRef.current = true;
        setRangeHasAuthoritativeSync(true);
        setMarkerState({ key: expectedGridKey, data: next });
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError") && sequence === markerSequence.current) setMessage(apiErrorMessage(error));
    } finally {
      if (sequence === markerSequence.current && currentGridKey.current === expectedGridKey) setMarkersLoading(false);
    }
  }, [gridEnd, gridKey, gridStart, household.id, household.timezone, user.id]);
  const loadSelected = useCallback(async (date: string) => {
    const sequence = ++selectedSequence.current;
    const requestEpoch = getCalendarSnapshotEpoch();
    const identity: CalendarDaySnapshotIdentity = { userId: user.id, householdId: household.id, timezone: household.timezone, selectedDate: date };
    setSelectedLoading(true);
    try {
      const next = await listCalendarSelected(date);
      if (!isCalendarSelectedResponse(next) || next.selectedDate !== identity.selectedDate || next.timezone !== identity.timezone) throw new Error("Calendar day response was invalid");
      void writeServerConfirmedCalendarDaySnapshot(identity, next, sequence, requestEpoch);
      if (sequence === selectedSequence.current && currentSelectedDate.current === date && requestEpoch === getCalendarSnapshotEpoch()) {
        dayAuthoritativeRef.current = true;
        setDayHasAuthoritativeSync(true);
        setSelectedState({ key: calendarDaySnapshotKey(identity), data: next });
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError") && sequence === selectedSequence.current && currentSelectedDate.current === date) {
        setMessage(apiErrorMessage(error));
      }
    } finally {
      if (sequence === selectedSequence.current && currentSelectedDate.current === date) setSelectedLoading(false);
    }
  }, [household.id, household.timezone, user.id]);
  const refresh = useCallback(async (date: string) => {
    setMessage("");
    await Promise.all([loadMarkers(), loadSelected(date)]);
  }, [loadMarkers, loadSelected]);
  const markers = markerState.key === gridKey ? markerState.data : null;
  const selectedForView = selectedState.key === dayKey && selectedState.data?.selectedDate === requestedDate ? selectedState.data : null;
  const selectedDataForDate = selectedForView !== null;
  const selectedDataReady = selectedDataForDate;
  const selectedDataAuthoritative = selectedDataForDate && dayHasAuthoritativeSync;
  const data = {
    ...(markers ?? { from: gridStart, to: gridEnd, today: selectedForView?.today ?? today, timezone: household.timezone, dates: {} }),
    selectedDate: requestedDate,
    selected: selectedForView?.selected ?? { fixed: [], weeklyFlexible: [], monthlyFlexible: [], completed: [], shopping: [] }
  };
  useEffect(() => {
    document.documentElement.classList.add("calendar-view-locked");
    document.body.classList.add("calendar-view-locked");
    const viewport = document.querySelector<HTMLElement>(".app-shell__viewport");
    viewport?.classList.add("calendar-view-locked");
    return () => {
      document.documentElement.classList.remove("calendar-view-locked");
      document.body.classList.remove("calendar-view-locked");
      viewport?.classList.remove("calendar-view-locked");
    };
  }, []);
  useEffect(() => {
    if (markerEffectKey.current === gridKey) return;
    markerEffectKey.current = gridKey;
    rangeAuthoritativeRef.current = false;
    setRangeHasAuthoritativeSync(false);
    const identity: CalendarRangeSnapshotIdentity = { userId: user.id, householdId: household.id, timezone: household.timezone, from: gridStart, to: gridEnd };
    const memory = readMemoryCalendarRangeSnapshot(identity);
    setMarkerState({ key: gridKey, data: memory });
    const readEpoch = getCalendarSnapshotEpoch();
    const persistentRead = memory ? Promise.resolve(null) : readPersistentCalendarRangeSnapshot(identity);
    void persistentRead.then((cached) => {
      if (!cached || readEpoch !== getCalendarSnapshotEpoch() || currentGridKey.current !== gridKey || rangeAuthoritativeRef.current) return;
      setMarkerState((current) => current.data ? current : { key: gridKey, data: cached });
    });
    void loadMarkers();
  }, [gridEnd, gridKey, gridStart, household.id, household.timezone, loadMarkers, user.id]);
  useEffect(() => {
    if (!selectedDate || selectedEffectDate.current === selectedDate) return;
    selectedEffectDate.current = selectedDate;
    const identity: CalendarDaySnapshotIdentity = { userId: user.id, householdId: household.id, timezone: household.timezone, selectedDate };
    const memory = readMemoryCalendarDaySnapshot(identity);
    dayAuthoritativeRef.current = false;
    setDayHasAuthoritativeSync(false);
    setSelectedState({ key: calendarDaySnapshotKey(identity), data: memory });
    const readEpoch = getCalendarSnapshotEpoch();
    const persistentRead = memory ? Promise.resolve(null) : readPersistentCalendarDaySnapshot(identity);
    void persistentRead.then((cached) => {
      if (!cached || readEpoch !== getCalendarSnapshotEpoch() || currentSelectedDate.current !== selectedDate || dayAuthoritativeRef.current) return;
      setSelectedState((current) => current.data ? current : { key: calendarDaySnapshotKey(identity), data: cached });
    });
    void loadSelected(selectedDate);
  }, [household.id, household.timezone, loadSelected, selectedDate, user.id]);
  const moveMonth = (amount: number) => {
    const next = new Date(`${visibleMonth}T00:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + amount, 1);
    setMonthDirection(amount > 0 ? "next" : "previous");
    window.setTimeout(() => setMonthDirection(null), reducedMotion ? 0 : MOTION_MS.large);
    setVisibleMonth(`${next.toISOString().slice(0, 7)}-01`);
  };
  const primeDate = (date: string) => {
    const identity: CalendarDaySnapshotIdentity = { userId: user.id, householdId: household.id, timezone: household.timezone, selectedDate: date };
    const memory = readMemoryCalendarDaySnapshot(identity);
    dayAuthoritativeRef.current = false;
    setDayHasAuthoritativeSync(false);
    setSelectedState({ key: calendarDaySnapshotKey(identity), data: memory });
    setSelectedLoading(true);
    setSelectedDate(date);
  };
  const openDate = (date: string) => { primeDate(date); onNavigate(`/calendar?date=${encodeURIComponent(date)}`); };
  const goToday = () => setVisibleMonth(`${(data?.today ?? today).slice(0, 7)}-01`);
  const pointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    monthGesture.current = { x: event.clientX, y: event.clientY, axis: "pending" };
    suppressMonthClick.current = false;
  };
  const pointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const gesture = monthGesture.current;
    if (!gesture) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (gesture.axis === "pending") {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 10) return;
      if (Math.abs(dx) <= Math.abs(dy) + 4) {
        gesture.axis = "vertical";
        setMonthDragging(false);
        return;
      }
      gesture.axis = "horizontal";
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setMonthDragging(true);
    }
    if (gesture.axis === "horizontal") {
      event.preventDefault();
      setMonthOffset(Math.max(-96, Math.min(96, dx)));
    } else if (gesture.axis === "vertical") {
      event.preventDefault();
    }
  };
  const pointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const gesture = monthGesture.current;
    if (!gesture) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (gesture.axis === "horizontal") {
      event.preventDefault();
      suppressMonthClick.current = true;
      if (Math.abs(dx) >= 56 && Math.abs(dx) > Math.abs(dy)) moveMonth(dx < 0 ? 1 : -1);
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    monthGesture.current = null;
    setMonthDragging(false);
    setMonthOffset(0);
  };
  const marker = (date: string) => data?.dates[date] ?? { fixedCount: 0, fixedCompletedCount: 0, fixedSkippedCount: 0, shoppingCount: 0, purchasedShoppingCount: 0, tasks: [] };
  return <AppFrame current="/calendar" onNavigate={onNavigate}><ErrorMessage message={message ? `Calendarを取得できませんでした。${message}` : ""} /><main className="calendar-page" aria-busy={markersLoading && !rangeHasAuthoritativeSync}><header className="calendar-header"><div className="calendar-header__title-row"><button type="button" className="calendar-icon-button" aria-label="前の月" onClick={() => moveMonth(-1)}><ChevronLeft /></button><h1>{formatCalendarMonth(visibleMonth)}</h1><button type="button" className="calendar-icon-button" aria-label="次の月" onClick={() => moveMonth(1)}><ChevronRight /></button></div><div className="calendar-header__today-row"><button type="button" className="calendar-today-button" onClick={goToday}>今日</button></div></header><section className={`calendar-month-grid${monthDirection ? ` is-month-transitioning-${monthDirection}` : ""}`} role="grid" aria-label={`${formatCalendarMonth(visibleMonth)}のカレンダー`} data-swipe-dragging={monthDragging ? "true" : "false"} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { monthGesture.current = null; setMonthDragging(false); setMonthOffset(0); }} onClickCapture={(event) => { if (!suppressMonthClick.current) return; event.preventDefault(); event.stopPropagation(); suppressMonthClick.current = false; }} style={{ "--month-swipe-offset": `${monthOffset}px` } as CSSProperties}><div className="calendar-weekday-row" aria-hidden="true">{["日", "月", "火", "水", "木", "金", "土"].map((label, index) => <span key={label} className={index === 0 ? "is-sunday" : index === 6 ? "is-saturday" : ""}>{label}</span>)}</div><div className="calendar-grid-body">{gridDates.map((date) => { const item = marker(date); const inMonth = date.slice(0, 7) === visibleMonth.slice(0, 7); const day = new Date(`${date}T00:00:00Z`).getUTCDay(); const names = item.tasks.slice(0, 2); const more = Math.max(0, item.tasks.length - names.length); return <div key={date} className={`calendar-day-cell${inMonth ? "" : " is-outside-month"}${item.shoppingCount ? " has-shopping" : ""}`} role="gridcell" tabIndex={0} aria-label={`${formatCalendarDateLong(date)}${item.tasks.length ? `、タスク${item.tasks.length}件` : ""}${item.shoppingCount ? `、買い物${item.shoppingCount}件` : ""}`} onClick={() => openDate(date)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openDate(date); } }}><span className={`calendar-day-number calendar-day-number--${day}${date === (data?.today ?? today) ? " is-today" : ""}`}>{Number(date.slice(8, 10))}</span><div className="calendar-day-tasks">{names.map((task) => <button type="button" key={task.id} className={`calendar-day-task${task.deadline ? " is-deadline" : ""}`} title={task.title} onClick={(event) => { event.stopPropagation(); openDate(date); }}>{task.title}</button>)}{more ? <button type="button" className="calendar-day-more" onClick={(event) => { event.stopPropagation(); openDate(date); }}>+{more}</button> : null}</div>{item.shoppingCount ? <span className="calendar-day-shopping" aria-hidden="true"><ShoppingCart /><span>{item.shoppingCount}</span></span> : null}</div>; })}</div></section><p className="calendar-status" role="status" aria-live="polite">{markersLoading && !markers ? "カレンダーを読み込んでいます。" : ""}</p></main>{selectedDate ? <CalendarDateSheet household={household} date={selectedDate} data={data} selectedDataForDate={selectedDataForDate} selectedDataReady={selectedDataReady} selectedDataAuthoritative={selectedDataAuthoritative} loading={selectedLoading} onClose={() => { setSelectedDate(null); onNavigate("/calendar"); }} onNavigateDate={(next) => { primeDate(next); onNavigate(`/calendar?date=${encodeURIComponent(next)}`); }} onRefresh={refresh} onNavigate={onNavigate} /> : null}</AppFrame>;
}

const calendarWeekdays = ["日", "月", "火", "水", "木", "金", "土"] as const;
function formatCalendarDateLong(dateKey: string) { const date = new Date(`${dateKey}T00:00:00Z`); return `${date.getUTCMonth() + 1}月${date.getUTCDate()}日 ${calendarWeekdays[date.getUTCDay()]}曜日`; }
function calendarTaskActionScope(task: TodayTask, date: string) { return task.modelRecurrenceType === "once" ? { targetDate: task.targetDate ?? date, calendarDate: date } : { targetDate: date, calendarDate: date }; }

/* eslint-disable @typescript-eslint/no-misused-promises */
function CalendarDateSheet({ household, date, data, selectedDataForDate, selectedDataReady, selectedDataAuthoritative, loading, onClose, onNavigateDate, onRefresh, onNavigate }: { household: Household; date: string; data: Awaited<ReturnType<typeof listCalendarTasks>> | null; selectedDataForDate: boolean; selectedDataReady: boolean; selectedDataAuthoritative: boolean; loading: boolean; onClose: () => void; onNavigateDate: (date: string) => void; onRefresh: (date: string) => Promise<void>; onNavigate: (route: NavigationPath) => void }) {
  void household;
  const reducedMotion = usePrefersReducedMotion();
  const [offset, setOffset] = useState(0);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);
  const [completedOpen, setCompletedOpen] = useState(false);
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set());
  const [passingIds, setPassingIds] = useState<Set<string>>(new Set());
  const [restoringIds, setRestoringIds] = useState<Set<string>>(new Set());
  const [direction, setDirection] = useState<"next" | "previous" | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const delayedRefreshStatusVisible = useDelayedBusyStatus(loading, {
    delayMs: HOME_REFRESH_STATUS_SHOW_DELAY_MS,
    minVisibleMs: HOME_REFRESH_STATUS_MIN_VISIBLE_MS
  });
  const dismissTimer = useRef<number | null>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number; axis: "pending" | "horizontal" | "vertical"; canDismiss: boolean } | null>(null);
  const suppressClick = useRef(false);
  useEffect(() => {
    setCompletedOpen(false);
    setOpenRowId(null);
    setExpandedTaskId(null);
    setOffset(0);
    setDragOffsetY(0);
    setIsDismissing(false);
  }, [date]);
  useEffect(() => {
    document.documentElement.classList.add("modal-open");
    document.body.classList.add("modal-open");
    const viewports = Array.from(document.querySelectorAll<HTMLElement>(".app-shell__viewport"));
    viewports.forEach((viewport) => viewport.classList.add("modal-open"));
    return () => {
      document.documentElement.classList.remove("modal-open");
      document.body.classList.remove("modal-open");
      viewports.forEach((viewport) => viewport.classList.remove("modal-open"));
      if (dismissTimer.current !== null) window.clearTimeout(dismissTimer.current);
    };
  }, []);
  const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, reducedMotion ? 0 : ms));
  const moveDate = (amount: number) => { setDirection(amount > 0 ? "next" : "previous"); window.setTimeout(() => setDirection(null), reducedMotion ? 0 : MOTION_MS.large); onNavigateDate(addDays(date, amount)); };
  const complete = async (task: TodayTask) => { if (completingIds.has(task.id) || passingIds.has(task.id) || restoringIds.has(task.id)) return; setOpenRowId(null); setExpandedTaskId(null); setCompletingIds((ids) => new Set(ids).add(task.id)); try { await changeTaskState(task.id, "complete", calendarTaskActionScope(task, date)); const reconciliation = onRefresh(date); await wait(MOTION_MS.completion); await reconciliation; } catch (error) { setStatusMessage(apiErrorMessage(error)); await onRefresh(date); } finally { setCompletingIds((ids) => { const next = new Set(ids); next.delete(task.id); return next; }); } };
  const pass = async (task: TodayTask) => { if (completingIds.has(task.id) || passingIds.has(task.id) || restoringIds.has(task.id)) return; setOpenRowId(null); setPassingIds((ids) => new Set(ids).add(task.id)); try { await changeTaskState(task.id, "skip", calendarTaskActionScope(task, date)); const reconciliation = onRefresh(date); await wait(MOTION_MS.pass); await reconciliation; } catch (error) { setStatusMessage(apiErrorMessage(error)); await onRefresh(date); } finally { setPassingIds((ids) => { const next = new Set(ids); next.delete(task.id); return next; }); } };
  const restore = async (record: CalendarCompletedRecord) => { if (completingIds.has(record.taskId) || passingIds.has(record.taskId) || restoringIds.has(record.taskId)) return; setOpenRowId(null); setRestoringIds((ids) => new Set(ids).add(record.taskId)); try { await restoreCalendarTaskRecord(record.taskId, record.id, date); const reconciliation = onRefresh(date); await wait(MOTION_MS.restore); await reconciliation; } catch (error) { setStatusMessage(apiErrorMessage(error)); await onRefresh(date); } finally { setRestoringIds((ids) => { const next = new Set(ids); next.delete(record.taskId); return next; }); } };
  const openRowAction = (rowId: string | null) => {
    setOpenRowId(rowId);
    if (rowId) setExpandedTaskId(null);
  };
  const toggleTaskDetail = (taskId: string) => {
    setOpenRowId(null);
    setExpandedTaskId((current) => current === taskId ? null : taskId);
  };
  const pointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    const inContent = contentRef.current?.contains(event.target as Node) ?? false;
    start.current = { x: event.clientX, y: event.clientY, axis: "pending", canDismiss: !inContent || (contentRef.current?.scrollTop ?? 0) <= 0 };
    suppressClick.current = false;
  };
  const pointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const gesture = start.current;
    if (!gesture) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (gesture.axis === "pending") {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 10) return;
      if (Math.abs(dx) > Math.abs(dy) + 4) {
        gesture.axis = "horizontal";
        event.currentTarget.setPointerCapture?.(event.pointerId);
        setDragging(true);
      } else if (dy > 0 && gesture.canDismiss) {
        gesture.axis = "vertical";
        event.currentTarget.setPointerCapture?.(event.pointerId);
        setDragging(true);
      } else {
        gesture.axis = "vertical";
      }
    }
    if (gesture.axis === "horizontal") {
      event.preventDefault();
      setOffset(Math.max(-88, Math.min(88, dx)));
    } else if (gesture.axis === "vertical" && gesture.canDismiss && dy > 0) {
      event.preventDefault();
      setDragOffsetY(Math.min(260, dy));
    }
  };
  const pointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const gesture = start.current;
    if (!gesture) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    const consumed = gesture.axis !== "pending" && Math.max(Math.abs(dx), Math.abs(dy)) >= 10;
    if (gesture.axis === "horizontal") {
      event.preventDefault();
      suppressClick.current = true;
      if (Math.abs(dx) >= 56 && Math.abs(dx) > Math.abs(dy)) moveDate(dx < 0 ? 1 : -1);
    } else if (gesture.axis === "vertical" && gesture.canDismiss && dy > 0) {
      event.preventDefault();
      suppressClick.current = consumed;
      if (dy >= 96) {
        setIsDismissing(true);
        setDragOffsetY(window.innerHeight);
        dismissTimer.current = window.setTimeout(onClose, reducedMotion ? 0 : MOTION_MS.sheet);
      } else {
        setDragOffsetY(0);
      }
    }
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    start.current = null;
    setDragging(false);
    setOffset(0);
  };
  const pointerCancel = (event: ReactPointerEvent<HTMLElement>) => {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    start.current = null;
    setDragging(false);
    setOffset(0);
    setDragOffsetY(0);
  };
  const currentData = selectedDataForDate && data?.selectedDate === date ? data : null;
  const direct = currentData?.selected.fixed ?? []; const period = [...(currentData?.selected.weeklyFlexible ?? []), ...(currentData?.selected.monthlyFlexible ?? [])].sort((a, b) => (a.deadlineDate ?? "").localeCompare(b.deadlineDate ?? "")); const completed = currentData?.selected.completed ?? [];
  return <div className="calendar-date-layer"><button type="button" className="calendar-date-backdrop" aria-label="背景を閉じる" onClick={onClose} /><section ref={sheetRef} role="dialog" aria-modal="true" aria-labelledby="calendar-date-sheet-title" className={`calendar-date-sheet${dragging ? " is-swipe-dragging" : ""}${isDismissing ? " is-dismissing" : ""}${direction ? ` is-date-transitioning-${direction}` : ""}`} style={{ "--date-sheet-drag-offset": `${dragOffsetY}px` } as CSSProperties} onPointerDown={(event) => { event.stopPropagation(); pointerDown(event); }} onPointerMove={(event) => { event.stopPropagation(); pointerMove(event); }} onPointerUp={(event) => { event.stopPropagation(); pointerUp(event); }} onPointerCancel={(event) => { event.stopPropagation(); pointerCancel(event); }} onClickCapture={(event) => { if (!suppressClick.current) return; event.preventDefault(); event.stopPropagation(); suppressClick.current = false; }}><div className="calendar-date-sheet__handle" aria-hidden="true" /><header className="calendar-date-sheet__header"><button type="button" className="calendar-date-sheet__close" onClick={onClose}><X /><span>閉じる</span></button><div className="calendar-date-sheet__nav" aria-label="日付を移動"><button type="button" aria-label="前の日" onClick={() => moveDate(-1)}><ChevronLeft /></button><button type="button" aria-label="次の日" onClick={() => moveDate(1)}><ChevronRight /></button></div></header><div ref={contentRef} className="calendar-date-sheet__content" style={{ "--date-swipe-offset": `${offset}px` } as CSSProperties}><h2 id="calendar-date-sheet-title">{formatCalendarDateLong(date)}</h2><CalendarDateSection title="この日" tasks={direct} showEmptyState={selectedDataReady} mutationsDisabled={!selectedDataAuthoritative} expandedTaskId={expandedTaskId} onToggleTask={toggleTaskDetail} openRowId={openRowId} onOpenRow={openRowAction} date={date} completingIds={completingIds} passingIds={passingIds} restoringIds={restoringIds} onComplete={complete} onEdit={(task) => onNavigate(`/tasks/${task.id}/edit?origin=calendar&calendarDate=${date}`)} onPass={pass} /><CalendarDateSection title="期間中" tasks={period} showEmptyState={selectedDataReady} mutationsDisabled={!selectedDataAuthoritative} expandedTaskId={expandedTaskId} onToggleTask={toggleTaskDetail} openRowId={openRowId} onOpenRow={openRowAction} date={date} completingIds={completingIds} passingIds={passingIds} restoringIds={restoringIds} onComplete={complete} onEdit={(task) => onNavigate(`/tasks/${task.id}/edit?origin=calendar&calendarDate=${date}`)} onPass={pass} />{completed.length ? <section className="home-completed calendar-completed-section"><button className="home-completed__history-toggle" type="button" aria-expanded={completedOpen} onClick={() => setCompletedOpen((open) => !open)}><span>完了済み {completed.length}</span><ChevronRight className={completedOpen ? "is-open" : ""} /></button>{completedOpen ? <div className="home-history__list home-completed__list">{completed.map((record) => <CalendarHistoryRow key={record.id} record={record} busy={restoringIds.has(record.taskId)} openRowId={openRowId} onOpenRow={openRowAction} onEdit={() => onNavigate(`/tasks/${record.taskId}/edit?origin=calendar&calendarDate=${date}`)} onRestore={() => void restore(record)} mutationsDisabled={!selectedDataAuthoritative} />)}</div> : null}</section> : null}{currentData?.selected.shopping.length ? <section className="calendar-shopping-section"><h3>買うもの</h3><div className="calendar-shopping-list">{currentData.selected.shopping.map((item) => <button key={item.id} type="button" className="calendar-shopping-row" aria-label={`${item.name}${item.quantity ? ` ${item.quantity}` : ""}`} onClick={() => onNavigate(`/shopping?item=${item.id}`)}><span>{item.name}</span>{item.quantity ? <span>{item.quantity}</span> : null}</button>)}</div></section> : null}<p className="calendar-status" role="status" aria-live="polite">{statusMessage}{delayedRefreshStatusVisible ? "読み込み中" : ""}</p></div></section></div>;
}

/* eslint-enable @typescript-eslint/no-misused-promises */
function CalendarDateSection({ title, tasks, showEmptyState, mutationsDisabled, expandedTaskId, onToggleTask, openRowId, onOpenRow, date, completingIds, passingIds, restoringIds, onComplete, onEdit, onPass }: { title: string; tasks: TodayTask[]; showEmptyState: boolean; mutationsDisabled: boolean; expandedTaskId: string | null; onToggleTask: (taskId: string) => void; openRowId: string | null; onOpenRow: (rowId: string | null) => void; date: string; completingIds: Set<string>; passingIds: Set<string>; restoringIds: Set<string>; onComplete: (task: TodayTask) => void; onEdit: (task: TodayTask) => void; onPass: (task: TodayTask) => void }) { return <section className="calendar-date-section"><h3>{title}</h3>{tasks.length ? <div className="calendar-detail-task-list">{tasks.map((task) => <CalendarDetailTask key={task.id} task={task} rowId={`calendar-active-${task.id}`} expanded={expandedTaskId === task.id} onToggle={() => onToggleTask(task.id)} date={date} openRowId={openRowId} onOpenRow={onOpenRow} completing={completingIds.has(task.id)} passing={passingIds.has(task.id)} restoring={restoringIds.has(task.id)} mutationsDisabled={mutationsDisabled} onComplete={() => onComplete(task)} onEdit={() => onEdit(task)} onPass={() => onPass(task)} />)}</div> : showEmptyState ? <p className="calendar-date-section__empty">なし</p> : <div className="calendar-date-section__placeholder" aria-hidden="true" />}</section>; }
function CalendarDetailTask({ task, rowId, expanded, onToggle, date, openRowId, onOpenRow, completing, passing, restoring, mutationsDisabled, onComplete, onEdit, onPass }: { task: TodayTask; rowId: string; expanded: boolean; onToggle: () => void; date: string; openRowId: string | null; onOpenRow: (rowId: string | null) => void; completing: boolean; passing: boolean; restoring: boolean; mutationsDisabled: boolean; onComplete: () => void; onEdit: () => void; onPass: () => void }) {
  const busy = completing || passing || restoring;
  const expandedContent = expanded ? <div className="m2-home__expanded" id={`calendar-task-detail-${task.id}`}><button type="button" className="m2-home__primary" disabled={busy || mutationsDisabled} onClick={onComplete}>{busy ? "完了中…" : "完了"}</button>{task.description?.trim() ? <div className="m2-home__detail"><span>メモ</span><p>{task.description.trim()}</p></div> : null}{task.deadlineDate || task.targetDate || task.deadlineTime || task.scheduledTime ? <div className="m2-home__detail"><span>日付 / 時間</span><p>{formatHomeDeadline(task, date)}</p></div> : null}{task.modelRecurrenceType || task.recurrenceType ? <div className="m2-home__detail"><span>繰り返し</span><p>{recurrenceDescription(task)}</p></div> : null}</div> : null;
  return <HomeSwipeRow rowId={rowId} openRowId={openRowId} onOpenRow={onOpenRow} busy={busy} onEdit={onEdit} onSecondary={onPass} secondaryLabel="パス" mutationsDisabled={mutationsDisabled} expanded={expanded} expandedContent={expandedContent} rowClassName={`calendar-detail-task${completing ? " is-completing" : ""}${passing ? " is-passing" : ""}${restoring ? " is-restoring" : ""}`}>
    <button type="button" className="m2-home__row-main calendar-detail-task__main" disabled={busy} onClick={onToggle} aria-label={`${task.title}の詳細`} aria-expanded={expanded} aria-controls={`calendar-task-detail-${task.id}`}>
      <span className={`calendar-detail-task__check${completing ? " is-completing" : ""}`} aria-hidden="true">{completing ? <Check /> : null}</span>
      <span>{task.title}</span>
    </button>
  </HomeSwipeRow>;
}
function CalendarHistoryRow({ record, busy, openRowId, onOpenRow, onEdit, onRestore, mutationsDisabled }: { record: CalendarCompletedRecord; busy: boolean; openRowId: string | null; onOpenRow: (rowId: string | null) => void; onEdit: () => void; onRestore: () => void; mutationsDisabled: boolean }) { const avatar = record.actualCompleter; return <HomeSwipeRow rowId={`calendar-history-${record.id}`} openRowId={openRowId} onOpenRow={onOpenRow} busy={busy} onEdit={record.taskActive ? onEdit : undefined} onSecondary={onRestore} secondaryLabel="戻す" restoreOnly={!record.taskActive} mutationsDisabled={mutationsDisabled} rowClassName="calendar-history-row"><div className="m2-home__row-main m2-home__history-main"><span className="m2-home__row-details"><span className="m2-home__task-title">{record.title}</span></span>{avatar.displayName ? <HomeAvatar member={avatar} label="完了者" /> : null}</div></HomeSwipeRow>; }

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
              onClick={() => onNavigate(`/shopping?item=${encodeURIComponent(item.id)}`)}
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

function useHomeData(user: AuthUser, household: Household, bootstrap: HomeBootstrapRequest | null) {
  const [dateKey, setDateKey] = useState(() => todayInTimezone(household.timezone));
  const dateKeyRef = useRef(dateKey);
  const identity: HomeSnapshotIdentity = { userId: user.id, householdId: household.id, date: dateKey };
  const identityKey = homeSnapshotKey(identity);
  const [state, setState] = useState(() => {
    const memory = readMemoryHomeSnapshot(identity);
    return {
      data: memory,
      loading: true,
      refreshing: true,
      message: "",
      source: memory ? "memory" : "none" as "memory" | "indexeddb" | "server" | "none",
      hasAuthoritativeSync: false,
      authoritativeRevision: 0
    };
  });
  const generationRef = useRef(0);
  const requestSequenceRef = useRef(0);
  const latestStartedRef = useRef(0);
  const latestAppliedRef = useRef(0);
  const refreshEpochRef = useRef(0);
  const hasAuthoritativeSyncRef = useRef(false);
  const controllersRef = useRef(new Set<AbortController>());
  const initialRequestRef = useRef<{ identityKey: string; request: Promise<HomeToday> } | null>(null);

  const startRequest = useCallback(async (request: Promise<HomeToday>, generation: number, applyGate?: Promise<unknown>): Promise<HomeToday | null> => {
    const sequence = ++requestSequenceRef.current;
    latestStartedRef.current = sequence;
    const requestEpoch = refreshEpochRef.current;
    setState((current) => ({ ...current, loading: current.data === null, refreshing: true, message: "" }));
    try {
      const nextData = await request;
      if (applyGate) await applyGate;
      if (generationRef.current !== generation || requestEpoch !== refreshEpochRef.current || sequence < latestAppliedRef.current) return null;
      if (nextData.date !== dateKeyRef.current) return null;
      latestAppliedRef.current = sequence;
      hasAuthoritativeSyncRef.current = true;
      setState((current) => ({
        ...current,
        data: nextData,
        loading: false,
        refreshing: latestStartedRef.current !== sequence,
        message: "",
        source: "server",
        hasAuthoritativeSync: true,
        authoritativeRevision: current.authoritativeRevision + 1
      }));
      if (nextData.date === dateKeyRef.current) {
        void writeServerConfirmedHomeSnapshot({ userId: user.id, householdId: household.id, date: dateKeyRef.current }, nextData);
      }
      return nextData;
    } catch (error: unknown) {
      if (generationRef.current !== generation || requestEpoch !== refreshEpochRef.current || sequence !== latestStartedRef.current) return null;
      if (error instanceof DOMException && error.name === "AbortError") return null;
      setState((current) => ({
        ...current,
        loading: false,
        refreshing: false,
        message: "最新情報を取得できませんでした。"
      }));
      return null;
    }
  }, [household.id, user.id]);

  const refresh = useCallback(async (applyGate?: Promise<unknown>): Promise<HomeToday | null> => {
    const controller = new AbortController();
    controllersRef.current.add(controller);
    const request = getHomeToday(undefined, controller.signal).finally(() => controllersRef.current.delete(controller));
    return startRequest(request, generationRef.current, applyGate);
  }, [startRequest]);

  const invalidateRequests = useCallback(() => {
    refreshEpochRef.current += 1;
    requestSequenceRef.current += 1;
    latestStartedRef.current = requestSequenceRef.current;
    controllersRef.current.forEach((controller) => controller.abort());
    controllersRef.current.clear();
  }, []);

  useEffect(() => {
    const generation = ++generationRef.current;
    dateKeyRef.current = dateKey;
    requestSequenceRef.current = 0;
    latestStartedRef.current = 0;
    latestAppliedRef.current = 0;
    hasAuthoritativeSyncRef.current = false;
    refreshEpochRef.current += 1;
    const currentIdentity: HomeSnapshotIdentity = { userId: user.id, householdId: household.id, date: dateKey };
    const memory = readMemoryHomeSnapshot(currentIdentity);
    setState({
      data: memory,
      loading: true,
      refreshing: true,
      message: "",
      source: memory ? "memory" : "none",
      hasAuthoritativeSync: false,
      authoritativeRevision: 0
    });

    let request: Promise<HomeToday>;
    if (bootstrap && !bootstrap.consumed) {
      bootstrap.consumed = true;
      request = bootstrap.promise;
      initialRequestRef.current = { identityKey, request };
    } else if (initialRequestRef.current?.identityKey === identityKey) {
      request = initialRequestRef.current.request;
    } else {
      request = getHomeToday();
      initialRequestRef.current = { identityKey, request };
    }
    const persistentRead = memory ? Promise.resolve(null) : readPersistentHomeSnapshot(currentIdentity);
    void persistentRead.then((cached) => {
      if (!cached || generationRef.current !== generation || hasAuthoritativeSyncRef.current) return;
      setState((current) => current.data ? current : {
        ...current,
        data: cached,
        source: "indexeddb"
      });
    });
    void startRequest(request, generation);

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const nextDateKey = todayInTimezone(household.timezone);
      if (nextDateKey !== dateKeyRef.current) {
        dateKeyRef.current = nextDateKey;
        setDateKey(nextDateKey);
        setState({ data: null, loading: true, refreshing: true, message: "", source: "none", hasAuthoritativeSync: false, authoritativeRevision: 0 });
        return;
      }
      void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    const activeControllers = controllersRef.current;
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      activeControllers.forEach((controller) => controller.abort());
      activeControllers.clear();
    };
  }, [dateKey, household.id, household.timezone, user.id, identityKey, bootstrap, refresh, startRequest]);

  return {
    data: state.data,
    loading: state.loading,
    refreshing: state.refreshing,
    message: state.message,
    hasAuthoritativeSync: state.hasAuthoritativeSync,
    authoritativeRevision: state.authoritativeRevision,
    refresh,
    invalidateRequests
  };
}

function HomeScreen({
  household,
  user,
  profileImageNotice,
  onNavigate,
  homeBootstrap
}: {
  household: Household;
  profileImageNotice?: string;
  user: AuthUser;
  onNavigate: (route: NavigationPath) => void;
  onLogout: () => void;
  homeBootstrap: HomeBootstrapRequest | null;
}) {
  const { data, loading, refreshing, message, refresh, invalidateRequests, hasAuthoritativeSync, authoritativeRevision } = useHomeData(user, household, homeBootstrap);
  const delayedRefreshStatusVisible = useDelayedBusyStatus(refreshing && data !== null, {
    delayMs: HOME_REFRESH_STATUS_SHOW_DELAY_MS,
    minVisibleMs: HOME_REFRESH_STATUS_MIN_VISIBLE_MS
  });
  const showRefreshStatus = (loading && !data) || (delayedRefreshStatusVisible && !message);
  const prefersReducedMotion = usePrefersReducedMotion();
  const [completedOpen, setCompletedOpen] = useState(false);
  const [passedOpen, setPassedOpen] = useState(false);
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [mutations, setMutations] = useState<HomeMutation[]>([]);
  const [statusMessage, setStatusMessage] = useState("");
  const mutationsRef = useRef<HomeMutation[]>([]);
  const mutationSequenceRef = useRef(0);
  const mountedRef = useRef(true);
  const sessionIdentity = `${user.id}:${household.id}:${todayInTimezone(household.timezone)}`;
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  useEffect(() => {
    mutationsRef.current = [];
    setMutations([]);
    setStatusMessage("");
  }, [sessionIdentity]);
  useEffect(() => {
    if (!data || authoritativeRevision === 0) return;
    const current = mutationsRef.current;
    const next = current.map((mutation) => mutation.postSucceeded && mutation.phase === "transitioned" && serverMatchesMutation(data, mutation)
      ? { ...mutation, phase: "reconciled" as const }
      : mutation);
    if (next.some((mutation, index) => mutation !== current[index])) {
      mutationsRef.current = next;
      setMutations(next);
    }
  }, [authoritativeRevision, data]);
  const mutationsDisabled = Boolean(data && !hasAuthoritativeSync);
  const currentSessionMutations = mutations.filter((mutation) => mutation.userId === user.id && mutation.householdId === household.id && mutation.date === todayInTimezone(household.timezone));
  const displayedData = data ? projectHomeData(data, currentSessionMutations) : null;
  const today = displayedData?.date ?? todayInTimezone(household.timezone);
  const activeTasks = (displayedData?.homeTasks ?? []).filter(
    (task) => task.status === "pending" || task.status === "in_progress"
  );
  const completed = displayedData?.completedRecords ?? [];
  const passed = displayedData?.passedRecords ?? [];
  const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, prefersReducedMotion ? 0 : ms));
  const updateMutations = (updater: (current: HomeMutation[]) => HomeMutation[]) => {
    if (!mountedRef.current) return;
    const next = updater(mutationsRef.current);
    mutationsRef.current = next;
    setMutations(next);
  };
  const activeMutationFor = (taskId: string) => [...mutationsRef.current].reverse().find((mutation) => mutation.taskId === taskId && mutation.phase !== "reconciled");
  const isBusy = (id: string) => Boolean(activeMutationFor(id));
  const mutationClass = (taskId: string, type: HomeMutationType) => {
    const mutation = activeMutationFor(taskId);
    return mutation?.type === type ? `is-${type === "complete" ? "completing" : type === "pass" ? "passing" : "restoring"}-row` : "";
  };
  const markPhaseAfterMotion = (mutationId: string, motionPromise: Promise<void>) => {
    void motionPromise.then(() => updateMutations((current) => current.map((mutation) => mutation.id === mutationId && mutation.phase === "animating"
      ? { ...mutation, phase: "transitioned" as HomeMutationPhase }
      : mutation)));
  };
  const beginMutation = ({ type, taskId, originalTask, originalRecord, motionMs }: { type: HomeMutationType; taskId: string; originalTask?: TodayTask; originalRecord?: HomeToday["completedRecords"][number]; motionMs: number }) => {
    const startedAt = Date.now();
    const mutation: HomeMutation = {
      id: `home-${type}-${taskId}-${startedAt}-${++mutationSequenceRef.current}`,
      type,
      phase: "animating",
      userId: user.id,
      householdId: household.id,
      date: today,
      taskId,
      originalTask,
      originalRecord,
      transientRecord: originalTask && (type === "complete" || type === "pass")
        ? createTemporaryHistoryRecord(originalTask, type, { userId: user.id, householdId: household.id, date: today }, user, startedAt, displayedData?.members.find((member) => member.userId === originalTask.assignedUserId))
        : undefined,
      startedAt,
      postSucceeded: false
    };
    invalidateRequests();
    updateMutations((current) => [...current, mutation]);
    const motionPromise = wait(motionMs);
    markPhaseAfterMotion(mutation.id, motionPromise);
    return { mutation, motionPromise };
  };
  const reconcileMatchingMutation = (serverData: HomeToday) => updateMutations((current) => current.map((mutation) => mutation.postSucceeded && mutation.phase === "transitioned" && serverMatchesMutation(serverData, mutation)
    ? { ...mutation, phase: "reconciled" as const }
    : mutation));
  const runMutation = async (mutation: HomeMutation, motionPromise: Promise<void>, request: Promise<unknown>) => {
    try {
      await request;
      if (!mountedRef.current) return;
      updateMutations((current) => current.map((entry) => entry.id === mutation.id ? { ...entry, postSucceeded: true } : entry));
      const nextData = await refresh(motionPromise);
      if (nextData && mountedRef.current) reconcileMatchingMutation(nextData);
    } catch (error) {
      if (!mountedRef.current) return;
      updateMutations((current) => current.filter((entry) => entry.id !== mutation.id));
      setStatusMessage(apiErrorMessage(error));
      await refresh();
    }
  };
  const complete = (task: TodayTask) => {
    if (isBusy(task.id) || mutationsDisabled) return;
    setOpenRowId(null);
    setExpandedTaskId(null);
    setStatusMessage("");
    const { mutation, motionPromise } = beginMutation({ type: "complete", taskId: task.id, originalTask: task, motionMs: MOTION_MS.completion });
    void runMutation(mutation, motionPromise, changeTaskState(task.id, "complete", homeTaskActionScope(task, household)));
  };
  const pass = (task: TodayTask) => {
    if (isBusy(task.id) || mutationsDisabled) return;
    setOpenRowId(null);
    setStatusMessage(`「${task.title}」をパスしました`);
    const { mutation, motionPromise } = beginMutation({ type: "pass", taskId: task.id, originalTask: task, motionMs: MOTION_MS.pass });
    void runMutation(mutation, motionPromise, changeTaskState(task.id, "skip", homeTaskActionScope(task, household)));
  };
  const restore = (record: HomeToday["completedRecords"][number]) => {
    if (isBusy(record.taskId) || mutationsDisabled) return;
    setOpenRowId(null);
    const originalTask = getRetainedTaskProjection(mutationsRef.current, record.taskId) ?? undefined;
    const { mutation, motionPromise } = beginMutation({ type: "restore", taskId: record.taskId, originalTask, originalRecord: record, motionMs: MOTION_MS.restore });
    void runMutation(mutation, motionPromise, restoreTaskRecord(record.taskId, record.id));
  };
  const editRecord = (record: HomeToday["completedRecords"][number]) => onNavigate(`/tasks/${record.taskId}/edit`);
  const openRowAction = (rowId: string | null) => {
    setOpenRowId(rowId);
    if (rowId) setExpandedTaskId(null);
  };
  const toggleTaskDetail = (taskId: string) => {
    setOpenRowId(null);
    setExpandedTaskId((current) => current === taskId ? null : taskId);
  };
  return (
    <AppFrame current="/home" onNavigate={onNavigate}>
      <main className="m2-home" aria-busy={refreshing}>
        <header className="m2-home__header">
          <p>{formatHomeDate(today)}</p>
          <h1>やること</h1>
          {showRefreshStatus ? <p className="m2-home__refresh-status" role="status" aria-live="polite">{HOME_REFRESH_STATUS}</p> : null}
        </header>
        {profileImageNotice ? <p className="m2-home__notice" role="status">{profileImageNotice}</p> : null}
        {message ? <p className="m2-home__refresh-error" role="status" aria-live="polite">{message}</p> : null}
        {!data ? (
          <section className="m2-home__pending" aria-label="やることを読み込み中" aria-hidden="true" />
        ) : activeTasks.length > 0 ? (
          <section className="m2-home__task-list" aria-label="やること一覧">
            {activeTasks.map((task) => (
              <HomeSwipeRow
                key={task.id}
                rowId={`active-${task.id}`}
                openRowId={openRowId}
                onOpenRow={openRowAction}
                busy={isBusy(task.id)}
                onEdit={() => onNavigate(`/tasks/${task.id}/edit`)}
                onSecondary={() => void pass(task)}
                secondaryLabel="パス"
                expanded={expandedTaskId === task.id}
                expandedContent={<TaskInlineDetail task={task} today={today} members={displayedData?.members} busy={isBusy(task.id)} disabled={mutationsDisabled} onComplete={() => void complete(task)} />}
                mutationsDisabled={mutationsDisabled}
                rowClassName={mutationClass(task.id, "complete") || mutationClass(task.id, "pass") || mutationClass(task.id, "restore")}
              >
                <button className="m2-home__row-main" type="button" disabled={isBusy(task.id)} onClick={() => toggleTaskDetail(task.id)} aria-label={`${task.title}の詳細`} aria-expanded={expandedTaskId === task.id} aria-controls={`home-task-detail-${task.id}`}>
                  <span className={`m2-home__check m2-home__check--${homeTaskScope(task)}${activeMutationFor(task.id)?.type === "complete" ? " is-completing" : ""}`} aria-hidden="true">
                    {activeMutationFor(task.id)?.type === "complete" ? <Check /> : null}
                  </span>
                  <span className="m2-home__row-details">
                    <span className="m2-home__task-title">{task.title}</span>
                    <span className="m2-home__deadline">{formatHomeDeadline(task, today)}</span>
                  </span>
                  {homeMemberForTask(task, displayedData?.members ?? []) ? <HomeAvatar member={homeMemberForTask(task, displayedData?.members ?? [])!} label="担当" /> : null}
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
            {completedOpen ? <div className="m2-home__history-list">{completed.map((record) => <HomeHistoryRow key={record.id} record={record} busy={isBusy(record.taskId)} onEdit={() => editRecord(record)} onRestore={() => void restore(record)} openRowId={openRowId} onOpenRow={setOpenRowId} mutationsDisabled={mutationsDisabled} />)}</div> : null}
          </section>
        ) : null}
        {passed.length > 0 ? (
          <section className="m2-home__history m2-home__history--passed">
            <button className="m2-home__history-toggle" type="button" aria-expanded={passedOpen} onClick={() => setPassedOpen((open) => !open)}>
              <span>パス済み {passed.length}</span><ChevronRight aria-hidden="true" className={passedOpen ? "is-open" : ""} />
            </button>
            {passedOpen ? <div className="m2-home__history-list">{passed.map((record) => <HomeHistoryRow key={record.id} record={record} busy={isBusy(record.taskId)} onEdit={() => void editRecord(record)} onRestore={() => void restore(record)} passed openRowId={openRowId} onOpenRow={setOpenRowId} mutationsDisabled={mutationsDisabled} />)}</div> : null}
          </section>
        ) : null}
        <button className="m2-home__shopping" type="button" onClick={() => onNavigate("/shopping")}>
          <span>買い物 {displayedData?.shopping.pendingCount ?? 0}件</span><ChevronRight aria-hidden="true" />
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

function homeMemberForTask(task: TodayTask, members: HomeToday["members"]) {
  return task.assignedUserId ? members.find((member) => member.userId === task.assignedUserId) ?? null : null;
}

function HomeAvatar({ member, label }: { member: { displayName: string | null; color?: string | null; avatarUrl?: string | null }; label: string }) {
  const name = member.displayName ?? "メンバー";
  return <span className="m2-home__avatar" role="img" aria-label={`${label}: ${name}`}>{member.avatarUrl ? <img src={member.avatarUrl} alt="" /> : name.slice(0, 1)}</span>;
}

function TaskInlineDetail({ task, today, members, busy, disabled = false, onComplete }: { task: TodayTask; today: string; members?: HomeToday["members"]; busy: boolean; disabled?: boolean; onComplete: () => void }) {
  const description = task.description?.trim();
  const assignee = members ? homeMemberForTask(task, members) : null;
  const hasDateOrTime = Boolean(task.deadlineDate ?? (task.modelRecurrenceType === "once" ? task.targetDate : null) ?? task.deadlineTime ?? task.scheduledTime);
  return <div className="m2-home__expanded" id={`home-task-detail-${task.id}`}>
    <button type="button" className="m2-home__primary" disabled={busy || disabled} onClick={onComplete}>{busy ? "完了中…" : "完了"}</button>
    {description ? <div className="m2-home__detail"><span>メモ</span><p>{description}</p></div> : null}
    {assignee ? <div className="m2-home__detail"><span>担当</span><p>{assignee.displayName ?? "メンバー"}</p></div> : null}
    {hasDateOrTime ? <div className="m2-home__detail"><span>日付 / 時間</span><p>{formatHomeDeadline(task, today)}</p></div> : null}
    {task.modelRecurrenceType || task.recurrenceType ? <div className="m2-home__detail"><span>繰り返し</span><p>{recurrenceDescription(task)}</p></div> : null}
  </div>;
}

function HomeSwipeRow({ children, rowId, openRowId, onOpenRow, busy, onEdit, onSecondary, secondaryLabel, expanded = false, expandedContent, rowClassName = "", restoreOnly = false, mutationsDisabled = false }: { children: ReactNode; rowId: string; openRowId: string | null; onOpenRow: (rowId: string | null) => void; busy: boolean; onEdit?: () => void; onSecondary: () => void; secondaryLabel: string; expanded?: boolean; expandedContent?: ReactNode; rowClassName?: string; restoreOnly?: boolean; mutationsDisabled?: boolean }) {
  const actionWidth = restoreOnly ? 72 : 136;
  const actionsOpen = openRowId === rowId;
  const [offset, setOffset] = useState(actionsOpen ? -actionWidth : 0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const vertical = useRef(false);
  const horizontal = useRef(false);
  const suppressClick = useRef(false);
  useEffect(() => {
    if (!dragging) setOffset(actionsOpen ? -actionWidth : 0);
  }, [actionWidth, actionsOpen, dragging]);
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
    if (wasVertical) { suppressClick.current = true; setOffset(actionsOpen ? -actionWidth : 0); return; }
    if (-dx > 48) { suppressClick.current = true; onOpenRow(rowId); setOffset(-actionWidth); }
    else if (dx > 24 && actionsOpen) { suppressClick.current = true; onOpenRow(null); setOffset(0); }
    else setOffset(actionsOpen ? -actionWidth : 0);
  };
  const clickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!suppressClick.current) return;
    if (event.target instanceof Element && event.target.closest(".m2-home__actions")) { suppressClick.current = false; return; }
    event.preventDefault(); event.stopPropagation(); suppressClick.current = false;
  };
  return <div className={`m2-home__row ${expanded ? "is-expanded" : ""} ${actionsOpen ? "is-actions-open" : ""} ${dragging ? "is-dragging" : ""} ${rowClassName}`} onPointerDown={(event) => { event.stopPropagation(); start.current = { x: event.clientX, y: event.clientY }; setDragging(false); }} onPointerMove={(event) => { event.stopPropagation(); move(event); }} onPointerUp={(event) => { event.stopPropagation(); end(event); }} onPointerCancel={(event) => { event.stopPropagation(); start.current = null; vertical.current = false; horizontal.current = false; setDragging(false); setOffset(actionsOpen ? -actionWidth : 0); }} onClickCapture={clickCapture}>
    <div className="m2-home__row-content" style={{ "--m2-swipe-offset": `${offset}px` } as CSSProperties}>
      {children}
      <button type="button" className="m2-home__more" aria-label="操作" aria-expanded={actionsOpen} onClick={() => { const next = !actionsOpen; onOpenRow(next ? rowId : null); setOffset(next ? -actionWidth : 0); }}><Ellipsis aria-hidden="true" /></button>
    </div>
     <div className={`m2-home__actions ${restoreOnly ? "is-restore-only" : ""}`} aria-label="操作メニュー"><span aria-hidden="true" />{!restoreOnly && onEdit ? <button type="button" onClick={onEdit}>編集</button> : null}<button type="button" className="is-secondary" disabled={busy || mutationsDisabled} onClick={onSecondary}>{secondaryLabel}</button></div>
    {expanded ? expandedContent : null}
  </div>;
}

function HomeHistoryRow({ record, busy, onEdit, onRestore, passed = false, openRowId, onOpenRow, mutationsDisabled = false }: { record: HomeToday["completedRecords"][number]; busy: boolean; onEdit: () => void; onRestore: () => void; passed?: boolean; openRowId: string | null; onOpenRow: (rowId: string | null) => void; mutationsDisabled?: boolean }) {
  const deleted = !record.taskActive;
  const member = passed ? record.assignedUser : record.actualCompleter;
  return <HomeSwipeRow rowId={`history-${record.id}`} openRowId={openRowId} onOpenRow={onOpenRow} busy={busy} onEdit={deleted ? undefined : onEdit} onSecondary={onRestore} secondaryLabel="戻す" restoreOnly={deleted} mutationsDisabled={mutationsDisabled} rowClassName={busy ? "is-restoring-row" : ""}>
    <div className="m2-home__row-main m2-home__history-main"><span className="m2-home__row-details"><span className="m2-home__task-title">{record.title}</span></span>{member?.displayName ? <HomeAvatar member={member} label={passed ? "担当" : "完了者"} /> : null}</div>
  </HomeSwipeRow>;
}

function TaskFormScreen({
  household,
  user,
  mode,
  taskId,
  onNavigate,
  onLogout
}: {
  household: Household;
  user: AuthUser;
  mode: "create" | "edit";
  taskId?: string;
  onNavigate: (route: NavigationPath) => void;
  onLogout: () => void;
}) {
  return (
    <M2TaskFormScreen
      household={household}
      user={user}
      mode={mode}
      taskId={taskId}
      onNavigate={onNavigate}
      onLogout={onLogout}
    />
  );
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
  const updateStartDate = (value: string) => {
    setForm((current) => normalizeTaskForm({ ...current, startDate: value, targetDate: current.recurrence === "once" ? value : current.targetDate }));
    setErrors((current) => ({ ...current, startDate: undefined }));
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
          <FormField className="mobile-compact-input-row" id="m2-task-start-date" label="開始日" error={errors.startDate}><input id="m2-task-start-date" type="date" value={form.startDate || today} onChange={(event) => updateStartDate(event.target.value)} aria-invalid={errors.startDate ? "true" : "false"} /></FormField>
          <label className="m2-task-form__toggle"><span>終日</span><span className="m2-task-form__toggle-current">{form.deadlineTime ? "オフ" : "オン"}</span><span className={`m2-task-form__switch${!form.deadlineTime ? " is-on" : ""}`}><input className="m2-task-form__switch-input" type="checkbox" checked={!form.deadlineTime} aria-label="終日" onChange={(event) => setField("deadlineTime", event.target.checked ? "" : "09:00")} /><span className="m2-task-form__switch-track" aria-hidden="true"><span /></span></span></label>
          {form.deadlineTime ? <FormField className="mobile-compact-input-row" id="m2-task-time" label="時間" error={errors.deadlineTime}><input id="m2-task-time" type="time" value={form.deadlineTime} aria-invalid={errors.deadlineTime ? "true" : "false"} aria-describedby={errors.deadlineTime ? "m2-task-time-error" : undefined} onChange={(event) => setField("deadlineTime", event.target.value)} /></FormField> : null}
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
  const orderedPendingRef = useRef<ShoppingItem[]>([]);

  useEffect(() => {
    orderedPendingRef.current = pending;
    setOrderedPending(pending);
  }, [pending]);

  useEffect(() => {
    if (!targetItemId || loading) return;
    const target = document.querySelector<HTMLElement>(`[data-shopping-m4-id="${CSS.escape(targetItemId)}"]`);
    if (!target) return;
    const isPurchased = visiblePurchasedShoppingItems(purchased).some((item) => item.id === targetItemId);
    if (isPurchased) setPurchasedOpen(true);
    setExpandedId(targetItemId);
    window.requestAnimationFrame(() => target.scrollIntoView({ block: "center", behavior: "smooth" }));
  }, [loading, targetItemId, orderedPending, pending, purchased]);

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
      orderedPendingRef.current = next;
      setDragOverId(overId);
      return next;
    });
  };

  const finishReorder = async () => {
    const ids = orderedPendingRef.current.map((item) => item.id);
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
              actionsOpen={actionsOpenId === item.id}
              dragging={false}
              dragOver={false}
              busy={busyItem === item.id}
              onToggle={() => toggleExpanded(item.id)}
              onPurchase={() => void runPurchase(item, "purchase")}
              onRestore={() => void runPurchase(item, "unpurchase")}
              onEdit={() => undefined}
              onActionsOpen={() => { setActionsOpenId(item.id); setExpandedId(null); }}
              onActionsClose={() => setActionsOpenId(null)}
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
  const capturedPointerId = useRef<number | null>(null);
  const capturedRow = useRef<HTMLElement | null>(null);
  const globalDragCleanup = useRef<(() => void) | null>(null);
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
    if (!purchased) {
      const row = event.currentTarget;
      const pointerId = event.pointerId;
      longPress.current = window.setTimeout(() => {
      if (!start.current || gesture.current) return;
      gesture.current = "reorder";
      dragStarted.current = true;
      if (row.setPointerCapture) {
        try {
          row.setPointerCapture(pointerId);
          capturedPointerId.current = pointerId;
          capturedRow.current = row;
        } catch {
          // The pointer may have been cancelled between the press and timer.
        }
      }
      const onWindowPointerUp = (upEvent: PointerEvent) => {
        if (upEvent.pointerId !== pointerId || !dragStarted.current) return;
        clearLongPress();
        dragStarted.current = false;
        suppressClick.current = true;
        globalDragCleanup.current?.();
        globalDragCleanup.current = null;
        if (capturedPointerId.current !== null && capturedRow.current?.hasPointerCapture?.(capturedPointerId.current)) capturedRow.current.releasePointerCapture(capturedPointerId.current);
        capturedPointerId.current = null;
        capturedRow.current = null;
        start.current = null;
        setSwiping(false);
        onDragEnd();
      };
      window.addEventListener("pointerup", onWindowPointerUp, true);
      globalDragCleanup.current = () => window.removeEventListener("pointerup", onWindowPointerUp, true);
      onDragStart();
      }, 360);
    }
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
    if (gesture.current === "swipe") { setSwiping(true); setSwipeOffset(Math.max(-80, Math.min(0, dx))); }
    if (Math.abs(dx) > 12 || Math.abs(dy) > 12) clearLongPress();
  };
  const handlePointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    clearLongPress();
    globalDragCleanup.current?.();
    globalDragCleanup.current = null;
    if (capturedPointerId.current !== null && event.currentTarget.hasPointerCapture?.(capturedPointerId.current)) {
      event.currentTarget.releasePointerCapture(capturedPointerId.current);
    }
    capturedPointerId.current = null;
    capturedRow.current = null;
    const origin = start.current;
    start.current = null;
    setSwiping(false);
    if (dragStarted.current) { dragStarted.current = false; suppressClick.current = true; onDragEnd(); return; }
    const currentGesture = gesture.current;
    gesture.current = null;
    if (!origin || currentGesture === "vertical") { setSwipeOffset(actionsOpen ? -80 : 0); return; }
    if (origin.x - event.clientX > 48) { suppressClick.current = true; setSwipeOffset(-80); onActionsOpen(); }
    else if (event.clientX - origin.x > 24 && actionsOpen) { suppressClick.current = true; setSwipeOffset(0); onActionsClose(); }
    else setSwipeOffset(actionsOpen ? -80 : 0);
  };
  const handleClickCapture = (event: ReactMouseEvent<HTMLElement>) => {
    if (!suppressClick.current) return;
    if (event.target instanceof Element && event.target.closest(".shopping-m4__actions")) { suppressClick.current = false; return; }
    event.preventDefault(); event.stopPropagation(); suppressClick.current = false;
  };
  const purchaserName = item.purchasedBy?.displayName ?? memberName(members, item.purchasedBy?.userId) ?? "メンバー";
  const imageSrc = item.image ? getShoppingItemImageUrl(item.id, item.image.updatedAt) : null;
  const canExpand = !purchased || Boolean(item.note || imageSrc);
  const isExpanded = canExpand && expanded;
  return (
    <article className={`shopping-m4__row${isExpanded ? " is-expanded" : ""}${actionsOpen ? " is-actions-open" : ""}${dragging ? " is-dragging" : ""}${dragOver ? " is-drag-over" : ""}${swiping ? " is-swiping" : ""}`} data-shopping-m4-id={item.id} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={(event) => { clearLongPress(); globalDragCleanup.current?.(); globalDragCleanup.current = null; if (capturedPointerId.current !== null && event.currentTarget.hasPointerCapture?.(capturedPointerId.current)) event.currentTarget.releasePointerCapture(capturedPointerId.current); capturedPointerId.current = null; capturedRow.current = null; start.current = null; if (dragStarted.current) onDragEnd(); dragStarted.current = false; setSwiping(false); }} onClickCapture={handleClickCapture}>
      <div className="shopping-m4__row-content" style={{ "--shopping-m4-swipe": `${swipeOffset}px` } as CSSProperties}>
        <button type="button" className="shopping-m4__row-main" aria-expanded={isExpanded} onClick={canExpand ? onToggle : undefined}>
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
      {actionsOpen ? <div className="shopping-m4__actions" aria-label={`${item.name}の操作メニュー`}><button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={purchased ? onRestore : onEdit}>{purchased ? "戻す" : "編集"}</button></div> : null}
      {isExpanded ? <div className="shopping-m4__expanded">
        {!purchased ? <button type="button" className="shopping-m4__primary" disabled={busy} onClick={onPurchase}>{busy ? "購入中…" : "購入"}</button> : null}
        {item.note ? <div className="shopping-m4__detail"><span>メモ</span><p>{item.note}</p></div> : null}
        {imageSrc ? <div className="shopping-m4__detail"><span>写真</span><img src={imageSrc} alt={`${item.name}の写真`} onError={(event) => { event.currentTarget.hidden = true; }} /></div> : null}
        {!purchased && item.plannedPurchaseDate ? <div className="shopping-m4__planned-detail">購入予定日 {formatShoppingPlannedDate(item.plannedPurchaseDate)}</div> : null}
      </div> : null}
      {!purchased && actionsOpen ? <button type="button" className="shopping-m4__actions-dismiss" onClick={onActionsClose} aria-label="操作を閉じる">閉じる</button> : null}
    </article>
  );
}

function remaining(limit: number, used: number) {
  return Math.max(limit - used, 0);
}

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
    return <small className="image-upload-usage">画像ストレージを確認しています…</small>;
  if (!usage) return null;
  const countAtLimit = usage.activeCount >= usage.activeCountLimit;
  const dailyAtLimit = usage.dailyUploadCount >= usage.dailyUploadLimit;
  const warning =
    (usage.activeCountLimit > 0 && usage.activeCount / usage.activeCountLimit >= 0.8) ||
    (usage.activeBytesLimit > 0 && usage.activeBytes / usage.activeBytesLimit >= 0.8) ||
    (usage.storedBytesKnown && usage.storedBytesLimit > 0 && usage.storedBytes / usage.storedBytesLimit >= 0.8);
  return (
    <div className="image-upload-usage" aria-label="画像アップロード状況">
      <span>画像ストレージ</span>
      {mode === "create" && countAtLimit ? (
        <strong className="image-upload-usage__message">画像の追加上限に達しています</strong>
      ) : (
        <>
          <span>残り画像 {remaining(usage.activeCountLimit, usage.activeCount)}枚</span>
          <span>本日あと {remaining(usage.dailyUploadLimit, usage.dailyUploadCount)}回</span>
        </>
      )}
      {dailyAtLimit ? <span className="image-upload-usage__message">本日のアップロード上限に達しています</span> : null}
      {warning && (mode === "edit" || !countAtLimit) && !dailyAtLimit ? <span className="image-upload-usage__message">画像保存容量が少なくなっています</span> : null}
      {!usage.storedBytesKnown ? <span className="image-upload-usage__note">削除処理中の画像があるため、保存容量を正確に確認できません</span> : null}
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
  const submittingRef = useRef(false);
  const [persistedItemId, setPersistedItemId] = useState<string | null>(mode === "edit" ? itemId ?? null : null);
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
        "image-conversion-failed":
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
    if (submittingRef.current) return;
    const nextErrors = validateShoppingForm(form);
    setErrors(nextErrors);
    setMessage("");
    if (Object.keys(nextErrors).length > 0) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const payload = normalizeShoppingForm(form) as UpdateShoppingItemInput;
      const existingItemId = persistedItemId ?? (mode === "edit" ? itemId : null);
      const result = existingItemId
        ? await updateShoppingItem(existingItemId, payload)
        : await createShoppingItem(payload as CreateShoppingItemInput);
      setPersistedItemId(result.item.id);
      if (selectedImage) {
        setImageStatus("uploading");
        try {
          await uploadShoppingItemImage(result.item.id, selectedImage);
          await refreshImageUsage();
        } catch (error) {
          setMessage(
            imageUploadErrorMessage(error) ??
              "買い物は登録されましたが、画像の保存に失敗しました。画像を確認してもう一度保存してください。"
          );
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
      submittingRef.current = false;
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
            className="mobile-compact-input-row"
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
            <div className="shopping-image-heading">
              <label htmlFor="shopping-image">写真</label>
              {previewUrl || existingImage ? <span className="shopping-image-state">選択済み</span> : null}
            </div>
            <ImageUploadUsageHint
              mode={mode}
              usage={imageUsage}
              loading={imageUsageLoading}
            />
            {previewUrl || existingImage ? (
              <div className="shopping-image-preview-row">
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
                <div className="inline-actions">
                  {selectedImage ? (
                    <Button
                      variant="secondary"
                      disabled={imageStatus !== "idle"}
                      onClick={removeSelectedImage}
                    >
                      外す
                    </Button>
                  ) : null}
                  {existingImage && !selectedImage ? (
                    <Button
                      variant="secondary"
                      disabled={imageStatus !== "idle" || submitting}
                      onClick={() => void removeExistingImage()}
                    >
                      外す
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : (
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
                  <ImageIcon aria-hidden="true" />
                  写真を選ぶ
                </Button>
              </div>
            )}
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
            {selectedImage ? (
              <small className="shopping-image-processing-detail">
                縮小後: {(selectedImage.size / 1024).toFixed(0)}KB /{" "}
                {selectedImage.width}×{selectedImage.height}px
              </small>
            ) : null}
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

