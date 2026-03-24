# Sample Generation Plan

This document outlines the recommended first approach for generating test samples and later supporting prompt-driven kit and loop creation in `browser-gen-mpc`.

## Goal

We want a reliable path from a user prompt to playable audio assets that can fill the 4x4 pad grid.

For the first implementation, the goal is not to build the entire live generation experience at once. The goal is to prove that we can:

1. Turn a prompt into a structured set of sample requests
2. Generate short audio clips that match those requests
3. Map the resulting assets onto pads
4. Reuse those assets during development and manual testing

## Recommendation

Use the stack in two layers:

### Layer 1: Prompt Planning and Tool Orchestration

Use the Vercel AI SDK to:

- Interpret the user's natural-language request
- Convert it into a structured drum kit or loop generation plan
- Perform tool calling for one-shot or loop generation jobs

This is the right place to use an LLM because it gives us:

- Better prompt digestion
- A consistent schema for generated pad assignments
- A clean place to add retries, fallback logic, and prompt normalization

### Layer 2: Audio Generation Provider

Use a specialized audio provider for the actual sound generation.

Recommended first choice:

- ElevenLabs Sound Effects API

Recommended second choice for longer musical loops:

- Stable Audio 2.5
- Or Stable Audio 2.5 through Replicate

## Why This Split Makes Sense

The AI SDK is well suited to planning and routing, but not to generating final drum samples by itself.

For prompt-based sampler content, we need a provider that can generate:

- Short one-shots
- Percussive hits
- Foley-like sounds
- Stabs and transitions
- Loops of a predictable duration

That makes a dedicated audio provider a better fit than a general-purpose language model.

## Provider Recommendation

### Option A: ElevenLabs Sound Effects API

Recommended as the first provider to test.

Why:

- Good fit for one-shots and short sound design elements
- Better aligned with drum hits, impacts, textures, risers, and foley-style prompts
- Duration control is important for pad-oriented workflows
- Likely the most practical way to generate usable pad content quickly

Best uses:

- Kick
- Snare
- Hat
- Perc
- FX
- Texture hits
- Short transitions

Possible limitations:

- Entire kits may still require prompt decomposition into separate sounds
- Musical loops may need a separate provider if we want richer harmonic output

### Option B: Stable Audio 2.5

Recommended for longer loops and broader music generation experiments.

Why:

- Better candidate for loop generation
- Better fit for musical or atmospheric content than purely percussive one-shots
- Useful if we want longer generated beds, phrases, or loop material

Best uses:

- 2-bar to 8-bar loops
- Textured beds
- Tonal phrases
- Ambient or genre-specific musical material

Possible limitations:

- One-shot control may be less direct than a sound-effects-focused model
- Generation times and output consistency may need more evaluation

### Option C: Replicate

Recommended as an experimentation layer, not the default production provider.

Why:

- Lets us quickly compare models
- Helps us prototype without overcommitting to a single vendor too early
- Useful for trying multiple text-to-audio models with one integration style

Possible limitations:

- Model quality, latency, pricing, and licensing vary by model
- It adds an extra abstraction layer if we already know which provider we want

## Proposed Architecture

### 1. User Prompt

The user enters a prompt such as:

- "Dusty boom bap kit with crunchy hats and a warm kick"
- "Minimal percussion kit made from kitchen sounds"
- "4-bar Detroit techno loop at 132 BPM"

### 2. Prompt Planner

The planner converts that into a structured generation request.

For a kit request, it should produce pad-level instructions such as:

```json
{
  "requestType": "kit",
  "style": "dusty boom bap",
  "pads": [
    {
      "pad": "pad-1",
      "role": "kick",
      "prompt": "short dusty boom bap kick with warm low end and subtle vinyl texture",
      "durationSeconds": 1.0
    },
    {
      "pad": "pad-2",
      "role": "snare",
      "prompt": "crunchy boom bap snare with dry attack and slight tape grit",
      "durationSeconds": 1.0
    }
  ]
}
```

This planner is the ideal place for the Vercel AI SDK.

