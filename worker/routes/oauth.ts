import {
  OAuthError,
  OAuthService,
  OAUTH_SCOPES,
  tokenHeaders,
  type OAuthDebugRecord,
  type OAuthScope
} from "../services/oauth-service";
import { generateOpaqueToken } from "../lib/crypto";
import type { Env } from "../types/env";

const securityHeaders = {
  "cache-control": "no-store",
  pragma: "no-cache",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "content-security-policy": "default-src 'none'; form-action 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"
};

const escapeHtml = (value: string): string =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

const asHtml = (body: string, status = 200, scriptNonce?: string): Response =>
  new Response(body, {
    status,
    headers: {
      ...securityHeaders,
      ...(scriptNonce ? {
        "content-security-policy": `default-src 'none'; form-action 'self'; style-src 'unsafe-inline'; script-src 'nonce-${scriptNonce}'; base-uri 'none'; frame-ancestors 'none'`
      } : {}),
      "content-type": "text/html; charset=utf-8"
    }
  });

const oauthJsonError = (error: OAuthError): Response => {
  const headers = tokenHeaders();
  if (error.authenticate) headers.set("www-authenticate", 'Basic realm="HouseToDo OAuth"');
  return new Response(JSON.stringify({ error: error.oauthCode }), {
    status: error.status,
    headers
  });
};

const internalOAuthError = (): Response => new Response(
  JSON.stringify({ error: "server_error" }),
  { status: 500, headers: tokenHeaders() }
);

const allowedOrigins = (env: Env): string[] =>
  (env.ALLOWED_ORIGINS ?? "").split(",").map((origin) => origin.trim()).filter(Boolean);

const consentOriginIsAllowed = (request: Request, env: Env): boolean => {
  const origin = request.headers.get("origin");
  const allowed = allowedOrigins(env);
  if (origin !== null && origin !== "null" && (!origin || !allowed.includes(origin))) return false;

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      if (!allowed.includes(new URL(referer).origin)) return false;
    } catch {
      return false;
    }
  }

  // A missing or opaque Origin is only a deferred check. Consent still requires
  // an active, user-bound transaction, its CSRF token, and an authenticated session.
  return true;
};

const redirect = (location: string, status = 302): Response => new Response(null, {
  status,
  headers: { ...securityHeaders, location }
});

const consentMarkup = (input: {
  transactionId: string;
  csrfToken: string;
  clientName: string;
  email: string;
  scopes: string[];
  clientId: string;
  redirectUri: string;
  requestedScope: string;
}): { html: string; scriptNonce: string } => {
  const scriptNonce = generateOpaqueToken();
  const labels: Record<OAuthScope, string> = {
    "tasks:read": "タスクを見る",
    "tasks:write": "タスクを追加・完了する",
    "shopping:read": "買い物リストを見る",
    "shopping:write": "買い物を追加・購入済みにする"
  };
  const actions = input.scopes
    .filter((scope): scope is OAuthScope => new Set<string>(OAUTH_SCOPES).has(scope))
    .map((scope) => `<li>${labels[scope]}</li>`)
    .join("");
  const html = `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>外部サービスへのアクセス許可</title><style>
    *{box-sizing:border-box}body{margin:0;background:#f5f3ef;color:#24251f;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;min-height:100vh;display:grid;place-items:center;padding:24px}.card{width:min(100%,440px);background:white;border:1px solid #e5e2dc;border-radius:20px;padding:28px;box-shadow:0 8px 30px #29220d0c}h1{font-size:1.35rem;line-height:1.5;margin:0 0 8px}.muted{color:#686960;font-size:.9rem}.who{font-weight:600;margin:16px 0 20px}.label{font-weight:650;margin:24px 0 8px}ul{padding-left:1.3rem;line-height:2}.buttons{display:flex;gap:12px;margin-top:24px}button{min-height:46px;border-radius:12px;border:1px solid #d8d8d0;padding:0 18px;background:white;color:inherit;font:inherit;cursor:pointer}.allow{background:#315e42;color:#fff;border-color:#315e42;flex:1}.cancel{flex:1}
  </style><main class="card"><h1>${escapeHtml(input.clientName)}がHouseToDoへのアクセスを求めています</h1><p class="muted">接続するアカウント</p><p class="who">${escapeHtml(input.email)}</p><p class="label">許可する操作：</p><ul>${actions}</ul><form method="post" action="/oauth/consent" target="_top"><input type="hidden" name="transaction_id" value="${escapeHtml(input.transactionId)}"><input type="hidden" name="csrf_token" value="${escapeHtml(input.csrfToken)}"><input type="hidden" name="client_id" value="${escapeHtml(input.clientId)}"><input type="hidden" name="redirect_uri" value="${escapeHtml(input.redirectUri)}"><input type="hidden" name="scope" value="${escapeHtml(input.requestedScope)}"><div class="buttons"><button class="cancel" type="submit" name="decision" value="deny">キャンセル</button><button class="allow" type="submit" name="decision" value="allow">許可する</button></div></form><script nonce="${scriptNonce}">document.querySelector('form')?.addEventListener('submit',function(event){const submitter=event.submitter;if(submitter instanceof HTMLButtonElement&&submitter.name==='decision'){let decision=this.querySelector('input[type="hidden"][name="decision"]');if(!decision){decision=document.createElement('input');decision.type='hidden';decision.name='decision';this.append(decision);}decision.value=submitter.value;}this.querySelectorAll('button[type="submit"]').forEach(function(button){button.disabled=true;});});</script></main></html>`;
  return { html, scriptNonce };
};

