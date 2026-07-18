const invoiceEl = document.getElementById("invoice");
const contentPreviewEl = document.getElementById("contentPreview");
const batchListEl = document.getElementById("batchList");
const batchSummaryEl = document.getElementById("batchSummary");
const batchModelPreviewEl = document.getElementById("batchModelPreview");
const welcomePanel = document.getElementById("welcomePanel");
const singlePanel = document.getElementById("singlePanel");
const batchPanel = document.getElementById("batchPanel");
const historyPanel = document.getElementById("historyPanel");
const historyListEl = document.getElementById("historyList");
const historyTotalEl = document.getElementById("historyTotal");
const storagePanel = document.getElementById("storagePanel");
const storageListEl = document.getElementById("storageList");
const storagePreviewEl = document.getElementById("storagePreview");
const invoiceDownloadsEl = document.getElementById("invoiceDownloads");
const batchDownloadsEl = document.getElementById("batchDownloads");
const batchProgressEl = document.getElementById("batchProgress");
const batchProgressBarEl = document.getElementById("batchProgressBar");

let lastInvoice = null;
let lastBatchResults = [];
let progressTimer = null;

function setStatus(targetId, message) {
    const target = document.getElementById(targetId);
    if (target) {
        target.textContent = message;
    }
}

function getInputMode() {
    return document.querySelector('input[name="inputMode"]:checked').value;
}

function toggleSections() {
    const mode = getInputMode();
    document.getElementById("textSection").classList.toggle("hidden", mode !== "text");
    document.getElementById("fileSection").classList.toggle("hidden", mode !== "file");
}

function updateFileName(inputId, labelId, fallbackText) {
    const input = document.getElementById(inputId);
    const label = document.getElementById(labelId);
    if (!input || !label) return;

    const files = Array.from(input.files || []);
    label.textContent = files.length
        ? files.map(file => file.name).join(", ")
        : fallbackText;

    const removeBtn = document.getElementById(`${inputId}Clear`);
    if (removeBtn) {
        removeBtn.classList.toggle("hidden", files.length === 0);
    }
}

function clearFileInput(inputId, labelId, fallbackText) {
    const input = document.getElementById(inputId);
    const label = document.getElementById(labelId);
    if (!input) return;
    input.value = "";
    if (label) {
        label.textContent = fallbackText;
    }
    const removeBtn = document.getElementById(`${inputId}Clear`);
    if (removeBtn) {
        removeBtn.classList.add("hidden");
    }
}

