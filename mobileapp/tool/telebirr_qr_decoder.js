/*
 * Standalone port of Api/Implementation/Services/Payment/TelebirrQrDecoder.cs.
 * Adapted from https://github.com/1RB/cheki/blob/main/src/lib/qr/telebirr.ts
 *
 * MIT License
 * Copyright (c) 2026 1RB
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
'use strict';

// Accepts scanned QR text (Base64, URL-safe Base64, or raw hex), not an image.
// Returns the transaction reference, or null for an invalid payload.
// The CRC checks QR integrity; it does not verify payment with Telebirr.
// CLI: node tool/telebirr_qr_decoder.js "PASTE_QR_TEXT_HERE"
// Node: const { decodeTelebirrQr } = require('./tool/telebirr_qr_decoder.js');
// Browser: load as a script and call decodeTelebirrQr(qrText).
function decodeTelebirrQr(input) {
  if (typeof input !== 'string' || input.length > 4096) return null;
  // Match .NET char.IsWhiteSpace used by the backend.
  const raw = input.replace(/[\u0009-\u000d\u0085\p{Zs}\p{Zl}\p{Zp}]/gu, '');
  if (raw.length === 0 || raw.length > 1024) return null;

  const base64 = raw.replace(/-/g, '+').replace(/_/g, '/');
  if (base64.length % 4 === 1) return null;
  let hex = raw;
  try {
    const decoded = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
    if (/^[a-f0-9]*$/i.test(decoded)) hex = decoded;
  } catch {
    // Raw hexadecimal input is also supported.
  }
  if (!hex.length || hex.length > 512 || hex.length % 2 || !/^[a-f0-9]+$/i.test(hex)) {
    return null;
  }

  const entries = [];
  let position = 0;
  while (position < hex.length) {
    if (entries.length >= 16 || position + 4 > hex.length) return null;
    const tag = hex.slice(position, position + 2).toUpperCase();
    const lengthText = hex.slice(position + 2, position + 4);
    if (!/^[0-9]{2}$/.test(lengthText)) return null;
    const length = Number(lengthText);
    position += 4;
    if (!length || position + length > hex.length) return null;
    entries.push({ tag, value: hex.slice(position, position + length), offset: position });
    position += length;
  }
  if (entries.length < 2) return null;

  const checksum = entries[entries.length - 1];
  if (checksum.tag !== '63' || checksum.value.length !== 4 ||
      crc16(hex.slice(0, checksum.offset)) !== parseInt(checksum.value, 16)) {
    return null;
  }
  const containers = entries.filter(entry => entry.tag === '81');
  if (containers.length !== 1 || containers[0].value.length % 2) return null;
  const bytes = containers[0].value.match(/../g).map(byte => parseInt(byte, 16));

  const tags = new Set();
  let reference = null;
  position = 0;
  while (position < bytes.length) {
    if (tags.size >= 16 || position + 2 > bytes.length) return null;
    const tag = bytes[position++];
    const length = bytes[position++];
    if (length >= 128 || position + length > bytes.length || tags.has(tag)) return null;
    tags.add(tag);
    if (tag === 0) {
      if (length !== 10) return null;
      reference = String.fromCharCode(...bytes.slice(position, position + length));
      if (!/^[A-Z0-9]{10}$/.test(reference)) return null;
    }
    position += length;
  }
  return reference;
}

// CRC-16/CCITT-FALSE: polynomial 0x1021, initial value 0xffff.
function crc16(text) {
  let crc = 0xffff;
  for (let index = 0; index < text.length; index++) {
    crc ^= text.charCodeAt(index) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = ((crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1) & 0xffff;
    }
  }
  return crc;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { decodeTelebirrQr, crc16 };
  if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args.length === 0 && process.stdin.isTTY)) {
      console.error('Usage: node tool/telebirr_qr_decoder.js "QR_TEXT" (or pipe QR text to stdin)');
      process.exitCode = 1;
    } else {
      const input = args.length ? args[0] : require('node:fs').readFileSync(0, 'utf8');
      const reference = decodeTelebirrQr(input);
      if (reference === null) {
        console.error('Invalid Telebirr QR payload.');
        process.exitCode = 1;
      } else {
        console.log(JSON.stringify({
          reference,
          receiptUrl: `https://transactioninfo.ethiotelecom.et/receipt/${reference}`,
        }, null, 2));
      }
    }
  }
}
