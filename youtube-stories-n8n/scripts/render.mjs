#!/usr/bin/env node
// render.mjs - builds a vertical YouTube Short (1080x1920) from a job file written by n8n.
//
//   node render.mjs /data/work/job-<id>.json
//
// The job file holds: id, title, thumbnail_text, narration, images[] (URLs or local paths),
// audio_base64 (mp3) and alignment (ElevenLabs character timings, optional).
// Output: <workdir>/<id>/video.mp4 and thumb.jpg. Prints a JSON summary on stdout.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const FPS = 30;
const W = 1080, H = 1920;
const FONT = process.env.SUBTITLE_FONT || "Noto Sans Arabic";
const FONTS_DIR = process.env.FONTS_DIR || "/usr/share/fonts";
const KEEP_DAYS = Number(process.env.KEEP_DAYS || 3);

const jobPath = process.argv[2];
if (!jobPath) { console.error("usage: node render.mjs <job.json>"); process.exit(1); }
const job = JSON.parse(fs.readFileSync(jobPath, "utf8"));
const root = path.dirname(jobPath);
const id = String(job.id || Date.now()).replace(/[^\w-]/g, "");
const dir = path.join(root, id);
fs.mkdirSync(dir, { recursive: true });

cleanupOld(root);

const run = (cmd, args) => execFileSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 << 20 }).toString();

// 1. audio
const audio = path.join(dir, "voice.mp3");
fs.writeFileSync(audio, Buffer.from(job.audio_base64, "base64"));
const duration = parseFloat(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", audio]));
if (!(duration > 0)) throw new Error("audio has no duration");

// 2. images
const images = [];
for (const [i, src] of (job.images || []).entries()) {
  const out = path.join(dir, `img${i}.jpg`);
  if (/^https?:/.test(src)) {
    const r = await fetch(src);
    if (!r.ok) throw new Error(`image ${i} download failed: ${r.status}`);
    fs.writeFileSync(out, Buffer.from(await r.arrayBuffer()));
  } else fs.copyFileSync(src, out);
  images.push(out);
}
if (!images.length) throw new Error("no images in job");

// 3. subtitles (ASS, rendered by libass so Arabic shaping and RTL are correct)
const chunks = subtitleChunks(job, duration);
const tail = 0.6; // let the last picture breathe after the voice ends
const total = duration + tail;
fs.writeFileSync(path.join(dir, "subs.ass"), assFile([
  ...(job.title ? [{ start: 0, end: Math.min(2.8, total), text: job.title, style: "Title" }] : []),
  ...chunks.map(c => ({ ...c, style: "Sub" })),
]));

// 4. video: one Ken Burns clip per image, concatenated, subtitles burned in, voice muxed
const seg = total / images.length;
const frames = Math.max(1, Math.round(seg * FPS));
const inputs = images.flatMap(p => ["-i", p]);
const parts = images.map((_, i) => {
  const zoom = i % 2 === 0 ? "min(zoom+0.0009,1.18)" : "if(eq(on,0),1.18,max(zoom-0.0009,1.0))";
  return `[${i}:v]scale=${W * 1.5}:${H * 1.5}:force_original_aspect_ratio=increase,crop=${W * 1.5}:${H * 1.5},` +
    `zoompan=z='${zoom}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=${FPS},setsar=1[v${i}]`;
});
const concat = images.map((_, i) => `[v${i}]`).join("") + `concat=n=${images.length}:v=1:a=0[vc]`;
const subs = `[vc]ass=subs.ass:fontsdir=${FONTS_DIR}[vout]`;
const video = path.join(dir, "video.mp4");
execFileSync("ffmpeg", [
  "-y", "-hide_banner", "-loglevel", "error", ...inputs, "-i", audio,
  "-filter_complex", [...parts, concat, subs].join(";"),
  "-map", "[vout]", "-map", `${images.length}:a`, "-af", `apad=pad_dur=${tail}`,
  "-t", total.toFixed(2), "-r", String(FPS),
  "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", video,
], { cwd: dir, stdio: ["ignore", "inherit", "inherit"] });

// 5. thumbnail: first image with the thumbnail text, same font pipeline
fs.writeFileSync(path.join(dir, "thumb.ass"), assFile([{ start: 0, end: 5, text: job.thumbnail_text || job.title || "", style: "Thumb" }]));
const thumb = path.join(dir, "thumb.jpg");
execFileSync("ffmpeg", [
  "-y", "-hide_banner", "-loglevel", "error", "-i", images[0],
  "-vf", `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},ass=thumb.ass:fontsdir=${FONTS_DIR}`,
  "-frames:v", "1", "-q:v", "3", thumb,
], { cwd: dir, stdio: ["ignore", "inherit", "inherit"] });

for (const f of [...images, audio]) fs.rmSync(f, { force: true });
fs.rmSync(jobPath, { force: true });
console.log(JSON.stringify({ id, video, thumb, duration: +total.toFixed(2), subtitles: chunks.length }));

// ---------------------------------------------------------------------------------------------

function subtitleChunks(job, duration) {
  const words = wordsFromAlignment(job.alignment);
  if (words.length) return group(words);
  // no timings: spread the narration evenly, weighted by word length
  const plain = String(job.narration || "").split(/\s+/).filter(Boolean);
  const weight = plain.reduce((a, w) => a + w.length + 1, 0) || 1;
  let t = 0;
  return group(plain.map(w => {
    const d = duration * (w.length + 1) / weight;
    const o = { text: w, start: t, end: t + d }; t += d; return o;
  }));
}

function wordsFromAlignment(a) {
  if (!a || !Array.isArray(a.characters)) return [];
  const out = []; let cur = null;
  a.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) { if (cur) out.push(cur); cur = null; return; }
    const s = a.character_start_times_seconds[i], e = a.character_end_times_seconds[i];
    if (!cur) cur = { text: "", start: s, end: e };
    cur.text += ch; cur.end = e;
  });
  if (cur) out.push(cur);
  return out;
}

