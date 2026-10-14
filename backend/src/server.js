import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const PORT = 8080;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.join(__dirname, "..", "data", "workspace");

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

const invoices = new Map();
const taskHistory = [];

function logStep(logs, message, status = "info", details = null) {
  const entry = {
    time: new Date().toISOString(),
    message,
    status,
    details,
  };
  logs.push(entry);
  console.log(`[${status.toUpperCase()}] ${message}`);
}

function extractInvoice(text) {
  text = text.replace(/^\uFEFF/, "");
  const get = (pattern) => text.match(pattern)?.[1]?.trim();

  const invoice = {
    invoice_number: get(/^Invoice Number:\s*(.+)$/mi),
    company: get(/^Company:\s*(.+)$/mi),
    invoice_date: get(/^Invoice Date:\s*(.+)$/mi),
    amount: Number(get(/^Amount:\s*([\d,.]+)$/mi)?.replaceAll(",", "")),
    currency: get(/^Currency:\s*(.+)$/mi),
    due_date: get(/^Due Date:\s*(.+)$/mi),
    status: get(/^Status:\s*(.+)$/mi),
  };

  if (
    !invoice.invoice_number ||
    !invoice.company ||
    !Number.isFinite(invoice.amount) ||
    !invoice.due_date ||
    !invoice.currency
  ) {
    throw new Error("Invoice is missing required fields.");
  }

  return invoice;
}

app.get("/api/health", (req, res) => {
  res.json({ success: true, status: "ok" });
});

// Simulated internal company application's invoice API.
app.get("/api/invoices", (req, res) => {
  res.json({ success: true, data: [...invoices.values()] });
});

app.get("/api/invoices/:number", (req, res) => {
  const invoice = invoices.get(req.params.number);
  if (!invoice) {
    return res.status(404).json({ success: false, error: "Invoice not found" });
  }
  res.json({ success: true, data: invoice });
});

app.post("/api/invoices", (req, res) => {
  const invoice = req.body;

  if (!invoice?.invoice_number || !invoice?.company ||
      !Number.isFinite(invoice.amount) || !invoice?.due_date) {
    return res.status(400).json({
      success: false,
      error: "Required invoice fields are missing.",
    });
  }

  // Idempotency: never create a duplicate invoice number.
  const existing = invoices.get(invoice.invoice_number);
  if (existing) {
    return res.json({
      success: true,
      data: existing,
      already_existed: true,
    });
  }

  const saved = {
    ...invoice,
    record_id: `REC-${Date.now()}`,
    created_at: new Date().toISOString(),
  };

  invoices.set(saved.invoice_number, saved);
  res.status(201).json({ success: true, data: saved });
});

