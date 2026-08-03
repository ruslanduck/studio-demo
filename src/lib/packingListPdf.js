// Packing list PDF (epic #6, 6.1).
//
// Generated for a CONFIRMED order: the assigned equipment + quantity per line,
// grouped exactly like the estimate — but this is a physical pull sheet, not a
// price doc. So: no money, and every line carries three initial boxes to sign
// on paper — two at sign-out, one at return (the EQ lifecycle OUT / OUT / RET).
//
// It reuses buildEstimate's grouped line model (same source of truth: the
// order's lines) and the estimate PDF's jsPDF setup + ASCII-safety, so the two
// documents stay visually of a piece and both run headless under Node.
import { jsPDF } from 'jspdf'
import { buildEstimate } from './estimate.js'
import { pdfSafe } from './estimatePdf.js'
import { packingRows } from './packing.js'
import { studioLabel } from '../data/studios.js'
import { BRAND_NAME } from './brand.js'

const PAGE = { w: 595.28, h: 841.89 } // A4 portrait, points
const M = 48
const INK = {
  text: [15, 23, 42],
  muted: [100, 116, 139],
  rule: [203, 213, 225],
  box: [148, 163, 184],
  accent: [124, 58, 237],
}

// Three initial boxes anchored to the right margin; content columns fill the
// space to their left.
const SIGN_W = 44
const SIGN_GAP = 7
const RET = { x1: PAGE.w - M - SIGN_W, x2: PAGE.w - M }
const OUT2 = { x1: RET.x1 - SIGN_GAP - SIGN_W, x2: RET.x1 - SIGN_GAP }
const OUT1 = { x1: OUT2.x1 - SIGN_GAP - SIGN_W, x2: OUT2.x1 - SIGN_GAP }
const COL = { item: M, detail: M + 150, qtyRight: OUT1.x1 - 12 }
const mid = (b) => (b.x1 + b.x2) / 2

