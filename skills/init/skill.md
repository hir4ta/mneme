---
name: init
description: Initialize memoria in the current project
user-invocable: true
---

# Initialize memoria

<instructions>
Create the `.memoria` directory structure in the current project.

1. Check if `.memoria` already exists - if so, inform the user it's already initialized
2. Create the directory structure:
   - `.memoria/sessions/`
   - `.memoria/rules/`
   - `.memoria/patterns/`
3. Copy default tags from the plugin's `hooks/default-tags.json` to `.memoria/tags.json`
4. Create empty rules files:
   - `.memoria/rules/dev-rules.json`
   - `.memoria/rules/review-guidelines.json`

Use this JSON template for the rules files:
```json
{
  "schemaVersion": 1,
  "createdAt": "<current ISO timestamp>",
  "updatedAt": "<current ISO timestamp>",
  "items": []
}
```

After creation, confirm success and explain that memoria will now track sessions in this project.
</instructions>