function escapeHtml(value) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function showMode(mode) {
    welcomePanel.classList.add("hidden");
    singlePanel.classList.toggle("hidden", mode !== "single");
    batchPanel.classList.toggle("hidden", mode !== "batch");
    historyPanel.classList.remove("hidden");
    storagePanel.classList.remove("hidden");
    if (mode === "single") {
        toggleSections();
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetMode() {
    welcomePanel.classList.remove("hidden");
    singlePanel.classList.add("hidden");
    batchPanel.classList.add("hidden");
    historyPanel.classList.add("hidden");
    storagePanel.classList.add("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function buildInvoice(data) {
    const breakdown = data.breakdown || {};
    lastInvoice = data;

    invoiceEl.classList.remove("hidden");
    invoiceEl.innerHTML = `
        <h3>Digital Invoice</h3>
        <div class="row"><span>Score</span><span>${data.score} / 10</span></div>
        <div class="row"><span>Base Fee</span><span>Rs ${breakdown.base_fee}</span></div>
        <div class="row"><span>Complexity</span><span>Rs ${breakdown.complexity_surcharge}</span></div>
        <div class="row"><span>Heavy Script</span><span>Rs ${breakdown.heavy_penalty}</span></div>
        <div class="row"><span>Words</span><span>${breakdown.word_count}</span></div>
        <div class="row"><span>File Size</span><span>${breakdown.file_size_bytes} bytes</span></div>
        <div class="row total"><span>Total</span><span>Rs ${data.cost}</span></div>
    `;

    const modelText = data.model_text || "";
    const studentText = data.student_text || "";

    if (modelText || studentText) {
        contentPreviewEl.classList.remove("hidden");
        contentPreviewEl.innerHTML = `
            <h3>Uploaded Content</h3>
            <div class="content-grid">
                <div>
                    <h4>Model Answer</h4>
                    <pre>${escapeHtml(modelText)}</pre>
                </div>
                <div>
                    <h4>Student Answer</h4>
                    <pre>${escapeHtml(studentText)}</pre>
                </div>
            </div>
        `;
    } else {
        contentPreviewEl.classList.add("hidden");
    }

    invoiceDownloadsEl.classList.remove("hidden");
}

async function evaluateSingle() {
    setStatus("singleStatus", "Evaluating...");
    invoiceEl.classList.add("hidden");
    contentPreviewEl.classList.add("hidden");
    invoiceDownloadsEl.classList.add("hidden");

    const mode = getInputMode();
    let response;

    if (mode === "text") {
        const model = document.getElementById("modelText").value.trim();
        const student = document.getElementById("studentText").value.trim();

        if (!model || !student) {
            setStatus("singleStatus", "Enter both answers.");
            return;
        }

        response = await fetch("/evaluate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                correct_answer: model,
                student_answer: student
            })
        });
    } else {
        const modelFile = document.getElementById("modelFile").files[0];
        const studentFile = document.getElementById("studentFile").files[0];

        if (!modelFile || !studentFile) {
            setStatus("singleStatus", "Upload both files.");
            return;
        }

        const formData = new FormData();
        formData.append("model_file", modelFile);
        formData.append("student_file", studentFile);

        response = await fetch("/evaluate", {
            method: "POST",
            body: formData
        });
    }

    const data = await response.json();
    if (!response.ok) {
        setStatus("singleStatus", data.error || "Evaluation failed.");
        return;
    }

    setStatus("singleStatus", "Done.");
    buildInvoice(data);
    await refreshHistory();
}

async function runBatch() {
    setStatus("batchStatus", "Processing batch...");
    batchSummaryEl.classList.add("hidden");
    batchModelPreviewEl.classList.add("hidden");
    batchListEl.innerHTML = "";
    batchDownloadsEl.classList.add("hidden");

    const modelText = document.getElementById("batchModelText").value.trim();
    const modelFile = document.getElementById("batchModelFile").files[0];
    const studentFiles = Array.from(document.getElementById("batchFiles").files || []);

    if (!modelText && !modelFile) {
        setStatus("batchStatus", "Provide a model answer (text or file).");
        return;
    }

    if (studentFiles.length === 0) {
        setStatus("batchStatus", "Upload at least one student file.");
        return;
    }

    const formData = new FormData();
    if (modelFile) {
        formData.append("model_file", modelFile);
    } else {
        formData.append("correct_answer", modelText);
    }

    studentFiles.forEach(file => formData.append("student_files", file));

    startBatchProgress(studentFiles.length);

    const response = await fetch("/batch", {
        method: "POST",
        body: formData
    });

    const data = await response.json();
    stopBatchProgress();
    if (!response.ok) {
        setStatus("batchStatus", data.error || "Batch failed.");
        return;
    }

    setStatus("batchStatus", "Batch complete.");
    batchSummaryEl.classList.remove("hidden");
    batchSummaryEl.textContent = `Cost Spike: Rs ${data.cost_spike} for ${data.count} scripts`;
    lastBatchResults = data.results || [];
    batchDownloadsEl.classList.remove("hidden");

    if (data.model_text) {
        batchModelPreviewEl.classList.remove("hidden");
        batchModelPreviewEl.innerHTML = `
            <h3>Model Answer (Batch)</h3>
            <pre>${escapeHtml(data.model_text)}</pre>
        `;
    }

    data.results.forEach(item => {
        const card = document.createElement("div");
        card.className = "batch-card";
        card.innerHTML = `
            <h4>${item.filename}</h4>
            <p>Score: ${item.score} / 10</p>
            <p>Cost: Rs ${item.cost}</p>
            <p>Words: ${item.breakdown.word_count} | Size: ${item.breakdown.file_size_bytes} bytes</p>
            <details>
                <summary>View student content</summary>
                <pre>${escapeHtml(item.student_text || "")}</pre>
            </details>
        `;
        batchListEl.appendChild(card);
    });

    await refreshHistory();
}

