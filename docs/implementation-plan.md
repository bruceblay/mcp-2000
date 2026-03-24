# Initial Implementation Plan

This document turns the project vision into a practical first-pass build plan for `browser-gen-mpc`.

## Goals

The first goal is to build a usable browser-based sampler that feels responsive and fun before layering on more advanced audio editing and generation workflows.

We should optimize for:

- Fast pad triggering
- Simple, clear interaction design
- A clean path from prompt to playable sample
- Incremental delivery of audio features
- A codebase that can support sequencing, effects, and export later

## Product Milestones

### Milestone 1: App Shell + Playable Pad Grid

Deliver a working React single-page app with:

- A 4x4 pad grid
- Click / keyboard-triggered playback
- Pad labels and active states
- Static or manually loaded sample assignment
- Global transport / status area

This milestone proves the core interaction: users can play 16 pads in the browser with low friction.

### Milestone 2: Sample Management

Add the ability to:

- Load samples into individual pads
- Replace and clear pad samples
- Show sample metadata such as name and duration
- Persist pad assignments in app state

This milestone makes the grid practically usable as a browser sampler.

### Milestone 3: Prompt-Driven Audio Generation

Add a generation workflow so users can:

- Enter a text prompt
- Request a one-shot, kit, or loop
- Receive generated audio results
- Assign generated results to one or more pads

This milestone introduces the defining product hook.

### Milestone 4: Editing + Sound Design

Add basic sample tools:

- Trim start / end
- Pitch shift
- Gain adjustment
- Reverse
- Basic chopping / slicing

Add initial audio effects:

- Filter
- Delay
- Reverb

This milestone turns the app from a trigger surface into a creative workstation.

### Milestone 5: Sequencing + Export

Add:

- Step sequencing
- BPM / swing controls
- Pattern playback
- Offline render or mixdown path
- WAV export

This milestone completes the loop from generation to finished output.

## Recommended Technical Stack

### Frontend

- React
- TypeScript
- Vite for fast local development

### Audio

- Web Audio API for playback graph, timing, effects, and rendering
- Optional helper library only if it reduces boilerplate without hiding important timing details

### State

- Local React state for early UI work
- A small dedicated store if pad state, transport state, and editor state start to sprawl

### Styling

- Keep styling lightweight and fast to iterate on
- Prioritize a layout that works well for both desktop and laptop screens

## Architecture Outline

### UI Areas

The app can be organized into a few primary regions:

- Header / transport bar
- Prompt generation panel
- 4x4 pad grid
- Pad inspector / sample editor
- Sequencer panel

### Core Domain Objects

We should define a few stable app concepts early:

#### Pad

A pad should include:

- `id`
- `label`
- `keyTrigger`
- `sampleId`
- `color` or visual theme
- playback settings such as gain, pitch, start, end, reverse

#### Sample

A sample should include:

- `id`
- `name`
- `sourceType` such as uploaded or generated
- `audioBuffer` or decoded audio reference
- duration / metadata

#### Pattern

A pattern should include:

- `id`
- tempo
- step count
- per-pad triggers
- swing or timing metadata

## First Build Order

### Step 1: Scaffold the App

- Create React + TypeScript app
- Set up basic folder structure
- Add linting / formatting if desired
- Create placeholder layout regions

### Step 2: Build the Pad Grid

- Render 16 pads
- Map keyboard keys to pads
- Add pressed / active visual states
- Wire click handlers and keyboard listeners

### Step 3: Add Sample Playback

- Load a few local test samples
- Decode audio into playable buffers
- Trigger playback on pad press
- Ensure repeated presses work cleanly

### Step 4: Add Pad Assignment Controls

- Let users assign sample files to pads
- Show which sample is assigned
- Add clear / replace actions

### Step 5: Add Prompt UI

- Build prompt form for one-shot / kit / loop requests
- Show loading, success, and failure states
- Mock the generation response first if needed

### Step 6: Integrate Audio Generation API

- Send prompt requests to backend or service
- Receive generated audio assets
- Decode and assign results to pads

### Step 7: Add Editing Tools

- Trim
- Pitch
- Reverse
- Gain

### Step 8: Add Sequencer

- Step grid UI
- Tempo control
- Pattern playback

### Step 9: Add Export

- Render sequence output offline
- Export to WAV

## Suggested File Structure

This is only a starting point:

```text
src/
  app/
  components/
  features/
    pads/
    samples/
    generation/
    sequencer/
    effects/
  audio/
  hooks/
  lib/
  types/
```

## Important Early Decisions

### 1. Keyboard Layout

We should choose a 16-key layout that feels natural for drumming. A common pattern would be four rows of nearby keys on a standard keyboard.

Example candidate:

- `1 2 3 4`
- `q w e r`
- `a s d f`
- `z x c v`

### 2. Playback Model

We should decide whether pads always play the full sample or support choke groups / retrigger behavior from the start.

Recommendation:

- Start with simple retrigger playback
- Add choke groups later when hi-hat behavior and pad interactions matter more

### 3. Generated Asset Mapping

We should define how generated audio lands in the grid:

- One-shot request -> assign to selected pad
- Drum kit request -> fill multiple pads automatically
- Loop request -> assign to one pad first, then optionally slice later

## Risks and Unknowns

- Browser audio timing and perceived latency
- Audio generation turnaround time
- Handling larger generated files in-browser
- Choosing an export strategy that preserves timing and effects
- Avoiding a UI that becomes crowded too early

## Immediate Next Tasks

The next implementation tasks should be:

1. Scaffold the React app with TypeScript and Vite
2. Build the 4x4 grid UI
3. Add keyboard interaction
4. Load and trigger a small set of test samples
5. Validate that playback feels responsive before adding generation

## Notes

This plan is intentionally biased toward getting to a playable prototype quickly. The app will be much easier to shape once the core pad interaction exists and we can test how responsive, musical, and intuitive it feels.
