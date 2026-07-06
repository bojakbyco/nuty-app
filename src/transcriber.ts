import { spawn } from "child_process";
import { mkdir, readdir, readFile } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

/**
 * Transcribe audio to MIDI using Spotify Basic Pitch (Python).
 *
 * Basic Pitch is a lightweight polyphonic transcription model that runs
 * on CPU. It outputs a .mid file which we then convert to MusicXML for
 * sheet music rendering in the browser.
 *
 * Requires: pip install basic-pitch  (done in Dockerfile)
 */

export interface TranscriptionResult {
  midiPath: string;
  musicXmlPath: string | null;
  notesCount: number;
}

export async function transcribeAudio(
  audioPath: string,
  outputDir: string,
): Promise<TranscriptionResult> {
  await mkdir(outputDir, { recursive: true });

  const sessionId = randomUUID().slice(0, 8);
  const sessionDir = join(outputDir, sessionId);
  await mkdir(sessionDir, { recursive: true });

  // Run Basic Pitch CLI: basic-pitch <output_dir> <audio_file>
  // Basic Pitch creates a subdirectory with the same name as the input file
  const { code, stderr } = await runCommand("basic-pitch", [
    sessionDir,
    audioPath,
  ]);

  if (code !== 0) {
    throw new Error(`Basic Pitch failed (exit ${code}): ${stderr}`);
  }

  // Find the generated .mid file
  const findResult = await findFilesRecursive(sessionDir, ".mid");
  if (findResult.length === 0) {
    throw new Error("Basic Pitch did not produce a .mid file");
  }

  const midiPath = findResult[0];

  // Convert MIDI → MusicXML using music21 (Python) if available
  let musicXmlPath: string | null = null;
  try {
    musicXmlPath = await convertMidiToMusicXml(midiPath, sessionDir);
  } catch (err) {
    console.warn("MusicXML conversion failed (non-fatal):", err);
  }

  // Count notes roughly
  let notesCount = 0;
  try {
    const midiData = await readFile(midiPath);
    // Very rough note count: count MIDI "note on" events
    notesCount = countMidiNotes(midiData);
  } catch {}

  return { midiPath, musicXmlPath, notesCount };
}

async function convertMidiToMusicXml(
  midiPath: string,
  outputDir: string,
): Promise<string | null> {
  const script = `
import sys
try:
    import music21
    score = music21.converter.parse("${midiPath.replace(/"/g, '\\"')}")
    out = "${join(outputDir, "score").replace(/"/g, '\\"')}.musicxml"
    score.write("musicxml", out)
    print(out)
except Exception as e:
    print(f"ERROR: {e}", file=sys.stderr)
    sys.exit(1)
`;

  const { code, stdout, stderr } = await runCommand("python3", ["-c", script]);
  if (code !== 0) {
    console.warn("music21 conversion failed:", stderr);
    return null;
  }

  const outPath = stdout.trim();
  if (!outPath) return null;

  try {
    const file = Bun.file(outPath);
    if (await file.exists()) return outPath;
  } catch {}

  return null;
}

function countMidiNotes(data: Buffer): number {
  let count = 0;
  // Simple parser: look for note-on events (0x90-0x9F) with velocity > 0
  for (let i = 0; i < data.length - 1; i++) {
    const byte = data[i];
    if (byte >= 0x90 && byte <= 0x9f && data[i + 1] > 0) {
      count++;
    }
  }
  return count;
}

async function findFilesRecursive(
  dir: string,
  ext: string,
): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...(await findFilesRecursive(fullPath, ext)));
      } else if (entry.name.endsWith(ext)) {
        results.push(fullPath);
      }
    }
  } catch {}
  return results;
}

function runCommand(
  cmd: string,
  args: string[],
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => resolve({ stdout, stderr, code: code ?? 1 }));
  });
}
