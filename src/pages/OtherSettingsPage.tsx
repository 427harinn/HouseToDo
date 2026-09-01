import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Camera, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { BottomSheet } from "../components/BottomSheet";
import { ApiError, apiMessage } from "../api/client";
import { createInvite, listMembers, updateCurrentHousehold } from "../api/households";
import { deleteProfileImage, updateProfile, uploadProfileImage } from "../api/account";
import {
  getNotificationSettings,
  getVapidPublicKey,
  registerPushSubscription,
  unregisterPushSubscription,
  updateNotificationSettings,
  type NotificationSettings
} from "../api/notifications";
import { getCurrentImageUsage, type ImageUsage } from "../api/image-usage";
import type { ProcessedImage } from "../lib/image-processing";
import { ProfileImagePicker } from "../components/ProfileImageCropper";
import { formatBytes } from "../lib/format";
import { getBrowserCapabilities, type BrowserCapabilities } from "../lib/capabilities";
import { urlBase64ToUint8Array } from "../lib/vapid";
import type { AuthUser, Household, HouseholdMember } from "../types";

export type OtherSettingsPageKind =
  | "members"
  | "notifications"
  | "storage"
  | "household"
  | "account";

type OtherSettingsProps = {
  kind: OtherSettingsPageKind;
  household: Household;
  user: AuthUser;
  onNavigate: (route: string) => void;
  onHouseholdUpdated: (household: Household) => Promise<void> | void;
  onUserUpdated: (user: AuthUser) => void;
  onLogout: () => Promise<void>;
};

const errorMessage = (error: unknown) =>
  error instanceof ApiError ? apiMessage(error) : "処理に失敗しました。もう一度お試しください。";

const initials = (name: string) => name.trim().slice(0, 1) || "?";

function OtherAvatar({ name, imageUrl, large = false }: { name: string; imageUrl?: string | null; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={`m5-avatar${large ? " m5-avatar--large" : ""}`} role="img" aria-label={`アバター: ${name}`}>
      {imageUrl && !failed ? <img src={imageUrl} alt="" onError={() => setFailed(true)} /> : initials(name)}
    </span>
  );
}

function SettingsHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="m5-settings-header">
      <button type="button" className="m5-settings-back" aria-label="戻る" onClick={onBack}>
        <ChevronLeft aria-hidden="true" />
        <span>戻る</span>
      </button>
      <h1>{title}</h1>
    </header>
  );
}

export function OtherLandingPage({ onNavigate }: { onNavigate: (route: string) => void }) {
  const rows = [
    ["メンバー", "/other/members"],
    ["通知", "/other/notifications"],
    ["ストレージ", "/other/storage"],
    ["家庭設定", "/other/household"],
    ["アカウント", "/other/account"]
  ] as const;
  return (
    <section className="m5-page m5-other-page">
      <header className="m5-other-header"><h1>その他</h1></header>
      <nav className="m5-other-navigation" aria-label="その他の設定">
        {rows.map(([label, route]) => (
          <a
            key={route}
            className="m5-other-row"
            href={route}
            onClick={(event) => { event.preventDefault(); onNavigate(route); }}
          >
            <span>{label}</span><ChevronRight aria-hidden="true" />
          </a>
        ))}
      </nav>
    </section>
  );
}

