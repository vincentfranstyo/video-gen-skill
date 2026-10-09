#!/usr/bin/env bash
# Usage: imggen.sh "<prompt>" <out.png> [size] [model]
# Any OpenAI-compatible /images/generations endpoint. Env: IMAGE_GEN_API_KEY (required),
# IMAGE_GEN_BASE_URL (default https://api.openai.com/v1), IMAGE_GEN_MODEL (default gpt-image-1).
set -euo pipefail
: "${IMAGE_GEN_API_KEY:?IMAGE_GEN_API_KEY not set}"
prompt="${1:?usage: imggen.sh \"<prompt>\" <out.png> [size] [model]}"
out="${2:?output path required}"; size="${3:-1536x1024}"; model="${4:-${IMAGE_GEN_MODEL:-gpt-image-1}}"
base="${IMAGE_GEN_BASE_URL:-https://api.openai.com/v1}"
body=$(jq -n --arg m "$model" --arg p "$prompt" --arg s "$size" '{model:$m,prompt:$p,n:1,size:$s}')
resp=$(curl -sS -m 300 "$base/images/generations" \
  -H "Authorization: Bearer $IMAGE_GEN_API_KEY" -H "Content-Type: application/json" -d "$body")
b64=$(jq -r '.data[0].b64_json // empty' <<<"$resp")
if [[ -z "$b64" ]]; then
  url=$(jq -r '.data[0].url // empty' <<<"$resp")
  [[ -n "$url" ]] || { echo "imggen: $(jq -c '.error // .' <<<"$resp")" >&2; exit 1; }
  curl -sS -m 120 -o "$out" "$url"
else
  base64 -d <<<"$b64" > "$out"
fi
echo "$out"
