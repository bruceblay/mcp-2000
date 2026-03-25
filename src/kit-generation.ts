import { bankKits, type Pad, type BankKitId } from './mock-kit'

export type PadChoice = {
  padId: string
  sampleFile: string
  sampleName: string
  group: Pad['group']
  gain: number
}

export type GeneratedKitSelection = {
  padId: string
  sampleFile: string
  rationale: string
}

export const padCatalog = Object.fromEntries(
  bankKits.A.map((templatePad) => {
    const options = Array.from(
      new Map(
        (Object.values(bankKits) as Pad[][])
          .flatMap((kit) => kit.filter((pad) => pad.id === templatePad.id))
          .map((pad) => [
            pad.sampleFile,
            {
              padId: pad.id,
              sampleFile: pad.sampleFile,
              sampleName: pad.sampleName,
              group: pad.group,
              gain: pad.gain,
            } satisfies PadChoice,
          ]),
      ).values(),
    )

    return [templatePad.id, options]
  }),
) as Record<string, PadChoice[]>

export const padRoleMap = Object.fromEntries(bankKits.A.map((pad) => [pad.id, pad.label])) as Record<string, string>

export const starterBankPads = Object.fromEntries(
  (Object.entries(bankKits) as [BankKitId, Pad[]][]).map(([bankId, pads]) => [bankId, pads.map((pad) => ({ ...pad }))]),
) as Record<BankKitId, Pad[]>

export const buildCatalogPrompt = () =>
  bankKits.A
    .map((templatePad) => {
      const choices = padCatalog[templatePad.id]
        .map((choice) => '- ' + choice.sampleFile + ' (' + choice.sampleName + ')')
        .join('\n')

      return templatePad.id + ' | ' + templatePad.label + '\n' + choices
    })
    .join('\n\n')

export const materializeGeneratedKit = (selections: GeneratedKitSelection[]) =>
  bankKits.A.map((templatePad) => {
    const selection = selections.find((entry) => entry.padId === templatePad.id)
    const choice = selection ? padCatalog[templatePad.id].find((entry) => entry.sampleFile === selection.sampleFile) : undefined

    if (!choice) {
      return { ...templatePad }
    }

    return {
      ...templatePad,
      sampleFile: choice.sampleFile,
      sampleName: choice.sampleName,
      sampleUrl: '/mock-samples/' + encodeURIComponent(choice.sampleFile),
      sourceType: 'generated' as const,
      durationLabel: 'Planned sample',
      gain: choice.gain,
      label: templatePad.label,
    }
  })

export const sanitizeGeneratedSelections = (selections: GeneratedKitSelection[]) =>
  bankKits.A.map((templatePad) => {
    const fallback = padCatalog[templatePad.id][0]
    const requested = selections.find((selection) => selection.padId === templatePad.id)
    const matchedChoice = requested
      ? padCatalog[templatePad.id].find((choice) => choice.sampleFile === requested.sampleFile)
      : undefined

    return {
      padId: templatePad.id,
      sampleFile: (matchedChoice ?? fallback).sampleFile,
      rationale: requested?.rationale?.trim() || 'Matched ' + templatePad.label + ' to the closest local option.',
    }
  })
