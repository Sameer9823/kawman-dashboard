'use client'

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

type ReportForPdf = {
  title: string
  type: string
  content: string
  createdAt: string
  generatedByName: string
}

const TYPE_LABEL: Record<string, string> = {
  PIPELINE_HEALTH: 'Pipeline Health',
  WEEKLY_SALES_SUMMARY: 'Weekly Sales',
  FOLLOW_UP_RISK: 'Follow-up Risk',
  EXECUTIVE_SUMMARY: 'Executive Summary',
  employee_daily_summary: 'Employee Daily Summary',
  team_management_summary: 'Team Management',
}

function stripMdInline(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim()
}

function parseSections(markdown: string): Array<{ heading: string | null; lines: string[] }> {
  const out: Array<{ heading: string | null; lines: string[] }> = []
  let cur: { heading: string | null; lines: string[] } = { heading: null, lines: [] }
  for (const raw of markdown.split('\n')) {
    const line = raw.trimEnd()
    const h = line.match(/^#{1,6}\s+(.*)$/)
    if (h) {
      if (cur.heading !== null || cur.lines.length) out.push(cur)
      cur = { heading: stripMdInline(h[1]), lines: [] }
    } else {
      cur.lines.push(line)
    }
  }
  if (cur.heading !== null || cur.lines.length) out.push(cur)
  return out
}

function isTableSeparator(l: string): boolean {
  return /^\s*\|?[\s-|:]+\|[\s-|:]*$/.test(l)
}

export function exportReportPdf(report: ReportForPdf): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 40
  const contentW = pageW - margin * 2
  let y = 0

  const addPageIfNeeded = (need: number) => {
    if (y + need > pageH - 36) {
      doc.addPage()
      y = 36
    }
  }

  // ── Top accent bar
  doc.setFillColor(109, 40, 217) // violet-700
  doc.rect(0, 0, pageW, 4, 'F')

  y = 28
  // Eyebrow
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(110, 110, 130)
  doc.text('KAWMAN EXACT  ·  AI REPORT  ·  GROUNDED IN LIVE CRM DATA', margin, y)

  // Type pill
  const pill = TYPE_LABEL[report.type] ?? report.type
  const pillW = doc.getTextWidth(pill) + 16
  doc.setFillColor(237, 233, 254)
  doc.setDrawColor(221, 214, 254)
  // @ts-ignore jsPDF roundedRect
  doc.roundedRect(pageW - margin - pillW, y - 9, pillW, 14, 7, 7, 'FD')
  doc.setFontSize(7)
  doc.setTextColor(76, 29, 149)
  doc.text(pill, pageW - margin - pillW + 8, y)

  // Title
  y += 18
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(17)
  doc.setTextColor(17, 17, 27)
  const titleLines = doc.splitTextToSize(report.title, contentW)
  doc.text(titleLines, margin, y)
  y += titleLines.length * 18 + 6

  // Meta strip
  const created = new Date(report.createdAt)
  const meta = `${created.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}  ·  ${created.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}  ·  ${report.generatedByName}  ·  Org-scoped & permission-aware`
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(100, 100, 115)
  const metaLines = doc.splitTextToSize(meta, contentW)
  doc.text(metaLines, margin, y)
  y += metaLines.length * 9 + 6

  doc.setDrawColor(228, 228, 231)
  doc.setLineWidth(0.6)
  doc.line(margin, y, pageW - margin, y)
  y += 14

  // ── Body
  const sections = parseSections(report.content)

  for (const sec of sections) {
    if (sec.heading) {
      addPageIfNeeded(28)
      // section heading bar
      doc.setFillColor(245, 243, 255)
      doc.setDrawColor(221, 214, 254)
      doc.rect(margin, y - 10, contentW, 18, 'FD')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(76, 29, 149)
      doc.text(stripMdInline(sec.heading).toUpperCase(), margin + 8, y + 1)
      y += 16
    }

    // Walk lines inside section, grouping tables / blockquotes / lists
    let i = 0
    while (i < sec.lines.length) {
      const line = sec.lines[i]

      if (!line.trim()) { y += 4; i++; continue }

      // Blockquote
      if (line.trimStart().startsWith('>')) {
        const text = stripMdInline(line.replace(/^\s*>\s?/, ''))
        addPageIfNeeded(30)
        const boxLines = doc.splitTextToSize(text, contentW - 20)
        const boxH = boxLines.length * 10 + 12
        addPageIfNeeded(boxH + 6)
        doc.setFillColor(250, 245, 255)
        doc.setDrawColor(221, 214, 254)
        doc.rect(margin, y - 4, contentW, boxH, 'FD')
        doc.setDrawColor(139, 92, 246)
        doc.setLineWidth(2)
        doc.line(margin, y - 4, margin, y - 4 + boxH)
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(8.5)
        doc.setTextColor(60, 30, 120)
        doc.text(boxLines, margin + 10, y + 6)
        y += boxH + 10
        i++
        continue
      }

      // Table: header row + separator + body rows
      if (line.includes('|') && i + 1 < sec.lines.length && isTableSeparator(sec.lines[i + 1])) {
        const headerCells = line.split('|').map((c) => stripMdInline(c)).filter(Boolean)
        const body: string[][] = []
        let j = i + 2
        while (j < sec.lines.length && sec.lines[j].includes('|') && sec.lines[j].trim() !== '') {
          if (isTableSeparator(sec.lines[j])) { j++; continue }
          const cells = sec.lines[j].split('|').map((c) => stripMdInline(c)).filter(Boolean)
          // pad to header length
          while (cells.length < headerCells.length) cells.push('')
          body.push(cells.slice(0, headerCells.length))
          j++
        }
        // render via autoTable
        const startY = y + 2
        autoTable(doc, {
          startY,
          head: [headerCells],
          body,
          margin: { left: margin, right: margin },
          theme: 'grid',
          styles: {
            font: 'helvetica',
            fontSize: 7,
            cellPadding: { top: 4, right: 6, bottom: 4, left: 6 },
            textColor: [39, 39, 47],
            lineColor: [228, 228, 231],
            lineWidth: 0.4,
          },
          headStyles: {
            fillColor: [109, 40, 217],
            textColor: 255,
            fontStyle: 'bold',
            fontSize: 7,
          },
          alternateRowStyles: { fillColor: [249, 249, 251] },
          didDrawPage: (data) => {
            // keep y in sync
            y = data.cursor?.y ?? y
          },
        })
        // autoTable updates cursor; sync y
        // @ts-ignore
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10
        i = j
        continue
      }

      // Bullet / ordered list
      const bullet = line.match(/^\s*[-*]\s+(.*)$/)
      const ordered = line.match(/^\s*\d+\.\s+(.*)$/)
      if (bullet || ordered) {
        const text = stripMdInline((bullet?.[1] ?? ordered?.[1] ?? '').trim())
        const prefix = bullet ? '•  ' : `${line.trim().split('.')[0]}.  `
        const wrapped = doc.splitTextToSize(prefix + text, contentW - 10)
        addPageIfNeeded(wrapped.length * 10 + 4)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8.5)
        doc.setTextColor(39, 39, 47)
        doc.text(wrapped, margin + 10, y)
        y += wrapped.length * 10 + 3
        i++
        continue
      }

      // Normal paragraph
      const para = stripMdInline(line)
      if (para) {
        const wrapped = doc.splitTextToSize(para, contentW)
        addPageIfNeeded(wrapped.length * 10 + 4)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8.5)
        doc.setTextColor(39, 39, 47)
        // crude bold: if original had **, render whole line bold
        const isBold = /\*\*/.test(line)
        doc.setFont('helvetica', isBold ? 'bold' : 'normal')
        doc.text(wrapped, margin, y)
        y += wrapped.length * 10 + 4
      }
      i++
    }

    y += 6
  }

  // ── Footer on every page
  const totalPages = doc.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(150, 150, 165)
    doc.text(`Kawman ExAct AI  ·  Generated ${created.toLocaleDateString('en-IN')} by ${report.generatedByName}  ·  Verify critical figures before sharing externally`, margin, pageH - 14)
    doc.text(`Page ${p} of ${totalPages}`, pageW - margin, pageH - 14, { align: 'right' })
  }

  const safe = report.title.replace(/[^a-z0-9\- ]/gi, '').slice(0, 48) || 'report'
  doc.save(`${safe}.pdf`)
}
