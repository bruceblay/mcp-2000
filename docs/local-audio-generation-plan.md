# Local Audio Generation Plan

## Goal

Support local or self-hosted audio generation alongside hosted providers like ElevenLabs.

The near-term plan is:

- Use ElevenLabs first to prove the product loop
- Keep Anthropic + Vercel AI SDK as the planning layer
- Add a provider bridge so the app can also send generation jobs to a Linux machine on the local network

## Why This Matters

Local generation gives us:

- lower marginal cost for experimentation
- more control over model choice
- the option to use niche or custom audio models
- an upgrade path for power users who want private or offline-ish workflows

Hosted generation gives us:

- faster initial implementation
- less ops burden
- better reliability while we shape the UX

We should support both.

## Proposed Architecture

Keep the generation flow split into three layers:

1. Planner
2. Provider adapter
3. Asset ingestion

### 1. Planner

Anthropic via Vercel AI SDK should stay responsible for:

- turning user prompts into structured generation plans
- deciding which pads need one-shots vs loops
- setting duration/style guidance
- optionally routing jobs to ElevenLabs or the local bridge

### 2. Provider Adapter

The provider adapter should expose one common interface, regardless of backend:

```ts
type GeneratedSampleRequest = {
  padId: string
  label: string
  prompt: string
  durationSeconds: number
  type: 'one-shot' | 'loop'
}

type GeneratedSampleResult = {
  padId: string
  sampleName: string
  fileName: string
  publicUrl: string
  source: 'elevenlabs' | 'local'
  metadata?: Record<string, unknown>
}
```

Suggested adapters:

- `elevenLabsProvider`
- `localBridgeProvider`

### 3. Asset Ingestion

Regardless of source, the app should:

- store the generated file in a known local/public location
- create or update pad metadata
- make the file immediately playable in the current bank
- retain source metadata for later regeneration/export workflows

## Local Bridge Concept

Your Linux machine can act as a small generation worker on the LAN.

The cleanest first version is:

- the React app sends requests to our existing local backend route
- that route forwards generation jobs to the Linux machine
- the Linux machine runs the actual audio model
- it returns audio bytes or a downloadable file URL
- the app ingests that result the same way it ingests ElevenLabs output

### Bridge Responsibilities

The Linux bridge should provide:

- a simple HTTP API
- authentication for local network use
- model selection
- job status reporting
- file return or file hosting

Suggested endpoints:

```txt
POST /generate-sample
POST /generate-kit
GET /jobs/:id
GET /health
```

Suggested request shape:

```json
{
  "prompt": "dusty boom bap kick, short, warm, saturated",
  "durationSeconds": 1.2,
  "type": "one-shot",
  "format": "wav",
  "model": "your-local-audio-model"
}
```

Suggested response shape:

```json
{
  "jobId": "abc123",
  "status": "completed",
  "fileUrl": "http://linux-box.local:8000/files/abc123.wav",
  "sampleRate": 44100,
  "durationSeconds": 1.2
}
```

## What The Linux Box Needs

At minimum:

- a long-running HTTP service
- access to the audio generation model(s)
- enough disk space for temp/output files
- a stable LAN address or hostname

Nice to have:

- queueing
- concurrency limits
- GPU/CPU model routing
- automatic cleanup of generated files
- health metrics

## Security Considerations

Even on a local network, we should avoid an open unauthenticated generator.

Minimum protections:

- shared API token between app backend and Linux bridge
- allowlist LAN origin or IPs if practical
- file size and duration limits
- request timeout handling

Later:

- signed job requests
- TLS on the local bridge

## File Format Decisions

For the bridge, prefer generating WAV first.

Why:

- best for sampler workflows
- avoids generation-loss stacking
- easier for trimming, pitch shifting, export, and resampling

We can transcode later if needed, but WAV should be the default internal target.

## Integration Strategy

### Phase 1

Keep ElevenLabs as the primary real provider.

Goals:

- prove prompt -> plan -> generated sample -> playable pad
- validate UX and latency expectations
- build provider abstraction without overcommitting to one backend

### Phase 2

Add a local provider toggle in the backend only.

Goals:

- same planner output
- same ingestion flow
- different provider adapter

At this stage, the UI does not need a provider switch yet. We can choose provider in code or env.

### Phase 3

Expose provider selection in the product.

Possible options:

- `Hosted`
- `Local`
- `Auto`

## Open Questions

- Which local audio model(s) are already running on the Linux machine?
- Does the Linux box already expose an HTTP API, or do we need to build one?
- Will the local bridge return raw bytes, local URLs, or push files back to this repo/app host?
- Do we want local generation for one-shots only, or loops too?
- Do we want provider choice per bank, per generation, or global session setting?

## Recommended Next Steps

1. Continue implementing ElevenLabs generation first.
2. Define a provider interface in the app/backend so hosted and local backends share one contract.
3. Document the Linux box's existing audio-generation stack.
4. Build a tiny `/health` and `/generate-sample` bridge on the Linux machine.
5. Test one generated kick sample end to end through the bridge.