function MembersPage({ household }: { household: Household }) {
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    listMembers(controller.signal)
      .then((result) => setMembers(result.members))
      .catch((nextError) => { if (!(nextError instanceof DOMException && nextError.name === "AbortError")) setError(errorMessage(nextError)); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const openInvite = () => {
    setSheetOpen(true);
    setInviteCode("");
    setStatus("");
    setError("");
    if (household.role !== "owner") return;
    setInviteLoading(true);
    void createInvite()
      .then(({ invite }) => setInviteCode(invite.code))
      .catch((nextError) => setError(errorMessage(nextError)))
      .finally(() => setInviteLoading(false));
  };

  const copyInvite = async () => {
    if (!inviteCode) return;
    if (!navigator.clipboard?.writeText) {
      setStatus("コードをコピーできませんでした。コードを選択してコピーしてください。");
      return;
    }
    try {
      await navigator.clipboard.writeText(inviteCode);
      setStatus("コードをコピーしました");
    } catch {
      setStatus("コードをコピーできませんでした。コードを選択してコピーしてください。");
    }
  };

  return (
    <section className="m5-page m5-settings-page">
      <SettingsHeader title="メンバー" onBack={() => { window.history.pushState({}, "", "/other"); window.dispatchEvent(new PopStateEvent("popstate")); }} />
      <div className="m5-settings-list m5-members-list">
        {loading ? <p className="m5-inline-status" role="status">メンバーを読み込んでいます。</p> : null}
        {error ? <p className="m5-error" role="alert">{error}</p> : null}
        {!loading && !error ? members.map((member) => (
          <div className="m5-settings-row m5-member-row" key={member.userId}>
            <OtherAvatar name={member.displayName} imageUrl={member.avatarUrl} />
            <span>{member.displayName}</span>
          </div>
        )) : null}
        {household.role === "owner" ? (
          <button type="button" className="m5-settings-row m5-row-button m5-invite-row" onClick={openInvite}>
            <span>招待する</span><ChevronRight aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <p className="m5-status" role="status" aria-live="polite">{status}</p>
      <BottomSheet open={sheetOpen} title="メンバーを招待" onClose={() => setSheetOpen(false)}>
        <div className="m5-sheet-content">
          {inviteLoading ? <p role="status">招待コードを発行しています。</p> : null}
          {inviteCode ? <div className="m5-invite-code" aria-label={`招待コード ${inviteCode}`}>{inviteCode}</div> : null}
          {error ? <p className="m5-error" role="alert">{error}</p> : null}
          <button type="button" className="m5-primary-action" disabled={!inviteCode || inviteLoading} onClick={() => void copyInvite()}>コードをコピー</button>
        </div>
      </BottomSheet>
    </section>
  );
}

const getNotificationRegistration = async () => {
  if (typeof navigator === "undefined" || !navigator.serviceWorker?.getRegistration) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
};

function NotificationsPage() {
  const [capabilities, setCapabilities] = useState<BrowserCapabilities>(() => getBrowserCapabilities());
  const [deviceEnabled, setDeviceEnabled] = useState(false);
  const [deviceReady, setDeviceReady] = useState(false);
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [summary, setSummary] = useState<NotificationSettings>({
    eveningSummaryEnabled: false,
    eveningSummaryTime: "21:00",
    morningSummaryEnabled: false,
    morningSummaryTime: "09:00",
    timezone: "Asia/Tokyo"
  });
  const savedSummary = useRef(summary);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.all([
      getNotificationSettings(),
      (async () => {
        const next = getBrowserCapabilities();
        if (!next.serviceWorkerSupported || !next.pushManagerSupported || !next.notificationSupported || next.notificationPermission === "denied") return { next, enabled: false };
        const registration = await getNotificationRegistration();
        const subscription = registration?.pushManager ? await registration.pushManager.getSubscription() : null;
        return { next, enabled: Boolean(subscription) };
      })()
    ]).then(([nextSummary, device]) => {
      if (!active) return;
      setSummary(nextSummary);
      savedSummary.current = nextSummary;
      setCapabilities(device.next);
      setDeviceEnabled(device.enabled);
      setDeviceReady(true);
    }).catch((nextError) => { if (active) { setCapabilities(getBrowserCapabilities()); setDeviceReady(true); setError(errorMessage(nextError)); } });
    return () => { active = false; };
  }, []);

  const persistSummary = useCallback(async (next: NotificationSettings) => {
    const previous = savedSummary.current;
    if (JSON.stringify(previous) === JSON.stringify(next)) return;
    setSummary(next);
    setError("");
    try {
      const saved = await updateNotificationSettings(next);
      savedSummary.current = saved;
      setSummary(saved);
      setStatus("保存しました");
    } catch (nextError) {
      setSummary(previous);
      setError(errorMessage(nextError));
    }
  }, []);

  const setScheduleField = (field: keyof NotificationSettings, value: string | boolean) => {
    setSummary((current) => ({ ...current, [field]: value }));
  };

  const toggleDevice = async (enabled: boolean) => {
    setError("");
    if (!enabled) {
      setDeviceBusy(true);
      try {
        const registration = await getNotificationRegistration();
        const subscription = registration?.pushManager ? await registration.pushManager.getSubscription() : null;
        if (subscription) {
          await unregisterPushSubscription(subscription.endpoint);
          await subscription.unsubscribe();
        }
        setDeviceEnabled(false);
      } catch (nextError) { setError(errorMessage(nextError)); }
      finally { setDeviceBusy(false); }
      return;
    }
    setDeviceBusy(true);
    try {
      const next = getBrowserCapabilities();
      setCapabilities(next);
      if (!next.serviceWorkerSupported || !next.pushManagerSupported || !next.notificationSupported) throw new Error("unsupported");
      const registration = await getNotificationRegistration();
      if (!registration) throw new Error("service-worker-unavailable");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error(permission === "denied" ? "denied" : "permission-not-granted");
      const { publicKey } = await getVapidPublicKey();
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
      try { await registerPushSubscription(subscription); }
      catch (nextError) { if (!existing) await subscription.unsubscribe().catch(() => undefined); throw nextError; }
      setDeviceEnabled(true);
    } catch (nextError) {
      setDeviceEnabled(false);
      setError(nextError instanceof Error && nextError.message === "unsupported" ? "このブラウザでは通知を利用できません。" : nextError instanceof Error && nextError.message === "denied" ? "ブラウザ設定から通知を許可してください。" : "通知の設定に失敗しました。もう一度お試しください。");
    } finally { setDeviceBusy(false); setCapabilities(getBrowserCapabilities()); }
  };

  const deviceDisabled = !deviceReady || deviceBusy || capabilities.notificationPermission === "denied" || !capabilities.notificationSupported || !capabilities.serviceWorkerSupported || !capabilities.pushManagerSupported;
  const browserStatus = !capabilities.notificationSupported || !capabilities.serviceWorkerSupported || !capabilities.pushManagerSupported
    ? "このブラウザでは通知を利用できません。"
    : capabilities.notificationPermission === "denied" ? "ブラウザ設定から通知を許可してください。" : capabilities.homeScreenInstallRequired ? "iPhoneで通知を使うには、ホーム画面に追加してください。" : "";

  return (
    <section className="m5-page m5-settings-page">
      <SettingsHeader title="通知" onBack={() => { window.history.pushState({}, "", "/other"); window.dispatchEvent(new PopStateEvent("popstate")); }} />
      <div className="m5-settings-list m5-notifications-list">
        <label className="m5-toggle-row">
          <span>この端末の通知</span>
          <input aria-label="この端末の通知" type="checkbox" checked={deviceEnabled} disabled={deviceDisabled} onChange={(event) => void toggleDevice(event.target.checked)} />
          <span className="m5-toggle-visual" aria-hidden="true" />
        </label>
        <label className={`m5-toggle-row${deviceEnabled ? "" : " m5-disabled"}`}>
          <span>朝のまとめ通知</span>
          <input aria-label="朝のまとめ通知" type="checkbox" checked={summary.morningSummaryEnabled} disabled={!deviceEnabled || deviceBusy} onChange={(event) => { const next = { ...summary, morningSummaryEnabled: event.target.checked }; setScheduleField("morningSummaryEnabled", event.target.checked); void persistSummary(next); }} />
          <span className="m5-toggle-visual" aria-hidden="true" />
        </label>
        {summary.morningSummaryEnabled ? <label className={`m5-time-row${deviceEnabled ? "" : " m5-disabled"}`}><span>時刻</span><input aria-label="朝のまとめ通知の時刻" type="time" value={summary.morningSummaryTime} disabled={!deviceEnabled || deviceBusy} onChange={(event) => setScheduleField("morningSummaryTime", event.target.value)} onBlur={() => void persistSummary(summary)} /></label> : null}
        <label className={`m5-toggle-row${deviceEnabled ? "" : " m5-disabled"}`}>
          <span>夜のまとめ通知</span>
          <input aria-label="夜のまとめ通知" type="checkbox" checked={summary.eveningSummaryEnabled} disabled={!deviceEnabled || deviceBusy} onChange={(event) => { const next = { ...summary, eveningSummaryEnabled: event.target.checked }; setScheduleField("eveningSummaryEnabled", event.target.checked); void persistSummary(next); }} />
          <span className="m5-toggle-visual" aria-hidden="true" />
        </label>
        {summary.eveningSummaryEnabled ? <label className={`m5-time-row${deviceEnabled ? "" : " m5-disabled"}`}><span>時刻</span><input aria-label="夜のまとめ通知の時刻" type="time" value={summary.eveningSummaryTime} disabled={!deviceEnabled || deviceBusy} onChange={(event) => setScheduleField("eveningSummaryTime", event.target.value)} onBlur={() => void persistSummary(summary)} /></label> : null}
      </div>
      {browserStatus ? <p className="m5-inline-status">{browserStatus}</p> : null}
      {error ? <p className="m5-error" role="alert">{error}</p> : null}
      <p className="m5-status" role="status" aria-live="polite">{status}</p>
    </section>
  );
}

function StoragePage() {
  const [usage, setUsage] = useState<ImageUsage | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void getCurrentImageUsage().then(setUsage).catch((nextError) => setError(errorMessage(nextError))); }, []);
  const known = Boolean(usage?.storedBytesKnown);
  const percent = usage && known ? Math.min(100, Math.max(0, Math.round((usage.storedBytes / Math.max(1, usage.storedBytesLimit)) * 100))) : null;
  const remaining = usage && known ? Math.max(0, usage.storedBytesLimit - usage.storedBytes) : null;
  const nearLimit = percent !== null && percent >= 80;
  return (
    <section className="m5-page m5-settings-page">
      <SettingsHeader title="ストレージ" onBack={() => { window.history.pushState({}, "", "/other"); window.dispatchEvent(new PopStateEvent("popstate")); }} />
      <div className="m5-storage-summary">
        <div className="m5-storage-row"><span>使用量</span><strong>{usage ? `${known ? formatBytes(usage.storedBytes) : "確認中"} / ${formatBytes(usage.storedBytesLimit)}` : "確認中"}</strong></div>
        <div className={`m5-storage-bar${nearLimit ? " m5-storage-bar--near-limit" : ""}`} role="progressbar" aria-label="ストレージ使用量" aria-valuemin={0} aria-valuemax={100} {...(percent === null ? { "aria-valuetext": "確認中" } : { "aria-valuenow": percent })}><span style={percent === null ? undefined : { width: `${percent}%` }} /></div>
        <div className="m5-storage-row"><span>使用割合</span><strong>{percent === null ? "確認中" : `${percent}%`}</strong></div>
        <p className="m5-storage-remaining">残り {remaining === null ? "確認中" : formatBytes(remaining)}</p>
        {!known && usage ? <p className="m5-inline-status" role="status">削除処理待ちの画像があるため、保存容量を正確に確認できません。</p> : null}
        {usage && (usage.pendingCleanupBytes > 0 || usage.pendingCleanupUnknownCount > 0) ? <p className="m5-inline-status">削除処理待ち: {usage.pendingCleanupBytes > 0 ? formatBytes(usage.pendingCleanupBytes) : "確認中"}</p> : null}
        {error ? <p className="m5-error" role="alert">{error}</p> : null}
      </div>
    </section>
  );
}

