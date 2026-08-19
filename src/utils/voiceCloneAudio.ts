export const VOICE_CLONE_MAX_FILE_BYTES = 7_000_000;
export const VOICE_CLONE_MAX_RECORDING_SECONDS = 30;

const WAV_MIME_TYPES = new Set(["audio/wav", "audio/x-wav", "audio/wave"]);
const MP3_MIME_TYPES = new Set(["audio/mpeg", "audio/mp3"]);

export function normalizeVoiceCloneMimeType(
  mimeType: string,
  fileName = "",
): "audio/wav" | "audio/mpeg" | null {
  const normalized = mimeType.trim().toLowerCase().split(";", 1)[0];
  if (WAV_MIME_TYPES.has(normalized) || /\.wav$/i.test(fileName)) {
    return "audio/wav";
  }
  if (MP3_MIME_TYPES.has(normalized) || /\.mp3$/i.test(fileName)) {
    return "audio/mpeg";
  }
  return null;
}

export function validateVoiceCloneFile(file: {
  name: string;
  type: string;
  size: number;
}): string | null {
  if (!normalizeVoiceCloneMimeType(file.type, file.name)) {
    return "referenceUnsupported";
  }
  if (file.size <= 0) {
    return "referenceEmpty";
  }
  if (file.size > VOICE_CLONE_MAX_FILE_BYTES) {
    return "referenceTooLarge";
  }
  return null;
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const arrayBuffer =
    typeof blob.arrayBuffer === "function"
      ? await blob.arrayBuffer()
      : await new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () =>
            reject(reader.error ?? new Error("读取音频失败"));
          reader.onload = () => resolve(reader.result as ArrayBuffer);
          reader.readAsArrayBuffer(blob);
        });
  const bytes = new Uint8Array(arrayBuffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }
  return btoa(binary);
}

export function base64ToAudioBlob(base64: string, mimeType: string): Blob {
  const normalized = base64.includes(",")
    ? base64.slice(base64.indexOf(",") + 1)
    : base64;
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

export function encodePcm16Wav(
  chunks: readonly Float32Array[],
  sampleRate: number,
): Blob {
  const totalSamples = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const buffer = new ArrayBuffer(44 + totalSamples * 2);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + totalSamples * 2, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, totalSamples * 2, true);

  let outputOffset = 44;
  for (const chunk of chunks) {
    for (const sample of chunk) {
      const clamped = Math.max(-1, Math.min(1, sample));
      const pcm = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
      view.setInt16(outputOffset, Math.round(pcm), true);
      outputOffset += 2;
    }
  }

  return new Blob([buffer], { type: "audio/wav" });
}

export function formatAudioBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
