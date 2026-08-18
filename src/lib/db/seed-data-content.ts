import type { PipelineStageKey } from "@/lib/db/schema/pipeline-stages";

/**
 * The functional area a job posting belongs to, used to pick track-appropriate detail phrases
 * for interview feedback (§ below) rather than writing feedback that reads the same regardless
 * of whether the interview was for a backend role or a sales role.
 */
export type JobTrack =
  "backend" | "frontend" | "data" | "design" | "research" | "salesAE" | "salesSDR";

/** `JOB_DEFINITIONS[i]`'s track, in the same index order. Job 7 is unused (still a draft). */
export const JOB_TRACK_BY_INDEX: JobTrack[] = [
  "backend",
  "frontend",
  "data",
  "design",
  "research",
  "salesAE",
  "salesSDR",
  "backend",
];

/**
 * A cohort of candidates who all apply to the same job(s). Candidate index `n` (0-based, in
 * `CANDIDATE_DEFINITIONS` order) belongs to whichever group its position falls into once every
 * prior group's `count` is consumed — see `buildCandidateJobPairs` in `seed-data.ts`. Encoding
 * the funnel's shape as groups rather than 90 hand-listed pairs is what makes the per-job
 * application totals (and the 30 candidates who apply twice) checkable by arithmetic instead of
 * by counting a flat list.
 */
export interface CandidateGroup {
  count: number;
  jobIndexes: number[];
}

/**
 * Ten cohorts whose `count`s sum to 60 candidates and whose `count * jobIndexes.length`s sum to
 * 90 applications, matching the funnel-reach and per-job totals asserted in `seed-data.test.ts`.
 * Order matters: it is the order candidates are drawn from `CANDIDATE_DEFINITIONS`.
 */
export const CANDIDATE_GROUPS: CandidateGroup[] = [
  { count: 1, jobIndexes: [0] }, // backend only
  { count: 10, jobIndexes: [1] }, // frontend only
  { count: 7, jobIndexes: [3] }, // product design only
  { count: 2, jobIndexes: [4] }, // UX research only
  { count: 6, jobIndexes: [5] }, // account executive only
  { count: 4, jobIndexes: [6] }, // SDR only
  { count: 4, jobIndexes: [0, 1] }, // full-stack: backend + frontend
  { count: 10, jobIndexes: [0, 2] }, // backend + data platform
  { count: 6, jobIndexes: [3, 4] }, // product design + UX research
  { count: 10, jobIndexes: [5, 6] }, // account executive + SDR
];

/**
 * One candidate's hand-authored profile. `email`/`phone`/`resumeUrl`/`linkedinUrl` are derived
 * from `fullName` and the array index in `seed-data.ts` rather than listed here, so this table
 * only carries the facts that are actually about the person. `noteDetail` is a short phrase
 * `CANDIDATE_NOTE_FRAMES` substitutes into a note body — kept distinct from `headline` because
 * a headline reads naturally as a title and `noteDetail` needs to read naturally as an object
 * ("vouched for their _______").
 */
export interface CandidateDefinition {
  fullName: string;
  location: string;
  headline: string;
  summary: string;
  resumeText: string;
  yearsExperience: number;
  noteDetail: string;
}

/**
 * Sixty candidates, in the exact order `CANDIDATE_GROUPS` draws from: index 0 is the sole
 * backend-only candidate, indexes 1-10 are the ten frontend-only candidates, and so on through
 * the two-job cohorts at the end. Reordering this array without reordering `CANDIDATE_GROUPS` to
 * match will misassign applications to jobs.
 */
