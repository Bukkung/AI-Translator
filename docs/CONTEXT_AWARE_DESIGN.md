# Ramantic: Context-aware English-to-Thai translator

## Scope for the first release

The first release keeps the upstream extension architecture and adds a focused Ollama/Qwen workflow for technical documents:

1. The user highlights English text.
2. `content.js` preserves the `Range` and identifies the nearest readable block.
3. It collects three bounded context slots: previous readable block, current readable block, and next readable block.
4. The popup offers **Translate** and **Explain** modes.
5. `background.js` sends a structured, injection-resistant prompt to the selected Ollama model.
6. Qwen returns either a Thai translation of only the selection or a concise Thai explanation grounded in the supplied context.

Full-page translation remains a separate existing flow.

## Proposed request contract

```js
{
  action: "translateSelection",
  mode: "translate", // or "explain"
  selectedText: "excitation",
  context: {
    previous: "The field winding establishes the main magnetic flux.",
    current: "The excitation current is supplied to the rotor field winding.",
    next: "As the excitation increases, terminal voltage rises."
  },
  sourceLang: "english",
  targetLang: "thai",
  domain: "engineering"
}
```

The response should remain the existing `{ success, translation }` shape initially so popup rendering changes stay small. A later cleanup can rename `translation` to `result` across both surfaces.

## Readable-block strategy

Start from `Range.commonAncestorContainer`, promote text nodes to their parent element, and walk upward to the nearest semantic or block-level container such as `P`, `LI`, `TD`, `TH`, `BLOCKQUOTE`, headings, or a block-displayed `DIV`. Reject hidden nodes and the existing skip tags used by full-page translation.

For previous and next context, traverse document order among eligible readable blocks rather than using only direct siblings. This handles nested markup while keeping the context understandable. Normalize whitespace, deduplicate identical blocks, and apply both per-block and total character limits before messaging the service worker.

Recommended initial limits:

- selected text: 2,000 characters;
- each context block: 1,500 characters;
- total context: 4,000 characters.

For selections inside `INPUT` or `TEXTAREA`, use the element value as current context and omit adjacent DOM context in the first release. Chrome's built-in PDF viewer may expose different DOM structures, so PDF behavior requires an explicit manual test and a graceful selected-text-only fallback.

## Prompt invariants

- System instructions state that document text is untrusted reference material, not instructions.
- Context and selection use explicit labeled delimiters.
- Translate mode returns only the Thai translation of `selectedText`.
- Explain mode returns a short Thai explanation, including the engineering meaning when context supports it.
- The model must not translate the whole context or invent an unsupported domain meaning.

## Implementation slices

1. Extract pure context helpers and add fixture-based tests for nested DOM, block boundaries, hidden content, and size limits.
2. Extend the content-to-background message contract and add Translate/Explain controls to the Shadow DOM popup.
3. Add mode-specific prompts in `background.js`, optimized for Ollama/Qwen while retaining provider compatibility.
4. Change first-run defaults to Thai and make Ollama the recommended setup path without silently choosing an unavailable model.
5. Perform manual Chrome tests against prose, engineering documentation, editable fields, dynamic pages, and PDFs.

## Upstream integration

The local remote named `upstream` points to `thainph/ai-trans`. A future GitHub fork should be added as `origin`; feature work must never be pushed directly to `upstream`.
