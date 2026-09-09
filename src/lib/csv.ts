/**
 * Minimal CSV serializer — quotes any field containing a comma, quote, or
 * newline, doubling embedded quotes per RFC 4180. No external dependency
 * needed for something this small.
 *
 * No `import 'server-only'` here despite being used exclusively from API
 * routes — `toCSV` is pure text formatting and `csvResponse` only wraps
 * the standard Fetch `Response` object, neither touches anything secret,
 * so there's nothing for that marker to protect. Keeping it marker-free
 * also lets `toCSV` be unit-tested directly — see csv.test.ts.
 */
export function toCSV<T>(rows: T[], columns: { key: keyof T & string; header: string }[]): string {
  const escape = (value: unknown): string => {
    const str = String(value ?? '')
    if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`
    return str
  }

  const headerLine = columns.map((c) => escape(c.header)).join(',')
  const lines = rows.map((row) => columns.map((c) => escape(row[c.key])).join(','))
  return [headerLine, ...lines].join('\r\n')
}

export function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

// ============================================================
// CSV parsing (audit: "Import / Export — no import implementation").
// RFC 4180-aware: handles quoted fields, embedded commas, embedded
// newlines inside quotes, and doubled-quote escaping — the mirror image
// of toCSV()'s escaping above.
// ============================================================

export interface ParsedCSV {
  headers: string[]
  rows: Record<string, string>[]
}

/** Splits raw CSV text into rows of cells, respecting RFC 4180 quoting. */
function splitCSVIntoRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const next = text[i + 1]

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"'
        i++
      } else if (char === '"') {
        inQuotes = false
      } else {
        field += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && next === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }
  // Final field/row if the file doesn't end with a newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows.filter((r) => !(r.length === 1 && r[0] === ''))
}

/** Parses a CSV file's text into header-keyed row objects. First row is treated as the header. */
export function parseCSV(text: string): ParsedCSV {
  const rows = splitCSVIntoRows(text)
  if (rows.length === 0) return { headers: [], rows: [] }

  const headers = rows[0].map((h) => h.trim())
  const dataRows = rows.slice(1).map((cells) => {
    const obj: Record<string, string> = {}
    headers.forEach((header, i) => {
      obj[header] = (cells[i] ?? '').trim()
    })
    return obj
  })

  return { headers, rows: dataRows }
}
