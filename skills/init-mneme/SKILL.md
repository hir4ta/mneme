---
name: init-mneme
description: |
  Initialize mneme in the current project by creating .mneme directory structure.
  Use when: (1) setting up mneme in a new project, (2) the project doesn't have .mneme yet.
disable-model-invocation: true
---

# Initialize mneme

<instructions>
Initialize mneme in the current project by running the CLI command.

<required>
- Never overwrite existing user data under `.mneme/` without explicit confirmation.
- Check if `.mneme` already exists first - if so, inform the user it's already initialized.
</required>

Run the following command:

```bash
npx @hir4ta/mneme --init
```

This single command handles all initialization:
- Creates `.mneme/` directory structure (sessions, rules, patterns)
- Copies default tags to `.mneme/tags.json`
- Creates empty rule files (dev-rules.json, review-guidelines.json)
- Creates `.gitignore` for local database files
- Initializes SQLite database at `.mneme/local.db`

After the command completes, confirm success and explain that mneme will now track sessions in this project.
</instructions>