export const CANDIDATE_DEFINITIONS: CandidateDefinition[] = [
  {
    fullName: "Marcus Whitfield",
    location: "Denver, CO",
    headline: "Backend engineer focused on high-throughput payment systems",
    summary:
      "Marcus has spent the last nine years building the ledger and settlement services behind consumer payment products.",
    resumeText: `Marcus led the migration of Talus Payments' settlement engine from a single Rails monolith to a set of Go services handling 40M+ transactions a day, cutting reconciliation errors by 90%. Before that, he spent three years at Cobalt Route building the routing layer that matched drivers to loads in under 200ms. He's comfortable owning an on-call rotation, writing the postmortem, and mentoring the engineer who gets paged next time. Strongest with Go, PostgreSQL, and Kafka; has opinions about idempotency keys.`,
    yearsExperience: 9,
    noteDetail: "payment settlement systems experience",
  },
  {
    fullName: "Priya Nandakumar",
    location: "Seattle, WA",
    headline: "Frontend engineer who cares about performance budgets",
    summary:
      "Priya rebuilt Solstice Retail's checkout flow to load in under a second on 3G and has been chasing performance regressions ever since.",
    resumeText: `At Solstice Retail, Priya owned the checkout experience for a site doing eight-figure GMV, cutting median time-to-interactive by 45% through code-splitting and image pipeline work. She previously built the internal design system at Gladwell Media, which three other product teams later adopted without her having to ask. Comfortable in React, TypeScript, and Playwright; has strong opinions about when not to reach for a state management library.`,
    yearsExperience: 6,
    noteDetail: "checkout performance work",
  },
  {
    fullName: "Oliver Bramble",
    location: "Portland, OR",
    headline: "Frontend engineer, two years into React after a bootcamp",
    summary:
      "Oliver joined Northfork Outfitters as their first dedicated frontend hire and has been the sole owner of their storefront since.",
    resumeText: `Oliver rebuilt Northfork Outfitters' product listing pages after a Shopify migration went sideways, restoring a 12% conversion drop within six weeks. He's self-taught past the bootcamp curriculum — dug into web accessibility on his own and got the storefront to a clean axe-core audit. Working knowledge of React, Tailwind, and enough backend Node to unblock himself on the days there's no one else to ask.`,
    yearsExperience: 3,
    noteDetail: "self-taught accessibility work",
  },
  {
    fullName: "Sofia Reyes-Calderón",
    location: "Austin, TX",
    headline: "Frontend engineer specializing in design systems",
    summary:
      "Sofia built and maintained the component library that Practical Habits Co's four product squads now ship against daily.",
    resumeText: `Sofia's design system work at Practical Habits Co cut new-feature frontend time by roughly a third once the token pipeline and Storybook docs were in place. She pairs closely with design, which shows in a component library that survived two full brand refreshes without a rewrite. React, TypeScript, and Figma's API are her daily tools; she's also the person who notices when a PR breaks dark mode.`,
    yearsExperience: 5,
    noteDetail: "design system ownership",
  },
  {
    fullName: "Devon Achebe",
    location: "Chicago, IL",
    headline: "Frontend engineer, ex-Cascade Wellness",
    summary:
      "Devon spent four years building the patient-facing scheduling app at Cascade Wellness, from prototype to a product used by 200k patients.",
    resumeText: `Devon took Cascade Wellness's scheduling flow from a Figma prototype to production, then rebuilt it twice as the appointment logic got more complex — multi-provider, waitlists, cancellation windows. He's the one who introduced end-to-end tests to a team that had none, and pushed back, successfully, on a redesign that would've broken keyboard navigation. React, React Query, and enough backend context to write his own API contracts.`,
    yearsExperience: 4,
    noteDetail: "healthcare scheduling app work",
  },
  {
    fullName: "Lena Petrov",
    location: "Remote — Berlin, Germany",
    headline: "Senior frontend engineer, internationalization and accessibility",
    summary:
      "Lena led the internationalization rollout that took Amberlane Foods' app from English-only to eleven languages without a rewrite.",
    resumeText: `At Amberlane Foods, Lena's team shipped i18n and RTL support across the entire consumer app in four months, then kept it clean enough that new features rarely broke translations. She previously worked on Bluefin Analytics' dashboard, where she rebuilt the charting layer after the third-party library the team relied on was abandoned mid-year. Deep React and CSS knowledge; screen-reader tests every PR she reviews.`,
    yearsExperience: 7,
    noteDetail: "internationalization rollout experience",
  },
  {
    fullName: "Hiroshi Tanaka",
    location: "San Jose, CA",
    headline: "Frontend engineer turned platform generalist",
    summary:
      "Hiroshi spent three years on Halyard Systems' frontend before moving into the internal tools that other engineers now depend on.",
    resumeText: `Hiroshi built and now maintains Halyard Systems' internal component library and the CI pipeline that lints, tests, and previews every frontend PR automatically. He came from a pure product engineering background — five years shipping consumer features before the internal-tools shift — so he still writes UI code that's pleasant to work with, not just infrastructure that's correct. React, Vite, and a healthy suspicion of unnecessary abstraction.`,
    yearsExperience: 8,
    noteDetail: "internal tooling work",
  },
  {
    fullName: "Camille Fontaine",
    location: "Remote — Montreal, Canada",
    headline: "Frontend engineer with a motion design background",
    summary:
      "Camille came from motion design and now builds the animated onboarding flows at Ostrom Robotics' consumer app.",
    resumeText: `Camille's onboarding redesign at Ostrom Robotics lifted activation by 18%, mostly by replacing a five-screen wall of text with a guided flow that actually shows the product working. Her motion-design background means her animations ship with reduced-motion fallbacks by default, not as an afterthought. Framer Motion, React, and a good eye for the difference between delightful and distracting.`,
    yearsExperience: 5,
    noteDetail: "motion design background",
  },
  {
    fullName: "Ravi Subramaniam",
    location: "Raleigh, NC",
    headline: "Staff-track frontend engineer, e-commerce",
    summary:
      "Ravi has spent a decade in e-commerce frontend, most recently leading Fernwood Studio's storefront rebuild.",
    resumeText: `Ravi led a six-engineer rebuild of Fernwood Studio's storefront off a legacy PHP templating system onto Next.js, run as a strangler migration over eight months with zero downtime windows. He's the engineer other teams ask to review architecture decisions before they commit to them, and he still writes code most weeks rather than only reviewing it. Next.js, GraphQL, and a strong track record of migrations that didn't blow up.`,
    yearsExperience: 10,
    noteDetail: "large-scale migration experience",
  },
  {
    fullName: "Grace Okonjo",
    location: "Remote — Lagos, Nigeria",
    headline: "Frontend engineer, fintech dashboards",
    summary:
      "Grace built the merchant-facing analytics dashboard at Trellis HR from a blank repo to a product used daily by 3,000 merchants.",
    resumeText: `Grace owned Trellis HR's merchant dashboard end to end — data fetching, charting, and the permissions model that decides what each merchant role can see. She's comfortable being the only frontend engineer on a project, which was true for most of her time there, and picked up enough backend Node to unblock API changes herself. React, D3, and a habit of writing down the decisions she made so the next person doesn't have to guess.`,
    yearsExperience: 4,
    noteDetail: "fintech dashboard ownership",
  },
  {
    fullName: "Tyler Fitzgerald",
    location: "Denver, CO",
    headline: "Junior frontend engineer, two years in",
    summary:
      "Tyler's first engineering job was rebuilding Kindling Learning's course-progress UI, which he still owns.",
    resumeText: `Tyler shipped Kindling Learning's course-progress tracker, including the offline-sync logic that keeps a learner's progress consistent across a spotty connection — the hardest bug of his career so far, and the one he's proudest of fixing. He's still building his backend intuition but reads other people's PRs closely and asks good questions in review. React, TypeScript, and a genuine appetite for feedback.`,
    yearsExperience: 2,
    noteDetail: "offline-sync debugging work",
  },
  {
    fullName: "Isabel Duarte",
    location: "New York, NY",
    headline: "Product designer, B2B dashboards",
    summary:
      "Isabel led the redesign of Trellis HR's admin console, taking it from a support-ticket generator to a product people compliment.",
    resumeText: `Isabel's redesign of Trellis HR's admin console cut support tickets tagged "confusing UI" by 60% within two quarters, based on a research-led rework of the information architecture rather than a visual refresh alone. She runs her own usability tests rather than waiting for a researcher to be staffed, and ships Figma files clean enough that engineering rarely comes back with layout questions. Strong in interaction design and design systems; portfolio available on request.`,
    yearsExperience: 6,
    noteDetail: "admin console redesign work",
  },
  {
    fullName: "Noah Kessler",
    location: "Brooklyn, NY",
    headline: "Product designer, consumer mobile",
    summary:
      "Noah designed the onboarding and referral flows for Amberlane Foods' consumer app, both still in production largely unchanged.",
    resumeText: `Noah's referral flow redesign at Amberlane Foods doubled invite-to-signup conversion by removing three unnecessary steps and giving both sides of a referral a reason to care about the outcome, not just the incentive. He prototypes in code when a static mockup won't answer the question, which has saved more than one feature from shipping with an interaction nobody had actually tried. Figma, light React for prototyping, and a habit of testing with five users before any five-person design review.`,
    yearsExperience: 4,
    noteDetail: "referral flow redesign work",
  },
  {
    fullName: "Amara Chukwu",
    location: "Remote — Lagos, Nigeria",
    headline: "Senior product designer, fintech",
    summary:
      "Amara has spent eight years designing for financial products, most recently owning the entire lending flow at Bluefin Analytics.",
    resumeText: `Amara redesigned Bluefin Analytics' loan application flow after research showed applicants were abandoning at the income-verification step; the new flow, with clearer expectations set up front, cut abandonment by a third. She's led design for teams of up to four designers and still reviews every research readout personally before it reaches engineering. Deep experience with regulated-industry design constraints and a portfolio built almost entirely around measurable outcomes.`,
    yearsExperience: 8,
    noteDetail: "regulated fintech design experience",
  },
  {
    fullName: "Felix Lindqvist",
    location: "Remote — Stockholm, Sweden",
    headline: "Product designer, developer tools",
    summary:
      "Felix designs for other engineers, most recently the CLI and dashboard experience at Halyard Systems.",
    resumeText: `Felix's redesign of Halyard Systems' deployment dashboard came out of sitting in on a dozen support calls and noticing every engineer asked the same three questions the old UI never answered. He writes his own copy, tests it with real error states instead of lorem ipsum, and treats empty states as a design problem rather than an afterthought. Figma and just enough command-line comfort to understand the tools he's designing for.`,
    yearsExperience: 5,
    noteDetail: "developer-tools design experience",
  },
  {
    fullName: "Renata Silva",
    location: "Miami, FL",
    headline: "Product designer, early career, e-commerce",
    summary:
      "Renata redesigned Fernwood Studio's product page template, now the default for every new collection launch.",
    resumeText: `Renata's product page redesign at Fernwood Studio lifted add-to-cart rate by 9% in an A/B test she designed and instrumented herself, which mattered more to the team than the visual polish. She's three years in and still asks for design critique from anyone willing to give it, which shows in how fast her work has improved. Figma, basic HTML/CSS, and a genuine curiosity about the data behind a design decision.`,
    yearsExperience: 3,
    noteDetail: "e-commerce product page work",
  },
  {
    fullName: "Owen Mackenzie",
    location: "Chicago, IL",
    headline: "Product designer, marketplace products",
    summary:
      "Owen spent five years designing both sides of Ridgeback Logistics' two-sided marketplace before moving into a broader product design role.",
    resumeText: `Owen's work on Ridgeback Logistics' carrier-facing app took load acceptance time from an average of six minutes to ninety seconds, mostly by cutting a form down to the three fields carriers actually needed in the moment. Designing for two audiences with opposite incentives taught him to be explicit about trade-offs in every review rather than pretend a design serves everyone equally well. Figma, whiteboard-first process, and comfort defending a decision to a room that disagrees.`,
    yearsExperience: 7,
    noteDetail: "marketplace design experience",
  },
  {
    fullName: "Yuki Matsumoto",
    location: "Remote — Tokyo, Japan",
    headline: "Staff product designer, platform and design systems",
    summary:
      "Yuki built and now governs the design system used across Ostrom Robotics' six product teams.",
    resumeText: `Yuki's design system work at Ostrom Robotics cut new-feature design time by an estimated 30% once components, tokens, and documentation were consistent across teams — and, more importantly, kept teams from quietly drifting back into one-off components eighteen months later. She runs a monthly system-critique session that any designer at the company can bring work to, regardless of team. Deep Figma component architecture experience and a healthy skepticism of design systems that exist mostly as a slide deck.`,
    yearsExperience: 9,
    noteDetail: "design systems governance",
  },
  {
    fullName: "Daniela Ferreira",
    location: "Remote — São Paulo, Brazil",
    headline: "UX researcher, mixed methods",
    summary:
      "Daniela runs both the quant surveys and the qual interviews behind Cascade Wellness' product roadmap.",
    resumeText: `Daniela's research directly reversed a planned feature cut at Cascade Wellness after usability sessions showed the feature was the main reason a third of interviewees had signed up in the first place — a finding the team's usage metrics alone hadn't surfaced. She runs a research repository that product managers actually search before proposing new work, which is rarer than it sounds. Comfortable moderating her own sessions, writing her own screeners, and pushing back when a stakeholder wants to skip research to hit a deadline.`,
    yearsExperience: 6,
    noteDetail: "mixed-methods research practice",
  },
  {
    fullName: "Sam Okafor",
    location: "Remote — US (Central)",
    headline: "UX researcher, developer-facing products",
    summary:
      "Sam's research background is in early-career usability work, most recently at Trellis HR studying how admins actually use permissions.",
    resumeText: `Sam's study of how Trellis HR admins configure permissions found that most admins copied an existing role rather than build one from scratch — a behavior the product had never been designed around — and the resulting redesign shipped within a quarter. Four years in, Sam is comfortable running a full study end to end: recruiting, moderating, and synthesizing without much oversight. Strong note-taking discipline and a growing interest in quantitative survey design.`,
    yearsExperience: 4,
    noteDetail: "permissions research work",
  },
  {
    fullName: "Brandon Kowalski",
    location: "Austin, TX",
    headline: "Account executive, mid-market SaaS",
    summary:
      "Brandon closed $2.1M in net-new ARR last fiscal year at Trellis HR, finishing 134% of quota.",
    resumeText: `Brandon's territory at Trellis HR grew from a cold list to a book of 40 active accounts over three years, and he's finished above 110% of quota in five of his last six quarters. He runs discovery calls that spend more time on the prospect's current process than on the product, which he credits for a shorter average sales cycle than his peers. Comfortable owning the full cycle from first call to contract redlines, and mentoring newer AEs on discovery.`,
    yearsExperience: 8,
    noteDetail: "mid-market quota attainment",
  },
  {
    fullName: "Michelle Osei",
    location: "Chicago, IL",
    headline: "Account executive, mid-market, ex-SDR",
    summary:
      "Michelle was promoted into her first AE seat after two years as a top-performing SDR at Ridgeback Logistics.",
    resumeText: `Michelle closed 118% of quota in her first full year as an AE at Ridgeback Logistics, after two years generating the pipeline she later learned to close herself. She's particular about qualification — she'll walk away from a deal that doesn't have a real budget owner rather than let it sit in the pipeline looking healthier than it is. Strong in MEDDIC-style qualification and comfortable negotiating multi-year contracts.`,
    yearsExperience: 6,
    noteDetail: "SDR-to-AE promotion path",
  },
  {
    fullName: "Diego Fernández",
    location: "Miami, FL",
    headline: "Senior account executive, enterprise expansion",
    summary:
      "Diego spent four years expanding Cascade Wellness' largest accounts, growing the top ten by an average of 40% year over year.",
    resumeText: `Diego's account expansion work at Cascade Wellness turned three single-department pilots into company-wide contracts, each requiring a different internal champion and a genuinely different pitch. He's run full-cycle enterprise deals with sales cycles over nine months and legal reviews that took longer than the actual negotiation. Deep experience with procurement processes, security questionnaires, and the patience multi-stakeholder deals require.`,
    yearsExperience: 10,
    noteDetail: "enterprise account expansion",
  },
  {
    fullName: "Aisha Bello",
    location: "Remote — Lagos, Nigeria",
    headline: "Account executive, outbound-led",
    summary:
      "Aisha built her own outbound pipeline at Amberlane Foods rather than rely on inbound, and still closes at a higher rate than the inbound-fed reps on her team.",
    resumeText: `Aisha's self-sourced pipeline at Amberlane Foods made up 35% of her closed revenue last year, unusual for an AE seat where most reps rely entirely on SDR-passed leads. She attributes her close rate to spending real time on discovery before ever proposing a solution, which she picked up from a manager who wouldn't let her build a proposal until she could explain the prospect's problem back to them unprompted. Comfortable with both outbound prospecting and full-cycle closing.`,
    yearsExperience: 5,
    noteDetail: "self-sourced outbound pipeline",
  },
  {
    fullName: "Connor Sheahan",
    location: "Boston, MA",
    headline: "Account executive, mid-market, vertical SaaS",
    summary:
      "Connor sold into the logistics vertical for four years at Ridgeback Logistics before moving to a broader mid-market book.",
    resumeText: `Connor's vertical expertise in logistics at Ridgeback Logistics meant he could speak credibly to a prospect's operations team, not just their buyer — a distinction that shortened his average sales cycle by roughly three weeks compared to team benchmarks. He's since broadened into a generalist mid-market book and had to relearn how to ramp up domain knowledge quickly on unfamiliar verticals. Strong at multi-threading a deal across economic buyer, champion, and end users.`,
    yearsExperience: 7,
    noteDetail: "vertical SaaS sales experience",
  },
  {
    fullName: "Natasha Petrenko",
    location: "Remote — Warsaw, Poland",
    headline: "Senior account executive, EMEA",
    summary:
      "Natasha built and closed Bluefin Analytics' first EMEA book from scratch, including the first contracts in three new countries.",
    resumeText: `Natasha closed Bluefin Analytics' first contracts in Germany, France, and Poland, each requiring her to learn a different procurement and data-residency expectation before the deal could move. She's comfortable running a deal in a language that isn't her first — she's fluent in four — and has trained two newer AEs on the specific complications of EMEA data protection conversations. Strong multilingual communicator with deep GDPR-adjacent sales experience.`,
    yearsExperience: 9,
    noteDetail: "EMEA sales expansion",
  },
  {
    fullName: "Jordan Michaels",
    location: "Chicago, IL",
    headline: "SDR, outbound, SaaS",
    summary:
      "Jordan is a top-quartile SDR at Halyard Systems, booking an average of 22 qualified meetings a month.",
    resumeText: `Jordan's outbound sequences at Halyard Systems consistently outperform the team benchmark for reply rate, which he attributes to writing every first-touch email himself rather than relying only on the standard template. Two years in, he's already trained one newer SDR on cold-call objection handling. Comfortable with Outreach, Salesforce, and the discomfort of a bad week that doesn't shake his numbers the next one.`,
    yearsExperience: 2,
    noteDetail: "outbound sequence writing",
  },
  {
    fullName: "Emily Castellano",
    location: "Denver, CO",
    headline: "SDR, first sales role out of college",
    summary:
      "Emily's first job out of college is outbound SDR at Practical Habits Co, where she's already the fastest ramp on her team.",
    resumeText: `Emily hit full quota in her second month at Practical Habits Co, faster than the typical four-month ramp for the role, largely by shadowing every AE call she could get invited to in her first two weeks. She's direct about what she doesn't know yet and asks for feedback after every call rather than waiting for a scheduled one-on-one. Comfortable with high call volume and genuinely enjoys the parts of the job most people find tedious.`,
    yearsExperience: 1,
    noteDetail: "fast SDR ramp-up",
  },
  {
    fullName: "Kwame Asante",
    location: "Atlanta, GA",
    headline: "SDR, promoted from support",
    summary:
      "Kwame moved into SDR at Ostrom Robotics after two years in customer support, where he'd already learned the product cold.",
    resumeText: `Kwame's support background at Ostrom Robotics means his discovery calls surface real usage friction, not just budget and timeline — a habit that's made his handoffs to AEs unusually well-qualified. He's three years into a sales career that started somewhat by accident and has decided he wants an AE seat within the next year. Strong product knowledge, solid cold-call fundamentals, and a support rep's instinct for what actually annoys a customer.`,
    yearsExperience: 3,
    noteDetail: "support-to-sales transition",
  },
  {
    fullName: "Bailey Nguyen",
    location: "Remote — US (Pacific)",
    headline: "SDR, inbound and outbound blend",
    summary:
      "Bailey splits time between inbound lead qualification and outbound prospecting at Fernwood Studio.",
    resumeText: `Bailey's inbound qualification process at Fernwood Studio cut the average time-to-first-touch from six hours to under thirty minutes, which alone measurably improved the team's connect rate. On the outbound side, results have been steadier than spectacular, which Bailey is candid about in reviews rather than overselling. Comfortable switching contexts between reactive and proactive prospecting within the same day.`,
    yearsExperience: 2,
    noteDetail: "inbound/outbound sales blend",
  },
  {
    fullName: "Anders Holm",
    location: "Remote — Copenhagen, Denmark",
    headline: "Full-stack engineer, React and Node",
    summary:
      "Anders has shipped both the frontend and the API layer for every product he's worked on, most recently at Loomstack.",
    resumeText: `Anders built Loomstack's customer-facing reporting feature end to end — schema design, API, and the React frontend — because the team was too small to split the work by layer. He's equally comfortable debugging a slow Postgres query and a re-render loop in React, which has made him the person other engineers page first when a bug won't reveal which layer it's in. TypeScript across the stack, Postgres, and a general suspicion of any architecture decision made before the second customer shows up.`,
    yearsExperience: 7,
    noteDetail: "full-stack feature ownership",
  },
  {
    fullName: "Fatima Zahra",
    location: "Remote — Casablanca, Morocco",
    headline: "Full-stack engineer, small teams",
    summary:
      "Fatima has spent her whole career on teams of four or fewer engineers, which means she's never had the luxury of specializing.",
    resumeText: `At Fernbank Systems, Fatima was one of three engineers who built the entire product from a blank repository to its first hundred paying customers, owning everything from the database schema to the onboarding UI. That kind of team forces fast, considered decisions rather than perfect ones, and she's candid that some of those decisions need revisiting now that the product has grown. Node, React, and PostgreSQL, plus the generalist instincts that come from never being able to say "that's not my layer."`,
    yearsExperience: 5,
    noteDetail: "early-stage generalist experience",
  },
  {
    fullName: "Chris Delgado",
    location: "Phoenix, AZ",
    headline: "Full-stack engineer turned technical lead",
    summary:
      "Chris leads a four-person full-stack team at Meridian Grid after five years as an individual contributor across the same stack.",
    resumeText: `Chris's team at Meridian Grid ships both frontend and backend changes in the same pull request when the feature calls for it, a practice he pushed for after watching too many features stall at the API-contract handoff between separate frontend and backend teams. He still writes code most sprints, split roughly evenly between React and Node, and reviews every PR his team ships. Strong technical leadership instincts without having fully left the IC track.`,
    yearsExperience: 9,
    noteDetail: "technical leadership on a small team",
  },
  {
    fullName: "Meera Iyer",
    location: "Remote — Bangalore, India",
    headline: "Full-stack engineer, early-stage startups",
    summary:
      "Meera has worked at two startups before their Series A, both times as one of the first three engineers.",
    resumeText: `At Perigee Data, Meera built the first version of the product's entire self-serve signup flow — frontend, backend, and the billing integration — in six weeks before the company's first sales hire started. She's fast, which she attributes to being comfortable shipping something imperfect and fixing it once real usage data exists rather than over-designing up front. React, Node, Stripe's API, and the instinct for what actually needs to be correct on day one versus what can wait.`,
    yearsExperience: 4,
    noteDetail: "fast early-stage shipping",
  },
  {
    fullName: "Ethan Brooks",
    location: "Remote — US (Eastern)",
    headline: "Backend engineer with a data platform bent",
    summary:
      "Ethan has spent the last three years splitting time between backend services and the analytics pipeline that reports on them at Fieldstone Analytics.",
    resumeText: `Ethan redesigned Fieldstone Analytics' event pipeline after repeated late-night pages for a backfill job that silently dropped records; the replacement uses idempotent writes and has run without a manual backfill since. Before the data-platform move, he spent four years building the core API layer, which gives him unusually good context for how the services generating the data actually behave. Strong in Python, SQL, and Kafka, with production Go experience from his backend years.`,
    yearsExperience: 8,
    noteDetail: "backend-to-data-platform transition",
  },
  {
    fullName: "Ling Zhao",
    location: "Remote — US (Pacific)",
    headline: "Backend and data engineer",
    summary:
      "Ling built the warehouse ingestion layer at Stonebrook Logistics and still owns the backend services that feed it.",
    resumeText: `Ling's dbt models at Stonebrook Logistics became the single source of truth for shipment volume reporting after three teams were previously maintaining their own conflicting spreadsheets. She's just as comfortable in the Rails services that generate the raw shipment events, which has made her the one person who can debug a discrepancy from either direction. dbt, Python, Ruby, and a low tolerance for a metric with two different definitions in two different dashboards.`,
    yearsExperience: 6,
    noteDetail: "warehouse ingestion ownership",
  },
  {
    fullName: "Gabriel Osei-Mensah",
    location: "Remote — Accra, Ghana",
    headline: "Backend engineer, moving into data infrastructure",
    summary:
      "Gabriel spent four years on Willowmere Health's core API before moving to their new data platform team six months ago.",
    resumeText: `Gabriel's first project on Willowmere Health's data platform team was replacing a fragile cron-triggered export script with an Airflow DAG that actually alerts someone when it fails, which had apparently not occurred to anyone in the two years the script had been quietly failing. His four years on the core API mean he understands exactly which upstream services produce dirty data and why. Python, SQL, and enough Airflow experience to be dangerous, by his own description.`,
    yearsExperience: 5,
    noteDetail: "Airflow pipeline reliability work",
  },
  {
    fullName: "Petra Novak",
    location: "Remote — Prague, Czech Republic",
    headline: "Senior backend engineer, distributed systems",
    summary:
      "Petra has spent a decade building backend systems, most recently the event-sourcing core at Cedarwave Robotics.",
    resumeText: `Petra designed Cedarwave Robotics' event-sourcing architecture for their fleet telemetry system, which now processes several million events a day with an audit trail the compliance team specifically asked for. She's led architecture reviews for every major backend decision on her team for the last three years and is known for asking the question nobody else wants to ask about failure modes. Deep expertise in Go, Kafka, and distributed systems design; comfortable presenting trade-offs to non-technical stakeholders.`,
    yearsExperience: 10,
    noteDetail: "event-sourcing architecture experience",
  },
  {
    fullName: "Samuel Adeyemi",
    location: "Remote — Lagos, Nigeria",
    headline: "Backend engineer, payments and data",
    summary:
      "Samuel builds both the transaction services and the reporting pipeline at Talus Payments.",
    resumeText: `Samuel's reconciliation pipeline at Talus Payments catches settlement mismatches within minutes instead of the next day's batch job, which has meaningfully reduced the finance team's month-end close time. He moves fluidly between the Java transaction services and the Python-based reporting layer, which most of his teammates specialize in one or the other. Strong in Java, Python, and SQL, with a genuine interest in financial reconciliation logic most engineers find tedious.`,
    yearsExperience: 7,
    noteDetail: "payments reconciliation pipeline work",
  },
  {
    fullName: "Julia Kowalczyk",
    location: "Remote — Warsaw, Poland",
    headline: "Backend engineer, analytics-adjacent",
    summary:
      "Julia joined Anchorpoint Software as a backend engineer and has increasingly become the go-to person for anything touching the data warehouse.",
    resumeText: `Julia's redesign of Anchorpoint Software's usage-metering service fixed a chronic undercounting bug that had been quietly understating customer usage — and therefore invoices — for months before anyone noticed. She's picked up dbt and warehouse modeling largely on her own initiative, which has made her the informal bridge between the backend team and the two-person data team. Node.js, PostgreSQL, and growing dbt fluency.`,
    yearsExperience: 4,
    noteDetail: "usage-metering bug fix",
  },
  {
    fullName: "Andres Villalobos",
    location: "Remote — Mexico City, Mexico",
    headline: "Backend engineer, high-scale APIs",
    summary:
      "Andres has spent the last five years scaling Vantage Rail Analytics' core API from thousands to tens of millions of daily requests.",
    resumeText: `Andres's caching layer redesign at Vantage Rail Analytics cut median API latency by 60% during a period when traffic had tripled in under a year, buying the team roughly eighteen months before the next scaling conversation. He's since taken an interest in the data platform feeding the same API, because half his recent incidents traced back to a stale materialized view rather than the API layer itself. Go, Redis, PostgreSQL, and increasing comfort with the analytics side of the stack.`,
    yearsExperience: 9,
    noteDetail: "high-scale API caching work",
  },
  {
    fullName: "Nina Sorensen",
    location: "Remote — Oslo, Norway",
    headline: "Backend and analytics engineer",
    summary:
      "Nina splits her time evenly between Harborlight Technologies' backend services and the analytics models built on top of them.",
    resumeText: `Nina's work rebuilding Harborlight Technologies' subscription-billing logic uncovered a proration bug that had been silently undercharging a subset of customers for over a year, and she led both the fix and the customer-facing remediation plan. She maintains the dbt models that turn that same billing data into the metrics finance reports on monthly. Ruby, SQL, dbt, and a habit of tracing a suspicious number all the way back to its source table before trusting it.`,
    yearsExperience: 6,
    noteDetail: "subscription billing fix",
  },
  {
    fullName: "Marcus Lee",
    location: "Remote — US (Mountain)",
    headline: "Staff backend engineer, platform and data",
    summary:
      "Marcus has spent eleven years across backend and data platform roles, most recently as a technical lead at Redshank Freight.",
    resumeText: `Marcus led the effort at Redshank Freight to split a single overloaded Postgres instance into properly bounded services with their own databases, a project that took the better part of a year and touched nearly every team. He's since taken on informal ownership of the analytics warehouse feeding the ops dashboards, partly because he was the only one who understood how the source data was actually structured. Deep PostgreSQL, Go, and data-modeling expertise; comfortable leading multi-quarter technical initiatives.`,
    yearsExperience: 11,
    noteDetail: "database-splitting initiative",
  },
  {
    fullName: "Tariq Hassan",
    location: "Remote — Dubai, UAE",
    headline: "Backend engineer, data pipelines",
    summary:
      "Tariq built the ETL layer connecting Brightline Systems' core product to its reporting warehouse.",
    resumeText: `Tariq's ETL rework at Brightline Systems replaced a set of brittle nightly scripts with an Airflow-orchestrated pipeline that's failed exactly once in eight months, and alerted the right person within minutes when it did. He came up through backend services and still owns two of the product's core APIs alongside the data platform work. Python, SQL, Airflow, and solid production experience in Node.js from his earlier backend-only years.`,
    yearsExperience: 5,
    noteDetail: "ETL reliability work",
  },
  {
    fullName: "Clara Bergström",
    location: "Remote — Stockholm, Sweden",
    headline: "Product designer with a research practice",
    summary:
      "Clara runs her own research before every major design decision at Kindling Learning rather than handing it off to a separate researcher.",
    resumeText: `Clara's redesign of Kindling Learning's course-builder tool was informed by a six-session research sprint she ran and synthesized herself, and the resulting interface cut course-creation time for instructors by nearly half. She treats research and design as one practice rather than a handoff between two roles, which shows in how tightly her recommendations map to what she actually observed in sessions. Figma, moderated usability testing, and survey design for the quantitative side.`,
    yearsExperience: 6,
    noteDetail: "integrated design/research practice",
  },
  {
    fullName: "Malik Johnson",
    location: "Atlanta, GA",
    headline: "Product designer, healthcare",
    summary:
      "Malik designs for Willowmere Health's patient portal, balancing regulatory constraints with an interface patients can actually use.",
    resumeText: `Malik's redesign of Willowmere Health's patient portal login flow cut support calls about account access by 40%, a fix that required negotiating with compliance about exactly how much friction was actually required versus assumed. He runs lightweight usability tests with patients recruited through the clinic rather than relying only on internal stakeholder opinions, which has repeatedly changed decisions the team thought were settled. Figma, accessibility-first design practice, and comfort navigating regulated-industry constraints.`,
    yearsExperience: 5,
    noteDetail: "healthcare portal accessibility work",
  },
  {
    fullName: "Ines Moreau",
    location: "Remote — Paris, France",
    headline: "Senior product designer and researcher",
    summary:
      "Ines has spent eight years moving between pure design and pure research roles, which now shows up as unusually strong instincts in both.",
    resumeText: `At Amberlane Foods, Ines led a research study that reversed the team's assumption about why cart abandonment was high — it wasn't price, it was an unclear delivery estimate — and then designed the fix herself once the insight was clear. She's comfortable being the only researcher in the room during a design review and the only designer in the room during a research readout. Deep Figma skills alongside moderated and unmoderated research methods.`,
    yearsExperience: 8,
    noteDetail: "research-led design reversal",
  },
  {
    fullName: "Theo Nakamura",
    location: "Remote — Tokyo, Japan",
    headline: "Product designer, early career, research-leaning",
    summary:
      "Theo joined Trellis HR as a product designer but has increasingly taken on the team's research work by default.",
    resumeText: `Theo ran Trellis HR's first structured usability study in over a year, recruiting participants himself after realizing no one else was going to, and the findings reshaped a feature the team had already started building. He's still building design craft but has a research instinct that's ahead of his design experience, and he's candid about which of the two he wants to grow into. Figma, basic survey tooling, and genuine curiosity about why users do what they do.`,
    yearsExperience: 4,
    noteDetail: "self-driven usability study",
  },
  {
    fullName: "Sasha Volkov",
    location: "Remote — Berlin, Germany",
    headline: "Product designer, marketplace and two-sided products",
    summary:
      "Sasha designs for both sides of Bluefin Analytics' data marketplace, which means resolving conflicting needs on nearly every project.",
    resumeText: `Sasha's redesign of the seller-facing listing flow on Bluefin Analytics' marketplace increased completed listings by 22%, largely by front-loading the fields buyers actually filtered on and deferring the rest. Designing for a two-sided marketplace means every decision has a trade-off, and Sasha runs a small research pass before most major changes specifically to catch which side is quietly being underserved. Figma, moderated research, and comfort defending trade-offs to stakeholders on both sides.`,
    yearsExperience: 7,
    noteDetail: "two-sided marketplace design work",
  },
  {
    fullName: "Priyanka Deshmukh",
    location: "Remote — Mumbai, India",
    headline: "Staff product designer and researcher",
    summary:
      "Priyanka leads both design and research for Halyard Systems' onboarding experience, a rare dual mandate she's held for three years.",
    resumeText: `Priyanka's onboarding research at Halyard Systems found that new users were getting stuck on a setup step that internal stakeholders considered trivial, and the resulting redesign — informed by both her research and design work — cut time-to-first-value by a third. She mentors two junior designers and reviews research plans for the wider design team even outside her own projects. Deep Figma and research methodology expertise, and a strong point of view on keeping design and research as one integrated practice.`,
    yearsExperience: 9,
    noteDetail: "onboarding research and design work",
  },
  {
    fullName: "Logan Pierce",
    location: "Denver, CO",
    headline: "Sales professional, SDR to AE track",
    summary:
      "Logan is an SDR at Practical Habits Co actively interviewing for AE roles as the next step.",
    resumeText: `Logan has carried an SDR quota at Practical Habits Co for two years, consistently in the top third of the team, and has spent the last six months shadowing AE calls to prepare for the jump to closing. He's built his own tracking system for which discovery questions actually predict a deal closing, which he's shared with newer SDRs on the team. Comfortable with high-volume outbound and increasingly confident running a discovery call solo.`,
    yearsExperience: 4,
    noteDetail: "SDR-to-AE transition prep",
  },
  {
    fullName: "Adaeze Nwosu",
    location: "Remote — Lagos, Nigeria",
    headline: "Account executive, mid-market",
    summary:
      "Adaeze closed 112% of quota last year at Ostrom Robotics after two years building her own outbound pipeline as an SDR there first.",
    resumeText: `Adaeze's internal promotion from SDR to AE at Ostrom Robotics came with a book of accounts she'd partly sourced herself, which shortened her ramp considerably compared to AEs starting from a cold book. She still occasionally works outbound sequences herself when a target account matters enough to warrant it, which is unusual for a closer a year into the seat. Strong full-cycle skills with an outbound instinct most pure-AEs lose over time.`,
    yearsExperience: 6,
    noteDetail: "internal SDR-to-AE promotion",
  },
  {
    fullName: "Marco Bellini",
    location: "Chicago, IL",
    headline: "SDR, considering the AE track",
    summary:
      "Marco has been an SDR at Ridgeback Logistics for eighteen months and is weighing whether to pursue AE or move toward sales operations.",
    resumeText: `Marco's outbound numbers at Ridgeback Logistics are solid but not exceptional, which he's candid about; what stands out more is the CRM hygiene and process documentation he's built that the rest of the SDR team now uses. He's genuinely undecided between the AE path and a sales-ops role, and has been exploring both through side projects. Comfortable with Salesforce administration beyond the basic SDR workflow.`,
    yearsExperience: 3,
    noteDetail: "CRM process documentation",
  },
  {
    fullName: "Hannah Goldstein",
    location: "Boston, MA",
    headline: "Account executive, mid-market SaaS",
    summary:
      "Hannah has carried a closing quota for five years, most recently at Fernwood Studio after two years as an SDR elsewhere.",
    resumeText: `Hannah's territory at Fernwood Studio grew from 15 to 45 active accounts over three years without her ever missing quota by more than a single quarter, which she attributes to disciplined pipeline hygiene more than any single closing technique. She mentors the SDR team on qualification even though it's not formally her responsibility, because a poorly qualified lead costs her time later. Strong full-cycle sales skills and genuine interest in the SDR-to-AE pipeline within a team.`,
    yearsExperience: 7,
    noteDetail: "SDR mentorship habit",
  },
  {
    fullName: "Rafael Torres",
    location: "Miami, FL",
    headline: "SDR, bilingual, LATAM-focused outbound",
    summary:
      "Rafael runs Halyard Systems' Spanish-language outbound motion, a segment the team had no coverage for before he joined.",
    resumeText: `Rafael built Halyard Systems' first Spanish-language outbound sequences from scratch, and the segment now generates enough qualified pipeline that leadership is considering a dedicated LATAM AE seat — which Rafael has made clear he wants. His English-language numbers are solid but not standout; the bilingual outbound work is where he's created the most distinct value. Comfortable with both English and Spanish-language discovery calls.`,
    yearsExperience: 2,
    noteDetail: "bilingual outbound motion",
  },
  {
    fullName: "Chloe Bennett",
    location: "Remote — US (Eastern)",
    headline: "Account executive, expansion-focused",
    summary:
      "Chloe specializes in expanding existing accounts at Amberlane Foods rather than net-new logo acquisition.",
    resumeText: `Chloe's expansion motion at Amberlane Foods grew the average existing account by 28% year over year, built on a habit of scheduling quarterly business reviews that most reps treat as optional. She came up through an SDR seat but moved directly into an expansion-focused AE role rather than a traditional net-new closing seat. Strong account-management instincts and comfortable being the primary relationship owner for a renewal-critical account.`,
    yearsExperience: 5,
    noteDetail: "account expansion motion",
  },
  {
    fullName: "Omar Siddiqui",
    location: "Remote — Toronto, Canada",
    headline: "Senior account executive, technical buyers",
    summary:
      "Omar sells into technical buyers at Solstice Retail, a segment that previously churned reps who couldn't hold a credible technical conversation.",
    resumeText: `Omar's technical background before moving into sales lets him run a credible conversation with a prospect's engineering lead without looping in a solutions engineer for every call, which has shortened his sales cycle noticeably compared to peers on the same team. He started as an SDR five years ago and has been closing for the last three. Comfortable with technical discovery and a track record other reps ask him to shadow.`,
    yearsExperience: 8,
    noteDetail: "technical sales conversations",
  },
  {
    fullName: "Vanessa Kruger",
    location: "Remote — Johannesburg, South Africa",
    headline: "SDR, high outbound volume",
    summary:
      "Vanessa runs one of the highest-volume outbound motions on Northfork Outfitters' SDR team, though her qualification rate lags the team average.",
    resumeText: `Vanessa's outbound activity at Northfork Outfitters consistently leads the team in raw volume, but her meetings-to-opportunity conversion trails the team average, which her manager has flagged as the main growth area in her last two reviews. She's responsive to the feedback and has started using a tighter qualification checklist before booking a meeting rather than optimizing for volume alone. Strong activity discipline; qualification rigor still developing.`,
    yearsExperience: 4,
    noteDetail: "high-volume outbound activity",
  },
  {
    fullName: "Trevor Simmons",
    location: "Remote — US (Central)",
    headline: "Account executive, transitioning from SDR management",
    summary:
      "Trevor briefly managed an SDR team at Cascade Wellness before moving back into an individual-contributor AE seat.",
    resumeText: `Trevor's year managing Cascade Wellness' SDR team gave him unusually good visibility into what makes a lead worth an AE's time, which he's carried into his own closing seat since moving back to an IC role. He's candid that management wasn't the right fit for him yet, and that the AE seat plays more directly to what he's good at. Strong qualification instincts shaped by having managed the function that qualifies for him.`,
    yearsExperience: 6,
    noteDetail: "SDR management experience",
  },
  {
    fullName: "Yasmin El-Sayed",
    location: "Remote — Cairo, Egypt",
    headline: "SDR, recent transfer from customer success",
    summary:
      "Yasmin moved into an SDR role at Bluefin Analytics after two years in customer success, and is exploring the AE path from here.",
    resumeText: `Yasmin's customer success background at Bluefin Analytics means her discovery conversations often surface churn risks and expansion opportunities in the same call, which isn't typical for a rep this early in a sales career. She's a year into the SDR seat and already asking her manager what an AE transition would require. Strong customer empathy and a fast-developing sales process.`,
    yearsExperience: 3,
    noteDetail: "customer-success-to-sales transition",
  },
];

