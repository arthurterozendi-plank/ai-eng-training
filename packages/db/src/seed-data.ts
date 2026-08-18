import type { NewApplicationStageTransition } from "@/schema/application-stage-transitions";
import type { NewApplication } from "@/schema/applications";
import type { NewCandidate } from "@/schema/candidates";
import type { NewInterview } from "@/schema/interviews";
import type { NewJob } from "@/schema/jobs";
import type { NewNote } from "@/schema/notes";
import type { PipelineStageKey } from "@/schema/pipeline-stages";

import type { ExtractionPayload } from "./extraction";
import {
  APPLICATION_NOTE_FRAMES,
  APPLIED_DAYS_AGO_RANGE,
  CANDIDATE_DEFINITIONS,
  CANDIDATE_GROUPS,
  CANDIDATE_NOTE_FRAMES,
  COVER_LETTER_ASSIGNMENTS,
  EXTRACTION_ASSIGNMENTS,
  FEEDBACK_FRAMES,
  FINAL_DETAIL_PHRASES,
  GAP_DAYS_RANGE,
  HIRED_REASONS,
  INTERVIEWER_NAMES,
  JOB_DEFINITIONS,
  JOB_NOTES,
  JOB_TRACK_BY_INDEX,
  ONSITE_DETAIL_PHRASES,
  PATH_COUNTS,
  PATH_LIBRARY,
  PHONE_SCREEN_DETAIL_PHRASES,
  RECRUITING_AUTHOR_NAMES,
  REJECTION_REASONS,
  TECHNICAL_DETAIL_PHRASES,
  WITHDRAWN_REASONS,
  type ExtractionAssignmentDefinition,
} from "./seed-data-content";

