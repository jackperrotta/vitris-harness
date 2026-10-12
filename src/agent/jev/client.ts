import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import {
  TypeSafeClient,
  type ChoiceCriteria,
  type ChoiceQuestion,
  type ChoiceResponse,
  type NoulQuestion,
  type NoulResponse,
  type Questions,
  type ScoreCriteria,
  type ScoreQuestion,
  type ScoreResponse,
  type SystemOneRequest,
  type SystemOneResult,
} from "@typesafe-ai/sdk";
import type { JevConfig, JevPilotBudget, JevReceipt, JevTransport } from "./types.ts";
import { DEFAULT_JEV_CONFIG, DEFAULT_JEV_MODEL, resolveApiKey } from "./config.ts";
import { POLICY_VERSION } from "./policy.ts";
import { QUESTION_VERSION, questionSemanticsHash, canonicalJsonStringify } from "./questions.ts";
import { acquireExtraAttempt, acquirePilotReservation, commitPilotReservation, estimateInputTokens, touchPilotReservation } from "./budget.ts";

/** Inference cache identity is independent of POLICY_VERSION. */
export const INFERENCE_CACHE_SCHEMA = 2 as const;

interface EvalTransportBag {
  attempts: number;
  reservedAttempts: number;
  reservationId: string;
  root: string;
  budget?: JevPilotBudget;
}

const evalTransport = new AsyncLocalStorage<EvalTransportBag>();

export class JevClient {
  private client: TypeSafeClient;
  private root: string;
  private config: JevConfig;
  private activeRequests = 0;
  private requestQueue: Array<() => void> = [];
  private sessionCalls = 0;
  private sessionInputTokens = 0;
  private sessionOutputTokens = 0;
  private sessionDurationMs = 0;

  public getSessionUsage(): {
    calls: number;
    inputTokens: number;
    outputTokens: number;
    durationMs: number;
  } {
    return {
      calls: this.sessionCalls,
      inputTokens: this.sessionInputTokens,
      outputTokens: this.sessionOutputTokens,
      durationMs: this.sessionDurationMs,
    };
  }

  public get model(): string {
    return this.config.model;
  }

  constructor(opts: {
    root: string;
    apiKey?: string;
    config?: Partial<JevConfig>;
    fetch?: JevTransport;
  }) {
    this.root = opts.root;
    this.config = { ...DEFAULT_JEV_CONFIG, ...opts.config };
    const resolvedKey = opts.apiKey || resolveApiKey([opts.root]);
    if (!resolvedKey && !opts.fetch) {
      throw new Error(
        "TypeSafe API key is required when no custom fetch transport is provided. Please set TYPESAFE_API_KEY in .dev.vars or environment."
      );
    }

    const userFetch: JevTransport = opts.fetch || ((input, init) => fetch(input, init as RequestInit));
    const countingFetch: JevTransport = async (input, init) => {
      const bag = evalTransport.getStore();
      if (bag) {
        if (bag.attempts >= bag.reservedAttempts) {
          const extra = await acquireExtraAttempt({
            root: bag.root,
            reservationId: bag.reservationId,
            budget: bag.budget,
          });
          if (!extra.ok) {
            throw new Error(extra.reason);
          }
          bag.reservedAttempts += 1;
        }
        bag.attempts += 1;
      }
      return userFetch(input, init);
    };

    this.client = new TypeSafeClient({
      apiKey: resolvedKey || "offline-unconfigured-key",
      baseURL: this.config.endpoint,
      defaultModel: this.config.model || DEFAULT_JEV_MODEL,
      fetch: countingFetch,
      retry: {
        maxRetries: this.config.maxRetries,
        backoffInitialMs: 500,
        backoffMaxMs: 5000,
        respectRetryAfter: true,
      },
    });
  }

