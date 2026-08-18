import type { ExtractionPayload } from "./extraction";
import type { NewApplicationStageTransition } from "./schema/application-stage-transitions";
import type { NewApplication } from "./schema/applications";
import type { NewCandidate } from "./schema/candidates";
import type { NewInterview } from "./schema/interviews";
import type { NewJob } from "./schema/jobs";
import type { NewNote } from "./schema/notes";
import type { PipelineStageKey } from "./schema/pipeline-stages";
import {
  APPLICATION_NOTE_FRAMES,
  APPLIED_DAYS_AGO_RANGE,
  CANDIDATE_DEFINITIONS,
  CANDIDATE_GROUPS,
  CANDIDATE_NOTE_FRAMES,
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

const EMAIL_DOMAINS = ["gmail.com", "outlook.com", "proton.me", "icloud.com", "fastmail.com"];
const PHONE_AREA_CODES = ["415", "212", "312", "512"];

function nameParts(fullName: string): { first: string; last: string } {
  const parts = fullName.split(" ");
  return { first: parts[0], last: parts[parts.length - 1] };
}

/** A fake-but-plausible email, lowercase and unique because every candidate's name is distinct. */
function emailFor(fullName: string, index: number): string {
  const { first, last } = nameParts(fullName);
  return `${slug(first)}.${slug(last)}@${EMAIL_DOMAINS[index % EMAIL_DOMAINS.length]}`;
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

function linkedinUrlFor(fullName: string, index: number): string {
  const { first, last } = nameParts(fullName);
  return `https://www.linkedin.com/in/${slug(first)}-${slug(last)}-${index}`;
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

function appliedDaysAgoFor(pathKey: string, rng: () => number): number {
  const [min, max] = APPLIED_DAYS_AGO_RANGE[pathKey];
  return nextInt(rng, min, max);
}

const TERMINAL_STAGES: readonly PipelineStageKey[] = ["hired", "rejected", "withdrawn"];

function reasonFor(stage: PipelineStageKey, rng: () => number): string | null {
  if (stage === "hired") return pick(rng, HIRED_REASONS);
  if (stage === "rejected") return pick(rng, REJECTION_REASONS);
  if (stage === "withdrawn") return pick(rng, WITHDRAWN_REASONS);
  return null;
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
 * Builds one interview row anchored to `kind`'s implied stage — `screening` for `phone_screen`,
 * `interview` for every other kind (§5 slice 7) — scheduled at or after the application actually
 * entered that stage.
 */
function buildInterview({
  rng,
  now,
  plan,
  candidateName,
  kind,
  offsetRange,
}: {
  rng: () => number;
  now: Date;
  plan: ApplicationPlan;
  candidateName: string;
  kind: InterviewKindLiteral;
  offsetRange: [number, number];
}): NewInterview {
  const anchorStage: PipelineStageKey = kind === "phone_screen" ? "screening" : "interview";
  const anchorIndex = plan.path.indexOf(anchorStage);
  const anchorDate = plan.transitionDates[anchorIndex];
  const scheduledAt = addDays(anchorDate, nextInt(rng, offsetRange[0], offsetRange[1]));

  if (scheduledAt > now) {
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
  }));

  const candidateIds = CANDIDATE_DEFINITIONS.map(() => nextId(rng));
  const candidates: NewCandidate[] = CANDIDATE_DEFINITIONS.map((def, index) => ({
    id: candidateIds[index],
    fullName: def.fullName,
    email: emailFor(def.fullName, index),
    phone: phoneFor(index),
    location: def.location,
    headline: def.headline,
    summary: def.summary,
    resumeText: def.resumeText,
    resumeUrl: resumeUrlFor(def.fullName),
    linkedinUrl: linkedinUrlFor(def.fullName, index),
    yearsExperience: def.yearsExperience,
  }));

  const pairs = buildCandidateJobPairs();
  const pathKeys = buildPathAssignments(rng);

  const extractionByPair = new Map(
    EXTRACTION_ASSIGNMENTS.map((assignment) => [
      `${assignment.candidateIndex}:${assignment.jobIndex}`,
      assignment,
    ]),
  );

  const applications: NewApplication[] = [];
  const stageTransitions: NewApplicationStageTransition[] = [];
  const plans: ApplicationPlan[] = [];

  pairs.forEach((pair, pairIndex) => {
    const applicationId = nextId(rng);
    const pathKey = pathKeys[pairIndex];
    const path = PATH_LIBRARY[pathKey];

    const appliedDaysAgo = appliedDaysAgoFor(pathKey, rng);
    const transitionDates: Date[] = [addDays(now, -appliedDaysAgo)];
    for (let step = 1; step < path.length; step++) {
      transitionDates.push(addDays(transitionDates[step - 1], gapDaysFor(path[step], rng)));
    }

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
      });
    });

    const assignment = extractionByPair.get(`${pair.candidateIndex}:${pair.jobIndex}`);
    const extraction: ExtractionPayload | null = assignment
      ? {
          schemaVersion: 1,
          model: assignment.model,
          extractedAt: addHours(transitionDates[0], assignment.extractedAfterHours).toISOString(),
          fields: assignment.fields,
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
      coverLetter: null,
      extraction,
    });

    plans.push({
      id: applicationId,
      jobIndex: pair.jobIndex,
      candidateIndex: pair.candidateIndex,
      path,
      transitionDates,
    });
  });

  const eligibleFor = (stage: PipelineStageKey) =>
    plans.filter((plan) => plan.path.includes(stage));
  const phoneScreenPlans = eligibleFor("screening").slice(0, 14);
  const technicalPlans = eligibleFor("interview").slice(0, 14);
  const offerReachedPlans = eligibleFor("offer");
  const onsitePlans = offerReachedPlans.slice(0, 8);
  const finalPlans = offerReachedPlans.slice(0, 4);

  const interviewRounds: {
    plan: ApplicationPlan;
    kind: InterviewKindLiteral;
    offsetRange: [number, number];
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
  ];

  const interviews: NewInterview[] = interviewRounds.map(({ plan, kind, offsetRange }) =>
    buildInterview({
      rng,
      now,
      plan,
      candidateName: candidates[plan.candidateIndex].fullName,
      kind,
      offsetRange,
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
    });
  }

  return { jobs, candidates, applications, stageTransitions, interviews, notes };
}
