Plan: optimize-session-logs

- What was done:
  - Updated src/session/index.ts to reveal full filePath only under debug/development, keep minimal info otherwise.
  - Implemented conditional logging for three log points: Session saved, Session restored, Session deleted.
  - Verified with npm run build and npm run typecheck; both succeeded.

- Verification:
  - Build: pass
  - Typecheck: pass
  - LSP diagnostics: not run due to environment limitations

- Next steps:
  - If any CI checks require further log verification, adjust log levels per env and add tests around logging behavior.
