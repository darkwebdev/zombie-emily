---
name: planner
description: Delegate game design and planning work to an Opus 5 subagent, instead of using the main session's model. Use when the user wants to plan mechanics, scope, or architecture for this 2D game rather than write code.
---

Delegate the requested planning work to the `planner` subagent (defined in `.claude/agents/planner.md`, which runs on Opus 5) rather than answering it directly in the main session.

Steps:
1. Take `$ARGUMENTS` as the planning topic. If empty, ask the user what they want planned.
2. Call the Agent tool with `subagent_type: "planner"` and a self-contained prompt describing the topic, plus any relevant context from the current conversation (e.g. the game concept, prior decisions).
3. Relay the subagent's plan back to the user in full. Do not implement code as part of this skill — planning output only.