function startBatchProgress(totalFiles) {
    if (totalFiles < 3) {
        batchProgressEl.classList.add("hidden");
        return;
    }

    let progress = 8;
    batchProgressEl.classList.remove("hidden");
    batchProgressBarEl.style.width = `${progress}%`;

    progressTimer = setInterval(() => {
        progress = Math.min(progress + 7, 88);
        batchProgressBarEl.style.width = `${progress}%`;
    }, 500);
}

function stopBatchProgress() {
    if (progressTimer) {
        clearInterval(progressTimer);
        progressTimer = null;
    }
    batchProgressBarEl.style.width = "100%";
    setTimeout(() => {
        batchProgressEl.classList.add("hidden");
        batchProgressBarEl.style.width = "0%";
    }, 600);
}

async function refreshHistory() {
    const response = await fetch("/history");
    if (!response.ok) return;

    const data = await response.json();
    const entries = data.entries || [];

    historyTotalEl.textContent = `Total Spend: Rs ${data.total_spend || 0}`;
    historyListEl.innerHTML = "";

    if (!entries.length) {
        historyListEl.innerHTML = "<div class=\"history-item\">No evaluations yet.</div>";
        return;
    }

    entries.forEach(item => {
        const card = document.createElement("div");
        card.className = "history-item";
        card.innerHTML = `
            <div>
                <strong>${item.filename || "text_input"}</strong>
                <span>${item.type} | ${item.mode} | Score: ${item.score}</span>
            </div>
            <div>
                <strong>Rs ${item.cost}</strong>
                <span>${item.word_count} words</span>
            </div>
        `;
        historyListEl.appendChild(card);
    });
}

async function refreshStorage() {
    const response = await fetch("/storage");
    if (!response.ok) return;

    const data = await response.json();
    const items = data.items || [];

    storageListEl.innerHTML = "";
    storagePreviewEl.classList.add("hidden");

    if (!items.length) {
        storageListEl.innerHTML = "<div class=\"storage-item\">No stored files yet.</div>";
        return;
    }

    items.forEach(item => {
        const card = document.createElement("div");
        card.className = "storage-item";
        card.innerHTML = `
            <div class="storage-meta">
                <strong>${item.key}</strong>
                <span>${item.size} bytes</span>
                <span>${item.modified}</span>
            </div>
            <div class="storage-actions">
                <button type="button" class="ghost-btn" data-action="view" data-key="${item.key}">Preview</button>
                <a class="ghost-btn" href="/storage/download/${item.key}">Download</a>
                <button type="button" class="ghost-btn" data-action="use-model" data-key="${item.key}">Use as Model</button>
                <button type="button" class="ghost-btn" data-action="use-student" data-key="${item.key}">Use as Student</button>
            </div>
        `;
        storageListEl.appendChild(card);
    });
}

async function previewStorageText(key) {
    if (key.toLowerCase().endsWith(".pdf")) {
        storagePreviewEl.classList.remove("hidden");
        storagePreviewEl.innerHTML = `
            <h3>Preview</h3>
            <pre>PDF preview is not available. Use Download to view the file.</pre>
        `;
        return;
    }

    const response = await fetch(`/storage/text/${key}`);
    if (!response.ok) return;
    const data = await response.json();
    storagePreviewEl.classList.remove("hidden");
    storagePreviewEl.innerHTML = `
        <h3>Stored Content</h3>
        <pre>${escapeHtml(data.text || "")}</pre>
    `;
}

async function loadStorageText(key, targetId) {
    const response = await fetch(`/storage/text/${key}`);
    if (!response.ok) return;
    const data = await response.json();
    const target = document.getElementById(targetId);
    if (target) {
        target.value = data.text || "";
    }
}

async function downloadInvoicePdf() {
    if (!lastInvoice) return;
    const response = await fetch("/invoice/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lastInvoice)
    });
    if (!response.ok) return;
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "invoice.pdf";
    link.click();
    URL.revokeObjectURL(url);
}

