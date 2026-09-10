// What a barcode reader — or a person — actually hands over.
//
// The register stores bare digits ("0806"); the `#` in every screen and PDF is
// decoration. But the obvious way to imitate a scan is to copy a code off the
// screen, which copies the `#` with it, and that was refused as "not in the
// register" (with a doubled ## in the message, since the error adds its own).
// Readers also append a carriage return, and some prefix a configurable
// character. So: strip whitespace, then any leading #.
//
// This is all that survives of the scanning STATION: signing gear out of the
// building and back is gone (a scan now only ADDS gear to a job from the
// equipment window), but "what a reader sends" is still the rule every barcode
// field has to share — the equipment picker, kit staging and the copy picker.
// PURE, so `npm run test:lib` asserts it under plain Node.
export const normalizeBarcode = (raw) =>
  String(raw ?? '')
    .trim()
    .replace(/^#+/, '')
    .trim()
