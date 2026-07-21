import {
  advanceXiangqiPuzzleMiningRunAfterAudit,
  claimNextXiangqiPuzzleMiningAuditCandidate,
  failXiangqiPuzzleMiningAuditCandidate,
  heartbeatXiangqiPuzzleMiningAuditCandidate,
  recordXiangqiPuzzleMiningJudgment,
  type XiangqiPuzzleMiningCandidate,
  type XiangqiPuzzleMiningJudgmentVerdict,
} from './persistence-xiangqi-puzzle-mining.js';

export type XiangqiPuzzleAuditWorkVerdict = {
  verdict: Exclude<XiangqiPuzzleMiningJudgmentVerdict, 'error'>;
  reason?: string | null;
  evidence: Record<string, unknown>;
};

export type XiangqiPuzzleAuditWorkResult = {
  candidateId: string;
  verdict: XiangqiPuzzleAuditWorkVerdict['verdict'];
  runAdvancedToReview: boolean;
};

export async function processNextXiangqiPuzzleAuditCandidate(input: {
  runId: string;
  workerId: string;
  profileVersion: string;
  engineProfile: Record<string, unknown>;
  leaseMs?: number;
  auditCandidate: (
    candidate: XiangqiPuzzleMiningCandidate,
  ) => Promise<XiangqiPuzzleAuditWorkVerdict>;
}): Promise<XiangqiPuzzleAuditWorkResult | null> {
  const leaseMs = input.leaseMs ?? 30 * 60_000;
  const claim = await claimNextXiangqiPuzzleMiningAuditCandidate({
    runId: input.runId,
    workerId: input.workerId,
    leaseMs,
  });
  if (!claim) {
    await advanceXiangqiPuzzleMiningRunAfterAudit(input.runId);
    return null;
  }
  const identity = {
    candidateId: claim.candidate.id,
    claimToken: claim.claimToken,
  };
  let heartbeatFailure: Error | null = null;
  let heartbeatInFlight = false;
  const heartbeatEveryMs = Math.max(1_000, Math.floor(leaseMs / 3));
  const heartbeat = setInterval(() => {
    if (heartbeatInFlight || heartbeatFailure) return;
    heartbeatInFlight = true;
    heartbeatXiangqiPuzzleMiningAuditCandidate({ ...identity, leaseMs })
      .catch((error: unknown) => {
        heartbeatFailure = error as Error;
      })
      .finally(() => {
        heartbeatInFlight = false;
      });
  }, heartbeatEveryMs);
  heartbeat.unref();

  try {
    const result = await input.auditCandidate(claim.candidate);
    if (heartbeatFailure) throw heartbeatFailure;
    await recordXiangqiPuzzleMiningJudgment({
      candidateId: claim.candidate.id,
      stage: 'audit',
      profileVersion: input.profileVersion,
      verdict: result.verdict,
      reason: result.reason,
      engineProfile: input.engineProfile,
      evidence: result.evidence,
      claimToken: claim.claimToken,
    });
    const runAdvancedToReview = await advanceXiangqiPuzzleMiningRunAfterAudit(input.runId);
    return { candidateId: claim.candidate.id, verdict: result.verdict, runAdvancedToReview };
  } catch (error) {
    await failXiangqiPuzzleMiningAuditCandidate({
      ...identity,
      failure: {
        code: 'audit-processing-failed',
        message: error instanceof Error ? error.message : String(error),
      },
    }).catch(() => undefined);
    throw error;
  } finally {
    clearInterval(heartbeat);
  }
}
