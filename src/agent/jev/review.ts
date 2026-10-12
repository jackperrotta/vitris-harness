import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { json, type Business, type NarrativeBrief, type Storyboard } from "../artifacts.ts";
import { getTasksForCaller, recordTaskExecution, saveTaskManifest } from "./service-registry.ts";
import type { JevClient } from "./client.ts";
import type { GroundingCheckItem, GroundingPreflightSummary, JevConfig } from "./types.ts";
import { makeGroundingQuestion, makePathReferencedGroundingQuestion, makeCtaConsistencyQuestion, questionSemanticsHash, GROUNDING_RELATION_CRITERIA, GROUNDING_SEMANTICS_HASH } from "./questions.ts";
import { evaluateGroundingVerdict, type CodeQuoteCheck } from "./policy.ts";
import { buildGroundingState, buildCtaState, buildSharedGroundingBatch, simpleHash, sha256Hex } from "./state.ts";
import { isPathConfined } from "./security.ts";
import { buildOrUpdateLedger, lookupJudgment, recordJudgment, saveEvidenceLedger } from "./ledger.ts";
import { partitionBatchItems, executeBatches, type BatchableQuestion, type BatchExecutionResult } from "./batching.ts";
import { isCapabilityActive, resolveEffectiveCapabilities } from "./config.ts";
import { semanticRerank } from "./ranking.ts";

function preflightOwnedTasks(nodeId: string) {
  const tasks = getTasksForCaller(nodeId);
  if (nodeId === "copy-review") return tasks.filter(t => t.taskId === "copy-review-grounding");
  if (nodeId === "narrative-review") return tasks.filter(t => t.taskId === "narrative-review-grounding");
  if (nodeId === "business-review") return tasks.filter(t => t.taskId === "business-review-grounding" || t.taskType === "grounding");
  return tasks.filter(t => t.taskType === "grounding" || t.taskId.endsWith("-grounding"));
}