/**
 * Five hand-written notes per job, indexed to match `JOB_DEFINITIONS`. Written directly rather
 * than templated, unlike the candidate/application note frames below: eight jobs is few enough
 * to author individually, and a note about a specific req reads oddly once genericized.
 */
export const JOB_NOTES: string[][] = [
  [
    "Kickoff call with the hiring manager: primary signal is ownership of a schema under real load, not raw years of experience. Willing to be flexible on distributed-systems depth if the schema instincts are strong.",
    "Sourcing update: leaning on referrals and a narrow LinkedIn search for 'backend' plus 'Postgres' rather than a broad job-board post — the last broad post produced mostly frontend-leaning resumes.",
    "Panel calibration note: technical round should weight the migration-design question over the algorithm question — the algorithm question hasn't distinguished strong candidates from weak ones in the last three loops.",
    "Comp benchmarking came back roughly 8% above our original band for the seniority we're targeting; recommending we adjust the band rather than lose candidates at the offer stage.",
    "Two-week pipeline check-in: volume is healthy, screen-to-interview conversion is lower than the last search. Recruiter believes the job post reads more junior than the role actually is.",
  ],
  [
    "Hiring manager wants the take-home exercise replaced with a live pairing session — take-homes have been taking strong candidates a full weekend and we lost two to competing offers during that window last search.",
    "Sourcing note: posting on two frontend-specific job boards in addition to the general careers page; general-board applicants have skewed junior so far.",
    "Panel calibration: accessibility question in the technical round is working well — it's cleanly separating candidates who treat a11y as a checklist from those who treat it as part of the design.",
    "Design partner flagged that the role should mention the one-designer-team structure explicitly in the post; a few candidates in screens assumed a larger design org and were surprised.",
    "Status update: on track, three candidates through onsite, panel feedback consistent across all three so far.",
  ],
  [
    "Search paused this week per engineering leadership — finishing the operational schema this role builds on top of before continuing interviews. Candidates already in process were notified individually.",
    "Sourcing note: strongest response so far has come from candidates with a backend background moving toward data platform work, not from candidates with a pure analytics background.",
    "Panel calibration: dbt-modeling exercise is the right level of difficulty; Airflow-specific questions should stay conversational rather than hands-on given the small applicant pool with direct Airflow experience.",
    "Hiring manager note: open to a slightly more junior hire than originally scoped if the SQL and warehouse-modeling fundamentals are strong, given the mentoring bandwidth on the team right now.",
    "Reminder to reopen outreach to the two candidates who withdrew during the pause once the search resumes — both left the door open for a follow-up.",
  ],
  [
    "Hiring manager (design lead) wants portfolio review to happen before the phone screen this time — too many phone screens last search ended with a portfolio that didn't match the seniority claimed.",
    "Sourcing note: direct outreach to designers with B2B or internal-tools portfolios converting better than the general job-board post.",
    "Panel note: the whiteboard exercise works best when we give the prompt 24 hours ahead rather than cold — candidates arrive with a real point of view instead of improvising on the spot.",
    "Status update: two strong candidates in final rounds; recommend moving quickly on an offer for whichever comes back positive first given how thin the pipeline is at this level.",
    "Note to self: stop scheduling portfolio reviews back to back with no break — reviewers' notes get noticeably thinner on the second one every time.",
  ],
  [
    "Headcount freeze update: this contract role is being folded into the product designer's research practice rather than extended or converted to full-time. Closing the requisition.",
    "Two candidates were in final-round conversations when the freeze hit; both were told directly rather than left to guess from a status change on a portal.",
    "Recruiter note: both candidates responded well to the direct conversation and said they'd be open to a future opening — flagging for a warm re-approach if this reopens.",
    "Retro note: sourcing for contract research roles converts much better through a research-specific community than through the general careers page; worth remembering for the next contract search.",
    "Closing summary: role closed due to budget, not candidate quality — worth stating explicitly in the ATS so this doesn't read as a failed search in future reporting.",
  ],
  [
    "Hiring manager wants a discovery-call roleplay to replace the generic 'walk me through your sales process' question — better signal on how a candidate actually structures a real conversation.",
    "Sourcing note: candidates coming through the SDR-to-AE internal-transfer pipeline are ramping faster than external hires historically have; worth prioritizing those referrals.",
    "Comp note: OTE benchmarking came back in line with our current band, no adjustment needed this cycle.",
    "Panel calibration: reference checks should specifically ask about quota attainment consistency, not just the headline number for a single strong year.",
    "Status update: pipeline is healthy, two offers extended, one accepted and one still deciding as of this week.",
  ],
  [
    "Final update: role filled internally from the support team candidate pool — faster ramp expected given existing product knowledge.",
    "Retro note: the internal candidate outperformed two external finalists specifically on the discovery-oriented cold-call exercise, which surprised the panel given less formal sales experience.",
    "Sourcing note for next search: internal support-to-sales transfers have now worked out twice in a row — worth formalizing as a standing pipeline rather than opportunistic.",
    "Comp note: starting band was fine for the internal transfer; external finalists were asking slightly above band and that was part of the deciding factor.",
    "Closing summary: role closed the same week as offer acceptance; no open action items remaining.",
  ],
  [
    "Draft note from the founder: wants leveling finalized against the current backend and data-platform bands before this goes external, so the manager hire doesn't end up out of line with the team they'd lead.",
    "Internal discussion: considering whether to look internally first, given the platform team's read on what 'real platform experience' actually means in day-to-day terms.",
    "HR note: compensation banding for a first engineering-manager hire needs a fresh benchmark; nothing directly comparable in the current bands.",
    "Founder note: timeline is soft — this isn't urgent enough to rush past getting the leveling and interview process right before it goes live.",
    "Reminder: loop in the three current platform engineers on interview panel design before this opens, since they'll be the ones reporting to whoever we hire.",
  ],
];

