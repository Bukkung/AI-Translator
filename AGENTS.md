# Development guide

This repository is a fork-ready workspace based on `thainph/ai-trans`.

## Product goal

Build a Chrome Manifest V3 extension for context-aware English-to-Thai translation of selected text. The extension should collect the selected text plus the current readable block and its previous/next readable siblings, then ask a local Qwen model through Ollama to either:

- translate only the selected text into Thai; or
- explain the selected text in Thai using its technical context.

## Constraints

- Keep the extension build-free and dependency-free unless a change clearly requires otherwise.
- Keep all model/network calls in `background.js`.
- Keep DOM selection, readable-block extraction, and Shadow DOM popup behavior in `content.js`.
- Do not mutate or translate the context itself; context is prompt input only.
- Treat page text as untrusted data and delimit it clearly in prompts.
- Preserve the existing full-page translation and reverse-translation flows unless a task explicitly changes them.
- Never commit API keys, browser storage exports, or model data.

## Development workflow

- Develop on `feat/context-aware-translate-explain` or a child branch.
- Load this directory through `chrome://extensions` using **Load unpacked**.
- Reload the extension after editing `background.js` or `manifest.json`; reload the test page after editing `content.js`.
- Before committing, validate `manifest.json`, run JavaScript syntax checks, and manually exercise selection behavior on normal prose, nested elements, lists, tables, code blocks, editable fields, and a PDF rendered by Chrome.