export function normalizeWhitespace(text: string): string {
  return text
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Code-level check to verify that a declared quote exists verbatim in the cited source file. */
export function verifyQuoteInSource(root: string, sourcePath: string, excerpt: string): CodeQuoteCheck {
  const normExcerpt = normalizeWhitespace(excerpt);
  if (!normExcerpt) {
    return {
      sourceExists: false,
      quoteFound: false,
      normalizedMatch: false,
      sourceFile: sourcePath,
      excerptLength: 0,
    };
  }

  // Handle paths relative to root or onboarding/copy, strictly confined inside root
  const candidates = [
    join(root, sourcePath),
    join(root, "onboarding", sourcePath),
    join(root, "onboarding/copy", sourcePath),
  ];

  let resolvedPath: string | undefined;
  for (const cand of candidates) {
    const confinement = isPathConfined(root, cand);
    if (!confinement.safe) {
      continue;
    }
    if (existsSync(confinement.resolvedPath)) {
      resolvedPath = confinement.resolvedPath;
      break;
    }
  }

  if (!resolvedPath) {
    return {
      sourceExists: false,
      quoteFound: false,
      normalizedMatch: false,
      sourceFile: sourcePath,
      excerptLength: normExcerpt.length,
    };
  }

  try {
    const rawContent = readFileSync(resolvedPath, "utf8");
    const normContent = normalizeWhitespace(rawContent);
    const directMatch = rawContent.includes(excerpt.trim());
    const normMatch = normContent.includes(normExcerpt);

    return {
      sourceExists: true,
      quoteFound: directMatch || normMatch,
      normalizedMatch: normMatch,
      sourceFile: resolvedPath,
      excerptLength: normExcerpt.length,
    };
  } catch {
    return {
      sourceExists: true,
      quoteFound: false,
      normalizedMatch: false,
      sourceFile: resolvedPath,
      excerptLength: normExcerpt.length,
    };
  }
}


/**
 * Builds question set for shared-state grounding batch with explicit path references.
 * Explicitly rejects missing evidence keys without falling back to ev_0.
 */
export function buildGroundingBatchQuestions(batch: {
  claims: Array<{ id: string; statement?: string; claim?: string; evidenceIds?: string[]; evidence?: string[] }>;
  evidence: Array<{ id: string; excerpt?: string; hash?: string; sources?: any[] }> | Record<string, any>;
}): Record<string, any> {
  const questions: Record<string, any> = {};
  const evKeys = new Set<string>();

  if (Array.isArray(batch.evidence)) {
    for (const ev of batch.evidence) {
      if (ev.id) evKeys.add(ev.id);
      if (ev.hash) evKeys.add(ev.hash);
    }
  } else if (batch.evidence && typeof batch.evidence === "object") {
    for (const [k, val] of Object.entries(batch.evidence)) {
      evKeys.add(k);
      if ((val as any)?.id) evKeys.add((val as any).id);
      if ((val as any)?.hash) evKeys.add((val as any).hash);
    }
  }

  for (const c of batch.claims) {
    const eIds = c.evidenceIds || c.evidence || [];
    for (const eId of eIds) {
      if (!evKeys.has(eId)) {
        throw new Error(`Missing evidence key in shared grounding batch: "${eId}" cited by claim "${c.id}".`);
      }
      questions[`rel_${c.id}_${eId}`] = makePathReferencedGroundingQuestion(
        `claims.${c.id}.claim`,
        `evidence.${eId}.excerpt`
      );
    }
  }
  return questions;
}

/** Executes semantic grounding preflight checks for review nodes. */
export async function runSemanticGroundingPreflight(opts: {
  root: string;
  client: JevClient;
  nodeId: string;
  signal?: AbortSignal;
  preparationId?: string;
  inputHash?: string;
  jevConfig?: JevConfig;
}): Promise<GroundingPreflightSummary> {
  const { root, client, nodeId, signal } = opts;
  const ledger = buildOrUpdateLedger(root);
  const items: GroundingCheckItem[] = [];

  if (nodeId === "business-review") {
    const busPath = join(root, "onboarding/business.json");
    if (existsSync(busPath)) {
      const bus = json<Business>(busPath);
      const evidenceMap = new Map((bus.evidence || []).map(e => [e.id, e]));
      const candidates: Array<{
        factId: string;
        claim: string;
        evId: string;
        source: string;
        excerpt: string;
        codeCheck: CodeQuoteCheck;
      }> = [];

      const effectiveCaps = opts.jevConfig ? resolveEffectiveCapabilities(opts.jevConfig) : undefined;
      const isSourceSelectionAssist = effectiveCaps?.sourceSelection === "assist";
      const policyThreshold = opts.jevConfig?.confidenceThresholds?.grounding ?? 0.85;

      for (const fact of (bus.facts || [])) {
        if (!fact.evidence || fact.evidence.length === 0) {
          items.push({
            id: fact.id,
            claim: fact.claim,
            verdict: "insufficient_evidence",
            autoAccepted: false,
            notes: "No evidence citations provided for this fact.",
          });
          continue;
        }

        let factEvidence = [...fact.evidence];
        if (factEvidence.length > 1) {
          if (isSourceSelectionAssist) {
            // Under assist mode, rank cited evidence to prioritize evaluation execution order,
            // but strictly PRESERVE all cited evidence items so contradictions and all citations are evaluated.
            const citedEvs = factEvidence
              .map(id => evidenceMap.get(id))
              .filter((e): e is NonNullable<typeof e> => Boolean(e));
            const ranked = semanticRerank(citedEvs, fact.claim);
            const rankedIds = ranked.map(r => r.id);
            const remainingIds = factEvidence.filter(id => !rankedIds.includes(id));
            factEvidence = [...rankedIds, ...remainingIds];
          } else if (effectiveCaps?.sourceSelection === "shadow") {
            // Shadow mode: compute shadow ranking purely for telemetry/audit; do not alter execution order or drop items
            try {
              const citedEvs = factEvidence
                .map(id => evidenceMap.get(id))
                .filter((e): e is NonNullable<typeof e> => Boolean(e));
              semanticRerank(citedEvs, fact.claim);
            } catch {}
          }
        }

        for (const evId of factEvidence) {
          const ev = evidenceMap.get(evId);
          if (!ev) {
            items.push({
              id: `${fact.id}:${evId}`,
              claim: fact.claim,
              evidenceId: evId,
              verdict: "missing_source",
              autoAccepted: true,
              notes: `Evidence ID ${evId} cited by fact ${fact.id} not found in evidence list.`,
            });
            continue;
          }

          const codeCheck = verifyQuoteInSource(root, ev.source, ev.excerpt);
          if (!codeCheck.sourceExists || !codeCheck.quoteFound) {
            const evaluation = evaluateGroundingVerdict({ codeCheck, threshold: policyThreshold });
            items.push({
              id: `${fact.id}:${evId}`,
              claim: fact.claim,
              evidenceId: evId,
              sourceFile: ev.source,
              excerpt: ev.excerpt,
              verdict: evaluation.verdict,
              autoAccepted: evaluation.autoAccepted,
              notes: evaluation.notes,
            });
            continue;
          }

          // Verbatim quote verified by code; queue for bounded semantic evaluation via Jev
          candidates.push({
            factId: fact.id,
            claim: fact.claim,
            evId,
            source: ev.source,
            excerpt: ev.excerpt,
            codeCheck,
          });
        }
      }

      // Check evidence ledger for existing judgments before calling Jev
      const unjudgedCandidates: typeof candidates = [];
      const cachedJudgmentIds: string[] = [];
      for (const cand of candidates) {
        const cached = lookupJudgment(ledger, {
          claimId: cand.factId,
          claimText: cand.claim,
          evidenceId: cand.evId,
          evidenceText: cand.excerpt,
          questionKey: "relation",
          expectedModel: client.model,
          expectedQuestionSemantics: GROUNDING_SEMANTICS_HASH,
          validateSource: true,
        });
        if (cached) {
          cachedJudgmentIds.push(cached.id);
          const rawRel = cached.rawRelation || cached.relation;
          const rawConf = cached.rawConfidence ?? cached.confidence;
          const evaluation = evaluateGroundingVerdict({
            codeCheck: cand.codeCheck,
            relationChoice: rawRel,
            confidence: rawConf,
            threshold: policyThreshold,
          });
          items.push({
            id: `${cand.factId}:${cand.evId}`,
            claim: cand.claim,
            evidenceId: cand.evId,
            sourceFile: cand.source,
            excerpt: cand.excerpt,
            verdict: evaluation.verdict,
            confidence: rawConf,
            relation: rawRel,
            autoAccepted: evaluation.autoAccepted,
            notes: cached.notes || "Reused cached ledger judgment evaluated under current policy.",
          });
        } else {
          unjudgedCandidates.push(cand);
        }
      }

      // Process unjudged candidates using bounded executor (partitionBatchItems & executeBatches)
      const batchableItems: BatchableQuestion[] = unjudgedCandidates.map((c, idx) => ({
        id: `${c.factId}:${c.evId}`,
        taskType: "grounding",
        questionKey: unjudgedCandidates.length === 1 ? "relation" : `rel_${idx}`,
        claimId: c.factId,
        claim: c.claim,
        evidenceId: c.evId,
        evidenceExcerpt: c.excerpt,
        source: c.source,
        metadata: { factId: c.factId, evId: c.evId },
      }));

      const candidateMap = new Map(unjudgedCandidates.map(c => [`${c.factId}:${c.evId}`, c]));

      const { partitions, rejectedOversizedItems } = partitionBatchItems(batchableItems, {
        config: {
          maxPayloadChars: 32000,
          maxQuestionsPerBatch: 10,
        },
      });

      for (const rej of rejectedOversizedItems) {
        items.push({
          id: rej.id,
          claim: rej.claim || "",
          evidenceId: rej.evidenceId,
          sourceFile: rej.source,
          excerpt: (rej.evidenceExcerpt || "").slice(0, 500) + "... [OVERSIZED EXCERPT]",
          verdict: "insufficient_evidence",
          confidence: 0,
          relation: "says_nothing",
          autoAccepted: false,
          notes: `Evidence excerpt exceeds 32KB payload boundary (${rej.evidenceExcerpt?.length || 0} chars); rejected for expansion.`,
        });
      }

      let batchExecutionResult: BatchExecutionResult | null = null;
      let batchError: any = null;

      if (opts.preparationId) {
        const registeredTask = getTasksForCaller(nodeId).find(t => t.taskType === "grounding");
        if (registeredTask) {
          const claimIds = [...new Set(candidates.map(c => c.factId))];
          const evidenceIds = [...new Set(candidates.map(c => c.evId))];
          const claimHashes: Record<string, string> = {};
          const evidenceHashes: Record<string, string> = {};
          for (const c of candidates) {
            claimHashes[c.factId] = sha256Hex(c.claim.trim());
            evidenceHashes[c.evId] = sha256Hex(c.excerpt.trim());
          }
          saveTaskManifest(root, {
            schemaVersion: 1,
            preparationId: opts.preparationId,
            nodeId,
            taskId: registeredTask.taskId,
            taskType: registeredTask.taskType,
            expectedModel: client.model,
            questionSemanticsHash: GROUNDING_SEMANTICS_HASH,
            claimIds,
            evidenceIds,
            claimHashes,
            evidenceHashes,
            batchStateHashes: partitions.map(p => sha256Hex(JSON.stringify(p.state))),
            questionIds: [...new Set(partitions.flatMap(p => Object.keys(p.questions || {})))],
            subjectHash: opts.inputHash,
            createdAt: new Date().toISOString(),
          });
        }
      }

      if (partitions.length > 0) {
        try {
          batchExecutionResult = await executeBatches({
            client,
            partitions,
            signal,
            nodeId,
          });
        } catch (err: any) {
          batchError = err;
        }
      }

      const evaluatedJudgmentIds: string[] = [];
      if (batchExecutionResult) {
        for (const partition of partitions) {
          for (const itemId of partition.questionIds) {
            const cand = candidateMap.get(itemId);
            if (!cand) continue;
            const ans = (batchExecutionResult.answers[itemId] as any) || (batchExecutionResult.answers["relation"] as any);
            if (ans) {
              const evaluation = evaluateGroundingVerdict({
                codeCheck: cand.codeCheck,
                relationChoice: ans?.choice,
                confidence: ans?.confidence,
                threshold: policyThreshold,
              });
              const receiptId = batchExecutionResult.itemReceipts?.[itemId]
                || (batchExecutionResult.receipts.length > 0 ? basename(batchExecutionResult.receipts[0]!) : undefined);
              const newJudg = recordJudgment(ledger, {
                claimId: cand.factId,
                evidenceId: cand.evId,
                claimText: cand.claim,
                evidenceText: cand.excerpt,
                questionKey: "relation",
                verdict: evaluation.verdict,
                confidence: ans?.confidence,
                relation: ans?.choice,
                notes: evaluation.notes,
                nodeId,
                model: client.model,
                questionSemantics: GROUNDING_SEMANTICS_HASH,
                sourcePath: cand.source,
                policyThreshold,
                rawAnswer: ans,
                receiptId,
              });
              evaluatedJudgmentIds.push(newJudg.id);
              items.push({
                id: itemId,
                claim: cand.claim,
                evidenceId: cand.evId,
                sourceFile: cand.source,
                excerpt: cand.excerpt,
                verdict: evaluation.verdict,
                confidence: ans?.confidence,
                relation: ans?.choice,
                autoAccepted: evaluation.autoAccepted,
                notes: evaluation.notes,
              });
            } else {
              items.push({
                id: itemId,
                claim: cand.claim,
                evidenceId: cand.evId,
                sourceFile: cand.source,
                excerpt: cand.excerpt,
                verdict: "insufficient_evidence",
                autoAccepted: false,
                notes: `Jev evaluation did not return an answer for ${itemId}; critic review required.`,
              });
            }
          }
        }
      } else if (batchError) {
        for (const partition of partitions) {
          for (const itemId of partition.questionIds) {
            const cand = candidateMap.get(itemId);
            if (!cand) continue;
            items.push({
              id: itemId,
              claim: cand.claim,
              evidenceId: cand.evId,
              sourceFile: cand.source,
              excerpt: cand.excerpt,
              verdict: "insufficient_evidence",
              autoAccepted: false,
              notes: `Jev batch evaluation failed (${batchError?.message || String(batchError)}); critic review required.`,
            });
          }
        }
      }

      if (opts.preparationId) {
        const registeredTask = getTasksForCaller(nodeId).find(t => t.taskType === "grounding");
        if (registeredTask) {
          let status: "completed" | "cached" | "no_candidates" | "unavailable" = "completed";
          const receiptIds: string[] | undefined = batchExecutionResult?.receipts?.map(r => basename(r));
          const cachedCount = cachedJudgmentIds.length;
          const evaluatedCount = evaluatedJudgmentIds.length;
          const judgmentIds = [...cachedJudgmentIds, ...evaluatedJudgmentIds];

          if (batchError && evaluatedCount === 0 && cachedCount === 0) {
            status = "unavailable";
          } else if (candidates.length === 0) {
            status = "no_candidates";
          } else if (unjudgedCandidates.length === 0 && cachedCount > 0) {
            status = "cached";
          } else if (evaluatedCount > 0 || cachedCount > 0) {
            status = "completed";
          }

          recordTaskExecution(root, {
            preparationId: opts.preparationId!,
            nodeId,
            taskId: registeredTask.taskId,
            taskType: "grounding",
            inputHash: opts.inputHash || "",
            status,
            receiptIds,
            judgmentIds,
            cachedCount,
            evaluatedCount,
            failureReason: batchError ? (batchError?.message || String(batchError)) : undefined,
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Check contact details in engagement/offer
      const contactText = `${bus.engagement || ""} ${bus.offer || ""}`;
      const phoneRegex = /\b(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g;
      const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
      const foundPhones = [...contactText.matchAll(phoneRegex)].map(m => m[0]);
      const foundEmails = [...contactText.matchAll(emailRegex)].map(m => m[0]);

      // Find if engagement explicitly references a fact like [F15]
      const citedFactMatch = bus.engagement ? [...bus.engagement.matchAll(/\[([A-Z0-9_-]+)\]/g)].map(m => m[1]!) : [];

      if (citedFactMatch.length > 0) {
        for (const factId of citedFactMatch) {
          const fact = bus.facts?.find(f => f.id === factId);
          if (fact) {
            for (const evId of (fact.evidence || [])) {
              const ev = evidenceMap.get(evId);
              if (ev) {
                const state = buildGroundingState({
                  claimId: `engagement:${factId}`,
                  claim: `The business engagement contact details are: ${bus.engagement}`,
                  evidenceId: evId,
                  sourceFile: ev.source,
                  excerpt: ev.excerpt,
                });
                const q = makeGroundingQuestion(`The business contact information is supported by: ${bus.engagement}`, ev.excerpt);
                try {
                  const evalResult = await client.evaluate({
                    taskType: "grounding",
                    nodeId,
                    questions: { relation: q },
                    state,
                    signal,
                  });
                  const ans = evalResult.result.answers.relation;
                  if (ans.choice === "contradicts" || ans.choice === "says_nothing") {
                    items.push({
                      id: `engagement:${factId}`,
                      claim: `Engagement contacts cite ${factId}, which does not support them`,
                      evidenceId: evId,
                      sourceFile: ev.source,
                      excerpt: ev.excerpt,
                      verdict: ans.choice === "contradicts" ? "contradicted" : "insufficient_evidence",
                      confidence: ans.confidence,
                      relation: ans.choice,
                      autoAccepted: true,
                      notes: `Engagement contacts cite ${factId}, but excerpt does not support the phone/email.`,
                    });
                  }
                } catch {
                  // ignore
                }
              }
            }
          }
        }
      } else if (foundPhones.length > 0 || foundEmails.length > 0) {
        // Unbracketed contact data: check if phone or email appears in any evidence excerpt
        const allExcerpts = (bus.evidence || []).map(e => e.excerpt).join(" ");
        for (const phone of foundPhones) {
          if (!allExcerpts.includes(phone)) {
            items.push({
              id: `contact:phone:${phone.replace(/\D/g, "")}`,
              claim: `Contact phone number ${phone} listed in engagement/offer`,
              verdict: "insufficient_evidence",
              autoAccepted: true,
              notes: `Phone number ${phone} is unbracketed and does not appear in any captured evidence excerpt.`,
            });
          }
        }
        for (const email of foundEmails) {
          if (!allExcerpts.toLowerCase().includes(email.toLowerCase())) {
            items.push({
              id: `contact:email:${email}`,
              claim: `Contact email ${email} listed in engagement/offer`,
              verdict: "insufficient_evidence",
              autoAccepted: true,
              notes: `Email ${email} is unbracketed and does not appear in any captured evidence excerpt.`,
            });
          }
        }
      }
    }
  } else if (nodeId === "narrative-review") {
    const narrPath = join(root, "onboarding/narrative-brief.json");
    const busPath = join(root, "onboarding/business.json");
    let candidatesCount = 0;
    let evaluatedCount = 0;
    let errorCount = 0;
    const receiptIds: string[] = [];
    let lastError: any = undefined;

    if (existsSync(narrPath) && existsSync(busPath)) {
      const narr = json<NarrativeBrief>(narrPath);
      const bus = json<Business>(busPath);
      const allFactsText = (bus.facts || []).map(f => f.claim).join("\n");

      // Check narrative claims against business facts
      const narrativeClaims: string[] = [];
      if (narr.customer) narrativeClaims.push(`Customer: ${narr.customer}`);
      if (narr.offer) narrativeClaims.push(`Offer: ${narr.offer}`);
      if (narr.serviceScope) narrativeClaims.push(`Service Scope: ${narr.serviceScope}`);
      if (narr.proof?.statement) narrativeClaims.push(`Proof: ${narr.proof.statement}`);

      candidatesCount = narrativeClaims.length;

      if (opts.preparationId) {
        const registeredTasks = preflightOwnedTasks(nodeId);
        for (const task of registeredTasks) {
          const claimHashes: Record<string, string> = {};
          const claimIds: string[] = [];
          const batchStateHashes: string[] = [];
          for (let i = 0; i < narrativeClaims.length; i++) {
            const claim = narrativeClaims[i]!;
            const id = `narrative:${i}`;
            claimIds.push(id);
            claimHashes[id] = sha256Hex(claim.trim());
            const state = buildGroundingState({
              claimId: id,
              claim,
              sourceFile: "onboarding/business.json",
              excerpt: allFactsText.slice(0, 1000),
            });
            batchStateHashes.push(sha256Hex(JSON.stringify(state)));
          }
          saveTaskManifest(root, {
            schemaVersion: 1,
            preparationId: opts.preparationId,
            nodeId,
            taskId: task.taskId,
            taskType: task.taskType,
            expectedModel: client.model,
            questionSemanticsHash: GROUNDING_SEMANTICS_HASH,
            claimIds,
            evidenceIds: ["business-facts"],
            claimHashes,
            evidenceHashes: { "business-facts": sha256Hex(allFactsText.slice(0, 1000)) },
            batchStateHashes,
            subjectHash: opts.inputHash,
            createdAt: new Date().toISOString(),
          });
        }
      }

      for (let i = 0; i < narrativeClaims.length; i++) {
        const claim = narrativeClaims[i]!;
        const q = makeGroundingQuestion(claim, allFactsText);
        const state = buildGroundingState({
          claimId: `narrative:${i}`,
          claim,
          sourceFile: "onboarding/business.json",
          excerpt: allFactsText.slice(0, 1000),
        });
        try {
          const evalResult = await client.evaluate({
            taskType: "grounding",
            nodeId,
            questions: { relation: q },
            state,
            signal,
          });
          evaluatedCount++;
          if (evalResult.receiptPath) {
            receiptIds.push(basename(evalResult.receiptPath));
          }
          const ans = evalResult.result.answers.relation;
          if (ans.choice === "contradicts") {
            items.push({
              id: `narrative:${i}`,
              claim,
              sourceFile: "onboarding/business.json",
              verdict: "contradicted",
              confidence: ans.confidence,
              relation: ans.choice,
              autoAccepted: true,
              notes: "Narrative brief premise directly contradicts business facts contract.",
            });
          } else if (ans.choice === "supports" && ans.confidence >= 0.85) {
            items.push({
              id: `narrative:${i}`,
              claim,
              sourceFile: "onboarding/business.json",
              verdict: "verified",
              confidence: ans.confidence,
              relation: ans.choice,
              autoAccepted: true,
              notes: "Narrative premise is supported by business facts.",
            });
          } else {
            items.push({
              id: `narrative:${i}`,
              claim,
              sourceFile: "onboarding/business.json",
              verdict: "insufficient_evidence",
              confidence: ans.confidence,
              relation: ans.choice,
              autoAccepted: false,
              notes: "Narrative premise lacks strong direct support in business facts.",
            });
          }
        } catch (err: any) {
          errorCount++;
          lastError = err;
        }
      }
    }

    if (opts.preparationId) {
      const registeredTasks = preflightOwnedTasks(nodeId);
      for (const task of registeredTasks) {
        if (candidatesCount === 0) {
          recordTaskExecution(root, {
            preparationId: opts.preparationId!,
            nodeId,
            taskId: task.taskId,
            taskType: task.taskType,
            inputHash: opts.inputHash || "",
            status: "no_candidates",
            timestamp: new Date().toISOString(),
          });
        } else if (evaluatedCount > 0) {
          recordTaskExecution(root, {
            preparationId: opts.preparationId!,
            nodeId,
            taskId: task.taskId,
            taskType: task.taskType,
            inputHash: opts.inputHash || "",
            status: "completed",
            receiptIds,
            evaluatedCount,
            timestamp: new Date().toISOString(),
          });
        } else {
          recordTaskExecution(root, {
            preparationId: opts.preparationId!,
            nodeId,
            taskId: task.taskId,
            taskType: task.taskType,
            inputHash: opts.inputHash || "",
            status: "unavailable",
            failureReason: lastError?.message || `All ${candidatesCount} narrative evaluations failed`,
            timestamp: new Date().toISOString(),
          });
        }
      }
    }
  } else if (nodeId === "copy-review") {
    const copyPath = join(root, "onboarding/copy-plan.json");
    const storyPath = join(root, "onboarding/storyboard.json");
    let ctaCandidatesCount = 0;
    let evaluatedCount = 0;
    let errorCount = 0;
    const receiptIds: string[] = [];
    let lastError: any = undefined;
    const threshold = opts.jevConfig?.confidenceThresholds?.grounding ?? 0.85;

    if (existsSync(copyPath) && existsSync(storyPath)) {
      const copyPlan = json<any>(copyPath);
      const storyboard = json<Storyboard>(storyPath);
      const actionMap = new Map<string, { label: string; destination: string; behavior: string }>();

      for (const page of (storyboard.pages || [])) {
        for (const sec of (page.sections || [])) {
          if (sec.action) {
            actionMap.set(`${page.path}:${sec.id}`, sec.action);
          }
        }
      }

      if (opts.preparationId) {
        const registeredTasks = preflightOwnedTasks(nodeId);
        const claimIds: string[] = [];
        const claimHashes: Record<string, string> = {};
        const batchStateHashes: string[] = [];
        for (const page of (copyPlan.pages || [])) {
          for (const sec of (page.sections || [])) {
            const action = actionMap.get(`${page.path}:${sec.id}`);
            const plannedCta = typeof sec.cta === "string"
              ? sec.cta
              : sec.cta?.label
              ? `${sec.cta.label}${sec.cta.target ? " -> " + sec.cta.target : ""}`
              : sec.action
              ? (typeof sec.action === "string" ? sec.action : `${sec.action.label || ""} -> ${sec.action.destination || ""}`)
              : sec.slots?.cta
              ? sec.slots.cta
              : undefined;
            if (action && (plannedCta || sec.body || sec.heading)) {
              const id = `cta:${page.path}:${sec.id}`;
              const ctaSummary = plannedCta || `Section ${sec.id} heading: ${sec.heading || ""} | body: ${(sec.body || "").slice(0, 100)}`;
              claimIds.push(id);
              claimHashes[id] = sha256Hex(ctaSummary.trim());
              const state = buildCtaState({
                pagePath: page.path,
                sectionId: sec.id,
                plannedCta: ctaSummary,
                storyboardAction: action,
              });
              batchStateHashes.push(sha256Hex(JSON.stringify(state)));
            }
          }
        }
        for (const task of registeredTasks) {
          saveTaskManifest(root, {
            schemaVersion: 1,
            preparationId: opts.preparationId,
            nodeId,
            taskId: task.taskId,
            taskType: task.taskType,
            expectedModel: client.model,
            questionSemanticsHash: GROUNDING_SEMANTICS_HASH,
            claimIds,
            evidenceIds: [],
            claimHashes,
            evidenceHashes: {},
            batchStateHashes,
            subjectHash: opts.inputHash,
            createdAt: new Date().toISOString(),
          });
        }
      }

      for (const page of (copyPlan.pages || [])) {
        for (const sec of (page.sections || [])) {
          const action = actionMap.get(`${page.path}:${sec.id}`);
          const plannedCta = typeof sec.cta === "string"
            ? sec.cta
            : sec.cta?.label
            ? `${sec.cta.label}${sec.cta.target ? " -> " + sec.cta.target : ""}`
            : sec.action
            ? (typeof sec.action === "string" ? sec.action : `${sec.action.label || ""} -> ${sec.action.destination || ""}`)
            : sec.slots?.cta
            ? sec.slots.cta
            : undefined;

          if (action && !plannedCta && !sec.body && !sec.heading) {
            // Storyboard expects an action but copy plan section is empty
            items.push({
              id: `cta:${page.path}:${sec.id}`,
              claim: `CTA action for ${page.path} section ${sec.id}`,
              verdict: "insufficient_evidence",
              autoAccepted: true,
              notes: `Storyboard defines action "${action.label}" but section has no planned copy or CTA.`,
            });
            continue;
          }

          if (action && (plannedCta || sec.body || sec.heading)) {
            ctaCandidatesCount++;
            const ctaSummary = plannedCta || `Section ${sec.id} heading: ${sec.heading || ""} | body: ${(sec.body || "").slice(0, 100)}`;
            const state = buildCtaState({
              pagePath: page.path,
              sectionId: sec.id,
              plannedCta: ctaSummary,
              storyboardAction: action,
            });
            const q = makeCtaConsistencyQuestion(
              ctaSummary,
              `Label: ${action.label} | Destination: ${action.destination} | Behavior: ${action.behavior}`
            );
            try {
              const evalResult = await client.evaluate({
                taskType: "cta_consistency",
                nodeId,
                questions: { cta: q },
                state,
                signal,
              });
              evaluatedCount++;
              if (evalResult.receiptPath) {
                receiptIds.push(basename(evalResult.receiptPath));
              }
              const ans = evalResult.result.answers.cta;
              const conf = ans.confidence;

              if (ans.choice === "consistent") {
                if (conf >= threshold) {
                  items.push({
                    id: `cta:${page.path}:${sec.id}`,
                    claim: `CTA action for ${page.path} section ${sec.id}`,
                    verdict: "verified",
                    confidence: conf,
                    autoAccepted: true,
                    notes: `Planned CTA aligns with storyboard contract (confidence: ${(conf * 100).toFixed(1)}%).`,
                  });
                } else {
                  items.push({
                    id: `cta:${page.path}:${sec.id}`,
                    claim: `CTA action for ${page.path} section ${sec.id}`,
                    verdict: "insufficient_evidence",
                    confidence: conf,
                    autoAccepted: false,
                    notes: `Planned CTA tentatively consistent but confidence (${(conf * 100).toFixed(1)}%) is below threshold.`,
                  });
                }
              } else if (ans.choice === "contradictory") {
                items.push({
                  id: `cta:${page.path}:${sec.id}`,
                  claim: `CTA action for ${page.path} section ${sec.id}`,
                  verdict: conf >= threshold ? "contradicted" : "insufficient_evidence",
                  confidence: conf,
                  autoAccepted: conf >= threshold,
                  notes: `Planned CTA conflicts with storyboard action contract (${action.label} -> ${action.destination}).`,
                });
              } else {
                // ans.choice === "unaddressed"
                items.push({
                  id: `cta:${page.path}:${sec.id}`,
                  claim: `CTA action for ${page.path} section ${sec.id}`,
                  verdict: "insufficient_evidence",
                  confidence: conf,
                  relation: ans.choice,
                  autoAccepted: true,
                  notes: `Planned CTA is unaddressed in storyboard action definitions; critic review required.`,
                });
              }
            } catch (err: any) {
              errorCount++;
              lastError = err;
              items.push({
                id: `cta:${page.path}:${sec.id}`,
                claim: `CTA action for ${page.path} section ${sec.id}`,
                verdict: "insufficient_evidence",
                autoAccepted: false,
                notes: `Jev CTA evaluation failed (${err.message}); critic review required.`,
              });
            }
          }
        }
      }
    }

    if (opts.preparationId) {
      const registeredTasks = preflightOwnedTasks(nodeId);
      for (const task of registeredTasks) {
        if (ctaCandidatesCount === 0) {
          recordTaskExecution(root, {
            preparationId: opts.preparationId!,
            nodeId,
            taskId: task.taskId,
            taskType: task.taskType,
            inputHash: opts.inputHash || "",
            status: "no_candidates",
            timestamp: new Date().toISOString(),
          });
        } else if (evaluatedCount > 0) {
          recordTaskExecution(root, {
            preparationId: opts.preparationId!,
            nodeId,
            taskId: task.taskId,
            taskType: task.taskType,
            inputHash: opts.inputHash || "",
            status: "completed",
            receiptIds,
            evaluatedCount,
            timestamp: new Date().toISOString(),
          });
        } else {
          recordTaskExecution(root, {
            preparationId: opts.preparationId!,
            nodeId,
            taskId: task.taskId,
            taskType: task.taskType,
            inputHash: opts.inputHash || "",
            status: "unavailable",
            failureReason: lastError?.message || `All ${ctaCandidatesCount} CTA evaluations failed`,
            timestamp: new Date().toISOString(),
          });
        }
      }
    }
  }

  saveEvidenceLedger(root, ledger);

  const verifiedCount = items.filter(i => i.verdict === "verified").length;
  const flaggedCount = items.filter(i => i.verdict !== "verified").length;

  return {
    nodeId,
    totalChecked: items.length,
    verifiedCount,
    flaggedCount,
    items,
  };
}

/** Formats the preflight summary block for insertion into critic prompts. */
export function formatPreflightSummary(summary: GroundingPreflightSummary): string {
  if (summary.totalChecked === 0) {
    return "Grounding Preflight: No verifiable claims found in current artifact.";
  }

  let text = `### Grounding Preflight Report (${summary.totalChecked} items evaluated)\n`;
  text += `- Verified: ${summary.verifiedCount}\n`;
  text += `- Flagged: ${summary.flaggedCount}\n\n`;

  if (summary.flaggedCount === 0) {
    text += `All ${summary.totalChecked} declared citations were confirmed by code and semantic preflight.\n`;
  } else {
    text += `#### Flagged Items (CRITIC ATTENTION REQUIRED):\n`;
    for (const item of summary.items.filter(i => i.verdict !== "verified")) {
      text += `- **[${item.id}]** Verdict: \`${item.verdict}\`\n`;
      text += `  Claim: "${item.claim}"\n`;
      if (item.notes) text += `  Issue: ${item.notes}\n`;
      if (item.excerpt) text += `  Cited Excerpt: "${item.excerpt.slice(0, 150)}..."\n`;
    }
  }

  return text;
}