const consentError = (message: string, status = 400): Response => asHtml(
  `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>許可できません</title><main><h1>接続を完了できませんでした</h1><p>${escapeHtml(message)}</p></main></html>`,
  status
);

const authorize = async (request: Request, service: OAuthService): Promise<Response> => {
  const url = new URL(request.url);
  let transactionId = url.searchParams.get("transaction_id") ?? "";
  let tx: Awaited<ReturnType<OAuthService["loadTransaction"]>>;
  if (transactionId) {
    tx = await service.loadTransaction(transactionId);
    if (!tx) return oauthJsonError(new OAuthError("invalid_request", "Authorization request expired"));
  } else {
    const created = await service.createAuthorizationTransaction(url);
    transactionId = created.transactionId;
  }

  const user = await service.getCurrentUser(request);
  if (!user) return redirect(`/login?oauth_tx=${encodeURIComponent(transactionId)}`);
  if (!await service.bindTransactionToUser(transactionId, user.id))
    return oauthJsonError(new OAuthError("invalid_request", "Authorization request unavailable"));
  tx = await service.loadTransaction(transactionId);
  if (!tx) return oauthJsonError(new OAuthError("invalid_request", "Authorization request unavailable"));
  const page = consentMarkup({
    transactionId,
    csrfToken: tx.csrfToken,
    clientName: tx.clientName,
    email: user.email,
    scopes: tx.row.requested_scope.split(" "),
    clientId: tx.row.client_id,
    redirectUri: tx.row.redirect_uri,
    requestedScope: tx.row.requested_scope
  });
  return asHtml(page.html, 200, page.scriptNonce);
};

const consent = async (request: Request, env: Env, service: OAuthService): Promise<Response> => {
  if (!OAuthService.isEnabled(env)) return consentError("OAuthは利用できません。", 404);
  if (!consentOriginIsAllowed(request, env)) return consentError("送信元を確認できませんでした。", 403);
  const form = new URLSearchParams(await request.text());
  const transactionId = form.get("transaction_id") ?? "";
  const csrfToken = form.get("csrf_token") ?? "";
  const clientId = form.get("client_id") ?? "";
  const redirectUri = form.get("redirect_uri") ?? "";
  const requestedScope = form.get("scope") ?? "";
  const decision = form.get("decision");
  const tx = await service.findTransactionForPost(transactionId);
  if (!tx || !service.validateCsrf(csrfToken, tx.csrf_token))
    return consentError("許可画面の有効期限が切れました。Museから接続をやり直してください。", 400);
  const user = await service.getCurrentUser(request);
  if (!user) return consentError("セッションを確認できませんでした。Museから接続をやり直してください。", 403);
  if (tx.user_id !== user.id || clientId !== tx.client_id || redirectUri !== tx.redirect_uri ||
    requestedScope !== tx.requested_scope || !await service.validateConsentTransaction(tx))
    return consentError("許可画面の有効期限が切れました。Museから接続をやり直してください。", 400);
  if (decision !== "allow" && decision !== "deny")
    return consentError("選択内容が正しくありません。", 400);
  if (!await service.consumeTransaction(tx, user.id))
    return consentError("許可画面の有効期限が切れました。Museから接続をやり直してください。", 400);

  const callback = new URL(tx.redirect_uri);
  if (decision === "deny") {
    callback.searchParams.set("error", "access_denied");
    callback.searchParams.set("state", tx.state);
    await env.DB.prepare("DELETE FROM oauth_authorization_transactions WHERE transaction_hash = ?")
      .bind(tx.transaction_hash).run();
    return redirect(callback.toString());
  }
  try {
    const completionHandle = await service.createAuthorizationCompletion(tx, user.id);
    return redirect(`/oauth/complete?ticket=${encodeURIComponent(completionHandle)}`, 303);
  } catch (error) {
    if (error instanceof OAuthError) return consentError(error.message, error.status);
    return internalOAuthError();
  }
};

