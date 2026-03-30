# Record Performance Feature

Capture a live performance as a stereo WAV file directly from the browser.

## Concept

A single toggle button in the transport bar records everything routed through the master output. Pressing it once starts recording; pressing it again stops and triggers a download. A running timer shows elapsed time while recording, and a hard ceiling prevents runaway recordings from eating memory.

## UI

### Button placement

Sits in the transport controls div, after the existing Stop button (the `<Square>` icon). This keeps all transport actions in one row: **Metronome | Play | Record-to-Sequence | Stop | Record Performance**.

### Button appearance

- **Idle:** secondary-button style, solid filled red circle icon (distinguish from the existing hollow `<Circle>` record-arm button).
- **Recording:** primary-button with `is-active` class, pulsing red dot (CSS animation), plus a `mm:ss` elapsed-time readout displayed inline next to the button.
- Icon candidate from lucide-react: `Disc` (filled-style) or a custom small SVG circle with fill. Alternatively, text label `REC` styled in red could work well and avoids icon confusion with the existing record-arm circle.

### Timer display

- Rendered as a `<span>` next to the button, visible only while recording.
- Updated every second via `requestAnimationFrame` or a 1-second `setInterval`.
- Format: `0:00` up to `mm:ss`.

## Recording mechanism

### Approach: MediaStream capture off the destination node

Use `AudioContext.createMediaStreamDestination()` to create a `MediaStreamAudioDestinationNode`. Connect the output limiter (the last node before `context.destination`) to this node in parallel. Feed the resulting `MediaStream` into a `MediaRecorder` set to capture lossless or near-lossless audio.

```
outputLimiter ─┬─> context.destination   (speakers, unchanged)
               └─> mediaStreamDestination  (recording tap)
                       │
                   MediaRecorder
                       │
                   Blob chunks[]
```

This approach:
- Captures exactly what the user hears, including all effects.
- Requires zero changes to the existing audio graph topology.
- Works in all modern browsers (Chrome, Firefox, Safari 14.1+).

### Preferred MIME type

Try `audio/webm;codecs=pcm` first (Chrome supports uncompressed WebM). Fall back to `audio/webm;codecs=opus`, then `audio/webm`, then whatever the browser defaults to. On Safari, `audio/mp4` may be the only option.

After recording stops, if the captured format is not WAV, decode the blob back through `AudioContext.decodeAudioData` and re-encode with the existing `encodeWavBlob()` utility so the user always gets a `.wav` file.

### Alternative considered: ScriptProcessorNode / AudioWorklet

Manually buffering Float32 samples gives a guaranteed WAV output without re-encoding but adds complexity (ring buffers, message ports, worklet registration). The MediaRecorder path is simpler and sufficient for v1. Can revisit if quality or cross-browser issues arise.

## State

New state additions in `App.tsx`:

```ts
const [isPerformanceRecording, setIsPerformanceRecording] = useState(false)
const [performanceRecordingElapsed, setPerformanceRecordingElapsed] = useState(0)
const performanceRecorderRef = useRef<MediaRecorder | null>(null)
const performanceChunksRef = useRef<Blob[]>([])
const performanceTimerRef = useRef<number | null>(null)
const performanceStreamNodeRef = useRef<MediaStreamAudioDestinationNode | null>(null)
```

## Flow

### Start recording

1. Ensure audio engine is initialized (`ensureAudioEngine()`).
2. Resume audio context if suspended.
3. Create `MediaStreamAudioDestinationNode` from context.
4. Connect `outputLimiter` to the stream node.
5. Create `MediaRecorder` on the stream node's `.stream`.
6. Attach `ondataavailable` handler to push chunks.
7. Call `recorder.start(1000)` (collect data every second for safety).
8. Set `isPerformanceRecording = true`.
9. Record `context.currentTime` as start time for the timer.
10. Start timer interval to update `performanceRecordingElapsed`.

### Stop recording

1. Call `recorder.stop()`.
2. In the `onstop` handler:
   - Combine chunks into a single `Blob`.
   - Decode blob to `AudioBuffer` via `context.decodeAudioData`.
   - Re-encode to WAV using `encodeWavBlob()`.
   - Trigger download with `triggerBlobDownload()`. Filename: `performance-{timestamp}.wav`.
3. Disconnect the stream destination node from the output limiter.
4. Clear refs and chunks.
5. Set `isPerformanceRecording = false`.
6. Reset elapsed timer to 0.

### Auto-stop (time limit)

- Default maximum: **10 minutes** (600 seconds).
- Could be a constant in `constants.ts`: `performanceRecordingMaxSeconds = 600`.
- When elapsed time hits the limit, auto-trigger the stop flow.
- Flash the timer or show a brief toast/status message: "Recording limit reached - saved automatically."

### Interaction with other transport controls

- Recording should continue regardless of sequence play/stop state. The user might play/stop sequences, trigger pads manually, or do both during a recording session.
- Pressing the main Stop transport button should NOT stop the performance recording. Only the dedicated record button toggles it off.
- If recording is active when the page unloads, attempt to finalize and download in a `beforeunload` handler (best-effort).

## Implementation steps

1. **Add the MediaStreamDestination tap** in `getAudioContext()` setup, connected to `outputLimiter`. Store the ref.
2. **Add state variables** for recording status, elapsed time, recorder ref, chunks ref.
3. **Implement `startPerformanceRecording()` and `stopPerformanceRecording()`** functions.
4. **Add the button** to the transport bar after the Stop button.
5. **Add the timer display** next to the button, visible only during recording.
6. **Add the auto-stop guard** checking elapsed time against the max constant.
7. **Add CSS** for the recording-active pulse animation and timer styling.
8. **Test** across Chrome, Firefox, and Safari. Verify the downloaded WAV plays correctly and captures all audio (pads, sequences, effects).

## Open questions

- Should the max recording time be user-configurable, or is a fixed 10-minute ceiling enough for v1?
- Should there be a visual waveform preview before download, or is immediate save-on-stop sufficient?
- Should the recording be offered as a loadable sample (assign to a pad) in addition to downloading?
