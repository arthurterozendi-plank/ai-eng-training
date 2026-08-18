CREATE TYPE "public"."application_source" AS ENUM('careers_site', 'referral', 'linkedin', 'job_board', 'agency', 'email', 'import');--> statement-breakpoint
CREATE TYPE "public"."employment_type" AS ENUM('full_time', 'part_time', 'contract', 'internship');--> statement-breakpoint
CREATE TYPE "public"."interview_kind" AS ENUM('phone_screen', 'technical', 'onsite', 'final');--> statement-breakpoint
CREATE TYPE "public"."interview_recommendation" AS ENUM('strong_no', 'no', 'yes', 'strong_yes');--> statement-breakpoint
CREATE TYPE "public"."interview_status" AS ENUM('scheduled', 'completed', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('draft', 'open', 'paused', 'closed', 'filled');--> statement-breakpoint
CREATE TABLE "application_stage_transitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"from_stage" text,
	"to_stage" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"changed_by" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "application_stage_transitions_from_to_distinct_check" CHECK ("application_stage_transitions"."from_stage" IS NULL OR "application_stage_transitions"."from_stage" <> "application_stage_transitions"."to_stage")
);
--> statement-breakpoint
ALTER TABLE "application_stage_transitions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"stage_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" "application_source" DEFAULT 'careers_site' NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cover_letter" text,
	"extraction" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applications_job_id_candidate_id_key" UNIQUE("job_id","candidate_id"),
	CONSTRAINT "applications_extraction_envelope_check" CHECK ("applications"."extraction" IS NULL OR (jsonb_typeof("applications"."extraction") = 'object' AND jsonb_exists("applications"."extraction", 'schemaVersion') AND jsonb_exists("applications"."extraction", 'fields')))
);
--> statement-breakpoint
ALTER TABLE "applications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"location" text,
	"headline" text,
	"summary" text,
	"resume_text" text,
	"resume_url" text,
	"linkedin_url" text,
	"years_experience" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidates_email_unique" UNIQUE("email"),
	CONSTRAINT "candidates_email_lowercase_check" CHECK ("candidates"."email" = lower("candidates"."email")),
	CONSTRAINT "candidates_years_experience_range_check" CHECK ("candidates"."years_experience" IS NULL OR ("candidates"."years_experience" BETWEEN 0 AND 60))
);
--> statement-breakpoint
ALTER TABLE "candidates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "interviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"kind" "interview_kind" NOT NULL,
	"status" "interview_status" DEFAULT 'scheduled' NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer DEFAULT 45 NOT NULL,
	"interviewer_name" text NOT NULL,
	"location" text,
	"recommendation" "interview_recommendation",
	"feedback" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "interviews_duration_minutes_positive_check" CHECK ("interviews"."duration_minutes" > 0)
);
--> statement-breakpoint
ALTER TABLE "interviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"department" text,
	"location" text NOT NULL,
	"employment_type" "employment_type" DEFAULT 'full_time' NOT NULL,
	"status" "job_status" DEFAULT 'open' NOT NULL,
	"description" text NOT NULL,
	"requirements" text,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_closed_after_opened_check" CHECK ("jobs"."closed_at" IS NULL OR "jobs"."closed_at" >= "jobs"."opened_at")
);
--> statement-breakpoint
ALTER TABLE "jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid,
	"candidate_id" uuid,
	"application_id" uuid,
	"body" text NOT NULL,
	"author" text NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notes_exactly_one_parent_check" CHECK (num_nonnulls("notes"."job_id", "notes"."candidate_id", "notes"."application_id") = 1)
);
--> statement-breakpoint
ALTER TABLE "notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pipeline_stages" (
	"key" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"position" integer NOT NULL,
	"is_terminal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pipeline_stages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "application_stage_transitions" ADD CONSTRAINT "application_stage_transitions_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_stage_transitions" ADD CONSTRAINT "application_stage_transitions_from_stage_fk" FOREIGN KEY ("from_stage") REFERENCES "public"."pipeline_stages"("key") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "application_stage_transitions" ADD CONSTRAINT "application_stage_transitions_to_stage_fk" FOREIGN KEY ("to_stage") REFERENCES "public"."pipeline_stages"("key") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_candidate_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_stage_fk" FOREIGN KEY ("stage") REFERENCES "public"."pipeline_stages"("key") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_candidate_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "application_stage_transitions_application_id_occurred_at_idx" ON "application_stage_transitions" USING btree ("application_id","occurred_at");--> statement-breakpoint
CREATE INDEX "applications_candidate_id_idx" ON "applications" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "applications_stage_idx" ON "applications" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "applications_applied_at_idx" ON "applications" USING btree ("applied_at");--> statement-breakpoint
CREATE INDEX "applications_extraction_gin_idx" ON "applications" USING gin ("extraction");--> statement-breakpoint
CREATE INDEX "interviews_application_id_scheduled_at_idx" ON "interviews" USING btree ("application_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "jobs_status_idx" ON "jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "notes_job_id_idx" ON "notes" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "notes_candidate_id_idx" ON "notes" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "notes_application_id_idx" ON "notes" USING btree ("application_id");