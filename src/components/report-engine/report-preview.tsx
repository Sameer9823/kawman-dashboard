"use client"

import * as React from 'react'
import { Card } from '@/components/ui/card'
import { ExportMenu } from './export-menu'
import type { UniversalReportDefinition, ReportTable } from '@/lib/report-engine/types'
import { normalizeReport } from '@/lib/report-engine/types'
import { cn } from '@/lib/utils'

interface ReportPreviewProps {
  report: UniversalReportDefinition
  className?: string
  maxRows?: number
  showExportMenu?: boolean
  title?: string
}

function stringify(v: unknown): string {
  if (v === null || v === undefined) return '\u2014'
  if (typeof v === 'string') return v || '\u2014'
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (v instanceof Date) return v.toLocaleString('en-IN')
  try { return String(v) } catch { return '\u2014' }
}

function getPreviewTable(def: UniversalReportDefinition): ReportTable | null {
  if (def.tables?.length) return def.tables[0]
  if (def.columns?.length) return { columns: def.columns, rows: def.rows ?? [] }
  for (const s of def.sections ?? []) if (s.tables?.[0]) return s.tables[0]
  return null
}

export function ReportPreview({ report: rawReport, className, maxRows = 50, showExportMenu = true, title }: ReportPreviewProps) {
  const report = normalizeReport(rawReport)
  const table = getPreviewTable(report)
  const cols = table?.columns ?? []
  const allRows = (table?.rows ?? []) as Record<string, unknown>[]
  const rows = allRows.slice(0, maxRows)
  const truncated = allRows.length > maxRows
  const heading = title ?? report.title ?? report.name
  const subtitle = report.subtitle ?? report.periodLabel ?? (report.filters ? Object.entries(report.filters).map(([k, v]) => `${k}: ${v}`).join('  \u00b7  ') : '')
  const meta = report.metadata

  return (
    <Card className={cn('overflow-hidden border-white/[0.08] bg-[#0a111c]/80', className)}>
      <div className="flex items-start justify-between gap-4 p-4 border-b border-white/[0.06]">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white truncate">{heading}</h3>
          {subtitle && <p className="text-xs text-white/50 mt-0.5 line-clamp-2">{subtitle}</p>}
          <p className="text-[11px] text-white/30 mt-1">
            {allRows.length} row{allRows.length === 1 ? '' : 's'} {cols.length} col{cols.length === 1 ? '' : 's'}
            {meta?.generatedAt ? ` \u00b7 ${new Date(meta.generatedAt).toLocaleDateString('en-IN')}` : ''}
            {meta?.generatedBy ? ` \u00b7 ${meta.generatedBy}` : ''}
          </p>
        </div>
        {showExportMenu && cols.length > 0 && <ExportMenu report={report} />}
      </div>

      {report.filters && Object.keys(report.filters).length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 py-2 border-b border-white/[0.04] bg-white/[0.02]">
          {Object.entries(report.filters).map(([k, v]) => (
            <span key={k} className="inline-flex items-center gap-1 rounded-full bg-white/5 border border-white/10 px-2.5 py-1 text-xs text-white/60">
              <span className="text-white/35">{k}:</span> {v}
            </span>
          ))}
        </div>
      )}

      {report.metrics && report.metrics.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 border-b border-white/[0.04]">
          {report.metrics.slice(0, 8).map((m) => (
            <div key={m.label} className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-white/40">{m.label}</div>
              <div className="text-sm font-bold text-white mt-1">{m.value}</div>
              {m.sublabel && <div className="text-xs text-white/40 mt-0.5">{m.sublabel}</div>}
            </div>
          ))}
        </div>
      )}

      <div className="overflow-x-auto">
        {cols.length === 0 ? (
          <div className="p-8 text-center text-sm text-white/40">No columns defined.</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-white/40">{table?.emptyMessage ?? 'No data to display.'}</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.03]">
                {cols.map((c) => (
                  <th key={c.key} className={cn('px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white/50 whitespace-nowrap', c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left')}>
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className={cn('border-b border-white/[0.04]', i % 2 === 0 ? 'bg-transparent' : 'bg-white/[0.02]')}>
                  {cols.map((c) => (
                    <td key={c.key} className={cn('px-3 py-2 text-white/80 whitespace-nowrap max-w-[28ch] truncate', c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left')}>
                      {stringify((row as Record<string, unknown>)[c.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {truncated && (
        <div className="px-4 py-2 text-xs text-white/40 border-t border-white/[0.06] bg-white/[0.02]">
          Showing {maxRows} of {allRows.length} rows — export to see all.
        </div>
      )}
    </Card>
  )
}