const timezoneOptions = ["Asia/Tokyo", "America/Los_Angeles", "Europe/London"];

function HouseholdPage({ household, onHouseholdUpdated }: { household: Household; onHouseholdUpdated: (household: Household) => Promise<void> | void }) {
  const [name, setName] = useState(household.name);
  const [timezone, setTimezone] = useState(household.timezone);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const options = timezoneOptions.includes(timezone) ? timezoneOptions : [timezone, ...timezoneOptions];
  const owner = household.role === "owner";
  const save = async () => {
    if (!owner) return;
    setSaving(true); setError(""); setStatus("");
    try {
      const result = await updateCurrentHousehold({ name, timezone });
      await onHouseholdUpdated(result.household);
      setName(result.household.name); setTimezone(result.household.timezone); setStatus("保存しました");
    } catch (nextError) { setError(errorMessage(nextError)); }
    finally { setSaving(false); }
  };
  return (
    <section className="m5-page m5-settings-page">
      <SettingsHeader title="家庭設定" onBack={() => { window.history.pushState({}, "", "/other"); window.dispatchEvent(new PopStateEvent("popstate")); }} />
      <div className="m5-settings-list">
        <label className={`m5-field-row${owner ? "" : " m5-disabled"}`}><span>家庭名</span><input aria-label="家庭名" value={name} disabled={!owner} onChange={(event) => setName(event.target.value)} /></label>
        <button type="button" className={`m5-settings-row m5-row-button${owner ? "" : " m5-disabled"}`} aria-label={`タイムゾーン: ${timezone}`} disabled={!owner} onClick={() => setSheetOpen(true)}><span>タイムゾーン</span><span className="m5-row-value">{timezone}<ChevronRight aria-hidden="true" /></span></button>
      </div>
      <div className="m5-actions"><button type="button" className="m5-primary-action" disabled={!owner || saving} onClick={() => void save()}>{saving ? "保存中…" : "保存"}</button></div>
      {!owner ? <p className="m5-inline-status">家庭設定を更新できるのはownerだけです。</p> : null}
      {error ? <p className="m5-error" role="alert">{error}</p> : null}
      <p className="m5-status" role="status" aria-live="polite">{status}</p>
      <BottomSheet open={sheetOpen} title="タイムゾーン" onClose={() => setSheetOpen(false)}>
        <div className="m5-selection-list">{options.map((option) => <button key={option} type="button" onClick={() => { setTimezone(option); setSheetOpen(false); }}><span>{option}</span>{timezone === option ? <Check aria-hidden="true" /> : null}</button>)}</div>
      </BottomSheet>
    </section>
  );
}