const complete = async (request: Request, env: Env, service: OAuthService): Promise<Response> => {
  if (!OAuthService.isEnabled(env)) return consentError("OAuthは利用できません。", 404);
  const handle = new URL(request.url).searchParams.get("ticket") ?? "";
  try {
    if (!await service.canContinueAuthorization(handle))
      return consentError("接続の完了リンクが無効か期限切れです。Museから接続をやり直してください。", 400);
    const continueUrl = `/oauth/continue?h=${encodeURIComponent(handle)}`;
    return asHtml(`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Museへの接続を続ける</title><style>
      *{box-sizing:border-box}body{margin:0;background:#f5f3ef;color:#24251f;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;min-height:100vh;display:grid;place-items:center;padding:24px}.card{width:min(100%,440px);background:white;border:1px solid #e5e2dc;border-radius:20px;padding:28px;box-shadow:0 8px 30px #29220d0c}h1{font-size:1.3rem;line-height:1.5;margin:0 0 12px}p{line-height:1.7;color:#55574f}.continue{display:block;margin-top:24px;min-height:48px;padding:12px 18px;border-radius:12px;background:#315e42;color:white;text-align:center;text-decoration:none;font-weight:650}
      </style><main class="card"><h1>HouseToDoの認証が完了しました。</h1><p>Museへの接続を続けます。</p><a class="continue" href="${escapeHtml(continueUrl)}" target="_top" rel="noopener">Museへの接続を続ける</a></main></html>`);
  } catch (error) {
    if (error instanceof OAuthError) return consentError(error.message, error.status);
    return internalOAuthError();
  }
};

const continueAuthorization = async (request: Request, env: Env, service: OAuthService): Promise<Response> => {
  if (!OAuthService.isEnabled(env)) return consentError("OAuthは利用できません。", 404);
  const handle = new URL(request.url).searchParams.get("h") ?? "";
  try {
    const completion = await service.completeAuthorization(handle);
    if (!completion) return consentError("接続の続行リンクが無効か期限切れです。Museから接続をやり直してください。", 400);
    const callback = new URL(completion.redirectUri);
    callback.searchParams.set("code", completion.code);
    callback.searchParams.set("state", completion.state);
    return redirect(callback.toString(), 303);
  } catch (error) {
    if (error instanceof OAuthError) return consentError(error.message, error.status);
    return internalOAuthError();
  }
};

