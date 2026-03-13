Health check plan learnings
- Implemented HTTP health server for liveness/readiness on healthPort
- Endpoints:
  - /health returns { status: 'ok', monitoring: getMonitoringSnapshot() }
  - /ready returns { status: 'ready' } if browser connected else 503
