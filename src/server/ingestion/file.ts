import { extname } from "node:path";

import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { PDFParse } from "pdf-parse";

import { MAX_MANUAL_DOCUMENT_CHARS } from "./normalize.js";

export const MAX_RESEARCH_FILE_BYTES = 10 * 1024 * 1024;

const supportedExtensions = new Set([".html", ".htm", ".md", ".pdf", ".txt"]);

export interface ResearchFileInput {
  data: Uint8Array;
  filename: string;
  mimeType?: string;
}

export async function extractResearchFile(
  input: ResearchFileInput,
): Promise<string> {
  const filename = input.filename.trim();
  const extension = extname(filename).toLowerCase();
  if (!filename || !supportedExtensions.has(extension)) {
    throw new TypeError(
      "Choose a PDF, plain text, Markdown, or HTML research file.",
    );
  }
  if (input.data.byteLength === 0) {
    throw new TypeError("The selected research file is empty.");
  }
  if (input.data.byteLength > MAX_RESEARCH_FILE_BYTES) {
    throw new TypeError("Research files must be 10 MB or smaller.");
  }

  let extracted: string;
  if (extension === ".pdf") {
    if (!hasPdfSignature(input.data)) {
      throw new TypeError("The selected file is not a valid PDF.");
    }
    extracted = await extractPdfText(input.data);
  } else {
    const decoded = decodeUtf8(input.data);
    extracted =
      extension === ".html" || extension === ".htm"
        ? extractHtmlText(decoded)
        : decoded;
  }

  const normalized = normalizeExtractedText(extracted);
  if (normalized.length < 20) {
    throw new TypeError(
      extension === ".pdf"
        ? "No usable text was found. Scanned PDFs need OCR before import."
        : "The selected file does not contain enough readable text.",
    );
  }
  if (normalized.length > MAX_MANUAL_DOCUMENT_CHARS) {
    throw new TypeError(
      `Extracted text exceeds the ${MAX_MANUAL_DOCUMENT_CHARS.toLocaleString()} character limit.`,
    );
  }
  return normalized;
}

export function isSupportedResearchFilename(filename: string): boolean {
  return supportedExtensions.has(extname(filename.trim()).toLowerCase());
}

async function extractPdfText(data: Uint8Array): Promise<string> {
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    return result.text;
  } catch (error) {
    throw new TypeError("Relay could not extract text from this PDF.", {
      cause: error,
    });
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

function extractHtmlText(html: string): string {
  const { document } = parseHTML(html);
  document
    .querySelectorAll("script, style, noscript, template")
    .forEach((element) => element.remove());
  const article = new Readability(document as unknown as Document, {
    charThreshold: 20,
  }).parse();
  return article?.textContent?.trim() ?? document.body.textContent.trim();
}

function decodeUtf8(data: Uint8Array): string {
  if (data.includes(0)) {
    throw new TypeError("Binary files cannot be imported as research text.");
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(data);
  } catch (error) {
    throw new TypeError("Research text files must use UTF-8 encoding.", {
      cause: error,
    });
  }
}

function hasPdfSignature(data: Uint8Array): boolean {
  return (
    data[0] === 0x25 &&
    data[1] === 0x50 &&
    data[2] === 0x44 &&
    data[3] === 0x46 &&
    data[4] === 0x2d
  );
}

function normalizeExtractedText(value: string): string {
  return value
    .split(String.fromCharCode(0))
    .join("")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const researchFileAccept = ".pdf,.txt,.md,.html,.htm";
