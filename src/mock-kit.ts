export type PadGroup = 'drums' | 'textures' | 'melodic' | 'fx' | 'chop'
export type PadSourceType = 'generated' | 'uploaded' | 'resampled'

export type Pad = {
  id: string
  label: string
  keyTrigger: string
  group: PadGroup
  sampleName: string
  sampleFile: string
  sampleUrl: string
  sourceType: PadSourceType
  durationLabel: string
  gain: number
}

export type BankKitId = 'A' | 'B' | 'C' | 'D'

const createPad = (
  id: string,
  label: string,
  keyTrigger: string,
  group: PadGroup,
  sampleName: string,
  sampleFile: string,
  gain: number,
  basePath = '/mock-samples/',
): Pad => ({
  id,
  label,
  keyTrigger,
  group,
  sampleName,
  sampleFile,
  sampleUrl: basePath + encodeURIComponent(sampleFile),
  sourceType: 'uploaded',
  durationLabel: 'fixture audio',
  gain,
})

export const bankKits: Record<BankKitId, Pad[]> = {
  A: [
    createPad('pad-1', 'Kick 01', '1', 'drums', 'BD Short and Clean', 'BD Short and Clean.wav', 1.0),
    createPad('pad-2', 'Snare 02', '2', 'drums', 'SD Classic Snare', 'SD Classic Snare.wav', 0.92),
    createPad('pad-3', 'Hat 03', '3', 'drums', 'HH Short', 'HH Short.wav', 0.68),
    createPad('pad-4', 'Open Hat 04', '4', 'drums', 'HHO Longuish', 'HHO Longuish.wav', 0.7),
    createPad('pad-5', 'Clap 05', 'Q', 'textures', 'CL Analog Clap', 'CL Analog Clap.wav', 0.82),
    createPad('pad-6', 'Perc 06', 'W', 'textures', 'PC Cabasa', 'PC Cabasa.wav', 0.72),
    createPad('pad-7', 'Cowbell 07', 'E', 'textures', 'CB Cowbell', 'CB Cowbell.wav', 0.72),
    createPad('pad-8', 'Metal FX 08', 'R', 'fx', 'FX FM Metal', 'FX FM Metal.wav', 0.65),
    createPad('pad-9', 'Tom 09', 'A', 'melodic', 'TM Lo Tom', 'TM Lo Tom.wav', 0.86),
    createPad('pad-10', 'Mid Tom 10', 'S', 'melodic', 'TM Mid Conga Var', 'TM Mid Conga Var.wav', 0.82),
    createPad('pad-11', 'Rim 11', 'D', 'melodic', 'RS Classic', 'RS Classic.wav', 0.7),
    createPad('pad-12', 'Ride 12', 'F', 'melodic', 'RD Ride Stereo', 'RD Ride Stereo.wav', 0.74),
    createPad('pad-13', 'Crash 13', 'Z', 'fx', 'CY Useful Mono', 'CY Useful Mono.wav', 0.7),
    createPad('pad-14', 'Blip 14', 'X', 'fx', 'FX Blip', 'FX Blip.wav', 0.68),
    createPad('pad-15', 'Shaker 15', 'C', 'fx', 'PC Stereo Shaker', 'PC Stereo Shaker.wav', 0.72),
    createPad('pad-16', 'Ride FX 16', 'V', 'fx', 'FX Chorus Ride', 'FX Chorus Ride.wav', 0.64),
  ],
  B: [
    createPad('pad-1', 'Boing 01', '1', 'melodic', 'Boing', 'boing.wav', 0.82, '/kraftwerk-kit/'),
    createPad('pad-2', 'Ping 02', '2', 'melodic', 'Ping', 'ping.wav', 0.76, '/kraftwerk-kit/'),
    createPad('pad-3', 'Boom 03', '3', 'drums', 'Boom', 'boom.wav', 0.9, '/kraftwerk-kit/'),
    createPad('pad-4', 'Tscha 04', '4', 'drums', 'Tscha', 'tscha.wav', 0.72, '/kraftwerk-kit/'),
    createPad('pad-5', 'Musique 05', 'Q', 'melodic', 'Musique', 'musique.wav', 0.74, '/kraftwerk-kit/'),
    createPad('pad-6', 'Non-Stop 06', 'W', 'melodic', 'Non-Stop', 'non-stop.wav', 0.74, '/kraftwerk-kit/'),
    createPad('pad-7', 'Techno 07', 'E', 'fx', 'Techno', 'techno.wav', 0.72, '/kraftwerk-kit/'),
    createPad('pad-8', 'Pop 08', 'R', 'textures', 'Pop', 'pop.wav', 0.74, '/kraftwerk-kit/'),
    createPad('pad-9', 'Bass Drum 09', 'A', 'drums', 'Bass Drum', 'bass-drum.wav', 1.0, '/kraftwerk-kit/'),
    createPad('pad-10', 'Snare 10', 'S', 'drums', 'Snare', 'snare.wav', 0.88, '/kraftwerk-kit/'),
    createPad('pad-11', 'Bell 11', 'D', 'textures', 'Bell', 'bell.wav', 0.72, '/kraftwerk-kit/'),
    createPad('pad-12', 'Lasers 12', 'F', 'fx', 'Lasers', 'lasers.wav', 0.66, '/kraftwerk-kit/'),
    createPad('pad-13', 'Melody 13', 'Z', 'melodic', 'Melody', 'melody.wav', 0.72, '/kraftwerk-kit/'),
    createPad('pad-14', 'Synth 14', 'X', 'fx', 'Synth', 'synth.wav', 0.7, '/kraftwerk-kit/'),
    createPad('pad-15', 'Low Boing 15', 'C', 'melodic', 'Low Boing', 'low-boing.wav', 0.78, '/kraftwerk-kit/'),
    createPad('pad-16', 'Ahh 16', 'V', 'fx', 'Ahh', 'ahh.wav', 0.68, '/kraftwerk-kit/'),
  ],
  C: [
    createPad('pad-1', 'Stomp 01', '1', 'drums', 'Blade Stomp Thud', '1774400746585-pad-1-blade-stomp-thud.mp3', 1.0, '/ice-kit/'),
    createPad('pad-2', 'Crack 02', '2', 'drums', 'Ice Crack Snap', '1774400746540-pad-2-ice-crack-snap.mp3', 0.88, '/ice-kit/'),
    createPad('pad-3', 'Scrape 03', '3', 'drums', 'Quick Blade Scrape', '1774400746466-pad-3-quick-blade-scrape.mp3', 0.7, '/ice-kit/'),
    createPad('pad-4', 'Glide 04', '4', 'drums', 'Gliding Edge Release', '1774400746919-pad-4-gliding-edge-release.mp3', 0.72, '/ice-kit/'),
    createPad('pad-5', 'Chop 05', 'Q', 'textures', 'Double Blade Chop', '1774400748514-pad-5-double-blade-chop.mp3', 0.82, '/ice-kit/'),
    createPad('pad-6', 'Tap 06', 'W', 'textures', 'Frozen Surface Tap', '1774400749279-pad-6-frozen-surface-tap.mp3', 0.74, '/ice-kit/'),
    createPad('pad-7', 'Clank 07', 'E', 'textures', 'Blade Guard Clank', '1774400748824-pad-7-blade-guard-clank.mp3', 0.74, '/ice-kit/'),
    createPad('pad-8', 'Whoosh 08', 'R', 'fx', 'Spinning Blade Whoosh', '1774400748728-pad-8-spinning-blade-whoosh.mp3', 0.66, '/ice-kit/'),
    createPad('pad-9', 'Resonance 09', 'A', 'melodic', 'Low Ice Resonance', '1774400751178-pad-9-low-ice-resonance.mp3', 0.88, '/ice-kit/'),
    createPad('pad-10', 'Frost 10', 'S', 'melodic', 'Mid Frost Knock', '1774400750926-pad-10-mid-frost-knock.mp3', 0.8, '/ice-kit/'),
    createPad('pad-11', 'Tick 11', 'D', 'melodic', 'Edge Tick Melody', '1774400751124-pad-11-edge-tick-melody.mp3', 0.72, '/ice-kit/'),
    createPad('pad-12', 'Shimmer 12', 'F', 'melodic', 'Sustained Glide Shimmer', '1774400751187-pad-12-sustained-glide-shimmer.mp3', 0.72, '/ice-kit/'),
    createPad('pad-13', 'Shatter 13', 'Z', 'fx', 'Ice Shatter Burst', '1774400754905-pad-13-ice-shatter-burst.mp3', 0.72, '/ice-kit/'),
    createPad('pad-14', 'Chirp 14', 'X', 'fx', 'Blade Squeak Chirp', '1774400752826-pad-14-blade-squeak-chirp.mp3', 0.68, '/ice-kit/'),
    createPad('pad-15', 'Scatter 15', 'C', 'fx', 'Ice Chip Scatter', '1774400752914-pad-15-ice-chip-scatter.mp3', 0.72, '/ice-kit/'),
    createPad('pad-16', 'Wind 16', 'V', 'fx', 'Arctic Wind Carve', '1774400753041-pad-16-arctic-wind-carve.mp3', 0.68, '/ice-kit/'),
  ],
  D: [
    createPad('pad-1', 'Kick 01', '1', 'drums', 'BD Heavy Handed', 'BD Heavy Handed.wav', 1.0),
    createPad('pad-2', 'Snare 02', '2', 'drums', 'SD Unclean', 'SD Unclean.wav', 0.9),
    createPad('pad-3', 'Hat 03', '3', 'drums', 'HH Hard Hittin Short', 'HH Hard Hittin Short.wav', 0.7),
    createPad('pad-4', 'Open Hat 04', '4', 'drums', 'HHO Longuish', 'HHO Longuish.wav', 0.74),
    createPad('pad-5', 'Clap 05', 'Q', 'textures', 'CL Bitreduced', 'CL Bitreduced.wav', 0.8),
    createPad('pad-6', 'Perc 06', 'W', 'textures', 'PC Found Sound', 'PC Found Sound.wav', 0.72),
    createPad('pad-7', 'Cowbell 07', 'E', 'textures', 'CB Echocow', 'CB Echocow.wav', 0.74),
    createPad('pad-8', 'Metal FX 08', 'R', 'fx', 'FX Chorus Ride', 'FX Chorus Ride.wav', 0.68),
    createPad('pad-9', 'Tom 09', 'A', 'melodic', 'TM Thumb', 'TM Thumb.wav', 0.84),
    createPad('pad-10', 'Mid Tom 10', 'S', 'melodic', 'TM Damped', 'TM Damped.wav', 0.8),
    createPad('pad-11', 'Rim 11', 'D', 'melodic', 'RS 12bit', 'RS 12bit.wav', 0.68),
    createPad('pad-12', 'Ride 12', 'F', 'melodic', 'RD Ride Stereo', 'RD Ride Stereo.wav', 0.74),
    createPad('pad-13', 'Crash 13', 'Z', 'fx', 'CY Ugly', 'CY Ugly.wav', 0.7),
    createPad('pad-14', 'Blip 14', 'X', 'fx', 'FX Blip', 'FX Blip.wav', 0.68),
    createPad('pad-15', 'Shaker 15', 'C', 'fx', 'PC Long Shake', 'PC Long Shake.wav', 0.72),
    createPad('pad-16', 'Ride FX 16', 'V', 'fx', 'FX FM Metal', 'FX FM Metal.wav', 0.66),
  ],
}

export const allBankPads = Object.values(bankKits).flat()
