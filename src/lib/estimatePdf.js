// Estimate PDF (epic #5, 5.4).
//
// `buildEstimatePdf` returns a jsPDF document and touches no browser API, so the
// exact same code path that produces the customer's file can be run in Node and
// inspected. `downloadEstimatePdf` is the thin browser wrapper.
//
// The table is hand-laid rather than pulled from a plugin: the layout is simple,
// and this keeps pagination, column widths and the repeated header under our own
// control (and one dependency lighter).
import { jsPDF } from 'jspdf'
// Explicit .js extensions: Vite resolves them fine and it keeps this module
// (and estimate.js) runnable under plain Node, which is how the PDF is tested.
import { buildEstimate, money } from './estimate.js'
import { studioLabel } from '../data/studios.js'
import { BRAND_NAME } from './brand.js'

const PAGE = { w: 595.28, h: 841.89 } // A4 portrait, points
const M = 48 // page margin
const COL = {
  item: M,
  detail: M + 210,
  qty: M + 330,
  rate: M + 390,
  total: PAGE.w - M,
}
const INK = { text: [15, 23, 42], muted: [100, 116, 139], rule: [203, 213, 225], accent: [124, 58, 237] }

const STATUS_LABEL = {
  hold: 'HOLD',
  confirmed: 'CONFIRMED',
  fulfilled: 'FULFILLED',
  draft: 'DRAFT',
  canceled: 'CANCELED',
}

// jsPDF's built-in Helvetica is WinAnsi-encoded. A character outside it (an arrow,
// an em dash) either vanishes or — worse — flips the whole string into a 16-bit
// encoding that renders as s p a c e d   o u t   l e t t e r s. Every string the
// PDF writes goes through here, so the typography we use on screen degrades to
// safe ASCII on paper instead of corrupting the line. (The middle dot IS in
// WinAnsi, so it is deliberately left alone.)
const ASCII = [
  [/[→⇒]/g, '->'],
  [/[—–−]/g, '-'],
  [/[‘’]/g, "'"],
  [/[“”]/g, '"'],
  [/…/g, '...'],
  [/≤/g, '<='],
  [/≥/g, '>='],
  [/ /g, ' '],
]
export function pdfSafe(value) {
  let out = String(value ?? '')
  for (const [re, to] of ASCII) out = out.replace(re, to)
  return out
}

export function estimateFileName(estimate) {
  const job = (estimate.order.jobName || 'estimate')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const po = estimate.order.poNumber ? `-${estimate.order.poNumber}` : ''
  return `estimate-${job || 'order'}${po}.pdf`.replace(/--+/g, '-')
}

