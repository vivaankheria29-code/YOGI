# YOGI design context

YOGI is a local desktop AI assistant built with vanilla JavaScript, CSS and Node.js. Existing tokens are in `public/style.css`; Core, Glass and Marigold themes have dark/light variants.

The CLI selector reuses existing setting rows, theme tokens, a labelled native select, text fields and a native details disclosure. Preserve visible keyboard focus, mobile stacking and minimum 44px form controls. Use status messages for saves and errors; distinguish an installed CLI from an authenticated provider.

Codex keeps native integrations. Other providers have explicit capability notes instead of a promise of feature parity. The selector introduces no new visual style or runtime UI framework.
