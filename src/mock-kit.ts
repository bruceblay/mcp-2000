export type PadGroup = 'drums' | 'textures' | 'melodic' | 'fx'
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

const sampleUrl = (fileName: string) => '/mock-samples/' + encodeURIComponent(fileName)

const createPad = (
  id: string,
  label: string,
  keyTrigger: string,
  group: PadGroup,
  sampleName: string,
  sampleFile: string,
  gain: number,
): Pad => ({
  id,
  label,
  keyTrigger,
  group,
  sampleName,
  sampleFile,
  sampleUrl: sampleUrl(sampleFile),
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
    createPad('pad-1', 'Kick 01', '1', 'drums', 'BD Big Gun', 'BD Big Gun.wav', 1.0),
    createPad('pad-2', 'Snare 02', '2', 'drums', 'SD Good Snare', 'SD Good Snare.wav', 0.9),
    createPad('pad-3', 'Hat 03', '3', 'drums', 'HH 909ish', 'HH 909ish.wav', 0.66),
    createPad('pad-4', 'Open Hat 04', '4', 'drums', 'HHO Way Open', 'HHO Way Open.wav', 0.74),
    createPad('pad-5', 'Clap 05', 'Q', 'textures', 'CL Hybrid Clap', 'CL Hybrid Clap.wav', 0.84),
    createPad('pad-6', 'Perc 06', 'W', 'textures', 'PC Block', 'PC Block.wav', 0.72),
    createPad('pad-7', 'Cowbell 07', 'E', 'textures', 'CB Decadent', 'CB Decadent.wav', 0.72),
    createPad('pad-8', 'Metal FX 08', 'R', 'fx', 'FX Aquablob', 'FX Aquablob.wav', 0.66),
    createPad('pad-9', 'Tom 09', 'A', 'melodic', 'TM Character', 'TM Character.wav', 0.84),
    createPad('pad-10', 'Mid Tom 10', 'S', 'melodic', 'TM Mid Conga New', 'TM Mid Conga New.wav', 0.82),
    createPad('pad-11', 'Rim 11', 'D', 'melodic', 'RS AR finest', 'RS AR finest.wav', 0.7),
    createPad('pad-12', 'Ride 12', 'F', 'melodic', 'RD Monoride Gentle', 'RD Monoride Gentle.wav', 0.72),
    createPad('pad-13', 'Crash 13', 'Z', 'fx', 'CY Dark Variant', 'CY Dark Variant.wav', 0.7),
    createPad('pad-14', 'Blip 14', 'X', 'fx', 'FX Boing', 'FX Boing.wav', 0.68),
    createPad('pad-15', 'Shaker 15', 'C', 'fx', 'PC Shake Me', 'PC Shake Me.wav', 0.72),
    createPad('pad-16', 'Ride FX 16', 'V', 'fx', 'FX Wave Ride', 'FX Wave Ride.wav', 0.66),
  ],
  C: [
    createPad('pad-1', 'Kick 01', '1', 'drums', 'BD Classic 808', 'BD Classic 808.wav', 1.0),
    createPad('pad-2', 'Snare 02', '2', 'drums', 'SD Another 808', 'SD Another 808.wav', 0.88),
    createPad('pad-3', 'Hat 03', '3', 'drums', 'HH 909 Var2', 'HH 909 Var2.wav', 0.66),
    createPad('pad-4', 'Open Hat 04', '4', 'drums', 'HHO Full Metal', 'HHO Full Metal.wav', 0.72),
    createPad('pad-5', 'Clap 05', 'Q', 'textures', 'CL Snap', 'CL Snap.wav', 0.82),
    createPad('pad-6', 'Perc 06', 'W', 'textures', 'PC Techno 1', 'PC Techno 1.wav', 0.72),
    createPad('pad-7', 'Cowbell 07', 'E', 'textures', 'CB Thingy', 'CB Thingy.wav', 0.74),
    createPad('pad-8', 'Metal FX 08', 'R', 'fx', 'FX Hi Metal', 'FX Hi Metal.wav', 0.66),
    createPad('pad-9', 'Tom 09', 'A', 'melodic', 'BT Low Rumble', 'BT Low Rumble.wav', 0.88),
    createPad('pad-10', 'Mid Tom 10', 'S', 'melodic', 'TM muTonic', 'TM muTonic.wav', 0.8),
    createPad('pad-11', 'Rim 11', 'D', 'melodic', 'RS Shot', 'RS Shot.wav', 0.7),
    createPad('pad-12', 'Ride 12', 'F', 'melodic', 'RD Tail me', 'RD Tail me.wav', 0.72),
    createPad('pad-13', 'Crash 13', 'Z', 'fx', 'CY Strong Stretch', 'CY Strong Stretch.wav', 0.72),
    createPad('pad-14', 'Blip 14', 'X', 'fx', 'FX Shakey', 'FX Shakey.wav', 0.66),
    createPad('pad-15', 'Shaker 15', 'C', 'fx', 'PC Stereo Shaker', 'PC Stereo Shaker.wav', 0.72),
    createPad('pad-16', 'Ride FX 16', 'V', 'fx', 'CY Echo', 'CY Echo.wav', 0.66),
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