/**
 * A hand-written note-body template that substitutes a candidate's name and a short detail
 * phrase, used instead of hand-writing 40 fully independent candidate notes: at 60 candidates,
 * templated substitution with genuinely distinct detail phrases (`CandidateDefinition.noteDetail`)
 * keeps every note grammatically real without the effort of 40 unrelated paragraphs.
 */
export type CandidateNoteFrame = (name: string, detail: string) => string;

/** Ten frames, cycled across the candidates selected to receive a note in `seed-data.ts`. */
export const CANDIDATE_NOTE_FRAMES: CandidateNoteFrame[] = [
  (name, detail) =>
    `${name} came in through a warm referral from someone already on the team, who specifically vouched for their ${detail} — flagging so we route any follow-up through that referrer if ${name} goes quiet.`,
  (name, detail) =>
    `Recruiter note: ${name}'s LinkedIn activity suggests they're actively looking, not just casually browsing, and their ${detail} lines up well with what we need — worth moving faster than the usual timeline.`,
  (name, detail) =>
    `${name} asked directly about how we'd evaluate ${detail} before agreeing to a screen — a good sign they're evaluating fit seriously rather than applying broadly.`,
  (name, detail) =>
    `Reference check on ${name} came back strong, specifically confirming the ${detail} described on their resume — nothing that changes our read on them.`,
  (name, detail) =>
    `${name} mentioned during outreach that they're also interviewing elsewhere for a role with similar ${detail} requirements, with a decision expected soon — flagging so we don't lose them to a slow internal process.`,
  (name, detail) =>
    `Sourcing note: found ${name} through a targeted search on ${detail} rather than an inbound application — a good example of the search working as intended.`,
  (name, detail) =>
    `${name} asked to reschedule twice for reasons unrelated to interest in the role (a family conflict, then a work deadline) — no concern here, and their ${detail} background is still exactly what we're looking for.`,
  (name, detail) =>
    `Quick note: ${name}'s resume undersells their ${detail} relative to how they talked about it live — worth reading the resume as a floor, not a ceiling, for this one.`,
  (name, detail) =>
    `${name} was candid in an early conversation about what they're optimizing for in a next role, which lines up well with their ${detail} — good context for whoever runs the next call.`,
  (name, detail) =>
    `Following up with ${name} next week regardless of outcome — they were generous with their time discussing their ${detail} during a fairly long process and deserve a real answer promptly.`,
];

