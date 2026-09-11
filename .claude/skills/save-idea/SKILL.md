---
name: save-idea
description: Capture a new, unscoped idea into docs/IDEAS.md via a background subagent, so dropping an idea mid-conversation doesn't interrupt whatever's currently in progress. Use whenever the user states a new idea for the game (e.g. "new idea:", "idea:", "what if we...") without asking for it to be designed right now. The subagent cross-references existing GitHub issues so the idea isn't filed blind, but does not design or resolve it — that's /triage-ideas's job, later.
---

Fast capture, not design. This skill exists so a one-line idea dropped
mid-task doesn't require stopping to do a manual write-up in the main
conversation — that's exactly the interruption this skill avoids.

If it's ambiguous whether the user wants an idea captured versus actually
designed right now, capture it — designing on the spot belongs to
`/triage-ideas` or the `planner` subagent, not here.

## Steps

1. Take the idea as stated in the user's message (or `$ARGUMENTS`) as the
   idea text, verbatim.

2. Spawn a subagent (Agent tool, default type — **not** `planner`/Opus; the
   deep design pass belongs to `/triage-ideas`, this is just capture) with a
   self-contained prompt that:
   - Gives it the idea text verbatim, attributed to the user.
   - Tells it to read `docs/IDEAS.md` in full first, and match its existing
     tone and structure exactly: a short paragraph describing the idea,
     then — where relevant — bullet points naming *specific* real tensions
     with prior decisions, each linking a GitHub issue number. Never a firm
     resolution; resolving it is out of scope for this step.
   - Tells it to find and read in full the "Rejected ideas register" issue
     (`gh issue list --state all`, match by title) — a meaningful fraction
     of new ideas turn out to overlap with something already rejected there,
     and it's the single most likely place to find that overlap.
   - Tells it to skim `gh issue list --state all` and actually read
     (`gh issue view <n>`, not just the title) any issue that looks
     plausibly related, rather than guessing from titles alone.
   - Tells it to add exactly one new `##` section to `docs/IDEAS.md`,
     inserted immediately before the "Moved into design discussion" section
     (matching the file's existing order), **re-reading the file's current
     on-disk content immediately before writing** — this narrows, though
     doesn't eliminate, the chance of clobbering another idea filed
     concurrently (see "Known limitation" below).
   - Tells it explicitly **not** to: create or modify any GitHub issue,
     touch any file outside `docs/IDEAS.md`, or commit/push anything. This
     step is capture only.
   - Tells it to report back the heading it used and a one-line summary of
     the tensions it flagged (or "none found, looks genuinely novel").

3. Let the subagent run in the background. Don't wait on it before
   continuing whatever else was in progress or responding to the rest of
   the user's message. Relay its short report back once it completes —
   the heading and the tensions found, not the full entry text.

## Known limitation

If two ideas are dropped in quick succession, their subagents can race on
`docs/IDEAS.md`: each reads the file near the start of its run and writes
near the end, so a second write can clobber a first one filed in between.
Re-reading immediately before writing (above) narrows this window but
doesn't close it. Nothing here commits automatically, so a lost update is
recoverable — a `git diff` before committing will show if an entry is
missing.

## What this skill does NOT do

- Does not design or resolve the idea, or judge whether it's a good one.
- Does not create GitHub issues — that's `/triage-ideas`.
- Does not commit or push.
