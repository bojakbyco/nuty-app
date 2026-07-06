// Nuty App — Frontend Logic

const urlInput = document.getElementById("urlInput");
const transcribeBtn = document.getElementById("transcribeBtn");
const statusSection = document.getElementById("statusSection");
const statusIcon = document.getElementById("statusIcon");
const statusTitle = document.getElementById("statusTitle");
const statusMessage = document.getElementById("statusMessage");
const progressFill = document.getElementById("progressFill");
const errorSection = document.getElementById("errorSection");
const errorMessage = document.getElementById("errorMessage");
const resultSection = document.getElementById("resultSection");
const videoTitleEl = document.getElementById("videoTitle");
const playMidiBtn = document.getElementById("playMidiBtn");
const downloadMidiLink = document.getElementById("downloadMidi");
const downloadXmlLink = document.getElementById("downloadXml");
const sheetMusicDiv = document.getElementById("sheetMusic");

let pollInterval = null;
let osmd = null;

// ---------------------------------------------------------------------------
// Submit
// ---------------------------------------------------------------------------
transcribeBtn.addEventListener("click", async () => {
  const url = urlInput.value.trim();
  if (!url) return;

  // Reset UI
  hideAll();
  transcribeBtn.disabled = true;
  statusSection.classList.remove("hidden");

  try {
    statusTitle.textContent = "Starting...";
    statusMessage.textContent = "Sending request...";
    progressFill.style.width = "5%";

    const resp = await fetch("/api/transcribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });

    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || "Request failed");
    }

    const data = await resp.json();
    pollJobStatus(data.jobId);
  } catch (err) {
    showError(err.message);
  }
});

urlInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") transcribeBtn.click();
});

// ---------------------------------------------------------------------------
// Poll job status
// ---------------------------------------------------------------------------
function pollJobStatus(jobId) {
  const stages = {
    pending:      { msg: "Queued...", progress: 10 },
    downloading:  { msg: "Downloading audio from YouTube...", progress: 30 },
    transcribing: { msg: "Transcribing audio to notes (Basic Pitch)...", progress: 70 },
    completed:    { msg: "Done!", progress: 100 },
    failed:       { msg: "Failed", progress: 100 },
  };

  if (pollInterval) clearInterval(pollInterval);

  pollInterval = setInterval(async () => {
    try {
      const resp = await fetch(`/api/jobs/${jobId}`);
      const job = await resp.json();

      const stage = stages[job.status] ?? stages.pending;
      statusTitle.textContent = job.status.charAt(0).toUpperCase() + job.status.slice(1);
      statusMessage.textContent = stage.msg;
      progressFill.style.width = `${stage.progress}%`;

      if (job.status === "completed") {
        clearInterval(pollInterval);
        statusIcon.textContent = "✅";
        statusIcon.style.animation = "none";
        setTimeout(() => showResult(job), 500);
      } else if (job.status === "failed") {
        clearInterval(pollInterval);
        showError(job.error || "Unknown error");
      }
    } catch (err) {
      clearInterval(pollInterval);
      showError("Failed to check job status: " + err.message);
    }
  }, 2000);
}

// ---------------------------------------------------------------------------
// Show result
// ---------------------------------------------------------------------------
async function showResult(job) {
  hideAll();
  resultSection.classList.remove("hidden");
  transcribeBtn.disabled = false;

  videoTitleEl.textContent = job.videoTitle || "Transcription complete";

  if (job.result?.midiUrl) {
    downloadMidiLink.href = job.result.midiUrl;
    downloadMidiLink.classList.remove("hidden");

    // Enable MIDI playback
    playMidiBtn.disabled = false;
    playMidiBtn.onclick = () => playMidi(job.result.midiUrl);
  }

  if (job.result?.musicXmlUrl) {
    downloadXmlLink.href = job.result.musicXmlUrl;
    downloadXmlLink.classList.remove("hidden");

    // Render sheet music
    await renderSheetMusic(job.result.musicXmlUrl);
  } else {
    sheetMusicDiv.innerHTML = `
      <p style="color: #666; text-align: center; padding: 2rem;">
        Sheet music rendering requires MusicXML. Download the MIDI file and open it
        in <a href="https://musescore.org" target="_blank">MuseScore</a> for full notation.
      </p>
    `;
  }
}

// ---------------------------------------------------------------------------
// Render sheet music with OpenSheetMusicDisplay
// ---------------------------------------------------------------------------
async function renderSheetMusic(musicXmlUrl) {
  try {
    const resp = await fetch(musicXmlUrl);
    const xmlText = await resp.text();

    osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(sheetMusicDiv, {
      autoResize: true,
      backend: "svg",
      drawTitle: true,
      drawSubtitle: true,
      drawComposer: true,
    });

    await osmd.load(xmlText);
    await osmd.render();
  } catch (err) {
    sheetMusicDiv.innerHTML = `
      <p style="color: #999; text-align: center; padding: 2rem;">
        Could not render sheet music: ${err.message}
        <br><br>
        Download the MIDI file and open it in MuseScore.
      </p>
    `;
  }
}

// ---------------------------------------------------------------------------
// Play MIDI with Tone.js
// ---------------------------------------------------------------------------
async function playMidi(midiUrl) {
  playMidiBtn.textContent = "⏳ Loading...";
  playMidiBtn.disabled = true;

  try {
    // Fetch and parse MIDI file
    const resp = await fetch(midiUrl);
    const buffer = await resp.arrayBuffer();

    // Use Tone.js MIDI reader
    const midi = await Tone.Midi.fromArrayBuffer(buffer);

    await Tone.start();

    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.02, decay: 0.2, sustain: 0.3, release: 1 },
    }).toDestination();

    const now = Tone.now() + 0.1;
    midi.tracks.forEach((track) => {
      track.notes.forEach((note) => {
        synth.triggerAttackRelease(
          note.name,
          note.duration,
          now + note.time,
          note.velocity,
        );
      });
    });

    playMidiBtn.textContent = "▶ Playing...";
    playMidiBtn.disabled = true;

    // Reset button after duration
    const totalDuration = Math.max(...midi.tracks.flatMap((t) => t.notes.map((n) => n.time + n.duration)));
    setTimeout(() => {
      playMidiBtn.textContent = "▶ Play MIDI";
      playMidiBtn.disabled = false;
    }, totalDuration * 1000 + 500);
  } catch (err) {
    alert("MIDI playback failed: " + err.message);
    playMidiBtn.textContent = "▶ Play MIDI";
    playMidiBtn.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function hideAll() {
  statusSection.classList.add("hidden");
  errorSection.classList.add("hidden");
  resultSection.classList.add("hidden");
}

function showError(msg) {
  hideAll();
  errorMessage.textContent = msg;
  errorSection.classList.remove("hidden");
  statusIcon.textContent = "⏳";
  statusIcon.style.animation = "pulse 1.5s infinite";
  transcribeBtn.disabled = false;
}
