---
name: Browser video capture
description: Remote capture-browser encoder and decoder limitations differ from the local workspace
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

The remote testing browser may support VP8/Opus WebM but not H.264/AAC MP4.
Check its codec capabilities before interpreting a video-preview failure.

**Why:** A valid MP4 confirmed by local FFprobe could not be decoded remotely;
the remote browser reported no MP4 codec support but did support WebM.

**How to apply:** Use a supported WebM source when testing browser transcoding.
Also verify the honest original-upload path for an unsupported decoder. Do not
reject valid merchant MP4 uploads or weaken server-side file validation merely
to accommodate the testing browser.
