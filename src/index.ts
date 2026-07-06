import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { mkdir, rm } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { transcribeAudio } from "./transcriber";
import { isValidYouTubeUrl } from "./validation";
import { classifyExtractError } from "./errors";

const app = new Hono();

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT ?? "3000");
const YT_EXTRACT_URL = process.env.YT_EXTRACT_URL ?? "http://localhost:3001";
const YT_EXTRACT_API_KEY = process.env.YT_EXTRACT_API_KEY ?? "dev-key-change-me";
const DATA_DIR = process.env.DATA_DIR ?? join(import.meta.dir, "..", "data");

// ---------------------------------------------------------------------------
// Job store
// ---------------------------------------------------------------------------
interface NutyJob {
  id: string;
  status: "pending" | "downloading" | "transcribing" | "completed" | "failed";
  url: string;
  videoTitle?: string;
  createdAt: number;
  completedAt?: number;
  error?: string;
  errorType?: string;
  errorDetail?: string;
  result?: {
    midiUrl?: string;
    musicXmlUrl?: string;
    notesCount: number;
  };
}

const jobs = new Map<string, NutyJob>();

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------

app.get("/health", (c) => {
  return c.json({
    status: "ok",
    service: "nuty-app",
    ytExtractUrl: YT_EXTRACT_URL,
  });
});

/**
 * POST /api/transcribe
 * Body: { url: string }
 *
 * Full pipeline: YouTube → audio → MIDI → MusicXML → sheet music
 */
app.post("/api/transcribe", async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const url: string | undefined = body.url;
  if (!url || typeof url !== "string") {
    return c.json({ error: "Missing 'url' field" }, 400);
  }

  if (!isValidYouTubeUrl(url)) {
    return c.json({ error: "URL must be a valid YouTube link" }, 400);
  }

  const jobId = randomUUID();
  const job: NutyJob = {
    id: jobId,
    status: "pending",
    url,
    createdAt: Date.now(),
  };
  jobs.set(jobId, job);

  // Process in background
  (async () => {
    const jobDir = join(DATA_DIR, jobId);
    await mkdir(jobDir, { recursive: true });

    try {
      // Step 1: Call yt-extract to get the audio
      job.status = "downloading";
      const extractResponse = await fetch(`${YT_EXTRACT_URL}/extract`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": YT_EXTRACT_API_KEY,
        },
        body: JSON.stringify({ url, audioOnly: true, audioFormat: "wav" }),
      });

      if (!extractResponse.ok) {
        const errText = await extractResponse.text();
        throw new Error(`yt-extract failed: ${errText}`);
      }

      const extractData = await extractResponse.json();
      const extractJobId = extractData.jobId;

      // Poll for completion
      let extractResult: any = null;
      for (let i = 0; i < 120; i++) {
        await sleep(3000);
        const poll = await fetch(`${YT_EXTRACT_URL}/jobs/${extractJobId}`);
        const pollData = await poll.json();

        if (pollData.status === "completed") {
          extractResult = pollData;
          break;
        }
        if (pollData.status === "failed") {
          throw new Error(`yt-extract job failed: ${pollData.error}`);
        }
      }

      if (!extractResult) {
        throw new Error("yt-extract timed out after 6 minutes");
      }

      job.videoTitle = extractResult.result?.videoTitle;

      // Download the audio file from yt-extract
      const audioUrl = `${YT_EXTRACT_URL}${extractResult.result.audioUrl}`;
      const audioResp = await fetch(audioUrl);
      if (!audioResp.ok) throw new Error("Failed to download audio from yt-extract");

      const audioBuffer = await audioResp.arrayBuffer();
      const audioPath = join(jobDir, "audio.wav");
      await Bun.write(audioPath, audioBuffer);

      // Step 2: Transcribe audio → MIDI
      job.status = "transcribing";
      const transcription = await transcribeAudio(audioPath, jobDir);

      // Step 3: Done
      job.status = "completed";
      job.completedAt = Date.now();
      job.result = {
        midiUrl: `/downloads/${jobId}/${transcription.midiPath.split("/").pop()}`,
        musicXmlUrl: transcription.musicXmlPath
          ? `/downloads/${jobId}/${transcription.musicXmlPath.split("/").pop()}`
          : undefined,
        notesCount: transcription.notesCount,
      };
    } catch (err: any) {
      const rawError = err.message ?? String(err);
      const classified = classifyExtractError(rawError);
      job.status = "failed";
      // Use user-friendly message for the UI, but keep the raw error for debugging
      job.error = classified.userMessage;
      job.errorType = classified.type;
      job.errorDetail = rawError;
      job.completedAt = Date.now();
    }
  })();

  return c.json({ jobId, status: "pending" }, 202);
});

/**
 * GET /api/jobs/:id — poll job status
 */
app.get("/api/jobs/:id", (c) => {
  const id = c.req.param("id");
  const job = jobs.get(id);
  if (!job) return c.json({ error: "Job not found" }, 404);

  return c.json({
    id: job.id,
    status: job.status,
    url: job.url,
    videoTitle: job.videoTitle,
    createdAt: new Date(job.createdAt).toISOString(),
    completedAt: job.completedAt ? new Date(job.completedAt).toISOString() : undefined,
    error: job.error,
    errorType: job.errorType,
    result: job.result,
  });
});

/**
 * Serve generated files (MIDI, MusicXML)
 */
app.get("/downloads/:jobId/:filename", async (c) => {
  const jobId = c.req.param("jobId");
  const filename = c.req.param("filename");
  if (/\.\.\//.test(filename) || /\.\.\//.test(jobId)) {
    return c.json({ error: "Invalid path" }, 400);
  }

  // Search recursively in the job dir (Basic Pitch creates subdirectories)
  const { readdir } = await import("fs/promises");
  const jobDir = join(DATA_DIR, jobId);

  async function findFile(dir: string, name: string): Promise<string | null> {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          const found = await findFile(fullPath, name);
          if (found) return found;
        } else if (entry.name === name) {
          return fullPath;
        }
      }
    } catch {}
    return null;
  }

  const filePath = await findFile(jobDir, filename);
  if (!filePath) return c.json({ error: "File not found" }, 404);

  const file = Bun.file(filePath);
  return new Response(file);
});

// ---------------------------------------------------------------------------
// Static file serving for the web UI
// ---------------------------------------------------------------------------
app.get("*", serveStatic({ root: "./public", rewriteRequestPath: (p) => (p === "/" ? "/index.html" : p) }));

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Cleanup old jobs
// ---------------------------------------------------------------------------
setInterval(async () => {
  const now = Date.now();
  const TTL = 2 * 60 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (now - job.createdAt > TTL) {
      jobs.delete(id);
      await rm(join(DATA_DIR, id), { recursive: true, force: true });
    }
  }
}, 10 * 60 * 1000);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
console.log(`🎵 nuty-app running on http://0.0.0.0:${PORT}`);
console.log(`🔗 yt-extract API: ${YT_EXTRACT_URL}`);
console.log(`📁 Data directory: ${DATA_DIR}`);

export default {
  port: PORT,
  fetch: app.fetch,
};
