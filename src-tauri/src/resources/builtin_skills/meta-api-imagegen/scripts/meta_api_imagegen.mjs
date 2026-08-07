#!/usr/bin/env node

import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { homedir } from "node:os";
import { dirname, extname, resolve } from "node:path";

const DEFAULTS = {
  baseUrl: "https://cn.meta-api.vip",
  imageModel: "gpt-image-2",
  responsesModel: "gpt-5.5",
  size: "1024x1024",
  quality: "standard",
  responsesQuality: "high",
  outputFormat: "png",
  out: "output/imagegen/output.png",
};

function parseArgs(argv) {
  const args = { ...DEFAULTS, images: [] };
  const valueOptions = new Map([
    ["--api-key", "apiKey"],
    ["--base-url", "baseUrl"],
    ["--prompt", "prompt"],
    ["--prompt-file", "promptFile"],
    ["--mask", "mask"],
    ["--out", "out"],
    ["--image-model", "imageModel"],
    ["--responses-model", "responsesModel"],
    ["--size", "size"],
    ["--quality", "quality"],
    ["--responses-quality", "responsesQuality"],
    ["--output-format", "outputFormat"],
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--image") {
      const value = argv[++index];
      if (!value) throw new Error("--image requires a file path");
      args.images.push(value);
      continue;
    }
    if (valueOptions.has(token)) {
      const value = argv[++index];
      if (!value) throw new Error(`${token} requires a value`);
      args[valueOptions.get(token)] = value;
      continue;
    }
    if (token === "--direct-only") args.directOnly = true;
    else if (token === "--responses-only") args.responsesOnly = true;
    else if (token === "--force") args.force = true;
    else if (token === "--dry-run") args.dryRun = true;
    else if (token === "--help" || token === "-h") args.help = true;
    else throw new Error(`Unknown option: ${token}`);
  }

  if (args.directOnly && args.responsesOnly) {
    throw new Error("Use --direct-only or --responses-only, not both");
  }
  return args;
}

function printHelp() {
  console.log(`YuanHeng ImageGen\n\nUsage:\n  meta_api_imagegen.mjs --prompt <text> [options]\n\nOptions:\n  --image <path>           Add an edit/reference image (repeatable)\n  --mask <path>            Optional edit mask\n  --out <path>             Output path\n  --size <size>            Image size (default: 1024x1024)\n  --quality <quality>      Direct API quality (default: standard)\n  --output-format <format> png, jpeg, or webp\n  --direct-only            Do not use the Responses fallback\n  --responses-only         Skip the direct Images API\n  --force                  Overwrite an existing output\n  --dry-run                Print the planned request without sending it`);
}

function normalizeBaseUrl(value) {
  let baseUrl = String(value || DEFAULTS.baseUrl).trim().replace(/\/+$/, "");
  if (baseUrl.endsWith("/v1")) baseUrl = baseUrl.slice(0, -3).replace(/\/+$/, "");
  return baseUrl;
}

async function fileExists(path) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function loadAuthKey() {
  try {
    const raw = await readFile(resolve(homedir(), ".codex", "auth.json"), "utf8");
    const auth = JSON.parse(raw);
    return auth.NAN_API_KEY || auth.OPENAI_API_KEY || null;
  } catch {
    return null;
  }
}

async function loadPrompt(args) {
  if (args.prompt && args.promptFile) {
    throw new Error("Use --prompt or --prompt-file, not both");
  }
  if (args.promptFile) return (await readFile(args.promptFile, "utf8")).trim();
  if (args.prompt) return args.prompt.trim();
  throw new Error("Missing prompt. Use --prompt or --prompt-file");
}

function mimeType(path) {
  const extension = extname(path).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  return "image/png";
}

async function imageDataUrl(path) {
  const bytes = await readFile(path);
  return `data:${mimeType(path)};base64,${bytes.toString("base64")}`;
}

function findImage(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findImage(item);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  for (const key of ["result", "b64_json", "partial_image_b64"]) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.length > 1000) {
      return { base64: candidate, source: key };
    }
  }
  for (const item of Object.values(value)) {
    const found = findImage(item);
    if (found) return found;
  }
  return null;
}