const slug = (s) =>
  (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

export function packingListFileName(order, opts = {}) {
  const job = slug(order.jobName || order.setTitle || 'order') || 'order'
  const po = order.poNumber ? `-${order.poNumber}` : ''
  const addon = opts.addonLabel ? `-addon-${slug(opts.addonLabel) || 'extra'}` : ''
  return `packing-list-${job}${po}${addon}.pdf`.replace(/--+/g, '-')
}

// `opts.docTitle` overrides the header (default "PACKING LIST"); `opts.addonLabel`
// prints an add-on line under the job name — both used for Add-On lists (6.4).
export function buildPackingListPdf(orderOrEstimate, context, opts = {}) {
  const est = orderOrEstimate?.groups ? orderOrEstimate : buildEstimate(orderOrEstimate, context)
  // The printed sheet and the digital checklist must be the SAME list, or the
  // crew is ticking two different documents: one row per barcoded copy, counted
  // rows for everything that has no barcode of ours. `packingRows` is the one
  // definition (lib/packing.js).
  const rows = packingRows(est, { inventory: context?.inventory ?? [], booking: context?.booking ?? null })
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  let y = M

  const setInk = (c) => doc.setTextColor(c[0], c[1], c[2])
  const text = (s, x, yy, opts) => doc.text(pdfSafe(s), x, yy, opts)
  const right = (s, x, yy) => doc.text(pdfSafe(s), x, yy, { align: 'right' })
  const center = (s, x, yy) => doc.text(pdfSafe(s), x, yy, { align: 'center' })
  const rule = (yy) => {
    doc.setDrawColor(INK.rule[0], INK.rule[1], INK.rule[2])
    doc.setLineWidth(0.5)
    doc.line(M, yy, PAGE.w - M, yy)
  }

  function tableHead(yy) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    setInk(INK.muted)
    text('EQUIPMENT', COL.item, yy)
    text('DETAIL', COL.detail, yy)
    right('QTY', COL.qtyRight, yy)
    center('OUT', mid(OUT1), yy)
    center('OUT', mid(OUT2), yy)
    center('RET', mid(RET), yy)
    rule(yy + 6)
    return yy + 20
  }

  // Break to a new page when the next block wouldn't fit, repeating the head.
  const ensure = (needed, repeatHead) => {
    if (y + needed <= PAGE.h - M - 24) return
    doc.addPage()
    y = M
    if (repeatHead) y = tableHead(y)
  }

  // Three empty initial boxes on the current row.
  function signBoxes(yy) {
    doc.setDrawColor(INK.box[0], INK.box[1], INK.box[2])
    doc.setLineWidth(0.5)
    for (const b of [OUT1, OUT2, RET]) doc.rect(b.x1, yy - 9, SIGN_W, 13)
  }

  // ---- header ------------------------------------------------------------
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  setInk(INK.text)
  text(BRAND_NAME, M, y + 4)
  doc.setFontSize(9)
  setInk(INK.accent)
  right(opts.docTitle || 'PACKING LIST', PAGE.w - M, y - 4)
  doc.setFont('helvetica', 'normal')
  setInk(INK.muted)
  right('CONFIRMED', PAGE.w - M, y + 9)
  y += 22
  rule(y)
  y += 22

  // ---- job block ---------------------------------------------------------
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  setInk(INK.text)
  text(est.order.jobName, M, y)
  y += 20

  if (opts.addonLabel) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    setInk(INK.accent)
    text(`ADD-ON — ${opts.addonLabel}`, M, y)
    y += 18
  }

  const meta = [
    ['PO number', est.order.poNumber || '—'],
    ['Order ref', est.order.number || '—'],
    ['Studio', est.order.studioId ? studioLabel(est.order.studioId) : '—'],
    // The crew pulling gear needs to know WHICH set of the day it's for.
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
  ]
  doc.setFontSize(9)
  for (const [k, v] of meta) {
    ensure(15)
    doc.setFont('helvetica', 'normal')
    setInk(INK.muted)
    text(k, M, y)
    doc.setFont('helvetica', 'bold')
    setInk(INK.text)
    text(v, M + 100, y)
    y += 15
  }
  y += 6

  // How the sign columns work, once, up top.
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8)
  setInk(INK.muted)
  text('Initials: two at sign-out (checked / loaded), one at return.', M, y)
  y += 16

  // ---- equipment table ---------------------------------------------------
  y = tableHead(y)

  if (rows.length === 0) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(9)
    setInk(INK.muted)
    text('No equipment on this order.', COL.item, y)
    y += 18
  }

  for (const g of rows) {
    ensure(34, true)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    setInk(INK.accent)
    text(g.type === 'kit' ? `KIT — ${g.name}` : 'A-LA-CARTE', COL.item, y)
    setInk(INK.muted)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    right(`${g.lines.reduce((n, l) => n + (Number(l.quantity) || 1), 0)} pcs`, COL.qtyRight, y)
    y += 15

    for (const l of g.lines) {
      ensure(18, true)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      setInk(INK.text)
      text(doc.splitTextToSize(pdfSafe(l.itemName), COL.detail - COL.item - 10)[0], COL.item, y)

      setInk(INK.muted)
      doc.setFontSize(8)
      const detail = [
        l.slotLabel,
        l.barcode ? `#${l.barcode}` : null,
        l.kind === 'bulk' && l.why ? l.why : null,
        l.source === 'sub_rental' ? `sub: ${l.vendorName || 'vendor'}` : null,
      ]
        .filter(Boolean)
        .join(' · ')
      text(doc.splitTextToSize(pdfSafe(detail || '—'), COL.qtyRight - COL.detail - 24)[0], COL.detail, y)

      setInk(INK.text)
      doc.setFontSize(9)
      right(String(l.quantity), COL.qtyRight, y)
      signBoxes(y)
      y += 18
    }
    y += 6
  }

  // ---- totals line -------------------------------------------------------
  ensure(30)
  rule(y)
  y += 16
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  setInk(INK.text)
  const rowCount = rows.reduce((n, g) => n + g.lines.length, 0)
  const byBarcode = rows.reduce((n, g) => n + g.lines.filter((l) => l.kind === 'unit').length, 0)
  text(
    `${rowCount} rows · ${est.pieces} pieces to pull · ${byBarcode} signed off by barcode`,
    M,
    y,
  )

  // ---- footer on every page ---------------------------------------------
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    setInk(INK.muted)
    text('Packing list — sign OUT twice, RET once per line.', M, PAGE.h - M + 12)
    right(`Page ${p} of ${pages}`, PAGE.w - M, PAGE.h - M + 12)
  }

  return doc
}

export function downloadPackingListPdf(order, context, opts = {}) {
  const est = order?.groups ? order : buildEstimate(order, context)
  const doc = buildPackingListPdf(est, undefined, opts)
  doc.save(packingListFileName(est.order, opts))
}
