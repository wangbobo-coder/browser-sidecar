# Sidecar Kubernetes Template Learnings
- Implemented a Kubernetes Pod template with two containers in a dedicated namespace:
  - mcp-server (Node.js 20.x) listening on port 3001
  - browser (Playwright base image) for browser automation
- Shared storage via emptyDir mounted at /shared/sessions for session persistence
- Pod-level health checks: livenessProbe and readinessProbe for both containers
- Security context enforcing non-root execution for both containers
- Resource requests/limits:
  - mcp-server: 256Mi request, 512Mi limit
  - browser: 1Gi request, 2Gi limit
- No MCP protocol ports exposed externally; no privileged containers
- Namespace created: sidecar-namespace; Pod scoped to this namespace

Context: Ongoing work follows the Sidecar pattern with separate browser instances per container.
- Fix TS6133 in tests/session.test.ts by prefixing unused crypto mock parameters with underscore
- Context: Unused parameters in crypto mock caused TypeScript error during typecheck
- Action taken: Updated mocks to use _algorithm, _key, _iv in createCipheriv and createDecipheriv
- Verification: npm run typecheck passes with no new TS6133 errors
- Implemented a safe reset mechanism for a crypto plaintext queue in tests/session.test.ts to ensure test isolation between tests.
- Added a global reset function exposed by the crypto mock and invoked in beforeEach to clear state pre-test.
- Verified by running npm test; recommended follow-up checks if environment differs (e.g., ensure deleteSession non-existent test handles ENOENT gracefully in code).
- Added a deterministic crypto mock in tests/integration.test.ts to align with session.test.ts for AES-GCM-like behavior. This ensures encryption/decryption steps do not introduce nondeterminism in integration tests.
## Benchmark Test Added
- Created tests/benchmark.test.ts to measure login flow duration using console.time and console.timeEnd, following the same setup as tests/integration.test.ts. The test is skipped by default to avoid impacting the normal test suite.
- Modified tests/benchmark.test.ts: removed test.skip wrapper to enable default execution of the login flow benchmark.
- Rationale: Ensure login flow performance is measured as part of regular test runs.
- Verification notes:
  - Run the test suite and confirm that the benchmark test executes (no skip) and prints timing via console.time/console.timeEnd as in the test body.
  - Confirm the test passes under CI with timing output visible in logs.
- Added exact Playwright mock from integration tests to benchmarks to ensure browser simulation returns the expected dashboard URL.
- This aligns benchmark tests with integration tests for deterministic behavior during login-flow simulations.
- Verification plan: benchmark.test.ts should pass and output timing information; lsp diagnostics should be clean after changes; build should succeed.
