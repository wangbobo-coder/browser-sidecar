Decision log:
- Use explicit guards for possibly undefined objects in server-side handler code.
- Replace bare localStorage usage inside Playwright page.evaluate with window.localStorage to satisfy TypeScript checks.
- Remove unused DEFAULT_CONFIG import to resolve TS6196.
- No behavioral changes beyond type-safety improvements.
