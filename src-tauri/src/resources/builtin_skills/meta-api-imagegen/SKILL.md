---
name: meta-api-imagegen
description: Generate or edit raster images with the YuanHeng Meta API. Use for posters, promotional images, product images, thumbnails, image generation, image editing, gpt-image-2, Image 2, or when the user provides one or more reference images.
---

# YuanHeng ImageGen

Generate and edit images through YuanHeng's OpenAI-compatible API.

## Routing

Use the bundled helper. Its default route is the direct Images API:

- Generation: `POST /v1/images/generations`
- Editing: `POST /v1/images/edits`
- Model: `gpt-image-2`

If the direct route is unavailable, the helper automatically falls back to:

- `POST /v1/responses`
- Outer model: `gpt-5.5`
- Tool: `image_generation`
- Streaming enabled

When reporting results, state which route succeeded. Do not claim that the
Responses fallback used `gpt-image-2`, because the provider controls the
internal image model mapping.

## Credentials

The helper reads credentials in this order:

1. `--api-key`, when explicitly supplied.
2. `NAN_API_KEY` or `OPENAI_API_KEY` in `~/.codex/auth.json`.
3. `NAN_API_KEY` or `OPENAI_API_KEY` in the process environment.

The default base URL is `https://cn.meta-api.vip`. Never print or repeat API
keys in logs or final responses.

## Generate

```bash
node "${CODEX_HOME:-$HOME/.codex}/skills/meta-api-imagegen/scripts/meta_api_imagegen.mjs" \
  --prompt "Create a polished product poster..." \
  --out "output/imagegen/poster.png"
```

## Edit

```bash
node "${CODEX_HOME:-$HOME/.codex}/skills/meta-api-imagegen/scripts/meta_api_imagegen.mjs" \
  --image "input/product.png" \
  --prompt "Keep the product unchanged and replace the background with a clean studio background." \
  --out "output/imagegen/product-edited.png"
```

Repeat `--image` for multiple references. Use `--mask mask.png` for masked
editing when the direct Images Edit API supports it.

Useful options:

- `--size 1024x1024`
- `--quality standard`
- `--output-format png`
- `--image-model gpt-image-2`
- `--responses-model gpt-5.5`
- `--direct-only` to forbid fallback
- `--responses-only` to bypass the direct route
- `--force` to overwrite an existing output
- `--dry-run` to inspect the request without sending it

Always inspect the saved image before reporting success. Return the absolute
output path to the user.
