/**
 * Deterministic, dependency-free document fixtures for the template-import e2e.
 *
 * The Console import path (Word/PDF → mammoth/pdf-parse → editor body) needs a
 * real `.docx` and a real multi-page `.pdf` to drive end-to-end. Rather than
 * commit opaque binaries, we synthesize minimal-but-valid files in pure Node:
 *
 *   - `.docx`: a stored (uncompressed) ZIP holding the three OOXML parts mammoth
 *     needs (`[Content_Types].xml`, `_rels/.rels`, `word/document.xml`). CRC-32s
 *     come from Node's built-in `zlib.crc32` (Node 18+), so no zip lib is needed.
 *   - `.pdf`: a hand-written PDF with one text-bearing page per string and a
 *     correct cross-reference table. A 2+ page PDF makes pdf-parse emit its
 *     "-- N of M --" page separators, which the server must strip — the exact
 *     regression this fixture lets the test prove.
 */
import { crc32 } from "node:zlib";

interface ZipEntry {
  name: string;
  data: Buffer;
}

/** Builds a ZIP archive using the STORE method (no compression). */
function buildZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, "utf8");
    const crc = crc32(e.data) >>> 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header signature
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // method = store
    local.writeUInt16LE(0, 10); // mod time
    local.writeUInt16LE(0, 12); // mod date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(e.data.length, 18); // compressed size
    local.writeUInt32LE(e.data.length, 22); // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra length
    const localRec = Buffer.concat([local, nameBuf, e.data]);
    locals.push(localRec);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); // central directory signature
    cen.writeUInt16LE(20, 4); // version made by
    cen.writeUInt16LE(20, 6); // version needed
    cen.writeUInt16LE(0, 8); // flags
    cen.writeUInt16LE(0, 10); // method
    cen.writeUInt16LE(0, 12); // mod time
    cen.writeUInt16LE(0, 14); // mod date
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(e.data.length, 20);
    cen.writeUInt32LE(e.data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt16LE(0, 30); // extra length
    cen.writeUInt16LE(0, 32); // comment length
    cen.writeUInt16LE(0, 34); // disk number
    cen.writeUInt16LE(0, 36); // internal attrs
    cen.writeUInt32LE(0, 38); // external attrs
    cen.writeUInt32LE(offset, 42); // local header offset
    central.push(Buffer.concat([cen, nameBuf]));

    offset += localRec.length;
  }

  const localsBuf = Buffer.concat(locals);
  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // end of central dir signature
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // disk with central dir
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(localsBuf.length, 16);
  eocd.writeUInt16LE(0, 20); // comment length
  return Buffer.concat([localsBuf, centralBuf, eocd]);
}

function escaparXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Builds a minimal `.docx` whose body is one paragraph per string. The HTML
 * mammoth produces (one `<p>` per paragraph) is what the editor must be
 * prefilled with.
 */
export function docxComParagrafos(paragrafos: string[]): Buffer {
  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `</Types>`;
  const rels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
    `</Relationships>`;
  const corpo = paragrafos
    .map(
      (p) =>
        `<w:p><w:r><w:t xml:space="preserve">${escaparXml(p)}</w:t></w:r></w:p>`,
    )
    .join("");
  const document =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:body>${corpo}</w:body></w:document>`;

  return buildZip([
    { name: "[Content_Types].xml", data: Buffer.from(contentTypes, "utf8") },
    { name: "_rels/.rels", data: Buffer.from(rels, "utf8") },
    { name: "word/document.xml", data: Buffer.from(document, "utf8") },
  ]);
}

/**
 * Builds a valid PDF with one text-bearing page per string. Two or more pages
 * make pdf-parse emit "-- 1 of N --" separators between pages, exercising the
 * server's page-marker stripping.
 */
export function pdfComPaginas(paginas: string[]): Buffer {
  const n = paginas.length;
  const fontNum = 3;
  const pageNums = paginas.map((_, i) => 4 + i * 2);
  const contentNums = paginas.map((_, i) => 5 + i * 2);
  const maxNum = 3 + n * 2;

  const objs: string[] = [];
  const set = (num: number, body: string) => {
    objs[num] = `${num} 0 obj\n${body}\nendobj\n`;
  };

  set(1, `<</Type /Catalog /Pages 2 0 R>>`);
  set(
    2,
    `<</Type /Pages /Kids [${pageNums
      .map((p) => `${p} 0 R`)
      .join(" ")}] /Count ${n}>>`,
  );
  set(3, `<</Type /Font /Subtype /Type1 /BaseFont /Helvetica>>`);
  for (let i = 0; i < n; i++) {
    const texto = paginas[i].replace(/[()\\]/g, "\\$&");
    const stream = `BT /F1 24 Tf 72 700 Td (${texto}) Tj ET`;
    set(
      pageNums[i],
      `<</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
        `/Contents ${contentNums[i]} 0 R /Resources <</Font <</F1 ${fontNum} 0 R>>>>>>`,
    );
    set(
      contentNums[i],
      `<</Length ${Buffer.byteLength(stream)}>>\nstream\n${stream}\nendstream`,
    );
  }

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let num = 1; num <= maxNum; num++) {
    offsets[num] = Buffer.byteLength(out, "latin1");
    out += objs[num];
  }
  const xrefPos = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${maxNum + 1}\n`;
  out += `0000000000 65535 f \n`;
  for (let num = 1; num <= maxNum; num++) {
    out += `${String(offsets[num]).padStart(10, "0")} 00000 n \n`;
  }
  out += `trailer\n<</Size ${maxNum + 1} /Root 1 0 R>>\nstartxref\n${xrefPos}\n%%EOF`;
  return Buffer.from(out, "latin1");
}

/**
 * A minimal-but-valid 1×1 PNG, used to drive the photo-upload e2e end to end:
 * it's a real image (so the server's `image/png` mimetype check passes and the
 * stored object decodes), small enough to upload instantly, and decodable by the
 * browser — the test asserts the rendered <img> reaches `naturalWidth > 0`,
 * proving the signed read URL resolved to actual image bytes.
 */
export function pngMinimo(): Buffer {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  );
}