/**
 * A hand-written note-body template for a note attached to a specific application, substituting
 * a candidate's name and the job title they applied to.
 */
export type ApplicationNoteFrame = (name: string, jobTitle: string) => string;

/** Ten frames, cycled across the applications selected to receive a note in `seed-data.ts`. */
export const APPLICATION_NOTE_FRAMES: ApplicationNoteFrame[] = [
  (name, jobTitle) =>
    `${name}'s application for ${jobTitle} is moving faster than average through the pipeline — recruiter flagged them as a priority candidate internally.`,
  (name, jobTitle) =>
    `Following up with ${name} on the ${jobTitle} application after a week of silence post-screen — second outreach goes out today.`,
  (name, jobTitle) =>
    `Hiring manager asked for a second technical opinion on ${name}'s ${jobTitle} application before proceeding — panel was split enough to warrant it.`,
  (name, jobTitle) =>
    `${name} asked to delay the next round on their ${jobTitle} application by a week due to travel — accommodated, no concern.`,
  (name, jobTitle) =>
    `Reference checks are underway for ${name}'s ${jobTitle} application ahead of a possible offer — expect to hear back by end of week.`,
  (name, jobTitle) =>
    `${name}'s ${jobTitle} application stalled at the offer stage while they weighed a competing offer — checking in today for a decision.`,
  (name, jobTitle) =>
    `Debrief after the panel round on ${name}'s ${jobTitle} application: consistent positive signal across every interviewer, moving to reference checks.`,
  (name, jobTitle) =>
    `${name} withdrew their ${jobTitle} application after accepting a counteroffer at their current company — recruiter left the door open for a future search.`,
  (name, jobTitle) =>
    `Compensation conversation on ${name}'s ${jobTitle} application went smoothly — expectations were within band from the first call.`,
  (name, jobTitle) =>
    `${name}'s ${jobTitle} application was declined after the technical round — feedback was shared directly with the candidate rather than a generic rejection template.`,
];

