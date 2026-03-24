# ElevenLabs Feature Notes

## Why We Care

We are starting with ElevenLabs for real sample generation, but there are several adjacent features that could become very useful inside this project.

## Highest-Value Features

### Sound Effects API

This is our current best fit for sampler-oriented generation.

Useful details:

- supports text-to-audio generation for one-shots, loops, ambiences, and musical elements
- supports duration control from 0.1 to 30 seconds
- supports loop generation
- supports prompt influence control
- supports musical elements like drum loops, brass stabs, and synth pads
- output is MP3 for all effects, and WAV at 48 kHz for non-looping effects

Why this matters for us:

- one-shots for kick, snare, hat, fx, percussion
- loop generation for textures and rhythmic beds
- stem-like musical fragments for chopping

Source:

- [Sound effects docs](https://elevenlabs.io/docs/overview/capabilities/sound-effects)

### Eleven Music API

This is more relevant for longer musical content than individual drum hits.

Useful details:

- generates full music from prompts
- supports instrumental or vocal tracks
- supports durations from 3 seconds to 5 minutes
- supports WAV and MP3 output
- can be commercially useful depending on plan/terms

Why this matters for us:

- generating longer loops to chop
- generating melodic beds or song sections for sampling
- creating bank-specific source material before chopping it down into pads

Source:

- [Eleven Music docs](https://elevenlabs.io/docs/overview/capabilities/music)
- [Eleven Music API overview](https://elevenlabs.io/blog/eleven-music-now-available-in-the-api)

### Voice Isolator

This one is potentially useful, but with an important limitation.

Useful details:

- isolates speech from background noise, music, and ambient audio
- supports many audio and video file formats
- supports files up to 500MB and 1 hour
- ElevenLabs explicitly says it is not specifically optimized for isolating vocals from music, though it may work depending on the content

Why this matters for us:

- cleaning up spoken-word or dialogue samples before loading them into pads
- extracting cleaner vocal phrases from noisy recordings
- experimenting with vocal extraction from songs, with the understanding that this is not guaranteed to behave like a dedicated stem-separation model

Important caveat:

- for true song stem separation or reliable vocal extraction from full mixes, we may eventually want a dedicated music-demixing tool in addition to ElevenLabs

Source:

- [Voice isolator docs](https://elevenlabs.io/docs/overview/capabilities/voice-isolator)

## Other Potentially Useful API Surface

From ElevenLabs' API overview, a few more capabilities could become relevant later:

- Speech to Text: useful for transcribing sampled dialogue or spoken phrases
- Forced Alignment: useful for lining text up with speech samples for precise chop points
- Dubbing: potentially useful if we ever support multilingual spoken sample generation workflows
- Voice Changer / Voice Remixing: interesting for character vocal chops or resampled vocal textures

Source:

- [ElevenLabs API overview](https://elevenlabs.io/api)

## Product Ideas To Revisit

- `Generate Loop` could use Eleven Music instead of Sound Effects
- `Extract Vocal` could start as an upload flow using Voice Isolator
- spoken-word sample workflows could combine Voice Isolator + Speech to Text + Forced Alignment
- generated drum loops from Sound Effects could be auto-loaded into a chop editor

## Recommendation

Near term:

1. keep using Sound Effects for one-shots
2. evaluate Eleven Music for loop generation
3. treat Voice Isolator as experimental for song-vocal extraction, not a guaranteed stem-separation solution
4. if vocal extraction becomes a core feature, compare ElevenLabs against dedicated source-separation tools
