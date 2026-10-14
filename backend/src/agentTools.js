import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Type } from "@google/genai";
import { submitInvoiceViaBrowser } from "./browserTool.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(__dirname, "../data/workspace");
const API_BASE = `http://127.0.0.1:${process.env.PORT || 8080}`;

const invoiceFields = {
  invoice_number: { type: Type.STRING },
  company: { type: Type.STRING },
  invoice_date: { type: Type.STRING },
  amount: { type: Type.NUMBER },
  currency: { type: Type.STRING },
  due_date: { type: Type.STRING },
  status: { type: Type.STRING },
};

const invoiceSchema = {
  type: Type.OBJECT,
  properties: invoiceFields,
  required: Object.keys(invoiceFields),
};

export const toolDefinitions = [
  {
    name: "list_workspace_files",
    description: "List available text files in the invoice workspace.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: "read_workspace_file",
    description: "Read an invoice text file. Use a filename returned by list_workspace_files.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        file_name: { type: Type.STRING },
      },
      required: ["file_name"],
    },
  },
  {
    name: "save_invoice_via_browser",
    description: "Save an invoice using the existing Playwright browser automation. Only use when the user's task explicitly requests saving or entering invoice data.",
    parameters: invoiceSchema,
  },
  {
    name: "verify_invoice",
    description: "Independently retrieve a saved invoice through the API and compare all expected fields.",
    parameters: invoiceSchema,
  },
];

async function getInvoice(invoiceNumber) {
  const response = await fetch(
    `${API_BASE}/api/invoices/${encodeURIComponent(invoiceNumber)}`
  );

  if (response.status === 404) return null;

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body.error || `Invoice lookup failed: ${response.status}`);
  }

  return body.data ?? null;
}

function sameValue(field, actual, expected) {
  if (field === "amount") {
    return Number.isFinite(Number(actual)) &&
      Number.isFinite(Number(expected)) &&
      Number(actual) === Number(expected);
  }

  return String(actual ?? "").trim() === String(expected ?? "").trim();
}

export async function executeTool(name, args, context = {}) {
  switch (name) {
    case "list_workspace_files": {
      const entries = await fs.readdir(workspace, { withFileTypes: true });

      return {
        ok: true,
        files: entries
          .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".txt"))
          .map((entry) => entry.name),
      };
    }

    case "read_workspace_file": {
      const fileName = String(args.file_name || "");

      if (!fileName || path.basename(fileName) !== fileName) {
        throw new Error("Only filenames inside the workspace are allowed.");
      }

      const fullPath = path.resolve(workspace, fileName);

      if (!fullPath.startsWith(workspace + path.sep)) {
        throw new Error("File path is outside the workspace.");
      }

      const stat = await fs.stat(fullPath);

      if (!stat.isFile() || stat.size > 20000) {
        throw new Error("File is not a regular text file or exceeds the 20KB limit.");
      }

      const content = await fs.readFile(fullPath, "utf8");

      return {
        ok: true,
        file_name: fileName,
        content: content.replace(/^\uFEFF/, ""),
      };
    }

    case "save_invoice_via_browser": {
      if (context.writeAllowed !== true) {
        throw new Error("Write operation blocked: the task did not explicitly authorize saving an invoice.");
      }

      const existing = await getInvoice(args.invoice_number);

      if (existing) {
        return {
          ok: true,
          skipped: true,
          reason: "An invoice with this number already exists. Duplicate creation was prevented.",
          record: existing,
        };
      }

      const result = await submitInvoiceViaBrowser(args);

      return { ok: true, ...result };
    }

    case "verify_invoice": {
      const actual = await getInvoice(args.invoice_number);

      if (!actual) {
        return {
          ok: true,
          passed: false,
          reason: "Invoice was not found in saved records.",
          mismatches: ["record_not_found"],
        };
      }

      const fields = Object.keys(invoiceFields);
      const mismatches = fields.filter(
        (field) => !sameValue(field, actual[field], args[field])
      );

      return {
        ok: true,
        passed: mismatches.length === 0,
        mismatches,
        verified_fields: fields,
        record: actual,
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
