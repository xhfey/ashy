---
description: Quick code review for recent changes
allowed-tools: Read, Grep, Glob, Bash
---

# Code Review

Review the recent code changes thoroughly.

## Steps

1. **Check what changed**
   ```bash
   git status
   git diff HEAD~1 --stat
   ```

2. **Review each changed file** against these criteria:

   ### 🚨 Critical Checks
   - All user text in Arabic?
   - Error handling on async operations?
   - Prisma transactions for coin operations?
   - No hardcoded secrets?
   
   ### ⚠️ Important Checks
   - TypeScript types (no `any`)?
   - N+1 query prevention?
   - Proper cooldowns?
   - Session cleanup?

3. **Run automated checks**
   ```bash
   npm run lint
   npm test
   ```

4. **Report findings** using severity levels:
   - 🔴 Critical - must fix
   - 🟠 Warning - should fix  
   - 🟡 Suggestion - nice to have
   - ✅ Good - positive feedback

5. **Give verdict**:
   - ✅ Approved
   - ⚠️ Approved with suggestions
   - 🔴 Changes requested