// 2-4 words per caption, breaking early at punctuation, so a line is read at a glance
function group(words) {
  const out = []; let buf = [];
  const flush = () => {
    if (!buf.length) return;
    out.push({ text: buf.map(w => w.text).join(" "), start: buf[0].start, end: buf[buf.length - 1].end });
    buf = [];
  };
  for (const w of words) {
    buf.push(w);
    if (buf.length >= 4 || /[.!?؟،,:؛…]$/.test(w.text)) flush();
  }
  flush();
  // close tiny gaps so captions don't flicker
  for (let i = 0; i < out.length - 1; i++) if (out[i + 1].start - out[i].end < 0.25) out[i].end = out[i + 1].start;
  return out;
}

function assFile(events) {
  const ts = s => {
    const cs = Math.max(0, Math.round(s * 100));
    const h = Math.floor(cs / 360000), m = Math.floor(cs / 6000) % 60, sec = Math.floor(cs / 100) % 60, c = cs % 100;
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
  };
  const esc = t => String(t).replace(/[{}]/g, "").replace(/\r?\n/g, "\\N");
  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,${FONT},84,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,7,2,2,80,80,560,1
Style: Title,${FONT},92,&H0000E1FF,&H0000E1FF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,1,8,3,8,70,70,240,1
Style: Thumb,${FONT},132,&H0000E1FF,&H0000E1FF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,1,10,4,5,70,70,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.map(e => `Dialogue: 0,${ts(e.start)},${ts(e.end)},${e.style},,0,0,0,,${esc(e.text)}`).join("\n")}
`;
}

function cleanupOld(base) {
  const cutoff = Date.now() - KEEP_DAYS * 86400e3;
  for (const name of fs.readdirSync(base)) {
    const p = path.join(base, name);
    try { if (fs.statSync(p).isDirectory() && fs.statSync(p).mtimeMs < cutoff) fs.rmSync(p, { recursive: true, force: true }); } catch {}
  }
}