async function parseJsonResponse(response) {
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 800)}`);
  }
  if (!response.ok) {
    const message = data?.error?.message || data?.message || text.slice(0, 800);
    throw new Error(`HTTP ${response.status}: ${message}`);
  }
  return data;
}

async function saveResult(item, out, force) {
  const outputPath = resolve(out);
  if (!force && (await fileExists(outputPath))) {
    throw new Error(`Output already exists: ${outputPath} (use --force to overwrite)`);
  }
  await mkdir(dirname(outputPath), { recursive: true });
  if (item.b64_json) {
    await writeFile(outputPath, Buffer.from(item.b64_json, "base64"));
  } else if (item.url) {
    const response = await fetch(item.url);
    if (!response.ok) throw new Error(`Image download failed: HTTP ${response.status}`);
    await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
  } else {
    throw new Error("Image response had neither b64_json nor url");
  }
  return outputPath;
}

async function directImages(args, apiKey, baseUrl, prompt) {
  const editing = args.images.length > 0;
  const url = `${baseUrl}/v1/images/${editing ? "edits" : "generations"}`;
  console.log(`TRY_DIRECT=${url} MODEL=${args.imageModel} MODE=${editing ? "edit" : "generate"}`);

  let request;
  if (editing) {
    const form = new FormData();
    form.append("model", args.imageModel);
    form.append("prompt", prompt);
    form.append("size", args.size);
    form.append("quality", args.quality);
    form.append("n", "1");
    form.append("output_format", args.outputFormat);
    for (const imagePath of args.images) {
      const bytes = await readFile(imagePath);
      const field = args.images.length === 1 ? "image" : "image[]";
      form.append(field, new Blob([bytes], { type: mimeType(imagePath) }), imagePath.split(/[/\\]/).pop());
    }
    if (args.mask) {
      const bytes = await readFile(args.mask);
      form.append("mask", new Blob([bytes], { type: mimeType(args.mask) }), args.mask.split(/[/\\]/).pop());
    }
    request = { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form };
  } else {
    const payload = {
      model: args.imageModel,
      prompt,
      size: args.size,
      quality: args.quality,
      n: 1,
      output_format: args.outputFormat,
    };
    if (args.dryRun) {
      console.log(JSON.stringify(payload));
      return null;
    }
    request = {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    };
  }

  if (args.dryRun) {
    console.log(JSON.stringify({ model: args.imageModel, prompt, size: args.size, quality: args.quality, images: args.images, mask: args.mask || null }));
    return null;
  }
  const data = await parseJsonResponse(await fetch(url, request));
  const item = data?.data?.[0];
  if (!item) throw new Error("Direct Images API returned no data[0]");
  const outputPath = await saveResult(item, args.out, args.force);
  console.log(`WROTE_IMAGE=${outputPath}`);
  console.log(`ROUTE=direct-images MODEL=${args.imageModel}`);
  return outputPath;
}

async function responsesFallback(args, apiKey, baseUrl, prompt) {
  const url = `${baseUrl}/v1/responses`;
  const content = [{ type: "input_text", text: prompt }];
  for (const imagePath of args.images) {
    content.push({ type: "input_image", image_url: await imageDataUrl(imagePath) });
  }
  const payload = {
    model: args.responsesModel,
    input: [{ role: "user", content }],
    tools: [{ type: "image_generation", size: args.size, quality: args.responsesQuality, output_format: args.outputFormat }],
    tool_choice: { type: "image_generation" },
    stream: true,
  };
  console.log(`TRY_RESPONSES=${url} MODEL=${args.responsesModel} MODE=${args.images.length ? "edit" : "generate"}`);
  if (args.dryRun) {
    const safePayload = structuredClone(payload);
    for (const item of safePayload.input[0].content) {
      if (item.image_url) item.image_url = "<local image data URL>";
    }
    console.log(JSON.stringify(safePayload));
    return null;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) await parseJsonResponse(response);

  const decoder = new TextDecoder();
  let buffer = "";
  let latest = null;
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const raw = line.slice(5).trim();
      if (!raw || raw === "[DONE]") continue;
      try {
        const found = findImage(JSON.parse(raw));
        if (found) latest = found;
      } catch {
        // Ignore non-JSON SSE lines.
      }
    }
  }
  if (!latest) throw new Error("Responses stream completed without image data");
  const outputPath = resolve(args.out);
  if (!args.force && (await fileExists(outputPath))) {
    throw new Error(`Output already exists: ${outputPath} (use --force to overwrite)`);
  }
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, Buffer.from(latest.base64, "base64"));
  console.log(`WROTE_IMAGE=${outputPath}`);
  console.log(`ROUTE=responses-tool MODEL=${args.responsesModel} SOURCE=${latest.source}`);
  console.log("NOTE=The provider controls the image model used by the Responses fallback.");
  return outputPath;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return printHelp();
  const prompt = await loadPrompt(args);
  const baseUrl = normalizeBaseUrl(args.baseUrl);
  const apiKey = args.apiKey || (await loadAuthKey()) || process.env.NAN_API_KEY || process.env.OPENAI_API_KEY;
  if (!args.dryRun && !apiKey) {
    throw new Error("Missing API key. Sign in through Codex or set NAN_API_KEY/OPENAI_API_KEY");
  }

  if (!args.responsesOnly) {
    try {
      await directImages(args, apiKey, baseUrl, prompt);
      return;
    } catch (error) {
      console.error(`DIRECT_FAILED=${error.message}`);
      if (args.directOnly) throw error;
    }
  }
  await responsesFallback(args, apiKey, baseUrl, prompt);
}

main().catch((error) => {
  console.error(`ERROR=${error.message}`);
  process.exitCode = 1;
});
