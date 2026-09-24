import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { decodePdfBase64, extractPdfText, isPdfFileName, pdfFailureMessage, PDF_MAX_BYTES, PdfExtractError } from '../src/pdf-text.ts'

const fixturesDir = join(import.meta.dirname, 'fixtures')

async function fixtureBytes(name: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(join(fixturesDir, name)))
}

describe('isPdfFileName', () => {
  it('accepts the .pdf extension case-insensitively and rejects other names', () => {
    expect(isPdfFileName('article.pdf')).toBe(true)
    expect(isPdfFileName('Article.PDF')).toBe(true)
    expect(isPdfFileName('article.txt')).toBe(false)
    expect(isPdfFileName('pdf')).toBe(false)
    expect(isPdfFileName('article.pdfx')).toBe(false)
  })
})

describe('decodePdfBase64', () => {
  it('decodes a base64 body back to the original PDF bytes', () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x01, 0x02])
    const decoded = decodePdfBase64(Buffer.from(bytes).toString('base64'))
    expect([...decoded]).toEqual([...bytes])
  })

  it('rejects a body over the size cap before decoding it', () => {
    const oversized = 'A'.repeat(Math.ceil(PDF_MAX_BYTES / 3) * 4 + 1)
    expect(() => decodePdfBase64(oversized)).toThrow(PdfExtractError)
  })

  it('rejects a body that decodes to no bytes', () => {
    expect(() => decodePdfBase64('!!!!')).toThrow(PdfExtractError)
  })
})

describe('pdfFailureMessage', () => {
  it('names an encrypted document and falls back to the damaged-file copy', () => {
    expect(pdfFailureMessage({ name: 'PasswordException' })).toContain('已加密')
    expect(pdfFailureMessage({ name: 'InvalidPDFException' })).toContain('无法解析')
    expect(pdfFailureMessage(undefined)).toContain('无法解析')
  })
})

describe('extractPdfText', () => {
  it('extracts the text of both pages in document order', async () => {
    const result = await extractPdfText(await fixtureBytes('text-sample.pdf'))
    expect(result.pages).toBe(2)
    expect(result.text).toBe('Hello Lingoladder\nDaily English practice\nSecond page reading text')
  })

  it('fails loud on a scanned document with no text layer', async () => {
    await expect(extractPdfText(await fixtureBytes('empty-sample.pdf')))
      .rejects.toThrow('未在 PDF 中找到可提取的文本')
  })

  it('fails loud on bytes that are not a PDF', async () => {
    await expect(extractPdfText(new TextEncoder().encode('this is not a pdf at all')))
      .rejects.toThrow('无法解析该 PDF 文件')
  })
})
