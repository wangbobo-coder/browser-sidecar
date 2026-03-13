Plan learned:
- Record config-driven changes for runtime tunables to avoid hard-coded values.
- Use default values when optional config is not provided to maintain backward compatibility.
- Validate by running build and type checks after changes.

Notes:
- Updated src/types.ts and src/server.ts to pull monitor settings from ServerConfig.
- Default values chosen to align with previous behavior (1000 ms, 60 samples).
