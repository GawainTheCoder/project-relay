import { describe, expect, it } from "vitest";

import {
  extractResearchFile,
  MAX_RESEARCH_FILE_BYTES,
} from "./file.js";

const encoder = new TextEncoder();

describe("research file extraction", () => {
  it("normalizes UTF-8 text and Markdown files", async () => {
    await expect(
      extractResearchFile({
        data: encoder.encode("# Optics note\r\n\r\nSupply is tightening.\r\n"),
        filename: "optics.md",
      }),
    ).resolves.toBe("# Optics note\n\nSupply is tightening.");
  });

  it("extracts readable HTML while dropping executable content", async () => {
    await expect(
      extractResearchFile({
        data: encoder.encode(`
          <html><body><main>
            <h1>Networking update</h1>
            <p>Switch demand is moving toward higher bandwidth.</p>
            <script>privateToken = "do-not-index"</script>
          </main></body></html>
        `),
        filename: "networking.html",
      }),
    ).resolves.not.toContain("do-not-index");
  });

  it("rejects unsupported, binary, and oversized files", async () => {
    await expect(
      extractResearchFile({
        data: encoder.encode("A source with enough readable content to import."),
        filename: "source.docx",
      }),
    ).rejects.toThrow("Choose a PDF");
    await expect(
      extractResearchFile({
        data: new Uint8Array([0, 1, 2, 3]),
        filename: "source.txt",
      }),
    ).rejects.toThrow("Binary files");
    await expect(
      extractResearchFile({
        data: new Uint8Array(MAX_RESEARCH_FILE_BYTES + 1),
        filename: "large.txt",
      }),
    ).rejects.toThrow("10 MB");
    await expect(
      extractResearchFile({
        data: new Uint8Array([0xc3, 0x28, ...encoder.encode(" invalid UTF-8 research text")]),
        filename: "invalid.txt",
      }),
    ).rejects.toThrow("UTF-8");
    await expect(
      extractResearchFile({
        data: encoder.encode("x".repeat(250_001)),
        filename: "too-long.txt",
      }),
    ).rejects.toThrow("250,000 character limit");
  });

  it("validates PDF signatures before parsing", async () => {
    await expect(
      extractResearchFile({
        data: encoder.encode("This is not really a PDF file."),
        filename: "filing.pdf",
      }),
    ).rejects.toThrow("not a valid PDF");
  });

  it("extracts selectable text from a local PDF", async () => {
    const content = await extractResearchFile({
      data: buildPdf("Relay optics research note"),
      filename: "optics-filing.pdf",
    });

    expect(content).toContain("Relay optics research note");
  });
});

function buildPdf(text: string): Uint8Array {
  const stream = `BT\n/F1 12 Tf\n72 720 Td\n(${text}) Tj\nET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF\n`;
  return encoder.encode(pdf);
}
