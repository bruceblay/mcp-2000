# MCP 2000

A browser-based drum machine and sampler inspired by the Akai MPC, with AI sample generation built in. Type a description of a kit, get 16 playable pads, then chop, sequence, mix, and record the result without leaving the tab.

Built with React 19, TypeScript, Vite, and the Web Audio API. Deployed on Vercel.

## Features

**Pads and banks**
- 16 velocity-sensitive pads in a 4x4 grid, triggered by click, touch, or keyboard (1-4, Q-R, A-F, Z-C)
- 4 banks (A/B/C/D), each holding its own 16-pad kit, effects chain, and sequence
- Chromatic mode plays a single sample across a piano keyboard layout
- Web MIDI input for external controllers

**AI generation**
- Text prompt to a full 16-pad kit, a single pad, a loop, or a step-sequencer pattern
- Claude picks the kit design and writes the per-sample prompts, ElevenLabs renders the audio
- Preset prompt chips for quick starts

**Sample editor**
- Waveform view with start and end trimming
- Pitch in semitones, gain, pan, reverse
- Chop a loop into slices spread across pads

**Sequencer and transport**
- 16 or 32 step grid with per-pad lanes and per-step velocity
- BPM 40-220, play, stop, and live pad recording as takes
- Arpeggiator with selectable modes and divisions

**Mixer and effects**
- Per-pad gain and pan, per-bank master gain, level meters
- 23 effects including reverb, hall reverb, delay, tap delay, distortion, bitcrusher, filter, DJ EQ, compressor, chorus, flanger, phaser, tremolo, vibrato, auto filter, auto panner, comb filter, ring mod, pitch shifter, tape stop, CD skipper, sidechain pump, and lo-fi tape
- Master compressor and limiter on the output

**Recording and export**
- Record the master output (effects and all) to a WAV, up to 10 minutes
- Export individual samples or a whole kit as a ZIP
- Share a project as a link, which recipients open as their own remixable copy

## How audio works

There is no database for audio data. Three paths, depending on where a sound comes from:

1. **Built-in kits** are static files in `public/`. The browser fetches them, `decodeAudioData` turns them into `AudioBuffer`s, and those are cached in a Map keyed by URL so each file decodes once. Triggering a pad creates a fresh `BufferSource` off the cached buffer.
2. **Generated samples** come back from `/api/generate-kit` as base64 in the JSON response, become a Blob and an object URL on the client, then decode the same way. They live only in the tab.
3. **Shared projects** are the only thing persisted. Each sample is hashed, the bytes go to Google Cloud Storage, and Firestore stores the hash, the GCS path, and a ref count. The project document holds a JSON snapshot of app state plus the list of sample hashes. Content hashing dedupes identical samples, and a nightly cron deletes anything with a ref count of zero.

Most effects are native Web Audio nodes. Bitcrusher, CD skipper, tape stop, and sidechain pump run through `ScriptProcessorNode` for sample-level control.

## Project layout

```
src/
  App.tsx              main app, audio engine, transport, pad triggering
  audio-utils.ts       buffer helpers, custom DSP nodes, offline rendering
  effects/             one module per effect (config plus node builder)
  effects-routing.ts   builds and connects the per-bank effects chain
  components/          chat panel, mixer, effects workspace, knob, waveform
  project-snapshot.ts  serialize and deserialize project state for sharing
api/
  generate-kit.ts      Claude plus ElevenLabs generation, rate limited
  chat.ts              in-app assistant
  share.ts             create and load shared projects
  shares/              recent shares and prompt logs
  cron/                nightly orphaned sample cleanup
  _shared/             Firestore, GCS, rate limiting, generation pipeline
```

## Running locally

```bash
npm install
npm run dev
```

The app runs without any keys, using the bundled sample kits. AI generation and sharing need environment variables:

| Variable | Used for |
| --- | --- |
| `ANTHROPIC_API_KEY` | kit design, sequence generation, chat assistant |
| `ELEVENLABS_API_KEY` | rendering the generated audio |
| `GCP_PROJECT_ID` | Firestore and GCS project |
| `GCP_SERVICE_ACCOUNT_KEY` | service account JSON, as a single-line string |
| `GCS_BUCKET_NAME` | bucket holding shared samples |
| `CRON_SECRET` | authorizes the cleanup cron |

See `docs/gcp-setup.md` for the Google Cloud side.

Generation is capped at 5 ElevenLabs-backed generations per IP per day, plus a shorter per-minute rate limit on the endpoint. Shared projects expire after 30 days.

```bash
npm run build     # tsc -b, then vite build
npm run preview   # serve the production build
```

## Credits

Built by Bruce Blay. Portfolio at [coolbrb.com](https://coolbrb.com).
