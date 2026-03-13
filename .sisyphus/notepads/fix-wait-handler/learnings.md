Task: Implement robust wait handler in src/handlers/index.ts with supported options (visible, enabled, clickable) and helper checks.

- What I changed:
  - Replaced createWaitHandler with a new implementation that exposes a wait function for DOM selectors.
  - Added internal helpers _waitForVisible and _waitForEnabled.
  - Supported options: timeout, interval, visible, enabled, clickable.
  - Ensured error is thrown when wait times out with a clear message.

- Rationale:
  - The existing code had syntax issues and incomplete wait options. The new implementation is explicit, type-safe, and extensible.

- Verification notes:
  - Build TypeScript to ensure type correctness.
  - Run unit/tests that exercise the wait handler with visible/enabled/clickable combos.
  - Confirm that missing elements throw a descriptive error after timeout.

- Follow-up ideas:
  - Add typings for possible root context variations.
  - Consider adding a lightweight logger for wait progress in future refactors.