export function buildEstimatePdf(estimateOrOrder, context) {
  // Accept either a prebuilt estimate or (order, context) for convenience.
  const est = estimateOrOrder?.groups ? estimateOrOrder : buildEstimate(estimateOrOrder, context)
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  let y = M

  const setInk = (c) => doc.setTextColor(c[0], c[1], c[2])
  const text = (s, x, yy, opts) => doc.text(pdfSafe(s), x, yy, opts)
  const right = (s, x, yy) => doc.text(pdfSafe(s), x, yy, { align: 'right' })

  const rule = (yy) => {
    doc.setDrawColor(INK.rule[0], INK.rule[1], INK.rule[2])
    doc.setLineWidth(0.5)
    doc.line(M, yy, PAGE.w - M, yy)
  }

  // Break to a new page when the next block wouldn't fit, repeating the table head.
  const ensure = (needed, repeatHead) => {
    if (y + needed <= PAGE.h - M - 24) return
    doc.addPage()
    y = M
    if (repeatHead) y = tableHead(y)
  }

  function tableHead(yy) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    setInk(INK.muted)
    text('EQUIPMENT', COL.item, yy)
    text('DETAIL', COL.detail, yy)
    right('QTY', COL.qty + 20, yy)
    right('DAY RATE', COL.rate + 50, yy)
    right('LINE TOTAL', COL.total, yy)
    rule(yy + 6)
    return yy + 20
  }

  // ---- header ------------------------------------------------------------
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  setInk(INK.text)
  text(BRAND_NAME, M, y + 4)

  doc.setFontSize(9)
  setInk(INK.accent)
  right('EQUIPMENT ESTIMATE', PAGE.w - M, y - 4)
  doc.setFont('helvetica', 'normal')
  setInk(INK.muted)
  right(STATUS_LABEL[est.order.status] ?? String(est.order.status).toUpperCase(), PAGE.w - M, y + 9)
  y += 22
  rule(y)
  y += 22

  // ---- job block ---------------------------------------------------------
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  setInk(INK.text)
  text(est.order.jobName, M, y)
  y += 20

  const meta = [
    ['PO number', est.order.poNumber || '—'],
    ['Order ref', est.order.number || '—'],
    ['Studio', est.order.studioId ? studioLabel(est.order.studioId) : '—'],
    ['Set', est.order.setLabel || '—'],
    [
      'Set date',
      est.order.startsOn
        ? est.order.endsOn && est.order.endsOn !== est.order.startsOn
          // Legacy rows from when an order could span days.
          ? `${est.order.startsOn} to ${est.order.endsOn}  (${est.days} days)`
          : est.order.startsOn
        : '—',
    ],
    ['Photographer', est.order.photographer || '—'],
    ['Client', est.order.companyName || '—'],
    [
      'Raised by',
      [est.order.createdBy, est.order.createdAt ? String(est.order.createdAt).slice(0, 10) : null]
        .filter(Boolean)
        .join(' · ') || '—',
    ],
  ]
  doc.setFontSize(9)
  for (const [k, v] of meta) {
    ensure(16)
    doc.setFont('helvetica', 'normal')
    setInk(INK.muted)
    text(k, M, y)
    doc.setFont('helvetica', 'bold')
    setInk(INK.text)
    text(v, M + 100, y)
    y += 15
  }
  y += 8

  // ---- roster ------------------------------------------------------------
  ensure(40)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  setInk(INK.muted)
  text('ROSTER', M, y)
  y += 14
  doc.setFontSize(9)
  if (est.roster.length === 0) {
    doc.setFont('helvetica', 'italic')
    setInk(INK.muted)
    text('No crew assigned yet.', M, y)
    y += 16
  } else {
    for (const r of est.roster) {
      ensure(15)
      doc.setFont('helvetica', 'normal')
      setInk(INK.muted)
      text(r.role, M, y)
      doc.setFont('helvetica', 'bold')
      setInk(INK.text)
      text(r.name, M + 100, y)
      y += 15
    }
  }
  y += 12

  // ---- equipment table ---------------------------------------------------
  y = tableHead(y)

  if (est.groups.length === 0) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(9)
    setInk(INK.muted)
    text('No equipment assigned to this order yet.', COL.item, y)
    y += 18
  }

  for (const g of est.groups) {
    ensure(34, true)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    setInk(INK.accent)
    text(g.type === 'kit' ? `KIT — ${g.name}` : 'A-LA-CARTE', COL.item, y)
    setInk(INK.muted)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    right(`${g.pieces} pcs · ${money(g.subtotal)}`, COL.total, y)
    y += 15

    for (const l of g.lines) {
      ensure(15, true)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      setInk(INK.text)
      // Long names are clipped so columns never collide.
      text(doc.splitTextToSize(pdfSafe(l.itemName), COL.detail - COL.item - 10)[0], COL.item, y)

      setInk(INK.muted)
      doc.setFontSize(8)
      const detail = [l.slotLabel, l.barcode ? `#${l.barcode}` : null].filter(Boolean).join(' · ')
      text(detail || '—', COL.detail, y)

      setInk(INK.text)
      doc.setFontSize(9)
      right(l.quantity, COL.qty + 20, y)
      right(l.dayRate == null ? 'n/a' : money(l.dayRate), COL.rate + 50, y)
      right(l.dayRate == null ? '—' : money(l.lineTotal), COL.total, y)
      y += 14
    }
    y += 6
  }

  // ---- totals ------------------------------------------------------------
  ensure(70)
  rule(y)
  y += 18
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  setInk(INK.muted)
  text(`${est.lineCount} lines · ${est.pieces} pieces · ${est.days} billable day(s)`, M, y)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  setInk(INK.text)
  right(`Equipment total: ${money(est.total)}`, COL.total, y + 2)
  y += 24

  if (est.unratedCount > 0) {
    ensure(30)
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8)
    setInk(INK.muted)
    const names = est.unratedNames.slice(0, 4).join(', ')
    const more = est.unratedCount > 4 ? `, +${est.unratedCount - 4} more` : ''
    text(
      `${est.unratedCount} line(s) have no day rate and are excluded from the total: ${names}${more}.`,
      M,
      y,
    )
    y += 14
  }

  // ---- footer on every page ---------------------------------------------
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    setInk(INK.muted)
    text('Estimate — equipment cost only. Not an invoice.', M, PAGE.h - M + 12)
    right(`Page ${p} of ${pages}`, PAGE.w - M, PAGE.h - M + 12)
  }

  return doc
}

export function downloadEstimatePdf(order, context) {
  const est = order?.groups ? order : buildEstimate(order, context)
  const doc = buildEstimatePdf(est)
  doc.save(estimateFileName(est))
}
