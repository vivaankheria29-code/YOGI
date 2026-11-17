#!/bin/sh
set -eu
ROOT=$(CDPATH= cd "$(dirname "$0")" && pwd -P)
RUNTIME="$ROOT/.runtime"
NODE=''
for candidate in "$RUNTIME/node" "$(command -v node 2>/dev/null || true)" /opt/homebrew/bin/node /usr/local/bin/node; do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then
    major=$("$candidate" -p 'process.versions.node.split(".")[0]' 2>/dev/null || printf 0)
    if [ "$major" -ge 22 ] 2>/dev/null; then NODE="$candidate"; break; fi
  fi
done
if [ -z "$NODE" ]; then
  case "$(uname -s)" in Darwin) platform=darwin;; Linux) platform=linux;; *) echo 'A macOS or Linux desktop is required.'; exit 1;; esac
  case "$(uname -m)" in x86_64|amd64) arch=x64;; arm64|aarch64) arch=arm64;; *) echo 'Supported CPU types: x64 and ARM64.'; exit 1;; esac
  command -v curl >/dev/null 2>&1 || { echo 'Install curl or Node.js 22+ and launch again.'; exit 1; }
  mkdir -p "$RUNTIME"
  echo 'Downloading a verified portable Node 24 LTS runtime from nodejs.org...'
  base='https://nodejs.org/dist/latest-v24.x/'
  curl --fail --location --proto '=https' --tlsv1.2 "$base"SHASUMS256.txt -o "$RUNTIME/SHASUMS256.txt"
  file=$(awk -v suffix="-$platform-$arch.tar.gz" '$2 ~ /^node-v24\.[0-9]+\.[0-9]+-/ && substr($2,length($2)-length(suffix)+1)==suffix {print $2; exit}' "$RUNTIME/SHASUMS256.txt")
  [ -n "$file" ] || { echo 'No verified runtime found for this operating system.'; exit 1; }
  expected=$(awk -v file="$file" '$2==file {print $1}' "$RUNTIME/SHASUMS256.txt")
  archive="$RUNTIME/node-archive.tar.gz"
  curl --fail --location --proto '=https' --tlsv1.2 "$base$file" -o "$archive"
  if command -v shasum >/dev/null 2>&1; then actual=$(shasum -a 256 "$archive" | awk '{print $1}'); else actual=$(sha256sum "$archive" | awk '{print $1}'); fi
  [ "$actual" = "$expected" ] || { echo 'Checksum failed. The downloaded runtime will not run.'; exit 1; }
  folder=${file%.tar.gz}
  tar -xzf "$archive" -C "$RUNTIME" --strip-components=2 "$folder/bin/node"
  NODE="$RUNTIME/node"
  chmod u+x "$NODE"
fi
PATH="$(dirname "$NODE"):$PATH"
export PATH
exec "$NODE" "$ROOT/launcher.mjs" "$@"