/**
 * A hand-written interview-feedback template that substitutes a candidate's name and a
 * track-appropriate detail phrase (from `TECHNICAL_DETAIL_PHRASES` and the generic pools below).
 */
export type FeedbackFrame = (name: string, detail: string) => string;

/** Positive and negative feedback frames per `interviews.kind`, cycled in `seed-data.ts`. */
export const FEEDBACK_FRAMES: Record<
  "phone_screen" | "technical" | "onsite" | "final",
  { positive: FeedbackFrame[]; negative: FeedbackFrame[] }
> = {
  phone_screen: {
    positive: [
      (name, detail) =>
        `${name} was clear about why they're looking and what they want next, and had specific questions about ${detail} rather than generic ones. Recommending we move to the next round.`,
      (name, detail) =>
        `Good energy on the call — ${name} came prepared, had clearly read the job post closely, and asked a sharp question about ${detail}. Comfortable moving forward.`,
      (name, detail) =>
        `${name}'s background lines up well with what we need, and their explanation of ${detail} matched what's on the resume almost exactly. No concerns, move ahead.`,
    ],
    negative: [
      (name, detail) =>
        `${name} was vague about ${detail} in a way that didn't match the confidence on the resume, and struggled to give a specific example when I asked for one. Not recommending we move forward.`,
      (name, detail) =>
        `Timeline and compensation expectations don't line up with where this role is banded, and ${name} was upfront about ${detail} being a dealbreaker. Pausing here rather than moving forward.`,
    ],
  },
  technical: {
    positive: [
      (name, detail) =>
        `${name} worked through ${detail} cleanly, narrating trade-offs out loud and adjusting the approach without much prompting when I pushed on edge cases. Strong recommend to continue.`,
      (name, detail) =>
        `Solid technical round — ${name} got to a correct solution for ${detail} and, more importantly, could explain why it was correct when I asked follow-up questions. Move forward.`,
      (name, detail) =>
        `${name} handled ${detail} well and asked good clarifying questions before diving in rather than guessing at requirements. Recommend advancing.`,
    ],
    negative: [
      (name, detail) =>
        `${name} struggled with ${detail} — got to a reasonable starting point but needed heavy hinting to get further, and the explanation of the final approach stayed shallow. Not ready for this round.`,
      (name, detail) =>
        `The approach to ${detail} worked for the happy path but fell apart under the first edge case I raised, and ${name} didn't have a good instinct for why. Recommend we pass.`,
    ],
  },
  onsite: {
    positive: [
      (name, detail) =>
        `Panel was aligned after the onsite — ${name} handled ${detail} well across every conversation, and the concerns from the phone screen didn't show up in person. Strong yes from the group.`,
      (name, detail) =>
        `${name} held up well across a full day of interviews, including ${detail}, and every panelist independently flagged the same strengths. Recommend extending an offer.`,
    ],
    negative: [
      (name, detail) =>
        `Panel was split after the onsite. ${name} did well on ${detail} but two panelists separately raised the same concern about collaboration style, which is enough for me to recommend we don't move forward right now.`,
    ],
  },
  final: {
    positive: [
      (name, detail) =>
        `Good final conversation — ${name} asked sharp questions about ${detail} and about the team's roadmap, which tells me they're evaluating us as seriously as we're evaluating them. Ready to extend an offer.`,
      (name, detail) =>
        `${name} was direct about ${detail}, which made this an easy final conversation. No new concerns; recommend moving to an offer.`,
    ],
    negative: [
      (name, detail) =>
        `${name} raised a concern about ${detail} in the final conversation that we hadn't fully addressed earlier in the process, and I don't think we can resolve it before they need an answer elsewhere. Recommend we don't extend.`,
    ],
  },
};

/** Generic, non-track-specific detail phrases for `phone_screen` feedback. */
export const PHONE_SCREEN_DETAIL_PHRASES: string[] = [
  "their reasons for looking",
  "the scope of this specific role",
  "compensation and timeline expectations",
  "what they're optimizing for in their next role",
];

/** Track-specific detail phrases for `technical` feedback — what was actually assessed. */
export const TECHNICAL_DETAIL_PHRASES: Record<JobTrack, string[]> = {
  backend: [
    "the API rate-limiter design question",
    "the schema migration walkthrough",
    "the incident postmortem discussion",
    "the distributed-systems design prompt",
  ],
  frontend: [
    "the component performance debugging exercise",
    "the accessibility review exercise",
    "the state-management design discussion",
    "the rendering-performance walkthrough",
  ],
  data: [
    "the pipeline backfill design question",
    "the warehouse modeling exercise",
    "the data-quality debugging prompt",
  ],
  design: [
    "the portfolio walkthrough and critique",
    "the whiteboard design exercise",
    "the research-synthesis discussion",
  ],
  research: [
    "the research plan critique",
    "the synthesis walkthrough",
    "the study design discussion",
  ],
  salesAE: [
    "the discovery-call roleplay",
    "the objection-handling roleplay",
    "the mock negotiation exercise",
  ],
  salesSDR: [
    "the cold-call roleplay",
    "the objection-handling roleplay",
    "the qualification exercise",
  ],
};

/** Generic detail phrases for `onsite` feedback — the format doesn't depend on job track. */
export const ONSITE_DETAIL_PHRASES: string[] = [
  "the cross-functional panel",
  "the leadership panel conversation",
  "the peer panel discussion",
  "the stakeholder Q&A round",
];

/** Generic detail phrases for `final` feedback. */
export const FINAL_DETAIL_PHRASES: string[] = [
  "the compensation and timeline conversation",
  "the team roadmap discussion",
  "the growth and leveling conversation",
];

/** Reasons recorded on a transition into `rejected`, reused across many applications on purpose: real ATS rejection-reason fields are short, standardized codes, not bespoke prose per candidate. */
export const REJECTION_REASONS: string[] = [
  "Not enough depth in the core skill area for this role.",
  "Another candidate was further along and we needed to move quickly.",
  "Compensation expectations were outside the approved band for this role.",
  "Interview feedback was mixed enough that we didn't feel confident moving forward.",
  "Role requirements shifted after this candidate entered the pipeline.",
  "Reference check raised a concern significant enough to pause here.",
  "Timeline didn't align with when we needed someone to start.",
  "Background is strong but not the specific fit this particular opening needs.",
];

/** Reasons recorded on a transition into `withdrawn` — always candidate-driven, not a rejection. */
export const WITHDRAWN_REASONS: string[] = [
  "Accepted an offer with another company.",
  "Decided to stay in their current role after a counteroffer.",
  "Timeline no longer worked with their notice period.",
  "Relocating and paused the search.",
  "Pursuing a role closer to their primary skill set.",
];

/** Reasons recorded on a transition into `hired`. */
export const HIRED_REASONS: string[] = [
  "Signed the offer letter.",
  "Accepted the offer and confirmed a start date.",
  "Countersigned after a short negotiation on start date and start-of-year comp.",
];

/** Recruiting-side names used for `applications.stage_transitions.changed_by` and `notes.author`. */
export const RECRUITING_AUTHOR_NAMES: string[] = [
  "Priya Chandrasekaran — Recruiting",
  "Sam Whitaker — Recruiting Coordinator",
  "Jordan Blake — Talent Partner",
  "Morgan Reyes — Recruiting Operations",
  "Devika Rao — Sourcer",
  "Chris Palladino — Recruiting Manager",
  "Aaliyah Brooks — Recruiting Coordinator",
  "Noah Kim — Talent Partner",
];

/** Hiring-manager-side names used as `interviews.interviewer_name`. */
export const INTERVIEWER_NAMES: string[] = [
  "Elena Marchetti — Engineering",
  "Victor Adeyemi — Design",
  "Dana Whitcombe — Founder",
  "Marcus Webb — Engineering",
  "Grace Liu — Data Platform",
  "Tom Reilly — Sales Leadership",
  "Nadia Farouk — Product Design",
];

/**
 * One `applications.extraction` payload's field set, keyed by which (candidate, job) pair it
 * attaches to. `extractedAfterHours` is an offset from that application's `applied_at`, keeping
 * the payload deterministic given `now` like everything else in the dataset.
 */
export interface ExtractionAssignmentDefinition {
  candidateIndex: number;
  jobIndex: number;
  model: string;
  extractedAfterHours: number;
  fields: Record<string, { value: unknown; confidence: number; source: string }>;
}

/**
 * Twelve applications carrying a populated `extraction` payload (AC 4). The set spans entirely
 * high-confidence payloads (indexes 0, 3, 6, 7, 10), payloads containing at least one field below
 * the 0.6 review threshold (indexes 1, 2, 4, 5, 8, 9, 11), and payloads mixing both within the
 * same envelope — so Day 18's review gate has both a passing and a failing case, at more than one
 * granularity, from the first migration onward.
 */
