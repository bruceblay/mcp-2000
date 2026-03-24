# Browser Gen MPC

`browser-gen-mpc` is a simple single-page React app for prompt-powered sample generation and MPC-style performance in the browser.

The goal is to combine a classic 4x4 pad workflow with modern generative audio tooling:

- Generate one-shots, drum kits, and loops from text prompts
- Load samples onto a 4x4 pad grid
- Trigger pads with mouse clicks or keyboard keys
- Edit audio with chopping, pitch shifting, trimming, and sequencing tools
- Add effects for shaping sound
- Eventually export performances and arrangements to `.wav`

## Vision

This project is inspired by the Akai MPC workflow: fast pad-based experimentation, finger-drumming, chopping samples, building loops, and sketching ideas quickly.

The twist is that the sounds are not limited to pre-existing sample packs. Users should be able to type prompts like:

- "Dusty boom bap drum kit with crunchy snares and a warm vinyl kick"
- "4-bar Detroit techno loop at 132 BPM"
- "Minimal percussion kit made from kitchen sounds"
- "Lo-fi jazz guitar loop in A minor, 8 seconds"

The app should turn those prompts into usable audio assets that can be played, edited, sequenced, and eventually exported.

## Core Product

### 1. Pad Grid

- A single-page interface with a 4x4 grid of pads
- Each pad can hold a generated or uploaded sample
- Pads should be playable via:
  - mouse / touch interaction
  - keyboard key mapping
- Pads should provide quick visual feedback when triggered

### 2. Prompt-Based Sample Generation

Users should be able to request:

- Entire drum kits
- Individual one-shot samples
- Loops of a specific duration
- Audio in a requested genre, mood, texture, or tempo

Prompt examples:

- "Trap hi-hat roll kit"
- "Ambient percussion made from glass and water"
- "2-second snare with gated reverb"
- "8-bar afro-house shaker loop at 120 BPM"

### 3. Audio Editing Tools

Basic sample tools should include:

- Trim start / end
- Sample chopping / slice creation
- Pitch shifting
- Volume and pan
- Reverse
- Loop region editing
- Start / end / envelope controls

### 4. Sequencing

The app should support lightweight beat-making and arrangement workflows:

- Step sequencing for pad patterns
- Tempo / BPM control
- Swing / timing adjustment
- Pattern playback
- Basic loop building

### 5. Audio Effects

Early effect ideas:

- Filter
- Delay
- Reverb
- Distortion / saturation
- Compressor
- Bitcrush

### 6. Export

Longer term, users should be able to export:

- Individual pads or samples
- Loops
- Full sequence playback
- `.wav` output

## Suggested User Flow

1. Open the app
2. Enter a prompt for a kit, one-shot, or loop
3. Generate audio assets
4. Assign results to the 4x4 pad grid
5. Play pads with the mouse or keyboard
6. Chop, pitch, sequence, and effect the sounds
7. Export the result as audio

## MVP Scope

A strong first version would include:

- React single-page app
- 4x4 playable sample grid
- Keyboard mapping for all 16 pads
- Ability to load generated samples onto pads
- Basic playback controls
- Simple trim and pitch controls
- Minimal sequencer

Everything else can layer on after the core interaction feels good.

## Technical Direction

Potential implementation choices:

- React for the UI
- Web Audio API for playback, routing, and effects
- A waveform visualization library for editing
- Client-side state for pads, sequencing, and transport
- A backend or API integration for prompt-based audio generation

Areas to think through early:

- Sample format and file management
- Latency and pad responsiveness
- Keyboard mapping ergonomics
- Non-destructive sample editing
- Offline rendering / WAV export path

## Roadmap

### Phase 1

- Set up React app shell
- Build 4x4 pad grid
- Add mouse and keyboard triggering
- Load local or remote samples into pads
- Basic visual pad states

### Phase 2

- Add prompt input for generated audio
- Integrate sample generation workflow
- Support kit and loop generation
- Store generated assets in pad slots

### Phase 3

- Add trimming, chopping, and pitch shifting
- Add waveform display
- Add simple effects chain

### Phase 4

- Add sequencing and transport controls
- Add pattern save/load
- Add WAV export

## Open Questions

- Which audio generation service or model should power prompt-to-sample creation?
- Should generated loops be sliced automatically across multiple pads?
- Should kits arrive as 16 assigned pads by default?
- How much editing should happen in-browser versus server-side?
- Do we want one global effects chain, per-pad effects, or both?

## Status

Project is currently at the concept / planning stage. The next practical step is to scaffold the React app and implement the playable 4x4 pad grid first.
