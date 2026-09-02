import { EffectConfig } from './types'

export const delayConfig: EffectConfig = {
  id: 'delay',
  name: 'Delay',
  description: 'Simple delay with feedback',
  parameters: [
    {
      key: 'delayTime',
      label: 'Time',
      min: 0.01,
      max: 1.0,
      step: 0.01,
      default: 0.25,
      unit: 's'
    },
    {
      key: 'feedback',
      label: 'Feedback',
      min: 0,
      max: 0.95,
      step: 0.01,
      default: 0.3,
      unit: '%'
    },
    {
      key: 'wet',
      label: 'Dry/Wet',
      min: 0,
      max: 1,
      step: 0.01,
      default: 0.4,
      unit: '%'
    }
  ],
  defaultValues: {
    delayTime: 0.25,
    feedback: 0.3,
    wet: 0.4
  },
  sliderColor: '#50C878' // Boss DD-7 green
}
