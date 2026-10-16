# Candidate profile — how to tell it is broken

Covers `/candidates/[id]` and `GET /api/candidates/[id]`. Why it behaves this way is in
[Failure handling](../../README.md#failure-handling); how it was built is in
[the AI-47 spec](../specs/ai-47-harden-candidate-profile.md).

## Symptoms a recruiter sees

- "We could not load this candidate just now" with a **Reference** id means the database read
  failed. Nothing was lost; the page retries on "Try again".
- "Loading this candidate took too long" with a **Reference** means the database answered nothing
  within 5 s.
- "Something went wrong showing this candidate" with a **Reference** means a render error after a
  successful load, which is a bug rather than an outage.

## Checks, in order

1. `curl -i <app>/api/status`.
   - `200 {"status":"ok","database":"ok"}` means the database is reachable, so look for a bug.
   - `503 {"database":"unreachable"}` means the database is down or refusing.
   - `503 {"database":"timeout"}` means it is up but too slow.
   - A bare `500` HTML page means the app's own config failed to load. Check `DATABASE_URL`.
2. Search the server log for the **Reference** the recruiter quotes. Each failure is one JSON line:
   `{"level":"error","message":"GET /api/candidates/[id] failed","correlationId":"<ref>","error":{…},"candidateId":"…"}`.
   Page failures log `"/candidates/[id] failed to load the candidate"`. A boundary reference is
   Next's own digest and appears in Next's own error log line.
3. The API returns `500` with the same `correlationId` in its body, so a scripted caller can quote
   it too.
