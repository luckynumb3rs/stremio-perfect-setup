#!/usr/bin/env bash
#
# encode-wizard-key.sh
# --------------------
# Encodes a raw shared service key into the base64 string format expected by
# `wizard/config.json` under:
#
#   configurations[].keys.tmdbApiKeys
#   configurations[].keys.tmdbReadAccessTokens
#   configurations[].keys.tvdbApiKeys
#   configurations[].keys.geminiApiKeys
#   configurations[].keys.rpdbApiKeys
#
# Purpose
# -------
# The wizard supports optional shared fallback keys that can be used in the
# background when the user leaves certain key fields empty. Those fallback keys
# are not stored in plain text inside `wizard/config.json`; instead, each one is
# AES-256-GCM encrypted, wrapped into a compact JSON payload, and then base64
# encoded into a single string so it can be pasted directly into one of the key
# arrays.
#
# A passphrase is used during encoding and later during browser-side decoding at
# runtime. That means:
#
#   1. You must use the exact same passphrase when encoding and decoding.
#   2. If the passphrase changes later, previously encoded keys will no longer
#      decrypt and must be re-encoded.
#
# Usage
# -----
#   scripts/encode-wizard-key.sh <passphrase> <raw-secret>
#
# Example
# -------
#   scripts/encode-wizard-key.sh example-passphrase t0-free-rpdb
#
# Example output
# --------------
#   eyJ2IjoxLCJpIjoyNTAwMDAsInMiOiJ...<snip>...
#
# Paste that output as a JSON string into the desired key array, for example:
#
#   "rpdbApiKeys": [
#     "eyJ2IjoxLCJpIjoyNTAwMDAsInMiOiJ...<snip>..."
#   ]
#
# Notes
# -----
# - The script prints only the encoded value, so it can be copied directly.
# - Secrets containing spaces are supported; everything after `<passphrase>` is
#   treated as the raw secret.
# - This is obfuscation for repo storage convenience, not hardened secret
#   management.
#
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: scripts/encode-wizard-key.sh <passphrase> <secret>" >&2
  exit 1
fi

passphrase=$1
shift
secret="$*"

node - "$passphrase" "$secret" <<'NODE'
const crypto = require('node:crypto');

const [, , passphrase, value] = process.argv;
const iterations = 250000;
const salt = crypto.randomBytes(16);
const iv = crypto.randomBytes(12);
const key = crypto.pbkdf2Sync(passphrase, salt, iterations, 32, 'sha256');
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
const tag = cipher.getAuthTag();

const payload = {
  v: 1,
  i: iterations,
  s: salt.toString('base64'),
  n: iv.toString('base64'),
  c: Buffer.concat([encrypted, tag]).toString('base64'),
};

process.stdout.write(Buffer.from(JSON.stringify(payload), 'utf8').toString('base64'));
process.stdout.write('\n');
NODE