  private async acquireConcurrencySlot(signal?: AbortSignal, deadlineMs?: number): Promise<() => void> {
    if (signal?.aborted) {
      throw (signal.reason instanceof Error ? signal.reason : new Error(String(signal.reason || "Canceled before acquiring slot")));
    }

    if (this.activeRequests < this.config.maxConcurrency) {
      this.activeRequests++;
      return () => {
        this.activeRequests--;
        const next = this.requestQueue.shift();
        if (next) next();
      };
    }

    return new Promise((resolveSlot, rejectSlot) => {
      let settled = false;
      let timer: NodeJS.Timeout | undefined;

      const cleanup = () => {
        settled = true;
        if (timer) clearTimeout(timer);
        if (signal) signal.removeEventListener("abort", onAbort);
        const idx = this.requestQueue.indexOf(slotHandler);
        if (idx >= 0) this.requestQueue.splice(idx, 1);
      };

      const onAbort = () => {
        if (settled) return;
        cleanup();
        rejectSlot(signal?.reason instanceof Error ? signal.reason : new Error(String(signal?.reason || "Canceled while waiting for concurrency slot")));
      };

      if (signal) {
        signal.addEventListener("abort", onAbort, { once: true });
      }

      if (deadlineMs !== undefined && deadlineMs > 0) {
        timer = setTimeout(() => {
          if (settled) return;
          cleanup();
          rejectSlot(new Error(`Task deadline exceeded while waiting for concurrency slot (${deadlineMs}ms)`));
        }, deadlineMs);
      }

      const slotHandler = () => {
        if (settled) {
          const next = this.requestQueue.shift();
          if (next) next();
          return;
        }
        cleanup();
        this.activeRequests++;
        resolveSlot(() => {
          this.activeRequests--;
          const next = this.requestQueue.shift();
          if (next) next();
        });
      };

      this.requestQueue.push(slotHandler);
    });
  }

  /** Compute deterministic SHA256 cache key. Policy version is intentionally excluded. */
  public cacheKey(model: string, questions: Questions, state: unknown): string {
    const payload = canonicalJsonStringify({
      schema: INFERENCE_CACHE_SCHEMA,
      model,
      questionVersion: QUESTION_VERSION,
      questionSemanticsHash: questionSemanticsHash(questions),
      questions,
      state,
    });
    return createHash("sha256").update(payload).digest("hex");
  }

  /** Validates that result answers match question criteria, bounds, and probability sums. */
  public validateResult<Q extends Questions>(questions: Q, result: SystemOneResult<Q>): void {
    if (!result || typeof result !== "object" || !result.answers) {
      throw new Error("Jev response missing answers payload");
    }

    for (const [key, q] of Object.entries(questions)) {
      const ans = (result.answers as Record<string, any>)[key];
      if (!ans) {
        throw new Error(`Missing answer for question key: ${key}`);
      }
      if (ans.type !== q.type) {
        throw new Error(`Answer type mismatch for ${key}: expected ${q.type}, got ${ans.type}`);
      }

      if (q.type === "choice") {
        const choiceAns = ans as ChoiceResponse<any>;
        if (typeof choiceAns.choice !== "string" || !Object.prototype.hasOwnProperty.call(q.criteria, choiceAns.choice)) {
          throw new Error(`Choice answer for ${key} selects invalid option: ${String(choiceAns.choice)}`);
        }
        if (typeof choiceAns.confidence !== "number" || !Number.isFinite(choiceAns.confidence) || choiceAns.confidence < 0 || choiceAns.confidence > 1) {
          throw new Error(`Choice confidence for ${key} out of range [0, 1]: ${choiceAns.confidence}`);
        }
        if (!choiceAns.probabilities || typeof choiceAns.probabilities !== "object") {
          throw new Error(`Choice answer for ${key} missing probabilities map`);
        }
        let probSum = 0;
        for (const [opt, p] of Object.entries(choiceAns.probabilities)) {
          if (typeof p !== "number" || !Number.isFinite(p) || p < 0 || p > 1) {
            throw new Error(`Invalid probability for ${key}.${opt}: ${p}`);
          }
          probSum += p;
        }
        if (Math.abs(probSum - 1.0) > 0.02) {
          throw new Error(`Choice probabilities for ${key} do not sum to 1.0 (sum=${probSum})`);
        }
      } else if (q.type === "score") {
        const scoreAns = ans as ScoreResponse<any>;
        if (typeof scoreAns.score !== "number" || !Number.isFinite(scoreAns.score)) {
          throw new Error(`Score answer for ${key} is not a finite number: ${scoreAns.score}`);
        }
        if (q.criteria && Array.isArray(q.criteria)) {
          const maxScore = q.criteria.length - 1;
          if (scoreAns.score < 0 || scoreAns.score > maxScore) {
            throw new Error(`Score answer for ${key} (${scoreAns.score}) out of rubric bounds [0, ${maxScore}]`);
          }
        }
        if (typeof scoreAns.confidence !== "number" || !Number.isFinite(scoreAns.confidence) || scoreAns.confidence < 0 || scoreAns.confidence > 1) {
          throw new Error(`Score confidence for ${key} out of range [0, 1]: ${scoreAns.confidence}`);
        }
        if (scoreAns.probabilities && typeof scoreAns.probabilities === "object") {
          let probSum = 0;
          for (const [sKey, p] of Object.entries(scoreAns.probabilities)) {
            if (typeof p !== "number" || !Number.isFinite(p) || p < 0 || p > 1) {
              throw new Error(`Invalid score probability for ${key}.${sKey}: ${p}`);
            }
            probSum += p;
          }
          if (Math.abs(probSum - 1.0) > 0.02) {
            throw new Error(`Score probabilities for ${key} do not sum to 1.0 (sum=${probSum})`);
          }
        }
      } else if (q.type === "noul") {
        const noulAns = ans as NoulResponse;
        if (typeof noulAns.noul !== "number" || !Number.isFinite(noulAns.noul) || noulAns.noul < 0 || noulAns.noul > 1) {
          throw new Error(`Noul answer for ${key} out of range [0, 1]: ${noulAns.noul}`);
        }
      }
    }
  }

