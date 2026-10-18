import { availableChannels } from '../services/otpService.js';
import { sttProviders, sttAvailable } from '../services/sttService.js';
import { ttsStatus, ttsAvailable } from '../services/ttsService.js';
import { voiceCloneAvailable } from '../services/voiceService.js';
import { translationEngines } from '../services/translationService.js';
import { llmAvailable } from '../services/llmService.js';
import { pushAvailable } from '../services/pushService.js';
import { dubbingAvailable } from '../services/dubbingService.js';
import { turnConfigured } from '../services/iceService.js';
import { WEAK_WHISPER } from './languages.js';

export const getFeatures = () => ({
  otp: { ...availableChannels(), dev: process.env.NODE_ENV === 'development' },
  stt: { available: sttAvailable(), ...sttProviders() },
  tts: { available: ttsAvailable(), ...ttsStatus() },
  voiceClone: voiceCloneAvailable(),
  push: pushAvailable(),
  translation: translationEngines(),
  dialectAI: llmAvailable(),
  dubbing: dubbingAvailable(),
  turn: turnConfigured(),
  groupCalls: { enabled: true, max: Math.min(Number(process.env.MAX_ROOM_SIZE) || 6, 8) },
  weakAsr: [...WEAK_WHISPER],
});
