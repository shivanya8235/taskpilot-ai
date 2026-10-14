
import { chromium } from "playwright";

export async function submitInvoiceViaBrowser(invoice) {
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();

    await page.goto("http://127.0.0.1:8080/company", {
      waitUntil: "domcontentloaded",
    });

    await page.locator("#invoice_number").fill(String(invoice.invoice_number));
    await page.locator("#company").fill(String(invoice.company));
    await page.locator("#invoice_date").fill(String(invoice.invoice_date));
    await page.locator("#amount").fill(String(invoice.amount));
    await page.locator("#currency").fill(String(invoice.currency));
    await page.locator("#due_date").fill(String(invoice.due_date));
    await page.locator("#status").selectOption({ label: invoice.status });

    await page.getByRole("button", { name: "Save invoice" }).click();

    const confirmation = page.locator('#result[data-status="success"]');
    await confirmation.waitFor({ state: "visible", timeout: 10000 });

    const message = await confirmation.innerText();

    // Read the saved record independently after the browser action.
    const response = await page.request.get(
      `http://127.0.0.1:8080/api/invoices/${encodeURIComponent(invoice.invoice_number)}`
    );

    if (!response.ok()) {
      throw new Error("Browser save succeeded, but saved record could not be retrieved.");
    }

    const body = await response.json();
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

    const mismatches = fields.filter(
      (field) => saved?.[field] !== invoice[field]
    );

    if (mismatches.length > 0) {
      throw new Error(
        `Browser verification failed. Mismatched fields: ${mismatches.join(", ")}`
      );
    }

    return {
      confirmation: message,
      page_url: page.url(),
      verified_fields: fields,
      saved_record: saved,
      verification: "passed",
    };
  } finally {
    await browser.close();
  }
}
