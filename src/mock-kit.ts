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

const sampleUrl = (fileName: string) => '/mock-samples/' + encodeURIComponent(fileName)

export const mockKitPads: Pad[] = [
  { id: 'pad-1', label: 'Kick 01', keyTrigger: '1', group: 'drums', sampleName: 'BD Short and Clean', sampleFile: 'BD Short and Clean.wav', sampleUrl: sampleUrl('BD Short and Clean.wav'), sourceType: 'uploaded', durationLabel: 'fixture audio', gain: 1.0 },
  { id: 'pad-2', label: 'Snare 02', keyTrigger: '2', group: 'drums', sampleName: 'SD Classic Snare', sampleFile: 'SD Classic Snare.wav', sampleUrl: sampleUrl('SD Classic Snare.wav'), sourceType: 'uploaded', durationLabel: 'fixture audio', gain: 0.92 },
  { id: 'pad-3', label: 'Hat 03', keyTrigger: '3', group: 'drums', sampleName: 'HH Short', sampleFile: 'HH Short.wav', sampleUrl: sampleUrl('HH Short.wav'), sourceType: 'uploaded', durationLabel: 'fixture audio', gain: 0.68 },
  { id: 'pad-4', label: 'Open Hat 04', keyTrigger: '4', group: 'drums', sampleName: 'HHO Longuish', sampleFile: 'HHO Longuish.wav', sampleUrl: sampleUrl('HHO Longuish.wav'), sourceType: 'uploaded', durationLabel: 'fixture audio', gain: 0.7 },
  { id: 'pad-5', label: 'Clap 05', keyTrigger: 'Q', group: 'textures', sampleName: 'CL Analog Clap', sampleFile: 'CL Analog Clap.wav', sampleUrl: sampleUrl('CL Analog Clap.wav'), sourceType: 'uploaded', durationLabel: 'fixture audio', gain: 0.82 },
  { id: 'pad-6', label: 'Perc 06', keyTrigger: 'W', group: 'textures', sampleName: 'PC Cabasa', sampleFile: 'PC Cabasa.wav', sampleUrl: sampleUrl('PC Cabasa.wav'), sourceType: 'uploaded', durationLabel: 'fixture audio', gain: 0.72 },
  { id: 'pad-7', label: 'Cowbell 07', keyTrigger: 'E', group: 'textures', sampleName: 'CB Cowbell', sampleFile: 'CB Cowbell.wav', sampleUrl: sampleUrl('CB Cowbell.wav'), sourceType: 'uploaded', durationLabel: 'fixture audio', gain: 0.72 },
  { id: 'pad-8', label: 'Metal FX 08', keyTrigger: 'R', group: 'fx', sampleName: 'FX FM Metal', sampleFile: 'FX FM Metal.wav', sampleUrl: sampleUrl('FX FM Metal.wav'), sourceType: 'uploaded', durationLabel: 'fixture audio', gain: 0.65 },
  { id: 'pad-9', label: 'Tom 09', keyTrigger: 'A', group: 'melodic', sampleName: 'TM Lo Tom', sampleFile: 'TM Lo Tom.wav', sampleUrl: sampleUrl('TM Lo Tom.wav'), sourceType: 'uploaded', durationLabel: 'fixture audio', gain: 0.86 },
  { id: 'pad-10', label: 'Mid Tom 10', keyTrigger: 'S', group: 'melodic', sampleName: 'TM Mid Conga Var', sampleFile: 'TM Mid Conga Var.wav', sampleUrl: sampleUrl('TM Mid Conga Var.wav'), sourceType: 'uploaded', durationLabel: 'fixture audio', gain: 0.82 },
  { id: 'pad-11', label: 'Rim 11', keyTrigger: 'D', group: 'melodic', sampleName: 'RS Classic', sampleFile: 'RS Classic.wav', sampleUrl: sampleUrl('RS Classic.wav'), sourceType: 'uploaded', durationLabel: 'fixture audio', gain: 0.7 },
  { id: 'pad-12', label: 'Ride 12', keyTrigger: 'F', group: 'melodic', sampleName: 'RD Ride Stereo', sampleFile: 'RD Ride Stereo.wav', sampleUrl: sampleUrl('RD Ride Stereo.wav'), sourceType: 'uploaded', durationLabel: 'fixture audio', gain: 0.74 },
  { id: 'pad-13', label: 'Crash 13', keyTrigger: 'Z', group: 'fx', sampleName: 'CY Useful Mono', sampleFile: 'CY Useful Mono.wav', sampleUrl: sampleUrl('CY Useful Mono.wav'), sourceType: 'uploaded', durationLabel: 'fixture audio', gain: 0.7 },
  { id: 'pad-14', label: 'Blip 14', keyTrigger: 'X', group: 'fx', sampleName: 'FX Blip', sampleFile: 'FX Blip.wav', sampleUrl: sampleUrl('FX Blip.wav'), sourceType: 'uploaded', durationLabel: 'fixture audio', gain: 0.68 },
  { id: 'pad-15', label: 'Shaker 15', keyTrigger: 'C', group: 'fx', sampleName: 'PC Stereo Shaker', sampleFile: 'PC Stereo Shaker.wav', sampleUrl: sampleUrl('PC Stereo Shaker.wav'), sourceType: 'uploaded', durationLabel: 'fixture audio', gain: 0.72 },
  { id: 'pad-16', label: 'Ride FX 16', keyTrigger: 'V', group: 'fx', sampleName: 'FX Chorus Ride', sampleFile: 'FX Chorus Ride.wav', sampleUrl: sampleUrl('FX Chorus Ride.wav'), sourceType: 'uploaded', durationLabel: 'fixture audio', gain: 0.64 },
]
