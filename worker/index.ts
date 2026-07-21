export interface Env {
  DB: D1Database;
  ATTACHMENTS: R2Bucket;
  ASSETS: Fetcher;
}

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8"
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json(
        {
          status: "ok",
          ok: true,
          service: "house-to-do",
          bindings: {
            db: Boolean(env.DB),
            r2: Boolean(env.ATTACHMENTS)
          }
        },
        { headers: jsonHeaders }
      );
    }

    if (url.pathname.startsWith("/api/")) {
      return Response.json(
        {
          error: "not_found",
          message: "このAPIはまだ実装されていません。"
        },
        { status: 404, headers: jsonHeaders }
      );
    }

    return env.ASSETS.fetch(request);
  }
};
