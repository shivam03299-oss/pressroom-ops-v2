// POST /api/hashway-ops-render-image
//   headers: Authorization: Bearer <supabase access token>  (founder only)
//   body:    { task_id, slide_index? }   // slide_index defaults to 0
//
// Reads the creative task's payload.slides[slide_index] which contains
//   { source_image_url, aspect: "4:5" | "1:1" | "9:16", crop_hint?: "top" | "center" | "bottom" }
// fetches the source product photo, resizes/crops with sharp to IG-ready
// dimensions, uploads to Supabase Storage, returns a signed URL.
//
// Lazy rendering — only renders when the founder expands the card or
// hits "Generate preview". Keeps the agent run fast.
//
// Output sizes:
//   4:5 (single post)      → 1080 x 1350
//   1:1 (square post)      → 1080 x 1080
//   9:16 (story / reel)    → 1080 x 1920

import sharp from "sharp";
import { sb, authedFounder, SUPABASE_URL, SUPABASE_SERVICE_ROLE } from "./_hashway-ops-shared.js";

const BUCKET = "hashway-ops-creative";

const ASPECT_DIMS = {
  "4:5":  { w: 1080, h: 1350 },
  "1:1":  { w: 1080, h: 1080 },
  "9:16": { w: 1080, h: 1920 },
};

// Upload a Buffer to Supabase Storage and return { path, signedUrl }
async function uploadToStorage(path, buffer, contentType = "image/jpeg") {
  // Upload via raw REST
  const upRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: buffer,
  });
  if (!upRes.ok) {
    const errText = await upRes.text().catch(() => "");
    throw new Error(`Storage upload failed (${upRes.status}): ${errText}`);
  }

  // Sign URL (1 hour validity — refresh on each open)
  const signRes = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${path}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expiresIn: 3600 }),
  });
  if (!signRes.ok) {
    const errText = await signRes.text().catch(() => "");
    throw new Error(`Sign URL failed (${signRes.status}): ${errText}`);
  }
  const signed = await signRes.json();
  return {
    path,
    signed_url: `${SUPABASE_URL}/storage/v1${signed.signedURL || signed.signedUrl || ""}`,
  };
}

async function fetchImageBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`source image fetch failed (${res.status}): ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function renderSlide({ sourceUrl, aspect, cropHint = "center" }) {
  const dims = ASPECT_DIMS[aspect] || ASPECT_DIMS["4:5"];
  const input = await fetchImageBuffer(sourceUrl);

  // sharp .resize with `fit: cover` crops to fill the target aspect.
  // position controls where we cut from for non-matching aspect ratios.
  const position = cropHint === "top" ? "top" : cropHint === "bottom" ? "bottom" : "center";

  const out = await sharp(input)
    .rotate()                                    // honor EXIF orientation
    .resize(dims.w, dims.h, { fit: "cover", position })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();

  return { buffer: out, contentType: "image/jpeg", ext: "jpg" };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    await authedFounder(req);
    const { task_id, slide_index = 0 } = req.body || {};
    if (!task_id) return res.status(400).json({ error: "missing task_id" });

    const tasks = await sb(`hashway_ops_tasks?id=eq.${encodeURIComponent(task_id)}&select=*`);
    const task  = tasks?.[0];
    if (!task) return res.status(404).json({ error: "task not found" });

    const slides = task.payload?.slides;
    if (!Array.isArray(slides) || slides.length === 0) {
      return res.status(400).json({ error: "task has no payload.slides[] — not a renderable creative task" });
    }
    const slide = slides[slide_index];
    if (!slide) return res.status(400).json({ error: `slide_index ${slide_index} out of range (${slides.length} slides)` });

    const sourceUrl = slide.source_image_url;
    if (!sourceUrl) return res.status(400).json({ error: "slide has no source_image_url" });

    const { buffer, contentType, ext } = await renderSlide({
      sourceUrl,
      aspect:   slide.aspect || task.payload?.aspect || "4:5",
      cropHint: slide.crop_hint,
    });

    const path = `${task.id}/slide-${slide_index}.${ext}`;
    const { signed_url, path: storedPath } = await uploadToStorage(path, buffer, contentType);

    // Patch the task payload so we cache the storage path
    const newSlides = [...slides];
    newSlides[slide_index] = { ...slide, rendered_path: storedPath, rendered_at: new Date().toISOString() };
    await sb(`hashway_ops_tasks?id=eq.${encodeURIComponent(task_id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ payload: { ...task.payload, slides: newSlides } }),
    });

    return res.status(200).json({
      ok: true,
      slide_index,
      signed_url,
      path: storedPath,
      width:  ASPECT_DIMS[slide.aspect || task.payload?.aspect || "4:5"].w,
      height: ASPECT_DIMS[slide.aspect || task.payload?.aspect || "4:5"].h,
    });
  } catch (e) {
    const msg = e?.message || String(e);
    const status = /founder-only|missing bearer|invalid token/.test(msg) ? 401 : 500;
    return res.status(status).json({ error: msg });
  }
}
