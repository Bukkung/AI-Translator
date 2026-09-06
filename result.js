const selectedTextEl = document.getElementById("selectedText");
const resultEl = document.getElementById("result");
const modeLabelEl = document.getElementById("modeLabel");
const copyButton = document.getElementById("copyButton");
const jobId = new URLSearchParams(location.search).get("job");
const jobKey = jobId ? `ramanticResult:${jobId}` : "";
let resultText = "";

function render(job) {
  if (!job) {
    resultEl.className = "result error";
    resultEl.textContent = "Translation job was not found.";
    return;
  }

  selectedTextEl.textContent = job.selectedText || "";
  modeLabelEl.textContent = job.mode === "explain" ? "Explain PDF selection" : "Translate PDF selection";

  if (job.status === "loading") {
    resultEl.className = "result";
    resultEl.innerHTML = '<span class="spinner" aria-hidden="true"></span>Translating…';
    return;
  }

  if (job.status === "error") {
    resultEl.className = "result error";
    resultEl.textContent = job.error || "Translation failed.";
    return;
  }

  resultText = job.translation || "";
  resultEl.className = "result";
  resultEl.textContent = resultText;
  copyButton.hidden = !resultText;
}

if (!jobKey) {
  render(null);
} else {
  chrome.storage.session.get(jobKey, (data) => render(data[jobKey]));
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "session" && changes[jobKey]?.newValue) {
      render(changes[jobKey].newValue);
    }
  });
}

window.addEventListener("pagehide", () => {
  if (jobKey) chrome.storage.session.remove(jobKey);
});

copyButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(resultText);
  copyButton.textContent = "Copied";
  setTimeout(() => { copyButton.textContent = "Copy"; }, 1200);
});
