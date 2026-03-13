Resource monitoring added to TCPServer (memory usage, CPU usage) with periodic sampling.
- Memory usage captured via process.memoryUsage(): rss, heapTotal, heapUsed, external.
- CPU usage captured via process.cpuUsage() and time delta; computes a CPU percent over the sampling interval.
- Samples stored in-memory (history) with a default window of 60 samples.
- Health endpoint exposure: attempts to attach /health route if an HTTP layer (Express-like app) is present; returns latest snapshot and history.
- Monitoring starts when TCPServer.start() is called and cleans up on shutdown.

Notes: The solution avoids modifying non-monitoring logic; no new dependencies added. Uses existing Node APIs.
