import { invoke } from "@tauri-apps/api/core";

export interface VoiceCloneRequest {
  referenceAudioBase64: string;
  mimeType: string;
  text: string;
  instruction: string;
  consentConfirmed: boolean;
}

export interface VoiceCloneResult {
  audioBase64: string;
  mimeType: string;
  finalTextPreview: string | null;
  segments: VoiceCloneSegment[];
}

export interface VoiceCloneSegment {
  audioBase64: string;
  mimeType: string;
  text: string;
  finalTextPreview: string | null;
}

export const voiceCloneApi = {
  generate(request: VoiceCloneRequest): Promise<VoiceCloneResult> {
    return invoke("generate_yuanheng_voice_clone", { request });
  },
};
