<explicit_instructions type="workflow-prime.md">
<task name="Prime">

<task_objective>
Orient an agent to this repository by inventorying tracked files and recent git history, then loading the repo’s key docs and entrypoints into context (README, ai_docs, package.json, core scripts). Output a concise Markdown summary in chat that captures the project’s purpose, how to run it, key conventions/philosophies, and recommended next steps.
</task_objective>

<detailed_sequence_steps>
# Prime - Detailed Sequence of Steps

## 1. Define / validate scope
1. Confirm the user’s intent for priming (what kind of orientation they want: quick overview vs. deeper architecture).
2. Confirm expected output format: **Markdown summary in chat** with headings and bullets.
3. Confirm target docs/entrypoints are:
   - `README.md`
   - `ai_docs/*.md`
   - `package.json`
   - `dolph.ts`, `setup-db.ts`, `test-agent.ts`

## 2. Inventory repo (history + surface area)
1. Use `execute_command` to run:
   - `git ls-files`
   - `git log -n 20 --oneline`
2. (Optional) If the repo appears large/complex, ask whether to narrow focus to a sub-area.

## 3. Gather inputs (load into context)
1. Use `read_file` to read:
   - `README.md`
   - `package.json`
   - `dolph.ts`
   - `setup-db.ts`
   - `test-agent.ts`
2. Use `read_file` to read each file in `ai_docs/`:
   - `ai_docs/bun-single-file-scripts.md`
   - `ai_docs/openai_quick_start.md`
   - `ai_docs/uv-single-file-scripts.md`

## 4. Synthesize understanding
1. Extract and organize:
   - What this repo is / what problem it solves
   - How to run it (scripts, env, commands)
   - Key entrypoints and their responsibilities
   - Conventions / philosophy / “how we work here” guidance
   - Risks, gotchas, and places to be careful
2. Identify the top 3–7 “next steps” an agent should take depending on their likely task type.

## 5. Report
1. Provide a Markdown summary in chat with headings (suggested):
   - **Repo purpose**
   - **How to run / scripts**
   - **Key entrypoints**
   - **Conventions & philosophy**
   - **Gotchas / sharp edges**
   - **Next steps checklist**
2. Keep it concise but actionable; link claims back to the docs/files you read when helpful.

</detailed_sequence_steps>

</task>
</explicit_instructions>
