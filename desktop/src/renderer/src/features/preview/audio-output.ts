// Una fuente por elemento: React StrictMode puede desmontar/remontar efectos.
const outputs = new WeakMap<HTMLMediaElement, { source: MediaElementAudioSourceNode; gain: GainNode }>()
let context: AudioContext | undefined

export function previewOutput(element: HTMLMediaElement) {
  context ??= new AudioContext()
  let output = outputs.get(element)
  if (!output) {
    const source = context.createMediaElementSource(element)
    const gain = context.createGain()
    source.connect(gain)
    output = { source, gain }
    outputs.set(element, output)
  }
  return { ...output, context }
}