app.get("/company", async (req, res) => {
  try {
    const html = await fs.readFile(
      path.join(__dirname, "..", "data", "company.html"),
      "utf8"
    );
    res.type("html").send(html);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

async function runDeterministicInvoiceFallback(task) {
  const logs = [];
  const taskId = `FALLBACK-${Date.now()}`;

  const log = (message, status = "info", details = null) => {
    logs.push({
      time: new Date().toISOString(),
      message,
      status,
      details,
    });
  };

  
  const explicitlyReadOnly =
    /\b(read[- ]only|do not modify|don't modify|without modifying|do not save|don't save|do not create|don't create|do not write|don't write|do not add|don't add|do not update|don't update|do not submit|don't submit|do not record|don't record)\b/i.test(task);

  const writeAllowed =
    /\b(save|enter|submit|record|create|add|update|write|modify)\b/i.test(task) &&
    !explicitlyReadOnly;


  const result = {
    task_id: taskId,
    task,
    status: "running",
    summary: "",
    logs,
    evidence: null,
    write_allowed: writeAllowed,
    verification: "not_required",
    execution_mode: "deterministic_fallback",
  };

  try {
    log("Gemini unavailable; using deterministic invoice fallback.");
    log("Fallback uses predefined rules, not Gemini reasoning.");

    const files = (await fs.readdir(workspace))
      .filter((name) => name.toLowerCase().endsWith(".txt"))
      .sort();

    log("Listed invoice workspace files.", "success", { files });

    if (files.length === 0) {
      throw new Error("No invoice text files found in the workspace.");
    }

    if (/list.*files/i.test(task)) {
      result.status = "completed";
      result.summary = `Available workspace files:\n${files.map((f) => `- ${f}`).join("\n")}\n\nNo records were modified.`;
      log("Read-only file listing completed.", "success");
      return result;
    }

    const candidates = [];

    for (const filename of files) {
      const content = await fs.readFile(
        path.join(workspace, filename),
        "utf8"
      );

      const invoice = extractInvoice(content);

      if (invoice.invoice_number && invoice.invoice_date) {
        candidates.push({ filename, invoice });
        log(`Read invoice file: ${filename}`, "success");
      }
    }

    candidates.sort(
      (a, b) =>
        new Date(b.invoice.invoice_date) -
        new Date(a.invoice.invoice_date)
    );

    const selected = candidates[0];

    if (!selected) {
      throw new Error("No valid invoice was found in the workspace.");
    }

    const { invoice, filename } = selected;

    log(`Selected invoice ${invoice.invoice_number}.`, "success", {
      source_file: filename,
    });

    if (!writeAllowed) {
      result.status = "completed";
      result.summary =
        `Invoice ${invoice.invoice_number} from ${invoice.company}: ` +
        `status ${invoice.status}, amount ${invoice.currency} ${invoice.amount}, ` +
        `due ${invoice.due_date}. No records were modified.`;
      log("Read-only invoice lookup completed.", "success");
      return result;
    }

    const apiBase = `http://127.0.0.1:${PORT}`;
    const invoiceUrl =
      `${apiBase}/api/invoices/${encodeURIComponent(invoice.invoice_number)}`;

    const existingResponse = await fetch(invoiceUrl);

    if (existingResponse.ok) {
      const body = await existingResponse.json();
      const existing = body.data;

      result.status = "completed";
      result.summary =
        `Duplicate prevention: invoice ${invoice.invoice_number} already exists. ` +
        "No new invoice was created.";

      result.evidence = {
        source_file: filename,
        verified_fields: [],
        saved_record: existing,
      };

      log("Existing invoice detected; duplicate creation prevented.", "success");
      return result;
    }

    if (existingResponse.status !== 404) {
      throw new Error(
        `Invoice lookup failed with HTTP ${existingResponse.status}.`
      );
    }

    log("No existing invoice found; starting browser automation.");

    const { submitInvoiceViaBrowser } = await import("./browserTool.js");
    const browserResult = await submitInvoiceViaBrowser(invoice);

    log("Browser automation completed.", "success", {
      verification: browserResult.verification,
    });

    const verifyResponse = await fetch(invoiceUrl);

    if (!verifyResponse.ok) {
      throw new Error("Saved invoice could not be retrieved for verification.");
    }

    const body = await verifyResponse.json();
    const saved = body.data;

    const fields = [
      "invoice_number",
      "company",
      "invoice_date",
      "amount",
      "currency",
      "due_date",
      "status",
    ];

    const mismatches = fields.filter((field) => {
      if (field === "amount") {
        return Number(saved[field]) !== Number(invoice[field]);
      }

      return String(saved[field] ?? "").trim() !==
        String(invoice[field] ?? "").trim();
    });

    if (mismatches.length > 0) {
      throw new Error(
        `Independent verification failed: ${mismatches.join(", ")}`
      );
    }

    result.status = "completed";
    result.verification = "passed";
    result.evidence = {
      source_file: filename,
      verified_fields: fields,
      saved_record: saved,
    };
    result.summary =
      `Invoice ${invoice.invoice_number} was saved using browser automation ` +
      "and independently verified across all seven fields.";

    log("All seven invoice fields verified through an independent API read.", "success");
    return result;
  } catch (error) {
    result.status = "failed";
    result.summary = error.message || "Fallback execution failed.";
    log(result.summary, "error");
    return result;
  }
}

app.post("/api/tasks", async (req, res) => {
  const task = String(req.body?.task || "").trim();

  if (!task) {
    return res.status(400).json({
      success: false,
      error: "Please provide a task.",
    });
  }

  const logs = [];
  const taskId = `TASK-${Date.now()}`;
  let extracted = null;

  const result = {
    task_id: taskId,
    task,
    status: "running",
    logs,
    evidence: null,
    summary: "",
  };

  taskHistory.push(result);

  try {
    logStep(logs, "Received natural-language task.");
    const intent = /invoice|acme|bill|amount|due date/i.test(task);

    if (!intent) {
      throw new Error(
        "This prototype currently supports invoice-processing tasks. " +
        "Try: Process the latest invoice from Acme Corp."
      );
    }

    logStep(logs, "Selected invoice-processing workflow.", "success");

    const files = (await fs.readdir(workspace))
      .filter((name) => name.toLowerCase().endsWith(".txt"))
      .sort();

    if (files.length === 0) {
      throw new Error("No invoice text files found in the workspace.");
    }

    // Read actual files and select the latest invoice date.
    const candidates = [];

    for (const filename of files) {
      const content = await fs.readFile(
        path.join(workspace, filename), "utf8"
      );
      const invoice = extractInvoice(content);
      candidates.push({ invoice, filename });
      logStep(logs, `Read invoice file: ${filename}`, "success");
    }

    candidates.sort(
      (a, b) =>
        new Date(b.invoice.invoice_date) - new Date(a.invoice.invoice_date)
    );

    extracted = candidates[0].invoice;
    logStep(logs, `Selected ${extracted.invoice_number}.`, "success", {
      source_file: candidates[0].filename,
    });

    logStep(logs, "Extracted invoice fields.", "success", extracted);
    const { submitInvoiceViaBrowser } = await import("./browserTool.js");
    const browserResult = await submitInvoiceViaBrowser(extracted);
    logStep(logs, "Submitted invoice through Playwright browser automation.", "success", browserResult);

    const saved = browserResult.saved_record;
    logStep(
      logs,
      "Browser automation saved the invoice and verified the stored fields.",
      "success",
      { verified_fields: browserResult.verified_fields }
    );
    // Independently read the saved record back through the API.
    logStep(logs, "Verifying saved record through a separate API read.");
    const verifyResponse = await fetch(
      `http://localhost:${PORT}/api/invoices/${encodeURIComponent(extracted.invoice_number)}`
    );

    if (!verifyResponse.ok) {
      throw new Error("Verification failed: saved record could not be retrieved.");
    }

    const verification = await verifyResponse.json();
    const actual = verification.data;

    const fields = ["invoice_number", "company", "amount", "currency", "due_date"];
    const mismatches = fields.filter(
      (field) => actual[field] !== extracted[field]
    );

    if (mismatches.length) {
      throw new Error(`Verification mismatch: ${mismatches.join(", ")}`);
    }

    logStep(logs, "All required fields verified against the saved record.", "success");

    result.status = "completed";
    result.evidence = {
      source_file: candidates[0].filename,
      verified_fields: fields,
      saved_record: actual,
    };
    result.summary =
      `Verified invoice ${actual.invoice_number} from ${actual.company} ` +
      `for ${actual.currency} ${actual.amount.toLocaleString("en-IN")}, ` +
      `due ${actual.due_date}.`;

    logStep(logs, "Task completed and verified.", "success");
    res.json({ success: true, data: result });
  } catch (error) {
    result.status = "failed";
    result.summary = error.message;
    logStep(logs, error.message, "error");
    res.status(422).json({ success: false, data: result, error: error.message });
  }
});

app.get("/api/tasks", (req, res) => {
  res.json({ success: true, data: taskHistory });
});


app.post("/api/agent/tasks", async (req, res) => {
  const task = String(req.body?.task || "").trim();

  if (!task) {
    return res.status(400).json({
      success: false,
      error: "Please provide a task.",
    });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({
      success: false,
      error: "Gemini API key is not configured.",
    });
  }

  try {
    const { runAgentTask } = await import("./agent.js");
    const result = await runAgentTask(task);

    const httpStatus = result.status === "completed" ? 200 : 422;

    return res.status(httpStatus).json({
      success: result.status === "completed",
      data: result,
    });
  } catch (error) {
    const message = String(error?.message || error);

    console.error("Gemini agent error:", message);

    const quotaError =
      /429|RESOURCE_EXHAUSTED|quota exceeded|GenerateRequestsPerDay/i.test(
        message
      );

    if (quotaError) {
      const fallback = await runDeterministicInvoiceFallback(task);

      return res
        .status(fallback.status === "completed" ? 200 : 422)
        .json({
          success: fallback.status === "completed",
          data: fallback,
          fallback: true,
          warning:
            "Gemini quota unavailable; deterministic fallback was used.",
        });
    }

    return res.status(500).json({
      success: false,
      error: message || "Agent execution failed.",
    });
  }
});

app.listen(PORT, () => {
  console.log(`TaskPilot backend running at http://localhost:${PORT}`);
});
