// The product name, in ONE place.
//
// Deliberately free of React/JSX and any icon imports: the PDF builders
// (estimatePdf / packingListPdf) print it on their letterhead and those modules
// run under plain Node — that is how the PDFs are tested. The visual mark lives
// in components/Logo.jsx, which re-exports this name for UI code.
export const BRAND_NAME = 'Kitbay'
