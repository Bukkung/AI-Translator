const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createHarness(modelResponse = "ผลลัพธ์", storageData = {}) {
  let messageListener;
  let fetchRequest;
  const chrome = {
    runtime: {
      onInstalled: { addListener() {} },
      onMessage: { addListener(listener) { messageListener = listener; } },
    },
    storage: {
      sync: {
        async get() {
          return {
            provider: "ollama",
            ollamaUrl: "http://localhost:11434",
            ollamaModel: "qwen-test",
            ...storageData.sync,
          };
        },
      },
      local: {
        async get() { return storageData.local || {}; },
      },
    },
    declarativeNetRequest: { updateDynamicRules() {} },
  };
  const fetch = async (url, options) => {
    fetchRequest = { url, options, body: JSON.parse(options.body) };
    return {
      ok: true,
      async json() {
        return {
          message: { content: modelResponse },
          choices: [{ message: { content: modelResponse } }],
        };
      },
    };
  };
  const source = fs.readFileSync(path.join(__dirname, "..", "background.js"), "utf8");
  vm.runInNewContext(source, { chrome, fetch, console, Date, JSON, String, Object, Array, Error });

  async function send(request) {
    return new Promise((resolve) => {
      const keepChannelOpen = messageListener(request, {}, resolve);
      assert.equal(keepChannelOpen, true);
    });
  }

  return { send, getRequest: () => fetchRequest, getRequestBody: () => fetchRequest?.body };
}

test("translateSelection sends bounded context as untrusted document data", async () => {
  const harness = createHarness("การกระตุ้นสนามแม่เหล็ก");
  const response = await harness.send({
    action: "translateSelection",
    mode: "translate",
    selectedText: "excitation",
    sourceLang: "english",
    targetLang: "thai",
    style: "business",
    context: {
      previous: "The field winding establishes the main magnetic flux.",
      current: "The excitation current is supplied to the rotor.",
      next: "As excitation increases, terminal voltage rises.",
    },
  });

  assert.equal(response.success, true);
  assert.equal(response.translation, "การกระตุ้นสนามแม่เหล็ก");
  const body = harness.getRequestBody();
  assert.equal(body.stream, false);
  assert.match(body.messages[0].content, /untrusted document text/);
  assert.match(body.messages[0].content, /Translate only the selected text from English to Thai/);
  assert.match(body.messages[0].content, /Preferred Thai engineering term.*การกระตุ้นสนามแม่เหล็ก/);
  const payload = JSON.parse(body.messages[1].content);
  assert.equal(payload.selected_text, "excitation");
  assert.match(payload.surrounding_context.current, /excitation current/);
});

test("explain mode requests a concise grounded explanation", async () => {
  const harness = createHarness("คำอธิบายเชิงวิศวกรรม");
  const response = await harness.send({
    action: "translateSelection",
    mode: "explain",
    selectedText: "slip",
    sourceLang: "english",
    targetLang: "thai",
    context: { current: "Slip is the difference between synchronous and rotor speed." },
  });

  assert.equal(response.success, true);
  const systemPrompt = harness.getRequestBody().messages[0].content;
  assert.match(systemPrompt, /Explain the selected English text in Thai/);
  assert.match(systemPrompt, /1-3 concise sentences/);
});

test("OpenAI provider reads the API key from device-local storage", async () => {
  const harness = createHarness("คำแปล", {
    sync: { provider: "openai", openaiModel: "gpt-4o-mini" },
    local: { apiKey: "sk-device-local" },
  });

  const response = await harness.send({
    action: "translateSelection",
    mode: "translate",
    selectedText: "voltage",
    sourceLang: "english",
    targetLang: "thai",
    context: { current: "The terminal voltage rises." },
  });

  assert.equal(response.success, true);
  assert.equal(harness.getRequest().url, "https://api.openai.com/v1/chat/completions");
  assert.equal(harness.getRequest().options.headers.Authorization, "Bearer sk-device-local");
});