export const EXTRACTION_ASSIGNMENTS: ExtractionAssignmentDefinition[] = [
  {
    candidateIndex: 0,
    jobIndex: 0,
    model: "claude-3-7-sonnet-20250219",
    extractedAfterHours: 6,
    fields: {
      candidateEmail: {
        value: "marcus.whitfield@candidates.talentscout.example",
        confidence: 0.98,
        source: "resume.pdf#page=1",
      },
      yearsExperience: { value: 9, confidence: 0.95, source: "resume.pdf#page=1" },
      currentTitle: {
        value: "Senior Backend Engineer, Talus Payments",
        confidence: 0.93,
        source: "resume.pdf#page=1",
      },
    },
  },
  {
    candidateIndex: 34,
    jobIndex: 0,
    model: "claude-3-7-sonnet-20250219",
    extractedAfterHours: 9,
    fields: {
      candidateEmail: {
        value: "ethan.brooks@candidates.talentscout.example",
        confidence: 0.96,
        source: "resume.pdf#page=1",
      },
      yearsExperience: { value: 8, confidence: 0.55, source: "resume.pdf#page=2" },
      currentTitle: {
        value: "Backend / Data Platform Engineer, Fieldstone Analytics",
        confidence: 0.68,
        source: "resume.pdf#page=1",
      },
    },
  },
  {
    candidateIndex: 34,
    jobIndex: 2,
    model: "gpt-4.1-mini-2025-04-14",
    extractedAfterHours: 10,
    fields: {
      yearsExperience: { value: 3, confidence: 0.38, source: "resume.pdf#page=2" },
      expectedSalaryUsd: { value: 145000, confidence: 0.42, source: "application_form" },
    },
  },
  {
    candidateIndex: 1,
    jobIndex: 1,
    model: "claude-3-7-sonnet-20250219",
    extractedAfterHours: 5,
    fields: {
      candidateEmail: {
        value: "priya.nandakumar@candidates.talentscout.example",
        confidence: 0.97,
        source: "resume.pdf#page=1",
      },
      yearsExperience: { value: 6, confidence: 0.91, source: "resume.pdf#page=1" },
      portfolioUrl: {
        value: "https://priyanandakumar.dev",
        confidence: 0.88,
        source: "resume.pdf#page=1",
      },
    },
  },
  {
    candidateIndex: 11,
    jobIndex: 3,
    model: "claude-3-7-sonnet-20250219",
    extractedAfterHours: 12,
    fields: {
      portfolioUrl: {
        value: "https://isabelduarte.design",
        confidence: 0.89,
        source: "resume.pdf#page=1",
      },
      yearsExperience: { value: 6, confidence: 0.58, source: "resume.pdf#page=1" },
    },
  },
  {
    candidateIndex: 44,
    jobIndex: 3,
    model: "gpt-4.1-mini-2025-04-14",
    extractedAfterHours: 8,
    fields: {
      currentTitle: {
        value: "Product Designer, Kindling Learning",
        confidence: 0.45,
        source: "linkedin.json",
      },
      yearsExperience: { value: 6, confidence: 0.5, source: "resume.pdf#page=1" },
    },
  },
  {
    candidateIndex: 44,
    jobIndex: 4,
    model: "claude-3-7-sonnet-20250219",
    extractedAfterHours: 8,
    fields: {
      yearsExperience: { value: 6, confidence: 0.94, source: "resume.pdf#page=1" },
      researchMethods: {
        value: "moderated usability testing, survey design",
        confidence: 0.92,
        source: "resume.pdf#page=1",
      },
    },
  },
  {
    candidateIndex: 20,
    jobIndex: 5,
    model: "claude-3-7-sonnet-20250219",
    extractedAfterHours: 4,
    fields: {
      quotaAttainmentPercent: { value: 134, confidence: 0.96, source: "resume.pdf#page=1" },
      yearsExperience: { value: 8, confidence: 0.9, source: "resume.pdf#page=1" },
    },
  },
  {
    candidateIndex: 50,
    jobIndex: 5,
    model: "gpt-4.1-mini-2025-04-14",
    extractedAfterHours: 7,
    fields: {
      quotaAttainmentPercent: { value: null, confidence: 0.3, source: "resume.pdf#page=1" },
      yearsExperience: { value: 4, confidence: 0.52, source: "resume.pdf#page=1" },
    },
  },
  {
    candidateIndex: 26,
    jobIndex: 6,
    model: "gpt-4.1-mini-2025-04-14",
    extractedAfterHours: 6,
    fields: {
      yearsExperience: { value: 2, confidence: 0.62, source: "resume.pdf#page=1" },
      meetingsBookedPerMonth: { value: 22, confidence: 0.85, source: "resume.pdf#page=1" },
    },
  },
  {
    candidateIndex: 37,
    jobIndex: 0,
    model: "claude-3-7-sonnet-20250219",
    extractedAfterHours: 5,
    fields: {
      candidateEmail: {
        value: "petra.novak@candidates.talentscout.example",
        confidence: 0.97,
        source: "resume.pdf#page=1",
      },
      yearsExperience: { value: 10, confidence: 0.95, source: "resume.pdf#page=1" },
    },
  },
  {
    candidateIndex: 57,
    jobIndex: 6,
    model: "gpt-4.1-mini-2025-04-14",
    extractedAfterHours: 11,
    fields: {
      yearsExperience: { value: 4, confidence: 0.9, source: "resume.pdf#page=1" },
      meetingsBookedPerMonth: { value: 0, confidence: 0.35, source: "resume.pdf#page=1" },
    },
  },
];

/**
 * One application's `cover_letter` body, keyed by which (candidate, job) pair it attaches to —
 * same keying convention as `ExtractionAssignmentDefinition`.
 */
export interface CoverLetterAssignmentDefinition {
  candidateIndex: number;
  jobIndex: number;
  body: string;
}

/**
 * Twelve applications carrying a populated `cover_letter` (§3.5's RAG-corpus note), spanning all
 * seven job tracks and two candidates (indexes 0 and 11) who also carry an `extraction` payload
 * on the same application, since a real application can have both. Written directly rather than
 * templated: a cover letter is the one document a candidate wrote specifically for this job, so
 * a frame function substituting a name and a job title into a fixed shape would read as obviously
 * fake, defeating the point of seeding a RAG corpus with prose worth retrieving.
 */
export const COVER_LETTER_ASSIGNMENTS: CoverLetterAssignmentDefinition[] = [
  {
    candidateIndex: 0,
    jobIndex: 0,
    body: `I'm applying for the Senior Backend Engineer role because the posting's framing of "a schema decision gets written down with its reasoning" is exactly the kind of team I want to be on. At Talus Payments I spent the better part of two years arguing for, and then executing, the move off a single Rails monolith, and the part I'm proudest of isn't the migration itself but the decision log we kept alongside it — it's saved us more than once when someone asked "why does this table look like this." I'd want to bring that same habit here. Happy to walk through the reconciliation-error work in more detail on a call.`,
  },
  {
    candidateIndex: 3,
    jobIndex: 1,
    body: `I've spent the last three years building and maintaining a design system that four product squads ship against daily, so the idea of joining a two-person frontend team where I'd be shaping the design system from scratch is genuinely exciting rather than daunting. What caught my attention in the posting was the line about performance and accessibility being first-class, not a cleanup pass — that's been my argument at Practical Habits Co for years, not always successfully. I'd welcome the chance to make that case somewhere it's already the stated bar.`,
  },
  {
    candidateIndex: 8,
    jobIndex: 1,
    body: `Ten years into e-commerce frontend, I'm looking for the next hard migration, and the Frontend Engineer posting reads like exactly that: a recruiter dashboard that needs to hold up under real usage, not a green-field toy. I led a six-engineer strangler migration off legacy PHP templating at Fernwood Studio with zero downtime windows, and what I learned there — mostly about sequencing, and about which shortcuts you can't take — is directly applicable to a data-heavy dashboard like the one described. I'd like to talk through how I'd approach the funnel-chart work specifically.`,
  },
  {
    candidateIndex: 11,
    jobIndex: 3,
    body: `Trellis HR's admin console redesign taught me that a confusing B2B interface doesn't just annoy people, it generates support tickets someone has to read every day — so a posting that opens with "recruiters are not a forgiving audience" told me this team already understands the stakes I care about. I run my own usability tests rather than wait for a researcher to be staffed, which the posting explicitly says is welcome here rather than merely tolerated. I'd love to bring the same research-led approach to the funnel and candidate-detail views.`,
  },
  {
    candidateIndex: 14,
    jobIndex: 3,
    body: `I design for other engineers, and a recruiter dashboard used by people juggling dozens of pipelines at once is close enough to the developer-tools work I've done at Halyard Systems that I think I'd ramp quickly. What I'd want to bring specifically is the habit of testing copy against real error and empty states rather than lorem ipsum — the posting's emphasis on shaping the design system from near-zero suggests those decisions haven't been made yet, which is exactly the stage I like joining at. My portfolio has a case study on the deployment-dashboard redesign that I think maps well to this role.`,
  },
  {
    candidateIndex: 18,
    jobIndex: 4,
    body: `I noticed this is a contract role, and I want to be upfront that a fixed-term engagement is genuinely appealing to me right now rather than a compromise — I like the focus a defined scope brings. My work at Cascade Wellness was mixed-methods by necessity: quant surveys to find where to look, qual interviews to understand why. Building a research repository that outlives the project seems to be exactly what this role is asking for, and it's something I've done once already and would want to do again somewhere the team explicitly values it.`,
  },
  {
    candidateIndex: 21,
    jobIndex: 5,
    body: `I was promoted from SDR to AE at Ridgeback Logistics specifically because I was particular about qualification — I'd rather walk away from a deal early than let it sit in the pipeline looking healthier than it is. The posting's note that most pipeline will come from SDR-sourced meetings, with room to build some of my own, is the setup I want: enough structure to focus on closing well, enough room to keep the outbound instincts I built as an SDR. Happy to talk through how I qualify a deal on a call.`,
  },
  {
    candidateIndex: 27,
    jobIndex: 6,
    body: `I'm six months into my first sales role and already the fastest ramp on my team at Practical Habits Co, mostly from shadowing every AE call I could get invited to in my first two weeks — so a posting that says the SDR seat feeds directly into an AE team I could learn from told me this is the kind of environment where I'd keep improving fast. I'm direct about what I don't know yet, which I think matters more early in a sales career than pretending otherwise.`,
  },
  {
    candidateIndex: 30,
    jobIndex: 0,
    body: `Loomstack has been small enough that I've never had the luxury of specializing, so I've built both the API layer and the React frontend for most of what I've shipped there — but this posting is specifically for backend, and that's a deliberate choice on my part: I want to go deep on the schema and migration work rather than keep splitting time. The line about being "the person who gets paged when a stage-transition write fails halfway through" is, for what it's worth, the part of the job I actually enjoy.`,
  },
  {
    candidateIndex: 33,
    jobIndex: 1,
    body: `Both of my previous roles were pre-Series-A, which means I'm used to shipping something imperfect and fixing it once real usage data exists rather than over-designing up front — I think that instinct transfers well to a small team like this one where, per the posting, I'd be working directly with backend engineers on API shape rather than through a spec. I'd want to talk specifically about the natural-language query interface mentioned for later this year; that's the kind of ambiguous, not-yet-scoped work I tend to do well with.`,
  },
  {
    candidateIndex: 36,
    jobIndex: 2,
    body: `I moved from Willowmere Health's core API to their data platform team six months ago, and the thing I didn't expect is how much my four years on the API side helps me now — I know exactly which upstream services produce dirty data and why, instead of discovering it the hard way. The posting's honesty about being paused while the underlying schema work finishes is actually a point in its favor for me; I'd rather join once the foundation is closer to settled than fight both problems at once.`,
  },
  {
    candidateIndex: 45,
    jobIndex: 3,
    body: `Willowmere Health's patient portal work means I've spent years negotiating with compliance about how much friction is actually required versus assumed, which is a specific kind of design problem I don't think shows up in every portfolio review. I run usability tests with real patients recruited through the clinic rather than relying only on internal stakeholder opinion, and I'd want to bring that same discipline to whatever recruiter-facing testing this role needs, even without an in-house research function to lean on yet.`,
  },
];

/**
 * The stage sequence for one of the thirteen shapes an application's history can take, keyed by
 * an internal letter code. The first entry is always `applied`; the last is the application's
 * current stage. See `PATH_COUNTS` for how many of the 90 applications take each shape.
 */
export const PATH_LIBRARY: Record<string, PipelineStageKey[]> = {
  A: ["applied"],
  B: ["applied", "rejected"],
  B2: ["applied", "withdrawn"],
  C: ["applied", "screening"],
  D: ["applied", "screening", "rejected"],
  D2: ["applied", "screening", "withdrawn"],
  E: ["applied", "screening", "interview"],
  F: ["applied", "screening", "interview", "rejected"],
  F2: ["applied", "screening", "interview", "withdrawn"],
  G: ["applied", "screening", "interview", "offer"],
  H: ["applied", "screening", "interview", "offer", "rejected"],
  H2: ["applied", "screening", "interview", "offer", "withdrawn"],
  I: ["applied", "screening", "interview", "offer", "hired"],
};

/**
 * How many of the 90 applications take each `PATH_LIBRARY` shape. The counts are chosen so that
 * funnel reach is strictly decreasing across the non-terminal stages (90 → 73 → 49 → 23), every
 * non-terminal stage has at least one application currently sitting in it, and every terminal
 * stage holds at least one application — see `seed-data.test.ts` for the exact assertions.
 */
export const PATH_COUNTS: Record<string, number> = {
  A: 6,
  B: 10,
  B2: 1,
  C: 10,
  D: 12,
  D2: 2,
  E: 10,
  F: 14,
  F2: 2,
  G: 6,
  H: 4,
  H2: 1,
  I: 12,
};

