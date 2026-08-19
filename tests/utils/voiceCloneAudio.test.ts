import { describe, expect, it } from "vitest";
import {
  base64ToAudioBlob,
  blobToBase64,
  encodePcm16Wav,
  normalizeVoiceCloneMimeType,
  validateVoiceCloneFile,
} from "@/utils/voiceCloneAudio";

describe("voice clone audio helpers", () => {
  const readBlob = (blob: Blob) =>
    new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.readAsArrayBuffer(blob);
    });

  it("accepts WAV and MP3 and rejects unrelated formats", () => {
    expect(normalizeVoiceCloneMimeType("audio/wav", "sample.wav")).toBe(
      "audio/wav",
    );
    expect(normalizeVoiceCloneMimeType("", "sample.mp3")).toBe("audio/mpeg");
    expect(normalizeVoiceCloneMimeType("audio/webm", "sample.webm")).toBeNull();
  });

  it("enforces the reference audio size and type boundary", () => {
    expect(
      validateVoiceCloneFile({ name: "voice.wav", type: "audio/wav", size: 1 }),
    ).toBeNull();
    expect(
      validateVoiceCloneFile({
        name: "voice.webm",
        type: "audio/webm",
        size: 1,
      }),
    ).toBe("referenceUnsupported");
    expect(
      validateVoiceCloneFile({
        name: "voice.wav",
        type: "audio/wav",
        size: 7_000_001,
      }),
    ).toBe("referenceTooLarge");
  });

  it("round-trips base64 audio bytes", async () => {
    const source = new Blob([new Uint8Array([0, 1, 2, 255])], {
      type: "audio/wav",
    });
    const encoded = await blobToBase64(source);
    const decoded = new Uint8Array(
      await readBlob(base64ToAudioBlob(encoded, "audio/wav")),
    );
    expect([...decoded]).toEqual([0, 1, 2, 255]);
  });

  it("writes a mono PCM16 WAV header", async () => {
    const wav = encodePcm16Wav([new Float32Array([0, 1, -1])], 16_000);
    const bytes = new Uint8Array(await readBlob(wav));
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...bytes.slice(8, 12))).toBe("WAVE");
    expect(new DataView(bytes.buffer).getUint32(24, true)).toBe(16_000);
    expect(wav.type).toBe("audio/wav");
  });
});
