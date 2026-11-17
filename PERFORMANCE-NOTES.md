# Performance update — 5 November 2026

- Idle face rendering uses a 24 FPS budget; active speech and music retain a 60 FPS render budget. Other activity uses 30 FPS and reduced motion 8 FPS. Hidden pages skip face drawing.
- Replaced the 60 Hz activity-text polling loop with visibility-aware 100 ms updates (50 ms for active captions). Background status/greeting requests pause.
- Streaming markdown updates are capped around 30 Hz; unchanged draft text is not re-rendered. Hidden drafts repaint when visible again.
- Scroll effects batch element geometry reads before style writes. Removed reveal targets are unobserved, and reveal scans skip streamed bubble internals.
- The dot renderer avoids temporary colour arrays while preserving pixels, checked across four expressions.
- Chess analysis runs in a shared module worker, with job timeouts and stale-board guards. The fallback for browsers without Workers uses a shallow engine. Interrupted view transitions handle their completion promises.
- The 750-skill catalogue is validated once per file version, frozen and cached in a bounded cache. File metadata changes invalidate it; skill-file integrity checks remain in place.
- Static assets use asynchronous file reads, bounded in-memory caching, gzip and ETags/304 revalidation. The allowlist remains in place and changed files invalidate their cache.
- Shared music analysis runs around 30 Hz while active faces keep their 60 FPS rendering budget.

Validation: 43 modules parse; 4 cache checks; 4 rendering/worker checks; 9 installer checks; 9 automatic-skill checks; 14 app regression groups; 7 merged-UI groups; 8 Spotify UI checks; 8 Spotify backend checks; 10 music audio checks; 5 mixed-expression checks. These use local fixtures and simulated providers.

Measurements are in PERFORMANCE-RESULTS.json. Three-second samples cover idle and 300-message conversation scenarios. Treat them as local evidence, not a universal speed guarantee. External model generation and service response times were not benchmarked or changed.
