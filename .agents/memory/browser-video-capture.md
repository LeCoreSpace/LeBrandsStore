---
name: Browser video capture
description: Native video recording can fail on the remote capture browser despite local FFmpeg being available
---
The remote capture browser may lack Playwright's bundled FFmpeg executable.
The workspace's working FFmpeg does not prove native remote `recordVideo` will work.

**Why:** Native recording failed during the real wizard capture; a Playwright-driven
Chrome CDP screencast successfully captured actual compositor frames instead.

**How to apply:** If native recording reports missing FFmpeg, use actual CDP
screencast frames with their timestamps, preserving pauses, then encode locally.
Do not replace the requested recording with invented UI or a screenshot slideshow.
Extract the poster from the final encoded recording's first frame, not a later
settled screenshot.

Capture encoders should resolve an image library's package exports rather than
assume its historical internal entrypoint.

**Why:** An installed Sharp upgrade moved its JavaScript entrypoint; an older
internal-path import failed even though the package and encoding support existed.

**How to apply:** Check the installed package's exports before reusing an older
capture utility. Do not assume a missing internal file means the library needs
to be reinstalled.
