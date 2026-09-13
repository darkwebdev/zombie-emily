---
name: triage-ideas
description: Run unscoped ideas in docs/IDEAS.md through a design pass (the planner subagent) and turn them into GitHub issues, one topic per issue, per the "Where design work lives" convention in CLAUDE.md. Use when the user asks to triage, process, or clear out the ideas backlog.
---

Manually-triggered idea triage. Do not schedule this or run it proactively —
only run it when the user explicitly asks (e.g. `/triage-ideas`, "triage the
ideas backlog", "process docs/IDEAS.md").

## Steps

1. **Read `docs/IDEAS.md`.** Every `##` section except "Moved into design
   discussion" (which is an archival index, not a live idea) is a candidate.
   If `$ARGUMENTS` names a specific idea, process only that one; otherwise
   process every candidate.

2. **Before any new design work, sweep every open issue's comment thread for
   unanswered questions from the user and answer them first.** Run `gh issue
   list --state open`, then for each one pull its comments with `gh issue
   view <number> --comments`. Issues and comments exist specifically so a
   long design conversation doesn't have to be navigated as one hard-to-scroll
   chat thread — an unanswered question sitting in a comment is a broken
   instance of that, not merely unprocessed feedback, whether or not it's
   related to anything currently in `docs/IDEAS.md`. Post the answer via the
   `agent-comment.yml` workflow (see "Who's commenting" in CLAUDE.md) —
   `gh workflow run agent-comment.yml -f issue=<number> -f body="..."` — not
   plain `gh issue comment`, so the reply is attributable to the agent rather
   than indistinguishable from the user's own account, and not only in the
   chat report at the end of this skill. If answering requires design
   judgment rather than a factual lookup, it's fine to route it through the
   `planner` subagent first (as in step 4) and post the subagent's answer —
   but post it.

3. **Check for overlap before spawning any design work on a candidate idea —
   and read the comments, not just the issue bodies.** Skim the existing
   issues this project already has — especially the character-progression
   epic and its children, and the rejected-ideas register. For any issue that
   looks related to a candidate idea, use the comment threads already pulled
   in step 2 (or fetch them now if this issue wasn't open): **the user gives
   feedback on design issues by commenting on them**, so an issue's body
   alone can be stale relative to where the discussion actually landed. Treat
   comments as the higher-authority source when the two disagree — the body
   is the opening position, comments are where it moved.

   Depending on what the comments show:
   - If the user already steered or decided part of what a candidate idea
     covers, don't have the planner re-litigate it from scratch — carry that
     steering into the design pass in step 4 as a constraint, the same way
     this project's own design passes were fed prior rulings mid-stream.
     Overturning a comment made this way is not the triage skill's call.
     Never re-word the user's own comments into third person or otherwise
     restate them as if they were your own reasoning; quote or clearly
     attribute them.
   - If the comments show a topic is already fully resolved, don't spawn a
     new design pass for it — flag it in step 7 as ready to be finalized into
     a doc instead (see "What this skill does NOT do").
   - If a candidate idea substantially duplicates an already-open issue with
     no new angle, don't create a competing thread — fold it into the
     existing issue as a comment, or skip it.

4. **For each remaining idea, delegate a design pass to the `planner`
   subagent** (`subagent_type: "planner"`), the same way `/planner` does.
   Give it the idea's full text from `docs/IDEAS.md`, plus enough project
   context (read the relevant source files yourself first, the way this
   project's design passes have done previously — tuning.ts, the relevant
   entities/systems, CLAUDE.md's invariants) that the subagent can ground its
   design in actual code rather than the abstract, **plus any user comments
   surfaced in step 3** that bear on this idea, stated as decisions the
   design must respect rather than as options still open for debate. Ask it
   explicitly to flag what it's uncertain about and what collides with
   existing invariants, rather than only presenting a clean answer.

   **Run these one at a time — never fan out a batch of planner agents in
   parallel.** Wait for each to finish before launching the next. A batch of
   five Opus subagents launched together once hit the account's session rate
   limit and all died mid-work, leaving issues created but their mandatory
   follow-up comments unposted — inconsistent half-written state across
   GitHub that then had to be audited and repaired. Sequential is slower in
   wall-clock terms but it actually completes. If a run does get interrupted,
   audit GitHub (`gh issue list --state all`, plus per-issue comment checks)
   before re-running anything, so a partially-completed pass isn't duplicated.

   Also: don't spawn a subagent for work the main session can just do. A few
   issue comments that need answering don't need a planner pass each — answer
   them directly unless the design judgment genuinely warrants delegation.

5. **Split the planner's output into GitHub issues, one topic per issue** —
   never one omnibus issue per original idea. Follow the shape already
   established by the character-progression epic
   (issues [#1](https://github.com/darkwebdev/zombie-emily/issues/1)–[#15](https://github.com/darkwebdev/zombie-emily/issues/15)):
   - Each issue is self-contained — readable without this conversation or the
     original IDEAS.md entry.
   - Every issue ends with the standard closing-condition footer:

     ```
     ---

     ## Closing condition

     This issue is the **discussion**. Close it only once the decision it reaches is
     finalized in a document under `docs/`, and that document is referenced from
     CLAUDE.md or the other docs. Shipping the code is not on its own grounds to
     close — the decision has to be written down and linked where a reader will find
     it without reading this thread.
     ```
   - Label issues meaningfully (reuse existing labels — `design`,
     `decision-needed`, `deferred`, `epic`, `phase-N` — creating new ones only
     when nothing existing fits).
   - If the design pass produced more than ~3 issues for one original idea,
     also create (or extend) an epic issue indexing them, matching
     [#15](https://github.com/darkwebdev/zombie-emily/issues/15)'s shape.
   - If the design pass rejected sub-ideas along the way, record them with
     their reasons — either as new entries in the existing rejected-ideas
     register ([#14](https://github.com/darkwebdev/zombie-emily/issues/14))
     if they're closely related, or as their own small issue otherwise. Don't
     let a rejected idea vanish silently; the point of the register is so it
     isn't re-proposed from scratch later.

6. **Update `docs/IDEAS.md`**: remove the processed idea's `##` section and
   fold it into (or extend) the "Moved into design discussion" section with
   links to the new issue(s), matching the file's existing style.

7. **Report back to the user**: which open-issue questions were found and
   answered (with links to the comment replies posted, per step 2), which
   ideas were processed, links to the issues created, any overlaps found and
   how they were handled (skipped / folded into an existing issue), any user
   comments that steered a design pass (say which issue and what they said,
   so it's traceable), any issues whose comment threads show a decision
   already resolved and ready to move into a doc, and anything genuinely
   undecided that needs the user's input before it can go further.

## What this skill does NOT do

- Does not create or manage a cron/scheduled job — triage only runs when
  asked.
- Does not write or finalize `docs/` decision documents — per CLAUDE.md's
  workflow, that only happens once a decision is actually made, which may
  need more back-and-forth with the user than one design pass provides.
- Does not implement any code.
