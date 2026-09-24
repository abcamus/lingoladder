/**
 * PDF text extraction for dashboard material upload.
 *
 * The dashboard reads a selected PDF in the browser, sends it base64-encoded to
 * the extract endpoint, and this module turns the bytes into the plain text the
 * materials pipeline already consumes: extraction runs through the unpdf
 * serverless pdf.js build (no native dependencies, cMaps resolved from unpdf's
 * own node_modules paths for CJK documents), and the text lands in the existing
 * `POST /api/materials` flow as one Markdown material file.
 *
 * @module
 */
import { extractText, getDocumentProxy } from 'unpdf'

/** Upper bound for one uploaded PDF; extraction decodes and indexes the full bytes. */
export const PDF_MAX_BYTES = 30 * 1024 * 1024

/** One failed PDF extraction. The message is user-facing dashboard copy, shown verbatim. */
export class PdfExtractError extends Error {}

/** One extraction result: the plain text of the whole document and its page count. */
export interface PdfTextResult {
  text: string
  pages: number
}

/** Whether a client-supplied file name names a PDF upload. */
export function isPdfFileName(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.pdf')
}

/** Map a pdf.js/unpdf failure to the dashboard copy for it. Exported for the encrypted-document branch, which no fixture can produce. */
export function pdfFailureMessage(error: unknown): string {
  const name = (error as { name?: string } | undefined)?.name
  if (name === 'PasswordException') return '该 PDF 已加密，请先解除密码保护后再上传'
  return '无法解析该 PDF 文件，文件可能已损坏或不是有效的 PDF'
}

/**
 * Decode one base64-encoded PDF body, enforcing the upload size cap before the
 * decode allocates.
 * @param dataBase64 the base64 payload from the extract request body.
 * @returns the decoded PDF bytes.
 * @throws PdfExtractError when the payload is empty or over {@link PDF_MAX_BYTES}.
 */
export function decodePdfBase64(dataBase64: string): Uint8Array {
  const maxEncodedLength = Math.ceil(PDF_MAX_BYTES / 3) * 4
  if (dataBase64.length > maxEncodedLength) {
    throw new PdfExtractError(`PDF 文件过大，最大支持 ${String(Math.floor(PDF_MAX_BYTES / (1024 * 1024)))} MB`)
  }
  const bytes = Buffer.from(dataBase64, 'base64')
  if (bytes.length === 0) throw new PdfExtractError('PDF 文件内容为空')
  return bytes
}

/**
 * Extract the plain text of one PDF document.
 * @param data the PDF bytes.
 * @returns the whole-document text (pages merged, line breaks preserved) and the page count.
 * @throws PdfExtractError when the document is encrypted or unreadable, or carries no
 * extractable text (scanned pages have no text layer).
 */
export async function extractPdfText(data: Uint8Array): Promise<PdfTextResult> {
  let text: string
  let pages: number
  try {
    const pdf = await getDocumentProxy(data)
    const extracted = await extractText(pdf, { mergePages: true })
    text = extracted.text
    pages = extracted.totalPages
  } catch (error) {
    throw new PdfExtractError(pdfFailureMessage(error))
  }
  if (text.trim() === '') {
    throw new PdfExtractError('未在 PDF 中找到可提取的文本，可能是扫描版或纯图片 PDF')
  }
  return { text, pages }
}
