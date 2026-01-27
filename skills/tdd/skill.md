---
name: tdd
description: |
  Test-driven development with strict RED-GREEN-REFACTOR enforcement.
  Recommended for implementing features and bugfixes.
  Use when you want disciplined test-first development.
---

# /memoria:tdd

Strict test-driven development with RED-GREEN-REFACTOR cycle enforcement.

## Invocation

```
/memoria:tdd                 # Start TDD for current task
/memoria:tdd "feature"      # Start TDD for specific feature
/memoria:tdd --continue     # Continue current TDD cycle
```

## Core Principle

**NO EXCEPTIONS. Tests must fail before implementation.**

```
WRONG:
1. Write implementation
2. Write tests
3. "It works!"

CORRECT:
1. Write failing test (RED)
2. See it fail
3. Write minimal code (GREEN)
4. See it pass
5. Improve code (REFACTOR)
6. Confirm still passing
7. Repeat
```

---

## RED Phase (Failing Test)

**Goal: Write a test that fails for the right reason.**

### Steps

1. **Write one test** for one specific behavior
   ```typescript
   it('should return user by ID', () => {
     const user = getUserById(1)
     expect(user.name).toBe('John')
   })
   ```

2. **Run the test** and confirm it fails
   ```bash
   npm test tests/path/to/test.ts
   ```

3. **Verify failure message** is about missing functionality, NOT:
   - Syntax errors
   - Import errors
   - Typos
   - Wrong test setup

### Recording

Add interaction:
```json
{
  "id": "int-XXX",
  "topic": "TDD RED: [behavior being tested]",
  "timestamp": "[ISO8601]",
  "phase": "tdd-red",
  "tddCycle": {
    "testFile": "[test file path]",
    "implFile": "[implementation file path]",
    "phase": "red",
    "testOutput": "[actual test output showing failure]"
  }
}
```

### Commit

```bash
git add tests/path/to/test.ts
git commit -m "test: add failing test for [behavior]

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## GREEN Phase (Minimal Implementation)

**Goal: Write the MINIMUM code to make the test pass.**

### Rules

- **Minimum code only** - just enough to pass
- **No extra features** - YAGNI (You Ain't Gonna Need It)
- **No optimization** - that's for REFACTOR
- **No cleanup** - that's for REFACTOR
- **Hardcoding is OK** - if it passes the test

### Steps

1. **Write minimal implementation**
   ```typescript
   function getUserById(id: number): User {
     // Minimal - hardcoded is OK if test passes
     return { id: 1, name: 'John' }
   }
   ```

2. **Run the test** and confirm it passes
   ```bash
   npm test tests/path/to/test.ts
   ```

3. **Run ALL tests** to check for regressions
   ```bash
   npm test
   ```

### Recording

Add interaction:
```json
{
  "id": "int-XXX",
  "topic": "TDD GREEN: [behavior implemented]",
  "timestamp": "[ISO8601]",
  "phase": "tdd-green",
  "tddCycle": {
    "testFile": "[test file path]",
    "implFile": "[implementation file path]",
    "phase": "green",
    "testOutput": "[test output showing pass]"
  },
  "actions": [
    { "type": "create|edit", "path": "[impl file]", "summary": "[what was implemented]" }
  ],
  "filesModified": ["[impl file]"]
}
```

### Commit

```bash
git add src/path/to/impl.ts
git commit -m "feat: implement [behavior]

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## REFACTOR Phase (Improvement)

**Goal: Improve code while keeping tests green.**

### Allowed Improvements

- Remove duplication
- Improve naming
- Extract helper functions
- Simplify logic
- Improve readability

### NOT Allowed

- Adding new features
- Changing external behavior
- Breaking tests

### Steps

1. **Identify improvement**
   ```
   Before: Duplicated logic in lines 10 and 25
   After: Extract to helper function
   ```

2. **Make change**
   ```typescript
   // Before
   function a() { /* duplicated logic */ }
   function b() { /* duplicated logic */ }

   // After
   function helper() { /* shared logic */ }
   function a() { return helper() }
   function b() { return helper() }
   ```

