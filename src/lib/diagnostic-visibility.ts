const stagingHostname = "house-to-do-staging.427harinn.workers.dev";

export const isDiagnosticEnvironment = (mode: string, hostname: string): boolean =>
  mode === "development" || mode === "test" || hostname === stagingHostname;