function AccountPage({ user, onUserUpdated, onLogout }: { user: AuthUser; onUserUpdated: (user: AuthUser) => void; onLogout: () => Promise<void> }) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl ?? null);
  const savedName = useRef(user.displayName);
  const [sheet, setSheet] = useState<"avatar" | "logout" | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState<ProcessedImage | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const nameCommitInFlight = useRef(false);

  const commitName = async () => {
    if (nameCommitInFlight.current) return;
    const next = displayName.trim();
    if (!next || next === savedName.current) { setDisplayName(savedName.current); return; }
    nameCommitInFlight.current = true;
    setBusy(true); setError("");
    try {
      const result = await updateProfile(next);
      savedName.current = result.user.displayName; setDisplayName(result.user.displayName); onUserUpdated(result.user); setStatus("保存しました");
    } catch (nextError) { setDisplayName(savedName.current); setError(errorMessage(nextError)); }
    finally { nameCommitInFlight.current = false; setBusy(false); }
  };
  const onNameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } };
  const chooseAvatar = async (processed: ProcessedImage | null) => {
    if (!processed) return;
    setSelectedAvatar(processed);
    setBusy(true); setError(""); setStatus("");
    try { const result = await uploadProfileImage(processed); setAvatarUrl(result.avatarUrl); onUserUpdated({ ...user, avatarUrl: result.avatarUrl }); setSelectedAvatar(null); setSheet(null); setStatus("保存しました"); }
    catch (nextError) { setError(nextError instanceof ApiError && nextError.details?.image ? nextError.details.image : "画像のアップロードに失敗しました。もう一度お試しください。"); }
    finally { setBusy(false); }
  };
  const removeAvatar = async () => {
    setBusy(true); setError("");
    try { const result = await deleteProfileImage(); setAvatarUrl(result.avatarUrl); onUserUpdated({ ...user, avatarUrl: result.avatarUrl }); setSheet(null); setStatus("初期状態に戻しました"); }
    catch (nextError) { setError(errorMessage(nextError)); }
    finally { setBusy(false); }
  };
  return (
    <section className="m5-page m5-settings-page m5-account-page">
      <SettingsHeader title="アカウント" onBack={() => { window.history.pushState({}, "", "/other"); window.dispatchEvent(new PopStateEvent("popstate")); }} />
      <div className="m5-account-profile">
        <button type="button" className="m5-account-avatar-button" aria-label="プロフィール画像を変更" onClick={() => setSheet("avatar")}>
          <OtherAvatar name={displayName} imageUrl={avatarUrl} large /><span className="m5-account-avatar-edit" aria-hidden="true"><Camera /></span>
        </button>
        <label className="m5-field-row"><span>表示名</span><input aria-label="表示名" value={displayName} disabled={busy} onChange={(event) => setDisplayName(event.target.value)} onBlur={() => void commitName()} onKeyDown={onNameKeyDown} /></label>
        <label className="m5-field-row"><span>メール</span><input aria-label="メール" value={user.email} readOnly /></label>
      </div>
      <div className="m5-account-logout"><button type="button" className="m5-danger-action" onClick={() => setSheet("logout")}>ログアウト</button></div>
      {error ? <p className="m5-error" role="alert">{error}</p> : null}
      <p className="m5-status" role="status" aria-live="polite">{status}</p>
      <BottomSheet open={sheet === "avatar"} title="プロフィール画像" onClose={() => setSheet(null)}>
        <div className="m5-sheet-actions">
          <ProfileImagePicker id="account-profile-image" image={selectedAvatar} disabled={busy} onImageChange={chooseAvatar} />
          {avatarUrl ? <button type="button" className="m5-danger-action" disabled={busy} onClick={() => void removeAvatar()}>初期状態に戻す</button> : null}
        </div>
      </BottomSheet>
      <BottomSheet open={sheet === "logout"} title="ログアウトしますか？" onClose={() => setSheet(null)}>
        <div className="m5-sheet-actions"><button type="button" className="m5-danger-action" disabled={busy} onClick={() => { setSheet(null); setBusy(true); void onLogout().finally(() => setBusy(false)); }}>ログアウト</button><button type="button" className="m5-secondary-action" onClick={() => setSheet(null)}>キャンセル</button></div>
      </BottomSheet>
    </section>
  );
}

export function OtherSettingsPage(props: OtherSettingsProps) {
  if (props.kind === "members") return <MembersPage household={props.household} />;
  if (props.kind === "notifications") return <NotificationsPage />;
  if (props.kind === "storage") return <StoragePage />;
  if (props.kind === "household") return <HouseholdPage household={props.household} onHouseholdUpdated={props.onHouseholdUpdated} />;
  return <AccountPage user={props.user} onUserUpdated={props.onUserUpdated} onLogout={props.onLogout} />;
}