3. **Run ALL tests** immediately
   ```bash
   npm test
   ```

4. **If tests fail** - revert and try smaller change

### Recording

Add interaction:
```json
{
  "id": "int-XXX",
  "topic": "TDD REFACTOR: [improvement made]",
  "timestamp": "[ISO8601]",
  "phase": "tdd-refactor",
  "tddCycle": {
    "testFile": "[test file path]",
    "implFile": "[implementation file path]",
    "phase": "refactor",
    "testOutput": "[test output confirming still green]"
  },
  "actions": [
    { "type": "edit", "path": "[impl file]", "summary": "[refactoring done]" }
  ]
}
```

### Commit

```bash
git add src/path/to/impl.ts
git commit -m "refactor: [improvement description]

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Strict Rules (NO EXCEPTIONS)

### Prohibited Actions

| Action | Why Prohibited | What to Do Instead |
|--------|---------------|-------------------|
| Write impl before test | Test proves nothing | Delete impl, write test first |
| Skip failing test | No proof it works | Run test, see failure |
| Write test after impl | Already knows the answer | Delete impl, start over |
| "Just this once" exception | Slippery slope | No exceptions ever |
| Manual testing instead | Not reproducible | Write automated test |
| Keep "reference" impl | Temptation to copy | Delete completely |

### Violation Recovery

If you accidentally wrote implementation first:

1. **DELETE the implementation** completely
2. **Write the failing test** first
3. **Run test** - confirm it fails
4. **Re-write implementation** from scratch
5. **Do NOT copy** from deleted code

```bash
# If impl exists without test:
git checkout -- src/path/to/impl.ts  # Discard changes
# Then write test first
```

### When User Resists

If user asks to skip TDD:

```markdown
I understand you want to move quickly, but TDD provides:
- **Confidence**: Tests prove it works
- **Documentation**: Tests show how to use it
- **Safety**: Tests catch regressions
- **Design**: Tests drive good design

The RED-GREEN-REFACTOR cycle takes the same total time
but produces better results.

Shall we proceed with the failing test first?
```

---

## Cycle Summary

```
┌─────────────────────────────────────────────────────────────┐
│                      TDD CYCLE                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────┐      ┌─────────┐      ┌─────────────┐       │
│   │  RED    │ ───> │  GREEN  │ ───> │  REFACTOR   │       │
│   │ (test)  │      │ (impl)  │      │ (improve)   │       │
│   └─────────┘      └─────────┘      └─────────────┘       │
│        │                                    │               │
│        │                                    │               │
│        └────────────────────────────────────┘               │
│                    Next behavior                            │
│                                                             │
│   Commit after each phase                                   │
│   test: → feat: → refactor:                                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Test Quality Guidelines

### Good Tests

```typescript
// Tests ONE thing
it('should return null for non-existent user', () => {
  const user = getUserById(999)
  expect(user).toBeNull()
})

// Clear assertion
it('should increment counter', () => {
  const counter = new Counter()
  counter.increment()
  expect(counter.value).toBe(1)
})
```

### Bad Tests

```typescript
// Tests multiple things
it('should work', () => {
  const user = createUser('John')
  expect(user.name).toBe('John')
  user.setAge(25)
  expect(user.age).toBe(25)
  user.delete()
  expect(user.deleted).toBe(true)
})

// No clear assertion
it('should not throw', () => {
  expect(() => doSomething()).not.toThrow()
  // What does "work" mean?
})
```

---

## Completion

After TDD cycle for a feature:

```markdown
## TDD Cycle Complete

**Behavior**: [what was implemented]

**Cycles completed**:
- RED: [test file] - tests [behavior]
- GREEN: [impl file] - implements [behavior]
- REFACTOR: [what was improved]

**All tests passing**: ✅

**Next steps**:
1. Continue with next behavior (back to RED)
2. Or run `/memoria:review` if feature complete
```
