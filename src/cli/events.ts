import type { CommandResult, OutputMode, VitrisEvent } from "./types.ts";
import { EXIT_CODES } from "./types.ts";

export class EventStream {
  private mode: OutputMode;
  private events: VitrisEvent[] = [];

  constructor(mode: OutputMode = "text") {
    this.mode = mode;
  }

  getMode(): OutputMode {
    return this.mode;
  }

  emit(event: Omit<VitrisEvent, "timestamp">): void {
    const fullEvent: VitrisEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };
    this.events.push(fullEvent);

    if (this.mode === "events") {
      process.stdout.write(JSON.stringify(fullEvent) + "\n");
    } else if (this.mode === "text") {
      if (event.type === "error") {
        console.error(typeof event.data === "string" ? event.data : JSON.stringify(event.data));
      } else if (event.type === "log" && typeof event.data === "string") {
        console.log(event.data);
      }
    }
  }

  log(message: string): void {
    this.emit({ type: "log", data: message });
  }

  error(message: string): void {
    this.emit({ type: "error", data: message });
  }

  status(status: unknown): void {
    this.emit({ type: "status", data: status });
  }

  finish<T>(result: CommandResult<T>): void {
    this.emit({ type: "result", data: result });
    if (this.mode === "json") {
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    } else if (this.mode === "text") {
      if (!result.ok && result.error) {
        console.error(`Error: ${result.error}`);
      }
      if (result.summary) {
        console.log(result.summary);
      }
    }
  }
}

export function determineOutputMode(flags: { json?: boolean; events?: boolean }): OutputMode {
  if (flags.json && flags.events) {
    const err = new Error("--json and --events flags are mutually exclusive");
    (err as unknown as { exitCode: number }).exitCode = EXIT_CODES.CONFIG_OR_CLI_ERROR;
    throw err;
  }
  if (flags.json) return "json";
  if (flags.events) return "events";
  return "text";
}
