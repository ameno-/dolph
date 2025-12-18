<explicit_instructions type="workflow-template.md">
<task name="Workflow Template">

<task_objective>
Describe in 1–3 sentences what this workflow achieves, including:
- Inputs (files/dirs/commands)
- Processing (what the agent does with those inputs)
- Outputs (what gets produced)
</task_objective>

<detailed_sequence_steps>
# Workflow - Detailed Sequence of Steps

## 1. Define / validate scope
1. Use `ask_followup_question` to confirm the goal, constraints, and expected output format.
2. Use `list_files` and/or `search_files` to confirm relevant files exist.

## 2. Gather inputs
1. Use `execute_command` for any required non-destructive commands (e.g., listing files, printing version info).
2. Use `read_file` to load required docs/code into context.

## 3. Produce outputs
1. Use `attempt_completion` to deliver the final output and confirm any files created/changed.

</detailed_sequence_steps>

</task>
</explicit_instructions>
