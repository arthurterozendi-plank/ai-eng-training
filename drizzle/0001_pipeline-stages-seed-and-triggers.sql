-- Hand-written: drizzle-orm@0.45.2's unique() cannot express DEFERRABLE and .$onUpdate() emits
-- no DDL (both measured — see docs/specs/ai-34-domain-model.md §2 and §3.2). This migration
-- covers what the schema files therefore cannot: the seven pipeline_stages reference rows, the
-- deferrable uniqueness on their position, and updated_at maintenance for every table that has
-- the column.

-- Reference data: pipeline_stages is a precondition for any applications.stage insert, so it is
-- seeded here rather than by the demo seed script (which never touches this table).
INSERT INTO "pipeline_stages" ("key", "label", "position", "is_terminal") VALUES
  ('applied', 'Applied', 1, false),
  ('screening', 'Screening', 2, false),
  ('interview', 'Interview', 3, false),
  ('offer', 'Offer', 4, false),
  ('hired', 'Hired', 5, true),
  ('rejected', 'Rejected', 6, true),
  ('withdrawn', 'Withdrawn', 7, true)
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint

-- Deferrable so the single most obvious reorder — one UPDATE swapping two stages' positions
-- with a CASE expression — does not fail mid-statement on a duplicate key.
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_position_key" UNIQUE ("position") DEFERRABLE INITIALLY IMMEDIATE;
--> statement-breakpoint

-- Maintains updated_at for the raw UPDATEs Days 5/17 will issue, which .$onUpdate() cannot
-- reach (it is ORM-level only and emits no DDL). Total function of the row, no business
-- semantics — see docs/specs/ai-34-domain-model.md §3.
--
-- `SET search_path = ''` pins name resolution so this function cannot be hijacked by a
-- same-named object created earlier in another schema on the search path (Supabase's linter
-- flags a mutable search_path on every SECURITY INVOKER function for this reason); `now()` is
-- qualified as `pg_catalog.now()` because pinning the search_path to empty means an unqualified
-- built-in no longer resolves.
CREATE FUNCTION "set_updated_at"() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = pg_catalog.now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';
--> statement-breakpoint

CREATE TRIGGER "pipeline_stages_set_updated_at" BEFORE UPDATE ON "pipeline_stages" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "jobs_set_updated_at" BEFORE UPDATE ON "jobs" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "candidates_set_updated_at" BEFORE UPDATE ON "candidates" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "applications_set_updated_at" BEFORE UPDATE ON "applications" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "interviews_set_updated_at" BEFORE UPDATE ON "interviews" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "notes_set_updated_at" BEFORE UPDATE ON "notes" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