/**
 * `[min, max]` days-ago range for when an application with the given path first enters `applied`.
 * Sized so that even the slowest random draw of per-stage gaps (`GAP_DAYS_RANGE`) never pushes a
 * later transition past `now` — see the inline reasoning in `seed-data.ts`'s date-planning code.
 */
export const APPLIED_DAYS_AGO_RANGE: Record<string, [number, number]> = {
  A: [5, 10],
  B: [13, 22],
  B2: [11, 20],
  C: [10, 22],
  D: [20, 35],
  D2: [18, 32],
  E: [20, 42],
  F: [30, 58],
  F2: [28, 50],
  G: [30, 58],
  H: [40, 78],
  H2: [38, 72],
  I: [40, 90],
};

/** `[min, max]` day gap before a transition *into* the given stage, relative to the prior transition. */
export const GAP_DAYS_RANGE: Record<PipelineStageKey, [number, number]> = {
  applied: [0, 0],
  screening: [2, 7],
  interview: [3, 10],
  offer: [3, 9],
  hired: [2, 10],
  rejected: [1, 10],
  withdrawn: [1, 8],
};

/**
 * One posting `buildSeedDataset` turns into a `jobs` row. Hand-authored, not templated: AC 1
 * needs prose specific enough to make a RAG corpus meaningful, and `openedDaysAgo`/`closedDaysAgo`
 * are resolved against the builder's `now` rather than baked in, so the seed stays deterministic
 * without hard-coding a calendar date.
 */
export interface JobDefinition {
  title: string;
  department: string;
  location: string;
  employmentType: "full_time" | "part_time" | "contract" | "internship";
  status: "draft" | "open" | "paused" | "closed" | "filled";
  description: string;
  requirements: string;
  openedDaysAgo: number;
  closedDaysAgo: number | null;
}

/**
 * The eight postings the seed's applications, interviews and notes are built against, indexed
 * 0-7 in the order every other content table (`CANDIDATE_GROUPS`, `JOB_TRACK_BY_INDEX`,
 * `JOB_NOTES`) refers to them by.
 */
export const JOB_DEFINITIONS: JobDefinition[] = [
  {
    title: "Senior Backend Engineer",
    department: "Engineering",
    location: "Remote (US)",
    employmentType: "full_time",
    status: "open",
    description: `TalentScout's recruiting platform runs on a relational core that tracks every job, candidate, and application as they move through a hiring pipeline — and that core is what this role owns. You'll design and build the services behind applications, stage transitions, and interview scheduling, working closely with the team shipping the recruiter dashboard and, soon, the LLM-extraction pipeline that reads resumes into structured data.

Day to day, that means: modeling schema changes that won't need a rewrite in six months, writing the migrations and the tests that go with them, and being the person who gets paged when a stage-transition write fails halfway through and something needs to be made right. You'll pair regularly with the frontend and data platform teams, since almost every feature here touches all three.

We're a small engineering team building in the open — every schema decision gets written down with its reasoning, not just its result, and we expect the same from you. You'll have real ownership over a production system from your first week, not a sandboxed corner of it.`,
    requirements: `6+ years building backend services in production, with real ownership of a relational schema you've had to evolve under load. Strong SQL fluency — you should be comfortable writing and reviewing migrations, not just ORMs. Experience with Postgres specifically is a plus but not required. Comfortable owning an on-call rotation and writing the postmortem when something breaks. You don't need prior recruiting-domain experience, but you do need to enjoy modeling a genuinely messy real-world process — a hiring pipeline has a lot of edge cases — into a schema that holds up.`,
    openedDaysAgo: 96,
    closedDaysAgo: null,
  },
  {
    title: "Frontend Engineer",
    department: "Engineering",
    location: "San Francisco, CA (Hybrid)",
    employmentType: "full_time",
    status: "open",
    description: `You'll build the recruiter-facing dashboard that turns the pipeline data behind this job posting — job reqs, candidates, applications, stage history — into something a recruiter actually wants to look at every morning. That includes the funnel charts, the candidate detail views, and eventually the natural-language query interface product is planning for later this year.

This is a small team, so you'll work directly with backend engineers on API shape rather than through a spec handed down to you, and directly with the one product designer on this team rather than through a formal design-review process. Most weeks you'll ship something a recruiter sees the same day.

We care about performance and accessibility as first-class requirements, not a cleanup pass at the end of a project — the dashboard needs to be usable by recruiters on ordinary laptops with ordinary internet, not just on the machine it was built on.`,
    requirements: `3+ years of production React experience, with TypeScript as your default rather than something you're picking up. Comfortable with data-heavy UI — tables, charts, filters — and with the accessibility work that heavy UI tends to skip. Experience with Next.js is a plus. We'll ask you to walk through a real performance or accessibility fix you've shipped, not just describe your process in the abstract.`,
    openedDaysAgo: 88,
    closedDaysAgo: null,
  },
  {
    title: "Data Platform Engineer",
    department: "Engineering",
    location: "Remote (US)",
    employmentType: "full_time",
    status: "paused",
    description: `The same pipeline data that shows up in the recruiter dashboard also needs to feed a funnel-analytics layer and, longer term, a RAG corpus over resumes and interview notes. This role owns the ELT layer that gets it there: warehouse modeling, the transformation pipelines, and the data-quality checks that keep a stale materialized view from quietly becoming everyone's source of truth.

You'd be the first dedicated data platform hire, working closely with the backend team that owns the operational schema and the eventual team building the RAG corpus on top of your models. A lot of the early work is less about scale and more about getting the modeling layer right before dashboards and, later, an LLM start depending on it.

We've paused this search temporarily while we finish the underlying schema work this role would build on top of — the posting stays open because we expect to resume within the quarter and don't want to lose a strong pipeline.`,
    requirements: `4+ years in a data engineering or analytics engineering role, with real experience in dbt or a comparable transformation tool and in an orchestrator like Airflow. Strong SQL and enough Python to build and debug a pipeline end to end. You should have opinions about when a metric belongs in the warehouse versus computed at query time, and be able to defend them.`,
    openedDaysAgo: 70,
    closedDaysAgo: null,
  },
  {
    title: "Product Designer",
    department: "Design",
    location: "New York, NY (Hybrid)",
    employmentType: "full_time",
    status: "open",
    description: `You'd own end-to-end design for the recruiter dashboard — the funnel views, the candidate and application detail screens, and the design system those views are built from. This is currently a one-designer team, so you'll work directly with engineering and with whoever's running research that week rather than through a larger design org's process.

Recruiters are not a forgiving audience for a confusing interface — they're moving fast between dozens of open pipelines, and a screen that makes them think twice costs them real time every day. We're looking for someone who treats that constraint as the interesting part of the job, not an obstacle to a nicer-looking interface.

You'll also be shaping the design system as you go, since almost nothing here has an established pattern yet. Decisions you make in your first few months will show up in how this product looks for years.`,
    requirements: `4+ years of product design experience with a portfolio that shows outcomes, not just polish — we want to see what changed because of your design, not only what it looked like. Comfortable running your own lightweight research rather than waiting for a dedicated researcher to be staffed. Strong Figma craft and component-system thinking. B2B or internal-tools design experience is a plus given the audience here.`,
    openedDaysAgo: 80,
    closedDaysAgo: null,
  },
  {
    title: "UX Researcher",
    department: "Design",
    location: "Remote (US)",
    employmentType: "contract",
    status: "closed",
    description: `This was a six-month contract to run the research backlog behind the recruiter dashboard roadmap — usability testing on the funnel views, interviews with recruiters about how they actually track candidates today, and a research repository the design and product teams could keep using after the contract ended.

The role has since been closed: a headcount freeze during the contract period meant the work was folded into the product designer's existing research practice rather than staffed as a separate contract past its original term. We're leaving this posting's history in place rather than deleting it, since the research questions it was scoped around are still relevant to how this product gets built.`,
    requirements: `3+ years of UX research experience, comfortable moderating your own sessions and synthesizing findings into something a design or product team can act on without you in the room. Survey design experience for the quantitative side is a plus. Recruiting-domain or B2B research experience preferred but not required.`,
    openedDaysAgo: 110,
    closedDaysAgo: 20,
  },
  {
    title: "Account Executive",
    department: "Sales",
    location: "Austin, TX",
    employmentType: "full_time",
    status: "open",
    description: `You'd own full-cycle sales into mid-market talent teams — from a qualified discovery call through to a signed contract — for a product that's still early enough that you'll shape the sales process as much as execute one that's already been figured out. Most of your pipeline will come from SDR-sourced meetings, with room to build some of your own outbound into named accounts if you want it.

Recruiting leaders are a specific buyer: they care about time-to-hire and pipeline visibility more than feature lists, and the reps who do well here are the ones who can run a discovery call around those outcomes rather than a product demo. You'll work closely with the SDR team feeding your pipeline and with the two co-founders, who are still closing some deals themselves and expect to hand more of that off to you over the next two quarters.`,
    requirements: `4+ years of full-cycle SaaS sales experience with a quota-attainment record you can speak to specifically, not just describe generally. Comfortable with a sales cycle that involves multiple stakeholders — recruiting, HR, sometimes finance. Experience selling to HR or recruiting teams is a strong plus but not required if you can show you pick up a new buyer persona quickly.`,
    openedDaysAgo: 92,
    closedDaysAgo: null,
  },
  {
    title: "Sales Development Representative",
    department: "Sales",
    location: "Chicago, IL",
    employmentType: "full_time",
    status: "filled",
    description: `This SDR seat was opened to build outbound pipeline for the Account Executive team — prospecting into mid-market talent teams, qualifying inbound signups, and booking meetings the AE team can actually close. It's since been filled: the successful candidate started from an internal SDR pool and ramped faster than a typical external hire would have, largely because they already knew the product from a prior support role.

We're keeping this listing's history rather than removing it, since the sourcing and interview process behind this hire is the template future SDR searches on this team will follow.`,
    requirements: `1+ years of outbound sales experience, or a strong internship/support background with a clear reason for the move into sales. Comfortable with a high volume of calls and emails and with a good week not always following a bad one. CRM hygiene matters more here than in most SDR roles, since the whole team relies on clean handoff data to the AE side.`,
    openedDaysAgo: 75,
    closedDaysAgo: 8,
  },
  {
    title: "Engineering Manager, Platform",
    department: "Engineering",
    location: "Remote (US)",
    employmentType: "full_time",
    status: "draft",
    description: `This req is still being scoped internally before we open it externally — it would lead the platform team that owns the schema, migrations, and, eventually, the runtime services this entire product depends on, including the backend and data platform roles posted separately. We expect to finalize scope and compensation banding before this goes live to candidates.

The team this role would lead is currently three engineers reporting directly to a founder; this hire is meant to give them a dedicated manager with real platform experience so the founder can step back to product and fundraising work. We're posting the draft now so the interview process and leveling can be reviewed internally before candidates see it.`,
    requirements: `3+ years managing engineers, with prior IC experience in backend or platform engineering — we want someone who can still review a schema design, not just a manager who's fully left technical work behind. Track record of shipping, not just organizing. Experience managing a team through a period of real technical debt, not just steady-state maintenance, preferred.`,
    openedDaysAgo: 6,
    closedDaysAgo: null,
  },
];
