---
description: Guided feature implementation with planning and testing
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
argument-hint: [feature description in Arabic or English]
---

# Implement Feature: $ARGUMENTS

## Phase 1: Understand 🤔

1. **Check project context**
   ```bash
   cat ROADMAP.md
   ```

2. **Clarify requirements**
   - What exactly should this feature do?
   - Who uses it (players, admins)?
   - Any edge cases to consider?
   
   > ASK clarifying questions if anything is unclear before proceeding!

## Phase 2: Plan 📋

3. **Think hard about implementation**
   - Which files need changes?
   - Any new files needed?
   - Database schema changes?
   - What could go wrong?

4. **Propose plan to user**
   ```markdown
   ## Implementation Plan
   
   ### Files to Create
   - [ ] path/to/new/file.js - [purpose]
   
   ### Files to Modify  
   - [ ] path/to/existing.js - [changes]
   
   ### Database Changes
   - [ ] [schema changes if any]
   
   ### Estimated Complexity
   [Low/Medium/High]
   ```

5. **Wait for user confirmation** before coding!

## Phase 3: Build 🔨

6. **Write tests first** (TDD)
   - Create test file if needed
   - Write failing tests for main functionality

7. **Implement the feature**
   - Follow existing patterns
   - Arabic for ALL user-facing text
   - Proper error handling
   - Use Prisma transactions for DB ops

8. **Make tests pass**
   ```bash
   npm test
   ```

## Phase 4: Verify ✅

9. **Run all checks**
   ```bash
   npm run lint
   npm test
   ```

10. **Self-review**
    - Did I add Arabic strings to localization?
    - Did I handle all error cases?
    - Did I clean up resources?

11. **Commit with good message**
    ```bash
    git add .
    git commit -m "feat(scope): description in English

    - Detail 1
    - Detail 2"
    ```

## Standards Reminder

- ✅ Arabic text for users
- ✅ Try-catch on async
- ✅ Prisma transactions
- ✅ deferReply for long ops
- ✅ Cooldowns on commands
- ✅ Tests for new code