  public writeReceipt(receipt: JevReceipt): string {
    const decisionsDir = join(this.root, "agent/decisions/jev");
    mkdirSync(decisionsDir, { recursive: true });
    const fileName = `${receipt.createdAt.replace(/[:.]/g, "-")}-${receipt.receiptId.slice(0, 8)}-${receipt.taskType}-${receipt.stateHash.slice(0, 8)}.json`;
    const receiptPath = join(decisionsDir, fileName);
    const tmpPath = `${receiptPath}.tmp.${randomUUID()}`;
    writeFileSync(tmpPath, JSON.stringify(receipt, null, 2), "utf8");
    try {
      renameSync(tmpPath, receiptPath);
    } catch {
      writeFileSync(receiptPath, JSON.stringify(receipt, null, 2), "utf8");
      try { unlinkSync(tmpPath); } catch {}
    }
    return receiptPath;
  }

  private writeCache(cacheDir: string, cachePath: string, result: SystemOneResult<any>, meta: {
    model: string;
    questionSemanticsHash: string;
    stateHash: string;
  }): void {
    mkdirSync(cacheDir, { recursive: true });
    const envelope = {
      inferenceSchema: INFERENCE_CACHE_SCHEMA,
      model: meta.model,
      questionSemanticsHash: meta.questionSemanticsHash,
      stateHash: meta.stateHash,
      result,
    };
    const tmpPath = `${cachePath}.tmp.${randomUUID()}`;
    writeFileSync(tmpPath, JSON.stringify(envelope, null, 2), "utf8");
    try {
      renameSync(tmpPath, cachePath);
    } catch {
      writeFileSync(cachePath, JSON.stringify(envelope, null, 2), "utf8");
      try { unlinkSync(tmpPath); } catch {}
    }
  }

  private readCachedResult<Q extends Questions>(cachePath: string, questions: Q): SystemOneResult<Q> {
    const raw = JSON.parse(readFileSync(cachePath, "utf8")) as any;
    if (raw?.inferenceSchema === INFERENCE_CACHE_SCHEMA && raw.result) {
      if (raw.model && raw.model !== this.config.model) {
        throw new Error("Cache model mismatch");
      }
      this.validateResult(questions, raw.result);
      return raw.result as SystemOneResult<Q>;
    }
    // Legacy unwrapped SystemOneResult: ignore; identity changed and must not be treated as current.
    throw new Error("Legacy inference cache entry ignored");
  }

