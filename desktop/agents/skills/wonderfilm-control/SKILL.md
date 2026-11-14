---
name: wonderfilm-control
description: Control WonderFilm through its local MCP or JSON CLI to import media, edit the visible timeline, save editable projects and export videos. Use for WonderFilm editing workflows, including importing screen recordings.
---

# WonderFilm control

WonderFilm must be open. Enable Ayuda → Integraciones IA → Permitir conexiones
locales. Copy the MCP configuration from that panel: it supplies the executable,
entrypoint and connection file for the active installation/profile. Preserve
ELECTRON_RUN_AS_NODE=1 for the Electron MCP adapter. Never print the connection token.

Discover `capabilities_get` and `tools/list` before composing a recipe. MCP tool
names use underscores; CLI methods use dots. The CLI entry accepts
`--cli METHOD --file arguments.json --request-id UUID`. With Node installed,
run `node <agents/entry.cjs> ...`, setting WONDERFILM_CONNECTION to the exact
absolute connection-file path from the panel. WONDERFILM_CLIENT labels the caller;
it is not an independent security identity.

Input times are seconds; project state uses integer microseconds. Obtain actual
media/track/clip ids from responses. Commands edit the visible project and share
its undo stack; there is no separate agent timeline. Query `project_get` after
operations that may clamp or replace clips. Magnetic mode can close gaps; overlaps
follow the editor's replacement rules. Configure magnetic=false for explicit spacing.

Before replacing a dirty project, save it or obtain user authorization to discard.
`discardChanges` and `overwrite` are explicit, never automatic defaults. File paths
must be absolute and local. Export to a new file, never over a source medium.

`export_start` returns a jobId, not an artifact. Poll `jobs_status` until completed,
failed or cancelled; use `jobs_cancel` to interrupt. Editing is rejected during an
active job. A transport timeout is not proof of failure: inspect project/job state
before retrying; reuse the original requestId for an exact retry within the running
server's bounded cache. Do not blindly replay a sequence of editing commands.

When importing a recording from another tool, wait until that file is complete before import.
Keep originals and the saved .wonderfilm; inspect exported duration, frames, audio
and sync before declaring a deliverable ready. Clean only disposable artifacts from
the authorized temporary folder after verification.

Preview supports reversed video/audio through a temporary, prepared proxy (up to 720p),
removed on normal exit. Gain up to 200% is shared with export. Crossfade, wipe, zoom,
slide and blur overlap held boundary frames without shortening the timeline; fade to
black remains available. Export always reads originals. Preserve source resolution
and frame rate for faithful demos; never inherit effects or 640x360 QA settings.
No transcription, cloud generation, remote web control or arbitrary
script execution. Check capabilities for version-specific limits.
