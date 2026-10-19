# Placebo demo video

Source of the README walkthrough, built with [Remotion](https://www.remotion.dev) so it can be re-rendered whenever the CLI or the report changes. Every terminal line comes from a real trial (`t_launch1` and `t_version1`). The browser shows a full-page capture of the real `report.html`.

```bash
cd demo
npm install          # remotion, react
npm run all          # bundle, render the MP4, then build the README GIF from it (scripts/make-gif.sh)
npm run studio       # live preview while editing
```

To refresh the report capture, render `trials/<trial>/report.html` at 1440 px wide, deviceScaleFactor 2, full page, into `public/report.png` (and `public/report-open.png` with the first task expanded).
