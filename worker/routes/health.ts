import { okJson } from "../lib/response";
import type { Handler } from "../middleware/error-handler";

export const healthRoute: Handler = (context) =>
  okJson(
    {
      status: "ok",
      service: "house-to-do",
      bindings: {
        db: Boolean(context.env.DB),
        r2: Boolean(context.env.ATTACHMENTS)
      }
    },
    context.requestId
  );
