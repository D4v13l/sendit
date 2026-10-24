# Continue Send It

Read ../README.md, ARCHITECTURE.md, GOOD-OUTSIDE-SETUP.md and VALIDATION.md first, then the README for the component being changed.

This repository contains the Good Outside trip planner and location database, the Trail Desk explorer, and the Adventure Projects SDK. Good Outside is the main product surface. Do not mistake Trail Desk for the entire project. The two apps are independently deployable; a shared database or SDK ingestion bridge between them is not implemented.

Run `npm run data:download` to download and verify four provider snapshots, retaining all 44,692 records and their evidence. Follow setup instructions to provision a separate D1 database and import records. Source snapshots are not a dump of user data or hosted job history. Credentials and schedules must be configured anew.

The SDK is canonical in packages/adventure-projects-client. Trail Desk retains a deployable copy; root sync:client/check:client commands control drift. Its unused trail-ui/server.js still has the original invalid ../src/index.js import; use the standalone package demo or the built Worker.

Preserve National Parks as a Hiking alias, not a park filter; synthetic demo labels; route-versus-area distinctions; unknown access/camping/forecast values; provider licenses; safe staged snapshot completion; and refresh cadence guards. Weather scores are not terrain/access/avalanche safety assessments.

Inspect actual source before proposing changes. Establish which component the next task targets, run relevant tests, and report new verification separately from historical notes. Use the recipient's own deployment configuration. Ask for extracted source if your chat environment cannot clone or read files. Never claim execution or publication without evidence.
