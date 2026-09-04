import { audioPreparationFailure, checkAudioSupport, initialAudioPreparation, prepareAudioAssets, type AudioPreparation } from './audioAssets'

let progress = initialAudioPreparation()
const report = (next: AudioPreparation) => { progress = next; postMessage(next) }
void checkAudioSupport().then(() => prepareAudioAssets(report)).catch(error => report({ ...progress, stage: 'error', error: audioPreparationFailure(error) }))
