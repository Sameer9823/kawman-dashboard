import * as React from 'react'

/** Renders **bold**, `code`, and leaves the rest as plain text within a line. */
function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      )
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i} className="rounded bg-white/10 px-1 py-0.5 text-[0.85em] text-purple-300">
          {part.slice(1, -1)}
        </code>
      )
    }
    return <React.Fragment key={i}>{part}</React.Fragment>
  })
}

/**
 * Minimal markdown -> JSX renderer for AI output. Handles the subset the
 * model realistically produces: #/##/### headings, bulleted and numbered
 * lists, and paragraphs. Not a full CommonMark implementation by design —
 * keeps the bundle light and output predictable.
 */
export function Markdown({ content, className }: { content: string; className?: string }) {
  const lines = content.split('\n')
  const blocks: React.ReactNode[] = []
  let listBuffer: string[] = []
  let listType: 'ul' | 'ol' | null = null

  function flushList() {
    if (listBuffer.length === 0) return
    const items = listBuffer.map((item, i) => <li key={i}>{renderInline(item)}</li>)
    if (listType === 'ol') {
      blocks.push(
        <ol key={blocks.length} className="list-decimal pl-5 space-y-1 my-2">
          {items}
        </ol>
      )
    } else {
      blocks.push(
        <ul key={blocks.length} className="list-disc pl-5 space-y-1 my-2">
          {items}
        </ul>
      )
    }
    listBuffer = []
    listType = null
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    const bulletMatch = line.match(/^\s*[-*]\s+(.*)/)
    const numberedMatch = line.match(/^\s*\d+[.)]\s+(.*)/)
    const h3 = line.match(/^###\s+(.*)/)
    const h2 = line.match(/^##\s+(.*)/)
    const h1 = line.match(/^#\s+(.*)/)

    if (bulletMatch) {
      if (listType !== 'ul') flushList()
      listType = 'ul'
      listBuffer.push(bulletMatch[1])
      continue
    }
    if (numberedMatch) {
      if (listType !== 'ol') flushList()
      listType = 'ol'
      listBuffer.push(numberedMatch[1])
      continue
    }
    flushList()

    if (h3) {
      blocks.push(
        <h3 key={blocks.length} className="text-sm font-semibold text-white mt-4 mb-1">
          {renderInline(h3[1])}
        </h3>
      )
    } else if (h2) {
      blocks.push(
        <h2 key={blocks.length} className="text-base font-semibold text-white mt-4 mb-1.5">
          {renderInline(h2[1])}
        </h2>
      )
    } else if (h1) {
      blocks.push(
        <h1 key={blocks.length} className="text-lg font-bold text-white mt-4 mb-2">
          {renderInline(h1[1])}
        </h1>
      )
    } else if (line.trim() === '') {
      // skip blank lines, spacing handled by margins
    } else {
      blocks.push(
        <p key={blocks.length} className="leading-relaxed">
          {renderInline(line)}
        </p>
      )
    }
  }
  flushList()

  return <div className={className}>{blocks}</div>
}
