# Learnings: WaitOptions type safety enhancement
- Change: Added new boolean fields to WaitOptions: visible, enabled, clickable with JSDoc comments.
- Rationale: Align type definitions with createWaitHandler usage and reduce as any access to these fields.
- Approach: Directly extended WaitOptions interface in src/types.ts (backwards compatible).
- Validation: Built and typechecked successfully after change.
- Next steps: If future enhancements are needed for combinations of these flags, consider adding a small TS helper type or a runtime validator.