const authorizationServerMetadata = (request: Request, env: Env): Response => {
  const issuer = env.OAUTH_ISSUER_URL?.replace(/\/$/, "") ?? new URL(request.url).origin;
  return new Response(JSON.stringify({
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    revocation_endpoint: `${issuer}/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["client_secret_basic"],
    revocation_endpoint_auth_methods_supported: ["client_secret_basic"],
    scopes_supported: [...OAUTH_SCOPES],
    code_challenge_methods_supported: ["S256"]
  }), { status: 200, headers: tokenHeaders() });
};

export const handleOAuthRequest = async (request: Request, env: Env): Promise<Response> => {
  const url = new URL(request.url);
  const isDiagnosticPath = url.pathname.startsWith("/oauth/") || url.pathname.startsWith("/.well-known/");
  const debug: OAuthDebugRecord | undefined = env.APP_ENV === "staging" && isDiagnosticPath
    ? {
      path: url.pathname.slice(0, 256),
      method: request.method,
      statePresent: false,
      scopePresent: false,
      responseType: null,
      pkcePresent: false,
      clientAuthMethod: "missing",
      clientId: null,
      clientFound: false,
      secretPresent: false,
      secretLength: 0,
      secretHashMatches: false,
      grantType: null,
      redirectUri: null,
      scope: null,
      failure: null
    }
    : undefined;
  const service = new OAuthService(env, debug);
  let response: Response;
  let oauthError: string | null = null;
  try {
    if (url.pathname === "/.well-known/oauth-authorization-server" && request.method === "GET") {
      if (!OAuthService.isEnabled(env)) throw new OAuthError("server_error", "OAuth is unavailable", 404);
      response = authorizationServerMetadata(request, env);
    } else if (url.pathname === "/oauth/authorize" && request.method === "GET") {
      if (debug) {
        debug.statePresent = url.searchParams.has("state");
        debug.scopePresent = url.searchParams.has("scope");
        debug.responseType = (url.searchParams.get("response_type") ?? "").slice(0, 64) || null;
        debug.pkcePresent = url.searchParams.has("code_challenge") || url.searchParams.has("code_challenge_method");
        debug.clientId = (url.searchParams.get("client_id") ?? "").slice(0, 256) || null;
        debug.redirectUri = (url.searchParams.get("redirect_uri") ?? "").slice(0, 2048) || null;
      }
      response = await authorize(request, service);
    } else if (url.pathname === "/oauth/consent" && request.method === "POST") {
      response = await consent(request, env, service);
    } else if (url.pathname === "/oauth/complete" && request.method === "GET") {
      response = await complete(request, env, service);
    } else if (url.pathname === "/oauth/continue" && request.method === "GET") {
      response = await continueAuthorization(request, env, service);
    } else if (url.pathname === "/oauth/token" && request.method === "POST") {
      if (!OAuthService.isEnabled(env)) throw new OAuthError("server_error", "OAuth is unavailable", 404);
      if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/x-www-form-urlencoded")) {
        if (debug) debug.failure = "content_type_validation";
        throw new OAuthError("invalid_request");
      }
      const form = new URLSearchParams(await request.text());
      if (debug) {
        debug.grantType = (form.get("grant_type") ?? "").slice(0, 64) || null;
        debug.redirectUri = (form.get("redirect_uri") ?? "").slice(0, 2048) || null;
        debug.scope = (form.get("scope") ?? "").slice(0, 256) || null;
        const header = request.headers.get("authorization") ?? "";
        const hasBodySecret = Boolean(form.get("client_secret"));
        if (/^basic\b/i.test(header)) debug.clientAuthMethod = "basic";
        else if (hasBodySecret) debug.clientAuthMethod = "post";
        else if (form.get("client_id")) debug.clientAuthMethod = "none";
        else debug.clientAuthMethod = header ? "none" : "missing";
        debug.clientId = (form.get("client_id") ?? "").slice(0, 256) || null;
        debug.secretPresent = hasBodySecret;
        debug.secretLength = (form.get("client_secret") ?? "").length;
      }
      response = await service.exchangeToken(request, form);
    } else if (url.pathname === "/oauth/revoke" && request.method === "POST") {
      if (!OAuthService.isEnabled(env)) throw new OAuthError("server_error", "OAuth is unavailable", 404);
      if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/x-www-form-urlencoded")) {
        if (debug) debug.failure = "content_type_validation";
        throw new OAuthError("invalid_request");
      }
      response = await service.revoke(request, new URLSearchParams(await request.text()));
    } else {
      throw new OAuthError("invalid_request", "Not found", 404);
    }
  } catch (error) {
    if (error instanceof OAuthError) {
      oauthError = error.oauthCode;
      response = oauthJsonError(error);
      if (debug && !debug.failure) debug.failure = `oauth_${error.oauthCode}`;
    } else {
      oauthError = "server_error";
      response = internalOAuthError();
      if (debug && !debug.failure) debug.failure = "internal_error";
    }
  }
  if (debug && env.APP_ENV === "staging") {
    console.info(JSON.stringify({
      event: "oauth_debug",
      path: debug.path,
      method: debug.method,
      clientId: debug.clientId,
      redirectUri: debug.redirectUri,
      statePresent: debug.statePresent,
      scopePresent: debug.scopePresent,
      responseType: debug.responseType,
      pkcePresent: debug.pkcePresent,
      failure: debug.failure,
      status: response.status,
      oauthError
    }));
  }
  return response;
};
