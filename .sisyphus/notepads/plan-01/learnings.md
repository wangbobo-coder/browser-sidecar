Task: Implement element visibility and interactivity checks in the wait handler.

What I did:
- Added runtime helpers to support visible, enabled, and clickable checks:
  - _waitForVisible(page, selector, timeout)
  - _waitForEnabled(page, selector, timeout)
  - _waitForElementStateIfNeeded(page, selector, opts, timeout)
- Integrated new wait options into createWaitHandler so that requests can specify:
  - visible: wait until element is visible
  - enabled: wait until element is enabled
  - clickable: wait until element is visible and enabled
- Updated wait handling logic in src/handlers/index.ts to invoke these checks.

Verification plan:
- TypeScript build passes with new code paths
- No changes to existing wait behavior unless new options are provided
- Manual smoke test: issue a wait with { visible: true, selector: '#foo' } and ensure it times out or passes as appropriate

Notes:
- All changes are isolated to wait functionality and do not alter existing APIs unless new options are supplied.
