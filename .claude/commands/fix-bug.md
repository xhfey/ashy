---
description: Smart debugging workflow with root cause analysis
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
argument-hint: [bug description or error message]
---

# Debug: $ARGUMENTS

## Phase 1: Reproduce 🔍

1. **Understand the bug**
   - What should happen?
   - What actually happens?
   - When does it occur?

2. **Find related code**
   ```bash
   # Search for relevant files
   grep -r "keyword" src/
   ```

3. **Check recent changes**
   ```bash
   git log --oneline -10
   git diff HEAD~3 --stat
   ```

## Phase 2: Diagnose 🩺

4. **Trace the execution path**
   - Entry point (command/event)
   - Service calls
   - Database operations
   - Response handling

5. **Identify root cause**
   
   Common issues in Ashy Bot:
   
   | Symptom | Likely Cause |
   |---------|--------------|
   | "Interaction failed" | Missing deferReply or >3s response |
   | "Unknown interaction" | Interaction already replied |
   | Coins not updating | Missing transaction |
   | Game stuck | Session not cleaned up |
   | Arabic not showing | String not in localization |
   | "Cannot read property" | Missing null check |

6. **Check logs if available**
   ```bash
   # Look for error patterns
   grep -i "error" logs/
   ```

## Phase 3: Fix 🔧

7. **Write a failing test first**
   - Reproduce the bug in a test
   - This prevents regression

8. **Apply the fix**
   - Fix root cause, not symptoms
   - Follow existing patterns
   - Add defensive checks

9. **Verify the fix**
   ```bash
   npm test
   npm run lint
   ```

## Phase 4: Prevent 🛡️

10. **Add safeguards**
    - Better error messages?
    - Additional validation?
    - Logging for debugging?

11. **Document if complex**
    - Add code comment explaining the fix
    - Update docs if behavior changed

12. **Commit with context**
    ```bash
    git commit -m "fix(scope): short description
    
    Root cause: [what was wrong]
    Solution: [what we did]
    
    Closes #[issue-number]"
    ```

## Debugging Tips

### Discord.js Issues
```javascript
// Check if interaction is still valid
if (interaction.replied || interaction.deferred) {
  await interaction.followUp({ content: '...', ephemeral: true });
} else {
  await interaction.reply({ content: '...', ephemeral: true });
}
```

### Prisma Issues
```javascript
// Always check if record exists
const user = await prisma.user.findUnique({ where: { id } });
if (!user) {
  // Handle missing user
}
```

### Async Issues
```javascript
// Don't forget await!
await someAsyncFunction(); // ✅
someAsyncFunction(); // ❌ Fire and forget bug
```
