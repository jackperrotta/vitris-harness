export const EXIT_CODES = {
  SUCCESS: 0,
  GENERIC_ERROR: 1,
  CONFIG_OR_CLI_ERROR: 2,
  PRECONDITION_FAILED: 3,
  GATES_FAILED: 4,
  DEPLOYMENT_FAILED: 5,
  ABORTED: 6,
} as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

export type OutputMode = "text" | "json" | "events";

export type VitrisEvent = {
  type: "status" | "step_start" | "step_finish" | "log" | "error" | "result";
  timestamp: string;
  runId?: string;
  nodeId?: string;
  data?: unknown;
};

export type CommandResult<T = unknown> = {
  ok: boolean;
  exitCode: ExitCode;
  summary?: string;
  data?: T;
  error?: string;
  failures?: string[];
};

export type GlobalCliOptions = {
  site?: string;
  json?: boolean;
  events?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
  signal?: AbortSignal;
};