### 3. Tool Calls

The app or backend calls `generateSample()` once per requested sound.

For loop requests, the planner can instead emit one or more loop-specific requests:

```json
{
  "requestType": "loop",
  "lengthBars": 4,
  "bpm": 132,
  "prompt": "Detroit techno loop with metallic percussion and rolling low-end pulse"
}
```

### 4. Asset Storage

Generated assets should be stored with metadata:

- `id`
- `provider`
- `prompt`
- `duration`
- `role`
- `padId`
- `audioUrl` or file path

### 5. Pad Assignment

Once generated, assets can be assigned to pads automatically:

- Kit generation fills a default pad layout
- One-shot generation fills the selected pad
- Loop generation fills one pad or a designated loop pad

## Initial Pad Layout Suggestion

For a generated drum kit, start with a stable default mapping:

- `1`: Kick
- `2`: Snare
- `3`: Closed Hat
- `4`: Open Hat
- `Q`: Perc 1
- `W`: Perc 2
- `E`: Clap
- `R`: Rim / Accent
- `A`: Bass hit
- `S`: Chord stab
- `D`: Texture hit
- `F`: Loop
- `Z`: Crash
- `X`: Riser
- `C`: Fill
- `V`: FX tail

This gives us a repeatable test layout even before users start customizing pad assignments.

## First Implementation Milestone

The first generation milestone should be intentionally small.

### Milestone: Offline Test Kit Generation Pipeline

Build a flow that:

1. Accepts a kit prompt
2. Uses the AI SDK to transform it into 8 to 16 pad-level sample prompts
3. Calls one provider for each sample request
4. Saves the generated results as reusable test assets
5. Loads those assets into the app

This is better than starting with fully live generation in the browser because it helps us validate:

- Prompt quality
- Provider fit
- Request batching
- Asset naming and storage
- Pad assignment rules

It also gives us a set of development fixtures we can reuse while building playback and editing.

## Suggested Implementation Order

### Step 1

Create a TypeScript schema for:

- `GenerationRequest`
- `KitPlan`
- `PadGenerationRequest`
- `GeneratedSampleAsset`

### Step 2

Build a small planner function using the Vercel AI SDK that produces a `KitPlan` from a user prompt.

### Step 3

Implement a provider adapter interface:

```ts
type SampleGenerator = {
  generateOneShot(input: PadGenerationRequest): Promise<GeneratedSampleAsset>
  generateLoop?(input: LoopGenerationRequest): Promise<GeneratedSampleAsset>
}
```

### Step 4

Create the first provider adapter for ElevenLabs Sound Effects.

### Step 5

Write a script or server route that:

- Generates a full test kit
- Saves files and metadata
- Produces output we can load into the sampler

### Step 6

Load the generated assets into the existing 4x4 pad grid.

## Product Decisions to Make Early

### 1. Should all kit requests always target 16 pads?

Recommendation:

- Start with 8 essential sounds plus optional fillers up to 16
- This gives us flexibility when providers produce uneven results

### 2. Should loop prompts create one loop or multiple variations?

Recommendation:

- Start with one loop per request
- Add alternate takes later

### 3. Should generation happen in the browser or on a server route?

Recommendation:

- Start on the server
- Keep provider keys out of the client
- Centralize retries, logging, and output shaping

## Risks

- One-shot output quality may vary heavily by provider
- Drum kits may need prompt engineering per sound role
- Live generation latency may be too slow for a fluid beat-making workflow
- Some generated sounds may need normalization or trimming before they feel playable
- Costs may rise quickly if kit generation fans out into 16 separate requests

## Recommended Next Build Step

The next practical step is to add a generation domain layer to the codebase before integrating any external provider.

That means:

1. Add TypeScript types for generation plans and generated assets
2. Create a mock planner that returns a fixed kit plan
3. Create a mock provider adapter that returns placeholder sample metadata
4. Wire the app to display generated-plan results in a way we can test before live API calls

This keeps us moving while preserving a clean provider abstraction for later.