  /** Run a bounded, validated System One evaluation with disk cache, timeout, and receipts. */
  public async evaluate<Q extends Questions>(opts: {
    taskType: JevReceipt["taskType"];
    nodeId?: string;
    questions: Q;
    state: unknown;
    signal?: AbortSignal;
    timeoutMs?: number;
    taskDeadlineMs?: number;
    useCache?: boolean;
  }): Promise<{
    result: SystemOneResult<Q>;
    receiptPath: string;
    cached: boolean;
    durationMs: number;
  }> {
    const started = Date.now();
    const model = this.config.model || DEFAULT_JEV_MODEL;
    const timeoutMs = opts.timeoutMs ?? this.config.timeoutMs;
    const taskDeadlineMs = opts.taskDeadlineMs ?? this.config.taskDeadlineMs;
    const stateHash = createHash("sha256").update(JSON.stringify(opts.state)).digest("hex");
    const key = this.cacheKey(model, opts.questions, opts.state);

    if (opts.signal?.aborted) {
      throw (opts.signal.reason instanceof Error ? opts.signal.reason : new Error(String(opts.signal.reason || "Operation aborted")));
    }

    const elapsedStart = Date.now() - started;
    if (elapsedStart >= taskDeadlineMs) {
      const failReceipt: JevReceipt = {
        schemaVersion: 1,
        receiptId: randomUUID(),
        taskType: opts.taskType,
        nodeId: opts.nodeId,
        model,
        policyVersion: POLICY_VERSION,
        questionVersion: QUESTION_VERSION,
        stateHash,
        durationMs: elapsedStart,
        createdAt: new Date().toISOString(),
        status: "budget_limited",
        cached: false,
        usage: { inputTokens: 0, outputTokens: 0 },
        retries: 0,
        transportAttempts: 0,
        answers: {},
        fallbackReason: `Task deadline exceeded before evaluation (${taskDeadlineMs}ms)`,
      };
      this.writeReceipt(failReceipt);
      throw new Error(`Task deadline exceeded before evaluation (${taskDeadlineMs}ms)`);
    }

    const cacheDir = join(this.root, "agent/decisions/jev/cache");
    const cachePath = join(cacheDir, `${key}.json`);

    // Check disk cache
    if (opts.useCache !== false && existsSync(cachePath)) {
      try {
        const cached = this.readCachedResult(cachePath, opts.questions);
        const durationMs = Date.now() - started;
        const receipt: JevReceipt = {
          schemaVersion: 1,
          receiptId: randomUUID(),
          taskType: opts.taskType,
          nodeId: opts.nodeId,
          model,
          policyVersion: POLICY_VERSION,
          questionVersion: QUESTION_VERSION,
          stateHash,
          durationMs,
          createdAt: new Date().toISOString(),
          status: "ok",
          cached: true,
          usage: { inputTokens: 0, outputTokens: 0 },
          retries: 0,
          transportAttempts: 0,
          answers: cached.answers as any,
        };
        const receiptPath = this.writeReceipt(receipt);
        this.sessionCalls++;
        this.sessionDurationMs += durationMs;
        return { result: cached, receiptPath, cached: true, durationMs };
      } catch {
        // invalid or legacy cache entry, recompute
      }
    }

    const estimatedInputTokens = estimateInputTokens({ state: opts.state, questions: opts.questions, model });
    const reservation = await acquirePilotReservation({
      root: this.root,
      budget: this.config.pilotBudget,
      estimatedInputTokens,
    });
    if (!reservation.ok) {
      const durationMs = Date.now() - started;
      const failReceipt: JevReceipt = {
        schemaVersion: 1,
        receiptId: randomUUID(),
        taskType: opts.taskType,
        nodeId: opts.nodeId,
        model,
        policyVersion: POLICY_VERSION,
        questionVersion: QUESTION_VERSION,
        stateHash,
        durationMs,
        createdAt: new Date().toISOString(),
        status: "budget_limited",
        cached: false,
        usage: { inputTokens: 0, outputTokens: 0 },
        retries: 0,
        transportAttempts: 0,
        answers: {},
        fallbackReason: reservation.reason,
      };
      this.writeReceipt(failReceipt);
      throw new Error(reservation.reason);
    }

    const bag: EvalTransportBag = {
      attempts: 0,
      reservedAttempts: reservation.reservedAttempts,
      reservationId: reservation.reservationId,
      root: this.root,
      budget: this.config.pilotBudget,
    };
    let reservationOpen = true;
    const commitReceipt = async (receipt: JevReceipt): Promise<string> => {
      let path = "";
      await commitPilotReservation({
        root: this.root,
        reservationId: reservation.reservationId,
        writeReceipt: () => {
          path = this.writeReceipt(receipt);
        },
      });
      reservationOpen = false;
      return path;
    };
    const attemptsOf = () => bag.attempts;
    const retriesOf = () => Math.max(0, bag.attempts - 1);
    const heartbeat = setInterval(() => {
      void touchPilotReservation(this.root, reservation.reservationId);
    }, 5_000);
    heartbeat.unref?.();

    try {
      return await evalTransport.run(bag, async () => {
        const remainingBeforeSlot = taskDeadlineMs - (Date.now() - started);
        if (remainingBeforeSlot <= 0) {
          const durationMs = Date.now() - started;
          await commitReceipt({
            schemaVersion: 1,
            receiptId: randomUUID(),
            taskType: opts.taskType,
            nodeId: opts.nodeId,
            model,
            policyVersion: POLICY_VERSION,
            questionVersion: QUESTION_VERSION,
            stateHash,
            durationMs,
            createdAt: new Date().toISOString(),
            status: "budget_limited",
            cached: false,
            usage: { inputTokens: 0, outputTokens: 0 },
            retries: retriesOf(),
            transportAttempts: attemptsOf(),
            answers: {},
            fallbackReason: `Task deadline exceeded before acquiring concurrency slot (${taskDeadlineMs}ms)`,
          });
          throw new Error(`Task deadline exceeded before acquiring concurrency slot (${taskDeadlineMs}ms)`);
        }

        const releaseSlot = await this.acquireConcurrencySlot(opts.signal, remainingBeforeSlot);
        try {
          const remainingForCall = Math.min(timeoutMs, taskDeadlineMs - (Date.now() - started));
          if (remainingForCall <= 0) {
            const durationMs = Date.now() - started;
            await commitReceipt({
              schemaVersion: 1,
              receiptId: randomUUID(),
              taskType: opts.taskType,
              nodeId: opts.nodeId,
              model,
              policyVersion: POLICY_VERSION,
              questionVersion: QUESTION_VERSION,
              stateHash,
              durationMs,
              createdAt: new Date().toISOString(),
              status: "budget_limited",
              cached: false,
              usage: { inputTokens: 0, outputTokens: 0 },
              retries: retriesOf(),
              transportAttempts: attemptsOf(),
              answers: {},
              fallbackReason: `Task deadline exceeded before network call (${taskDeadlineMs}ms)`,
            });
            throw new Error(`Task deadline exceeded before network call (${taskDeadlineMs}ms)`);
          }

          const controller = new AbortController();
          let timedOut = false;
          const timer = setTimeout(() => {
            timedOut = true;
            controller.abort("TIMEOUT");
          }, remainingForCall);

          const abortListener = () => {
            controller.abort("USER_ABORT");
          };
          if (opts.signal) {
            if (opts.signal.aborted) {
              controller.abort("USER_ABORT");
            } else {
              opts.signal.addEventListener("abort", abortListener, { once: true });
            }
          }

          let systemOneResult: SystemOneResult<Q>;
          try {
            systemOneResult = await this.client.systemOne({
              state: opts.state as any,
              questions: opts.questions,
              model,
            }, {
              signal: controller.signal,
              timeout: remainingForCall,
            });
          } catch (err: any) {
            const durationMs = Date.now() - started;
            const status = timedOut
              ? "budget_limited"
              : controller.signal.aborted
              ? "canceled"
              : "unavailable";
            await commitReceipt({
              schemaVersion: 1,
              receiptId: randomUUID(),
              taskType: opts.taskType,
              nodeId: opts.nodeId,
              model,
              policyVersion: POLICY_VERSION,
              questionVersion: QUESTION_VERSION,
              stateHash,
              durationMs,
              createdAt: new Date().toISOString(),
              status,
              cached: false,
              usage: { inputTokens: 0, outputTokens: 0, unknown: true },
              retries: retriesOf(),
              transportAttempts: Math.max(1, attemptsOf()),
              estimatedInputTokens,
              answers: {},
              fallbackReason: err.message || String(err),
            });
            throw err;
          } finally {
            clearTimeout(timer);
            if (opts.signal) {
              opts.signal.removeEventListener("abort", abortListener);
            }
          }

          try {
            this.validateResult(opts.questions, systemOneResult);
          } catch (valErr: any) {
            const durationMs = Date.now() - started;
            await commitReceipt({
              schemaVersion: 1,
              receiptId: randomUUID(),
              taskType: opts.taskType,
              nodeId: opts.nodeId,
              model: systemOneResult?.model || model,
              policyVersion: POLICY_VERSION,
              questionVersion: QUESTION_VERSION,
              stateHash,
              durationMs,
              createdAt: new Date().toISOString(),
              status: "malformed",
              cached: false,
              usage: {
                inputTokens: typeof systemOneResult?.usage?.input_tokens === "number"
                  ? systemOneResult.usage.input_tokens
                  : estimatedInputTokens,
                outputTokens: typeof systemOneResult?.usage?.output_tokens === "number"
                  ? systemOneResult.usage.output_tokens
                  : 0,
                unknown: typeof systemOneResult?.usage?.input_tokens !== "number",
              },
              retries: retriesOf(),
              transportAttempts: Math.max(1, attemptsOf()),
              estimatedInputTokens,
              answers: (systemOneResult?.answers as any) || {},
              fallbackReason: valErr.message || String(valErr),
            });
            throw valErr;
          }

          const hasUsage = typeof systemOneResult.usage?.input_tokens === "number";
          const durationMs = Date.now() - started;
          const receipt: JevReceipt = {
            schemaVersion: 1,
            receiptId: randomUUID(),
            taskType: opts.taskType,
            nodeId: opts.nodeId,
            model: systemOneResult.model || model,
            policyVersion: POLICY_VERSION,
            questionVersion: QUESTION_VERSION,
            stateHash,
            durationMs,
            createdAt: new Date().toISOString(),
            status: "ok",
            cached: false,
            usage: {
              inputTokens: hasUsage ? systemOneResult.usage!.input_tokens : estimatedInputTokens,
              outputTokens: hasUsage ? (systemOneResult.usage?.output_tokens ?? 0) : 0,
              unknown: !hasUsage,
            },
            retries: retriesOf(),
            transportAttempts: Math.max(1, attemptsOf()),
            estimatedInputTokens,
            answers: systemOneResult.answers as any,
          };

          this.writeCache(cacheDir, cachePath, systemOneResult, {
            model: receipt.model,
            questionSemanticsHash: questionSemanticsHash(opts.questions),
            stateHash,
          });
          const receiptPath = await commitReceipt(receipt);
          this.sessionCalls++;
          this.sessionDurationMs += durationMs;
          this.sessionInputTokens += receipt.usage.inputTokens;
          this.sessionOutputTokens += receipt.usage.outputTokens;
          return { result: systemOneResult, receiptPath, cached: false, durationMs };
        } finally {
          releaseSlot();
        }
      });
    } finally {
      clearInterval(heartbeat);
      if (reservationOpen) {
        await commitPilotReservation({
          root: this.root,
          reservationId: reservation.reservationId,
        });
      }
    }
  }
}
