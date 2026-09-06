const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createHarness(modelResponse = "ผลลัพธ์", storageData = {}) {
  let messageListener;
  let contextMenuListener;
  let fetchRequest;
  let createdWindow;
  const localState = { ...(storageData.local || {}) };
  const sessionState = {};
  const chrome = {
    runtime: {
      onInstalled: { addListener() {} },
      onMessage: { addListener(listener) { messageListener = listener; } },
      getURL(resource) { return `chrome-extension://test/${resource}`; },
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
        async get(keys) {
          if (typeof keys === "string") return { [keys]: localState[keys] };
          return localState;
        },
        async set(values) { Object.assign(localState, values); },
      },
      session: {
        async get(key) { return { [key]: sessionState[key] }; },
        async set(values) { Object.assign(sessionState, values); },
        async remove(key) { delete sessionState[key]; },
      },
      onChanged: { addListener() {} },
    },
    contextMenus: {
      removeAll(callback) { callback(); },
      create() {},
      onClicked: { addListener(listener) { contextMenuListener = listener; } },
    },
    windows: {
      async create(options) { createdWindow = options; },
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
  vm.runInNewContext(source, { chrome, fetch, console, Date, Math, JSON, String, Object, Array, Error });

  async function send(request) {
    return new Promise((resolve) => {
      const keepChannelOpen = messageListener(request, {}, resolve);
      assert.equal(keepChannelOpen, true);
    });
  }

  return {
    send,
    clickContextMenu: (info, tab = {}) => contextMenuListener(info, tab),
    getSessionState: () => sessionState,
    getCreatedWindow: () => createdWindow,
    getRequest: () => fetchRequest,
    getRequestBody: () => fetchRequest?.body,
  };
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

test("GPT-5.6 uses low-latency reasoning-compatible parameters", async () => {
  const harness = createHarness("คำแปล", {
    sync: { provider: "openai", openaiModel: "gpt-5.6-luna" },
    local: { apiKey: "sk-device-local" },
  });

  const response = await harness.send({
    action: "translateSelection",
    mode: "translate",
    selectedText: "current",
    sourceLang: "english",
    targetLang: "thai",
    context: { current: "The current flows through the winding." },
  });

  assert.equal(response.success, true);
  const body = harness.getRequestBody();
  assert.equal(body.model, "gpt-5.6-luna");
  assert.equal(body.reasoning_effort, "none");
  assert.equal(body.max_completion_tokens, 1024);
  assert.equal("temperature" in body, false);
  assert.equal("max_tokens" in body, false);
});

test("context menu translates PDF selections in a result window", async () => {
  const harness = createHarness("แรงดันไฟฟ้า", {
    sync: { provider: "openai", openaiModel: "gpt-4.1-nano", targetLang: "thai" },
    local: { apiKey: "sk-device-local" },
  });

  await harness.clickContextMenu(
    { menuItemId: "ramantic-translate-selection", selectionText: "voltage" },
    { title: "Electrical machines.pdf" },
  );

  assert.match(harness.getCreatedWindow().url, /^chrome-extension:\/\/test\/result\.html\?job=/);
  assert.equal(harness.getCreatedWindow().type, "popup");
  const job = Object.values(harness.getSessionState()).find((value) => value?.selectedText === "voltage");
  assert.equal(job.status, "success");
  assert.equal(job.translation, "แรงดันไฟฟ้า");
  const payload = JSON.parse(harness.getRequestBody().messages[1].content);
  assert.equal(payload.surrounding_context.previous, "Electrical machines.pdf");
});
