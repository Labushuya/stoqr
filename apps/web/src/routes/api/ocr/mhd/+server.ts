import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import Tesseract from 'tesseract.js'

interface OcrResult {
  found: boolean
  date: string | null
  raw: string
}

/**
 * Parses a two-digit year to a four-digit year.
 * Assumes values 00–49 → 2000–2049, 50–99 → 1950–1999 (standard sliding window).
 * For MHD context, years far in the past are unlikely — anything that resolves
 * before today is bumped forward by 100 years if it would otherwise be in the past.
 */
function expandYear(yy: number): number {
  const full = yy < 50 ? 2000 + yy : 1900 + yy
  // If the resulting year is already behind us by more than one year,
  // assume it rolls into the next century bracket (edge case safeguard).
  const now = new Date().getFullYear()
  if (full < now - 1) {
    return full + 100
  }
  return full
}

/**
 * Extracts ISO-8601 dates (YYYY-MM-DD) from raw OCR text.
 * Handles:
 *   DD.MM.YYYY
 *   DD.MM.YY  (short year, assumed 20YY)
 *   MM/YYYY
 *   YYYY-MM-DD
 *   Prefixes: MHD:, Best by:, Mindestens haltbar bis:
 */
function extractDates(text: string): string[] {
  const dates: string[] = []

  // Normalise whitespace but preserve line structure
  const normalised = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // --- Pattern 1: DD.MM.YYYY ---
  const ddmmyyyy = /\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/g
  for (const m of normalised.matchAll(ddmmyyyy)) {
    const [, dd, mm, yyyy] = m
    const d = parseInt(dd, 10)
    const mo = parseInt(mm, 10)
    const y = parseInt(yyyy, 10)
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      dates.push(`${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
    }
  }

  // --- Pattern 2: DD.MM.YY (short year) ---
  // Must not be preceded by another digit (would already be caught by Pattern 1)
  const ddmmyy = /\b(\d{1,2})\.(\d{1,2})\.(\d{2})\b/g
  for (const m of normalised.matchAll(ddmmyy)) {
    const [, dd, mm, yy] = m
    const d = parseInt(dd, 10)
    const mo = parseInt(mm, 10)
    const y = expandYear(parseInt(yy, 10))
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      dates.push(`${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
    }
  }

  // --- Pattern 3: MM/YYYY → first day of month ---
  const mmyyyy = /\b(\d{1,2})\/(\d{4})\b/g
  for (const m of normalised.matchAll(mmyyyy)) {
    const [, mm, yyyy] = m
    const mo = parseInt(mm, 10)
    const y = parseInt(yyyy, 10)
    if (mo >= 1 && mo <= 12) {
      dates.push(`${y}-${String(mo).padStart(2, '0')}-01`)
    }
  }

  // --- Pattern 4: YYYY-MM-DD (already ISO) ---
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/g
  for (const m of normalised.matchAll(iso)) {
    const [, yyyy, mm, dd] = m
    const mo = parseInt(mm, 10)
    const d = parseInt(dd, 10)
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      dates.push(`${yyyy}-${mm}-${dd}`)
    }
  }

  return dates
}

/**
 * Searches specifically in lines that contain known MHD-related prefixes.
 * Returns dates found near those prefixes, otherwise falls back to all dates.
 */
function prioritiseMhdDates(text: string, allDates: string[]): string[] {
  const mhdPrefixes = [
    /MHD\s*:/i,
    /Best\s+by\s*:/i,
    /Mindestens\s+haltbar\s+bis\s*:/i,
    /haltbar\s+bis\s*:/i,
    /verbrauchen\s+bis\s*:/i,
    /zu\s+verbrauchen\s+bis\s*:/i,
  ]

  const lines = text.split('\n')
  const mhdLines: string[] = []

  for (const line of lines) {
    if (mhdPrefixes.some((rx) => rx.test(line))) {
      mhdLines.push(line)
    }
  }

  if (mhdLines.length === 0) {
    return allDates
  }

  const mhdText = mhdLines.join('\n')
  const mhdDates = extractDates(mhdText)
  return mhdDates.length > 0 ? mhdDates : allDates
}

/**
 * Returns the latest date from a list of ISO-8601 date strings.
 * The latest date is the most likely MHD (not production/packaging date).
 */
function latestDate(dates: string[]): string | null {
  if (dates.length === 0) return null
  return dates.reduce((a, b) => (a > b ? a : b))
}

export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { imageData?: string }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { imageData } = body
  if (!imageData || typeof imageData !== 'string') {
    return json({ error: 'imageData is required' }, { status: 400 })
  }

  // Strip optional data-URL prefix (data:image/png;base64,...)
  const base64 = imageData.replace(/^data:image\/[a-z]+;base64,/i, '')

  let buffer: Buffer
  try {
    buffer = Buffer.from(base64, 'base64')
  } catch {
    return json({ error: 'Invalid base64 data' }, { status: 400 })
  }

  let rawText = ''

  try {
    const {
      data: { text },
    } = await Tesseract.recognize(buffer, 'deu+eng', { logger: () => {} })
    rawText = text ?? ''
  } catch {
    const fallback: OcrResult = { found: false, date: null, raw: '' }
    return json(fallback)
  }

  const allDates = extractDates(rawText)
  const candidates = prioritiseMhdDates(rawText, allDates)
  const best = latestDate(candidates)

  const result: OcrResult = {
    found: best !== null,
    date: best,
    raw: rawText.trim(),
  }

  return json(result)
}