function downloadInvoiceJson() {
    if (!lastInvoice) return;
    const blob = new Blob([JSON.stringify(lastInvoice, null, 2)], {
        type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "invoice.json";
    link.click();
    URL.revokeObjectURL(url);
}

function downloadBatchCsv() {
    if (!lastBatchResults.length) return;
    const header = ["filename", "score", "cost", "words", "size"].join(",");
    const rows = lastBatchResults.map(item => {
        const words = item.breakdown?.word_count ?? 0;
        const size = item.breakdown?.file_size_bytes ?? 0;
        return [item.filename, item.score, item.cost, words, size]
            .map(value => `"${String(value).replace(/"/g, '""')}"`)
            .join(",");
    });
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "batch-results.csv";
    link.click();
    URL.revokeObjectURL(url);
}

function wireDropZone(zoneId, inputId, labelId, fallbackText) {
    const zone = document.getElementById(zoneId);
    const input = document.getElementById(inputId);

    if (!zone || !input) return;

    zone.addEventListener("dragover", event => {
        event.preventDefault();
        zone.classList.add("active");
    });

    zone.addEventListener("dragleave", () => {
        zone.classList.remove("active");
    });

    zone.addEventListener("drop", event => {
        event.preventDefault();
        zone.classList.remove("active");
        input.files = event.dataTransfer.files;
        updateFileName(inputId, labelId, fallbackText);
    });

    input.addEventListener("change", () =>
        updateFileName(inputId, labelId, fallbackText)
    );
}

document.addEventListener("DOMContentLoaded", () => {
    resetMode();

    document.querySelectorAll(".welcome-card").forEach(card => {
        card.addEventListener("click", () => showMode(card.dataset.target));
    });

    document.querySelectorAll(".mode-reset").forEach(btn => {
        btn.addEventListener("click", resetMode);
    });

    document.querySelectorAll('input[name="inputMode"]').forEach(input => {
        input.addEventListener("change", toggleSections);
    });

    document.getElementById("evalBtn").addEventListener("click", event => {
        event.preventDefault();
        evaluateSingle();
    });

    document.getElementById("batchBtn").addEventListener("click", event => {
        event.preventDefault();
        runBatch();
    });

    document.getElementById("downloadPdf").addEventListener("click", downloadInvoicePdf);
    document.getElementById("downloadJson").addEventListener("click", downloadInvoiceJson);
    document.getElementById("downloadCsv").addEventListener("click", downloadBatchCsv);
    document.getElementById("refreshStorage").addEventListener("click", refreshStorage);

    wireDropZone("modelDrop", "modelFile", "modelFileName", "No file selected");
    wireDropZone("singleDrop", "studentFile", "singleFileName", "No file selected");
    wireDropZone("batchModelDrop", "batchModelFile", "batchModelFileName", "No file selected");
    wireDropZone("batchDrop", "batchFiles", "batchFileName", "No files selected");

    document.getElementById("modelFileClear").addEventListener("click", () =>
        clearFileInput("modelFile", "modelFileName", "No file selected")
    );
    document.getElementById("studentFileClear").addEventListener("click", () =>
        clearFileInput("studentFile", "singleFileName", "No file selected")
    );
    document.getElementById("batchModelFileClear").addEventListener("click", () =>
        clearFileInput("batchModelFile", "batchModelFileName", "No file selected")
    );
    document.getElementById("batchFilesClear").addEventListener("click", () =>
        clearFileInput("batchFiles", "batchFileName", "No files selected")
    );

    ["modelFile", "studentFile", "batchModelFile", "batchFiles"].forEach(inputId => {
        const removeBtn = document.getElementById(`${inputId}Clear`);
        if (removeBtn) {
            removeBtn.classList.add("hidden");
        }
    });

    storageListEl.addEventListener("click", async event => {
        const button = event.target.closest("button");
        if (!button) return;
        const action = button.dataset.action;
        const key = button.dataset.key;
        if (!action || !key) return;

        if (action === "view") {
            await previewStorageText(key);
        }

        if (action === "use-model") {
            showMode("single");
            document.querySelector('input[name="inputMode"][value="text"]').checked = true;
            toggleSections();
            await loadStorageText(key, "modelText");
        }

        if (action === "use-student") {
            showMode("single");
            document.querySelector('input[name="inputMode"][value="text"]').checked = true;
            toggleSections();
            await loadStorageText(key, "studentText");
        }
    });

    refreshHistory();
    refreshStorage();
});