/** The full deterministic dataset `buildSeedDataset` produces, one array per demo table. */
export interface SeedDataset {
  jobs: NewJob[];
  candidates: NewCandidate[];
  applications: NewApplication[];
  stageTransitions: NewApplicationStageTransition[];
  interviews: NewInterview[];
  notes: NewNote[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/**
 * A fixed, arbitrary seed — not derived from `now` — so every call to `buildSeedDataset` draws
 * the exact same sequence of ids, path assignments, and phrase choices regardless of what `now`
 * is. Only the *dates* below vary with `now`; everything drawn from this generator is otherwise
 * identical across calls, which is what makes the dataset deterministic.
 */
const PRNG_SEED = 0x5eed_1234;

/** A small, seeded PRNG (mulberry32) — deterministic, no `Math.random`, no `Date.now`. */
function createRng(seed: number): () => number {
  let state = seed;
  return function next(): number {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function nextInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function pick<T>(rng: () => number, values: readonly T[]): T {
  return values[Math.floor(rng() * values.length)];
}

/** Fisher-Yates shuffle over a copy of `values` — does not mutate its argument. */
function shuffle<T>(rng: () => number, values: readonly T[]): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * A version-4-shaped, variant-conformant UUID string drawn from `rng` — satisfies drizzle-zod's
 * `z.uuid()` (which checks the version/variant nibbles) without `crypto.randomUUID()`, which
 * would break determinism.
 */
function nextId(rng: () => number): string {
  const hexDigit = () => Math.floor(rng() * 16).toString(16);
  const segment = (length: number) => Array.from({ length }, hexDigit).join("");
  const variantNibble = pick(rng, ["8", "9", "a", "b"]);
  return `${segment(8)}-${segment(4)}-4${segment(3)}-${variantNibble}${segment(3)}-${segment(12)}`;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * HOUR_MS);
}

/** Strips diacritics and non-letters so `emailFor`/`resumeUrl`/`linkedinUrl` stay plain ASCII. */
function slug(part: string): string {
  return part
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

/**
 * RFC 2606 reserves `.example` for exactly this use — sixty invented candidates at real
 * mail-provider domains (gmail.com, outlook.com, ...) could collide with a live mailbox that
 * belongs to an actual person. Named after `resumeUrlFor`'s `resumes.talentscout.example`, below.
 */
const CANDIDATE_EMAIL_DOMAIN = "candidates.talentscout.example";
const PHONE_AREA_CODES = ["415", "212", "312", "512"];

function nameParts(fullName: string): { first: string; last: string } {
  const parts = fullName.split(" ");
  return { first: parts[0], last: parts[parts.length - 1] };
}

/** A fake-but-plausible email, lowercase and unique because every candidate's name is distinct. */
function emailFor(fullName: string): string {
  const { first, last } = nameParts(fullName);
  return `${slug(first)}.${slug(last)}@${CANDIDATE_EMAIL_DOMAIN}`;
}

/** A fake NANP number in the `555-01XX` block reserved for fictional use — never a real line. */
function phoneFor(index: number): string {
  const area = PHONE_AREA_CODES[index % PHONE_AREA_CODES.length];
  const line = String(100 + index).padStart(4, "0");
  return `+1-${area}-555-${line}`;
}

function resumeUrlFor(fullName: string): string {
  const { first, last } = nameParts(fullName);
  return `https://resumes.talentscout.example/${slug(first)}-${slug(last)}.pdf`;
}

/**
 * A profile URL under our own reserved namespace rather than `linkedin.com`. A
 * `firstname-lastname-N` slug for sixty invented people can collide with a real member's vanity
 * URL, which would attribute a stranger's profile to a fictional applicant.
 */
function linkedinUrlFor(fullName: string, index: number): string {
  const { first, last } = nameParts(fullName);
  return `https://profiles.talentscout.example/in/${slug(first)}-${slug(last)}-${index}`;
}

/**
 * Overwrites a `candidateEmail` extraction field's `value` with the candidate's authoritative
 * email, so a hand-authored `EXTRACTION_ASSIGNMENTS` entry can never disagree with the column it
 * models — the bug this guards against was a mail domain picked independently of `emailFor`'s
 * derivation for the same candidate. Confidence and source stay exactly as authored: only the
 * value a reader would compare against `candidates.email` is derived.
 */
function withAuthoritativeEmail(
  fields: ExtractionAssignmentDefinition["fields"],
  candidateEmail: string,
): ExtractionAssignmentDefinition["fields"] {
  if (!("candidateEmail" in fields)) return fields;
  return { ...fields, candidateEmail: { ...fields.candidateEmail, value: candidateEmail } };
}

/** One (candidate, job) application pairing, before the funnel path is assigned. */
interface CandidateJobPair {
  candidateIndex: number;
  jobIndex: number;
}

/**
 * Expands `CANDIDATE_GROUPS` into the flat list of (candidate, job) pairs the 90 applications are
 * built from, in group order. See the doc comment on `CANDIDATE_GROUPS` for why this is arithmetic
 * rather than a hand-listed table.
 */
function buildCandidateJobPairs(): CandidateJobPair[] {
  const pairs: CandidateJobPair[] = [];
  let candidateIndex = 0;
  for (const group of CANDIDATE_GROUPS) {
    for (let i = 0; i < group.count; i++) {
      for (const jobIndex of group.jobIndexes) {
        pairs.push({ candidateIndex, jobIndex });
      }
      candidateIndex++;
    }
  }
  return pairs;
}

/** A deterministically shuffled array of `PATH_LIBRARY` keys, one per application, built from `PATH_COUNTS`. */
function buildPathAssignments(rng: () => number): string[] {
  const assignments: string[] = [];
  for (const [key, count] of Object.entries(PATH_COUNTS)) {
    for (let i = 0; i < count; i++) {
      assignments.push(key);
    }
  }
  return shuffle(rng, assignments);
}

function gapDaysFor(stage: PipelineStageKey, rng: () => number): number {
  const [min, max] = GAP_DAYS_RANGE[stage];
  return nextInt(rng, min, max);
}

/**
 * `appliedDaysAgoFor`'s draw, capped so an application can never predate the job it applies to
 * (`appliedAt >= job.openedAt`, i.e. `appliedDaysAgo <= job.openedDaysAgo`). Every job's
 * `openedDaysAgo` (70+, see `JOB_DEFINITIONS`) is comfortably above every path's own range, so
 * this only ever narrows the draw — it never conflicts with the path's minimum.
 *
 * This clamps only the chain's *start*; the per-stage gaps summed onto it below are not
 * separately clamped to `now`, leaving roughly four days of headroom in the worst case (a path's
 * minimum `appliedDaysAgo` less its stages' maximum `GAP_DAYS_RANGE` draws). That headroom holds
 * only because every job actually wired into `CANDIDATE_GROUPS` has `openedDaysAgo` far above the
 * clamp's threshold, so it never engages. If a job with a small `openedDaysAgo` (the draft
 * `Engineering Manager, Platform` posting is 6) is ever added to `CANDIDATE_GROUPS`, this clamp
 * would engage, the four days of headroom would not be enough for some paths, and a transition
 * could land after `now` with no obvious cause in the failing test.
 */
function appliedDaysAgoFor(pathKey: string, jobOpenedDaysAgo: number, rng: () => number): number {
  const [min, max] = APPLIED_DAYS_AGO_RANGE[pathKey];
  const clampedMax = Math.min(max, jobOpenedDaysAgo);
  const clampedMin = Math.min(min, clampedMax);
  return nextInt(rng, clampedMin, clampedMax);
}

const TERMINAL_STAGES: readonly PipelineStageKey[] = ["hired", "rejected", "withdrawn"];

function reasonFor(stage: PipelineStageKey, rng: () => number): string | null {
  if (stage === "hired") return pick(rng, HIRED_REASONS);
  if (stage === "rejected") return pick(rng, REJECTION_REASONS);
  if (stage === "withdrawn") return pick(rng, WITHDRAWN_REASONS);
  return null;
}

/**
 * A closed or filled job cannot have an application still mid-pipeline after the requisition
 * itself closed, and none of its transitions can postdate `closedAt` — the JOB_NOTES prose for
 * UX Researcher and SDR names specific closure events that the rows must agree with. Prefers the
 * organically-drawn `transitionDates` untouched when they already fit inside
 * `[transitionDates[0], closedAt]` (appending a `rejected` close-out one day after the last real
 * stage when the path never reached a terminal one); only when they do not — the rare draw that
 * runs past `closedAt` — rescales every date onto an even grid ending exactly at `closedAt`,
 * which keeps the chain strictly increasing without hand-tuning each offender.
 */
function closeOutForJobClosure({
  path,
  transitionDates,
  closedAt,
}: {
  path: PipelineStageKey[];
  transitionDates: Date[];
  closedAt: Date;
}): { path: PipelineStageKey[]; transitionDates: Date[] } {
  const needsClosing = !TERMINAL_STAGES.includes(path[path.length - 1]);
  const finalPath = needsClosing ? [...path, "rejected" as PipelineStageKey] : path;

  const naturalLast = needsClosing
    ? addDays(transitionDates[transitionDates.length - 1], 1)
    : transitionDates[transitionDates.length - 1];
  if (naturalLast.getTime() <= closedAt.getTime()) {
    const dates = needsClosing ? [...transitionDates, naturalLast] : transitionDates;
    return { path: finalPath, transitionDates: dates };
  }

  const stageCount = finalPath.length;
  const appliedAt = transitionDates[0];
  const start =
    appliedAt.getTime() < closedAt.getTime()
      ? appliedAt.getTime()
      : closedAt.getTime() - stageCount * HOUR_MS;
  const span = closedAt.getTime() - start;
  // `stageCount - 1` is the divisor below; a single-stage path has nothing to space out, and
  // dividing by zero would otherwise produce a silent NaN/Infinity date. No path in
  // `PATH_LIBRARY` is a single terminal stage today, so this branch is unreached, not untested.
  const dates =
    stageCount === 1
      ? [new Date(start)]
      : Array.from(
          { length: stageCount },
          (_, i) => new Date(start + (span * i) / (stageCount - 1)),
        );
  return { path: finalPath, transitionDates: dates };
}

const APPLICATION_SOURCE_WEIGHTS: readonly [NewApplication["source"], number][] = [
  ["careers_site", 35],
  ["referral", 20],
  ["linkedin", 15],
  ["job_board", 15],
  ["agency", 5],
  ["email", 5],
  ["import", 5],
];

function sourceFor(rng: () => number): NewApplication["source"] {
  const total = APPLICATION_SOURCE_WEIGHTS.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng() * total;
  for (const [value, weight] of APPLICATION_SOURCE_WEIGHTS) {
    if (roll < weight) return value;
    roll -= weight;
  }
  return APPLICATION_SOURCE_WEIGHTS[0][0];
}

/** Per-application context the interview and note builders need after the funnel is laid out. */
interface ApplicationPlan {
  id: string;
  jobIndex: number;
  candidateIndex: number;
  path: PipelineStageKey[];
  transitionDates: Date[];
}

type InterviewKindLiteral = "phone_screen" | "technical" | "onsite" | "final";

/**
 * Whether feedback on an interview anchored to `anchorStage` should read positive or negative,
 * derived from where the application ended up: hires and still-in-progress applications read
 * positive throughout; a rejection reads negative only for the round anchored to the stage the
 * application was in immediately before the rejection, since earlier rounds were, by definition,
 * passed.
 */
function sentimentFor(
  path: PipelineStageKey[],
  anchorStage: PipelineStageKey,
  rng: () => number,
): "positive" | "negative" {
  const terminalStage = path[path.length - 1];
  if (!TERMINAL_STAGES.includes(terminalStage)) return "positive";
  if (terminalStage === "hired") return "positive";
  if (terminalStage === "withdrawn") return rng() < 0.85 ? "positive" : "negative";

  const lastNonTerminalStage = path[path.length - 2];
  if (anchorStage === lastNonTerminalStage) {
    return rng() < 0.75 ? "negative" : "positive";
  }
  return "positive";
}

function recommendationFor(
  sentiment: "positive" | "negative",
  rng: () => number,
): NewInterview["recommendation"] {
  if (sentiment === "positive") return rng() < 0.4 ? "strong_yes" : "yes";
  return rng() < 0.4 ? "strong_no" : "no";
}

function detailPhraseFor(kind: InterviewKindLiteral, jobIndex: number, rng: () => number): string {
  if (kind === "phone_screen") return pick(rng, PHONE_SCREEN_DETAIL_PHRASES);
  if (kind === "technical")
    return pick(rng, TECHNICAL_DETAIL_PHRASES[JOB_TRACK_BY_INDEX[jobIndex]]);
  if (kind === "onsite") return pick(rng, ONSITE_DETAIL_PHRASES);
  return pick(rng, FINAL_DETAIL_PHRASES);
}

const INTERVIEW_DURATION_MINUTES: Record<InterviewKindLiteral, number> = {
  phone_screen: 20,
  technical: 60,
  onsite: 90,
  final: 45,
};

function locationFor(kind: InterviewKindLiteral, rng: () => number): string {
  if (kind === "phone_screen") return "Phone call";
  if (kind === "technical") return "Video call — Google Meet";
  if (kind === "final") return "Video call — Google Meet (leadership panel)";
  return pick(rng, [
    "Onsite — Company HQ, Conference Room 2B",
    "Onsite — Company HQ, Conference Room 4A",
  ]);
}

/**
 * Clamps a candidate `scheduledAt` so an interview can never be dated after the application's
 * own terminal transition (or after `now`, for a terminal transition that has not — impossibly —
 * happened yet): a `rejected`/`hired`/`withdrawn` application cannot later acquire an interview
 * that postdates the decision it would have to justify. Non-terminal applications are untouched,
 * since a genuinely future `scheduled` interview is a real, intended case (§5 slice 7).
 */
function clampToTerminal(plan: ApplicationPlan, now: Date, scheduledAt: Date): Date {
  const finalStage = plan.path[plan.path.length - 1];
  if (!TERMINAL_STAGES.includes(finalStage)) return scheduledAt;

  const terminalOccurredAt = plan.transitionDates[plan.transitionDates.length - 1];
  const ceiling = terminalOccurredAt.getTime() <= now.getTime() ? terminalOccurredAt : now;
  return scheduledAt.getTime() > ceiling.getTime() ? ceiling : scheduledAt;
}

/**
 * Builds one interview row anchored to `kind`'s implied stage — `screening` for `phone_screen`,
 * `interview` for every other kind (§5 slice 7) — scheduled at or after the application actually
 * entered that stage, and never after the application's own terminal transition.
 *
 * `scheduleFrom: "now"` draws the offset from `now` rather than from the anchor transition, for
 * the handful of still-in-progress applications the seed deliberately books ahead: without it,
 * every draw is anchor-relative and, for this dataset's actual anchor dates, none happens to land
 * after `now` — leaving `interview_status = 'scheduled'` with zero seeded rows and the
 * `scheduledAt > now` branch below dead code.
 */
function buildInterview({
  rng,
  now,
  plan,
  candidateName,
  kind,
  offsetRange,
  scheduleFrom = "anchor",
}: {
  rng: () => number;
  now: Date;
  plan: ApplicationPlan;
  candidateName: string;
  kind: InterviewKindLiteral;
  offsetRange: [number, number];
  scheduleFrom?: "anchor" | "now";
}): NewInterview {
  const anchorStage: PipelineStageKey = kind === "phone_screen" ? "screening" : "interview";
  const anchorIndex = plan.path.indexOf(anchorStage);
  const anchorDate = plan.transitionDates[anchorIndex];
  const scheduleBase = scheduleFrom === "now" ? now : anchorDate;
  const scheduledAt = clampToTerminal(
    plan,
    now,
    addDays(scheduleBase, nextInt(rng, offsetRange[0], offsetRange[1])),
  );

  if (scheduledAt > now) {
    // The row itself can't have been written in the future — it was booked just now, for a
    // session that hasn't happened yet.
    return {
      id: nextId(rng),
      applicationId: plan.id,
      kind,
      status: "scheduled",
      scheduledAt,
      durationMinutes: INTERVIEW_DURATION_MINUTES[kind],
      interviewerName: pick(rng, INTERVIEWER_NAMES),
      location: locationFor(kind, rng),
      recommendation: null,
      feedback: null,
      createdAt: now,
    };
  }

  if (rng() < 0.05) {
    const didNotShow = rng() < 0.5;
    return {
      id: nextId(rng),
      applicationId: plan.id,
      kind,
      status: didNotShow ? "no_show" : "cancelled",
      scheduledAt,
      durationMinutes: INTERVIEW_DURATION_MINUTES[kind],
      interviewerName: pick(rng, INTERVIEWER_NAMES),
      location: locationFor(kind, rng),
      recommendation: null,
      feedback: didNotShow
        ? "Candidate did not join; recruiter is following up to reschedule."
        : "Cancelled by recruiter due to a scheduling conflict; will rebook.",
      createdAt: scheduledAt,
    };
  }

  const sentiment = sentimentFor(plan.path, anchorStage, rng);
  const detail = detailPhraseFor(kind, plan.jobIndex, rng);
  const frame = pick(rng, FEEDBACK_FRAMES[kind][sentiment]);

  return {
    id: nextId(rng),
    applicationId: plan.id,
    kind,
    status: "completed",
    scheduledAt,
    durationMinutes: INTERVIEW_DURATION_MINUTES[kind],
    interviewerName: pick(rng, INTERVIEWER_NAMES),
    location: locationFor(kind, rng),
    recommendation: recommendationFor(sentiment, rng),
    feedback: frame(candidateName, detail),
    createdAt: scheduledAt,
  };
}

/**
 * Builds one seed dataset for every table in `docs/specs/ai-34-domain-model.md` §3. `now` is
 * required, with no default, so the same `now` always yields a byte-for-byte identical dataset
 * (the DoD's determinism assertion) while a test can still exercise a fixed instant and the
 * runner can pass the real `new Date()`. Every timestamp below is an offset from `now`; no other
 * source of "current time" is read.
 */
export function buildSeedDataset({ now }: { now: Date }): SeedDataset {
  const rng = createRng(PRNG_SEED);

  const jobIds = JOB_DEFINITIONS.map(() => nextId(rng));
  const jobs: NewJob[] = JOB_DEFINITIONS.map((def, index) => ({
    id: jobIds[index],
    title: def.title,
    department: def.department,
    location: def.location,
    employmentType: def.employmentType,
    status: def.status,
    description: def.description,
    requirements: def.requirements,
    openedAt: addDays(now, -def.openedDaysAgo),
    closedAt: def.closedDaysAgo === null ? null : addDays(now, -def.closedDaysAgo),
    createdAt: addDays(now, -def.openedDaysAgo),
  }));

  // Only the id draw happens here — it consumes `rng` in the same position every prior slice
  // relied on. The row literal itself is built after the pairs loop below, once each
  // candidate's earliest `appliedAt` is known, without disturbing that draw order.
  const candidateIds = CANDIDATE_DEFINITIONS.map(() => nextId(rng));

  const pairs = buildCandidateJobPairs();
  const pathKeys = buildPathAssignments(rng);

  const extractionByPair = new Map(
    EXTRACTION_ASSIGNMENTS.map((assignment) => [
      `${assignment.candidateIndex}:${assignment.jobIndex}`,
      assignment,
    ]),
  );
  const coverLetterByPair = new Map(
    COVER_LETTER_ASSIGNMENTS.map((assignment) => [
      `${assignment.candidateIndex}:${assignment.jobIndex}`,
      assignment.body,
    ]),
  );

  const applications: NewApplication[] = [];
  const stageTransitions: NewApplicationStageTransition[] = [];
  const plans: ApplicationPlan[] = [];

  pairs.forEach((pair, pairIndex) => {
    const applicationId = nextId(rng);
    const pathKey = pathKeys[pairIndex];

    const appliedDaysAgo = appliedDaysAgoFor(
      pathKey,
      JOB_DEFINITIONS[pair.jobIndex].openedDaysAgo,
      rng,
    );
    const rawTransitionDates: Date[] = [addDays(now, -appliedDaysAgo)];
    const rawPath = PATH_LIBRARY[pathKey];
    for (let step = 1; step < rawPath.length; step++) {
      rawTransitionDates.push(
        addDays(rawTransitionDates[step - 1], gapDaysFor(rawPath[step], rng)),
      );
    }

    const jobClosedAt = jobs[pair.jobIndex].closedAt;
    const { path, transitionDates } = jobClosedAt
      ? closeOutForJobClosure({
          path: rawPath,
          transitionDates: rawTransitionDates,
          closedAt: jobClosedAt,
        })
      : { path: rawPath, transitionDates: rawTransitionDates };

    path.forEach((stage, step) => {
      const fromStage = step === 0 ? null : path[step - 1];
      stageTransitions.push({
        id: nextId(rng),
        applicationId,
        fromStage,
        toStage: stage,
        occurredAt: transitionDates[step],
        changedBy: fromStage === null ? null : pick(rng, RECRUITING_AUTHOR_NAMES),
        reason: fromStage === null ? null : reasonFor(stage, rng),
        createdAt: transitionDates[step],
      });
    });

    const assignment = extractionByPair.get(`${pair.candidateIndex}:${pair.jobIndex}`);
    const extraction: ExtractionPayload | null = assignment
      ? {
          schemaVersion: 1,
          model: assignment.model,
          extractedAt: addHours(transitionDates[0], assignment.extractedAfterHours).toISOString(),
          fields: withAuthoritativeEmail(
            assignment.fields,
            emailFor(CANDIDATE_DEFINITIONS[pair.candidateIndex].fullName),
          ),
        }
      : null;

    applications.push({
      id: applicationId,
      jobId: jobIds[pair.jobIndex],
      candidateId: candidateIds[pair.candidateIndex],
      stage: path[path.length - 1],
      stageChangedAt: transitionDates[transitionDates.length - 1],
      source: sourceFor(rng),
      appliedAt: transitionDates[0],
      coverLetter: coverLetterByPair.get(`${pair.candidateIndex}:${pair.jobIndex}`) ?? null,
      extraction,
      createdAt: transitionDates[0],
    });

    plans.push({
      id: applicationId,
      jobIndex: pair.jobIndex,
      candidateIndex: pair.candidateIndex,
      path,
      transitionDates,
    });
  });

  /**
   * A candidate row's `createdAt` is the moment they first entered the pipeline — the earliest
   * `applied_at` across their applications, which every candidate has at least one of (every
   * `CANDIDATE_GROUPS` cohort has `jobIndexes.length >= 1`). Computed from `plans` rather than a
   * new draw, so it matches the applications above by construction and needs no extra `rng` call.
   */
  const earliestAppliedAtByCandidateIndex = new Map<number, Date>();
  for (const plan of plans) {
    const appliedAt = plan.transitionDates[0];
    const earliest = earliestAppliedAtByCandidateIndex.get(plan.candidateIndex);
    if (!earliest || appliedAt.getTime() < earliest.getTime()) {
      earliestAppliedAtByCandidateIndex.set(plan.candidateIndex, appliedAt);
    }
  }

  const candidates: NewCandidate[] = CANDIDATE_DEFINITIONS.map((def, index) => ({
    id: candidateIds[index],
    fullName: def.fullName,
    email: emailFor(def.fullName),
    phone: phoneFor(index),
    location: def.location,
    headline: def.headline,
    summary: def.summary,
    resumeText: def.resumeText,
    resumeUrl: resumeUrlFor(def.fullName),
    linkedinUrl: linkedinUrlFor(def.fullName, index),
    yearsExperience: def.yearsExperience,
    createdAt: earliestAppliedAtByCandidateIndex.get(index)!,
  }));

  const currentlyIn = (stage: PipelineStageKey) =>
    plans.filter((plan) => plan.path[plan.path.length - 1] === stage);

  /**
   * A handful of still-open applications get their next round booked ahead of `now` rather than
   * behind it — a recruiter's "interviews this week" view has rows to show. Drawn from
   * applications actually sitting in the round's anchor stage today (not yet moved on), so a
   * `phone_screen` only lands on someone still in `screening` and a `technical`/`final` only on
   * someone still in `interview` — never a stage that round would already have moved them past.
   * Excluded from the historical pools below so the same application is not also given a
   * same-kind interview dated in the past.
   */
  const upcomingPhoneScreenPlans = currentlyIn("screening").slice(0, 1);
  const upcomingInterviewPlans = currentlyIn("interview").slice(0, 2);
  const upcomingPlanIds = new Set(
    [...upcomingPhoneScreenPlans, ...upcomingInterviewPlans].map((plan) => plan.id),
  );

  const eligibleFor = (stage: PipelineStageKey) =>
    plans.filter((plan) => plan.path.includes(stage) && !upcomingPlanIds.has(plan.id));
  const phoneScreenPlans = eligibleFor("screening").slice(0, 14);
  const technicalPlans = eligibleFor("interview").slice(0, 14);
  const offerReachedPlans = eligibleFor("offer");
  const onsitePlans = offerReachedPlans.slice(0, 8);
  const finalPlans = offerReachedPlans.slice(0, 4);

  const interviewRounds: {
    plan: ApplicationPlan;
    kind: InterviewKindLiteral;
    offsetRange: [number, number];
    scheduleFrom?: "anchor" | "now";
  }[] = [
    ...phoneScreenPlans.map((plan) => ({
      plan,
      kind: "phone_screen" as const,
      offsetRange: [1, 3] as [number, number],
    })),
    ...technicalPlans.map((plan) => ({
      plan,
      kind: "technical" as const,
      offsetRange: [2, 6] as [number, number],
    })),
    ...onsitePlans.map((plan) => ({
      plan,
      kind: "onsite" as const,
      offsetRange: [6, 12] as [number, number],
    })),
    ...finalPlans.map((plan) => ({
      plan,
      kind: "final" as const,
      offsetRange: [10, 18] as [number, number],
    })),
    ...upcomingPhoneScreenPlans.map((plan) => ({
      plan,
      kind: "phone_screen" as const,
      offsetRange: [1, 4] as [number, number],
      scheduleFrom: "now" as const,
    })),
    ...upcomingInterviewPlans.map((plan, index) => ({
      plan,
      kind: (index === 0 ? "technical" : "final") as InterviewKindLiteral,
      offsetRange: [2, 6] as [number, number],
      scheduleFrom: "now" as const,
    })),
  ];

  const interviews: NewInterview[] = interviewRounds.map(
    ({ plan, kind, offsetRange, scheduleFrom }) =>
      buildInterview({
        rng,
        now,
        plan,
        candidateName: candidates[plan.candidateIndex].fullName,
        kind,
        offsetRange,
        scheduleFrom,
      }),
  );

  const notes: NewNote[] = [];

  JOB_DEFINITIONS.forEach((_job, jobIndex) => {
    JOB_NOTES[jobIndex].forEach((body, noteIndex) => {
      notes.push({
        id: nextId(rng),
        jobId: jobIds[jobIndex],
        candidateId: null,
        applicationId: null,
        body,
        author: pick(rng, RECRUITING_AUTHOR_NAMES),
        pinned: noteIndex === JOB_NOTES[jobIndex].length - 1,
        // Hours, not days: job 7 (the draft) is only 6 days old, and this must stay well under
        // that even at the last note in the array.
        createdAt: addHours(jobs[jobIndex].openedAt!, 4 + noteIndex * 20),
      });
    });
  });

  for (let candidateIndex = 0; candidateIndex < 40; candidateIndex++) {
    const candidate = candidates[candidateIndex];
    const definition = CANDIDATE_DEFINITIONS[candidateIndex];
    const frame = CANDIDATE_NOTE_FRAMES[candidateIndex % CANDIDATE_NOTE_FRAMES.length];
    notes.push({
      id: nextId(rng),
      jobId: null,
      candidateId: candidateIds[candidateIndex],
      applicationId: null,
      body: frame(candidate.fullName, definition.noteDetail),
      author: pick(rng, RECRUITING_AUTHOR_NAMES),
      pinned: false,
      // Shortly after this candidate's earliest application — every path's minimum
      // `appliedDaysAgo` (5 days) comfortably outlasts the largest offset here.
      createdAt: addHours(
        earliestAppliedAtByCandidateIndex.get(candidateIndex)!,
        6 + (candidateIndex % 6) * 12,
      ),
    });
  }

  for (let pairIndex = 0; pairIndex < 40; pairIndex++) {
    const plan = plans[pairIndex];
    const candidate = candidates[plan.candidateIndex];
    const job = jobs[plan.jobIndex];
    const frame = APPLICATION_NOTE_FRAMES[pairIndex % APPLICATION_NOTE_FRAMES.length];
    notes.push({
      id: nextId(rng),
      jobId: null,
      candidateId: null,
      applicationId: plan.id,
      body: frame(candidate.fullName, job.title),
      author: pick(rng, RECRUITING_AUTHOR_NAMES),
      pinned: false,
      createdAt: addHours(plan.transitionDates[0], 6 + (pairIndex % 6) * 12),
    });
  }

  return { jobs, candidates, applications, stageTransitions, interviews, notes };
}
