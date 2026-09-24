/**
 * Contacts CSV export — single source of truth for the columns, display
 * values, country-code rules and Excel text-quoting used by every Contacts
 * CSV export path (API route, report engine, and the inline "Export selected").
 *
 * Deliberately has NO `server-only` marker: the inline table export runs in
 * the browser, so this module imports only the client-safe `toCSV`/`csv.ts`
 * helpers (which are themselves marker-free) and a plain type from `@/types/crm`.
 */
import type { CountryCode } from 'libphonenumber-js'
import { parsePhoneNumberFromString } from 'libphonenumber-js/max'
import type { Contact } from '@/types/crm'
import { toCSV, CSV_BOM, type CsvColumn } from '@/lib/csv'

/** Country assumed for numbers that carry no country code (national format). */
export const DEFAULT_PHONE_COUNTRY: CountryCode = 'IN'

export interface ContactCsvRow {
  name: string
  company: string
  designation: string
  email: string
  phone: string
  mobile: string
}

export const CONTACT_CSV_COLUMNS: CsvColumn<ContactCsvRow>[] = [
  { key: 'name', header: 'Name' },
  { key: 'company', header: 'Company' },
  { key: 'designation', header: 'Designation' },
  { key: 'email', header: 'Email' },
  { key: 'phone', header: 'Phone', asText: true },
  { key: 'mobile', header: 'Mobile', asText: true },
]

/**
 * Normalise a raw CRM value into the text that should appear in the CSV.
 * null/undefined -> ''; strings are trimmed; placeholder tokens that the table
 * renders as "—" become empty cells so the CSV never contains literally
 * "—"/"null"/"undefined"/"NaN".
 */
export function displayValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = String(value).trim()
  if (str === '—' || str === '-' || str === 'null' || str === 'undefined' || str === 'NaN') {
    return ''
  }
  return str
}

/**
 * Normalise a phone/mobile value to E.164 (+{country_code}{number}) for any
 * country, falling back to the original trimmed value when it can't be parsed.
 *
 * Candidates (first that parses AND validates wins):
 *  1. v starts with "+":   parsed as-is (already international).
 *  2. v starts with "00":  "00" international dial prefix -> "+" + remainder.
 *  3. Otherwise:
 *     a. parsed as a national number of `defaultCountry`;
 *  4. International number that lost its leading "+" (digits only).
 * Never guesses: unparseable values are returned unchanged (no leading-zero
 * landlines, no foreign numbers, no spaces/dashes, no empty).
 * Idempotent: withCountryCode(withCountryCode(x)) === withCountryCode(x).
 */
export function withCountryCode(value: string, defaultCountry: CountryCode = DEFAULT_PHONE_COUNTRY): string {
  const v = value.trim()
  if (v === '') return v

  // 1. Already international.
  if (v.startsWith('+')) {
    const parsed = parsePhoneNumberFromString(v)
    if (parsed?.isValid()) return parsed.number
  }

  // 2. "00" international dial prefix.
  if (v.startsWith('00')) {
    const parsed = parsePhoneNumberFromString('+' + v.slice(2))
    if (parsed?.isValid()) return parsed.number
  }

  // 3. National format of the default country.
  {
    const parsed = parsePhoneNumberFromString(v, defaultCountry)
    if (parsed?.isValid()) return parsed.number
  }

  // 4. International number that lost its leading "+" (digits only).
  {
    const parsed = parsePhoneNumberFromString('+' + v.replace(/\D/g, ''))
    if (parsed?.isValid()) return parsed.number
  }

  return v
}

/** Map raw contacts to the six export fields only — drops owner/status/ids/etc. */
export function toContactCsvRows(
  contacts: Partial<Pick<Contact, keyof ContactCsvRow>>[],
): ContactCsvRow[] {
  return contacts.map((c) => ({
    name: displayValue(c.name),
    company: displayValue(c.company),
    designation: displayValue(c.designation),
    email: displayValue(c.email),
    phone: withCountryCode(displayValue(c.phone)),
    mobile: withCountryCode(displayValue(c.mobile)),
  }))
}

/** Plain CSV (header + rows, RFC 4180, Phone/Mobile as Excel text). */
export function contactsToCsv(contacts: Partial<Pick<Contact, keyof ContactCsvRow>>[]): string {
  return toCSV(toContactCsvRows(contacts), CONTACT_CSV_COLUMNS)
}

/** CSV prefixed with a UTF-8 BOM so Excel opens it with correct encoding. */
export function contactsToExcelCsv(contacts: Partial<Pick<Contact, keyof ContactCsvRow>>[]): string {
  return CSV_BOM + contactsToCsv(contacts)
}
