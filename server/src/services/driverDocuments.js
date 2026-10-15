// What a driver may upload as a KYC document, and how the server decides
// what a file really is. The phone's picker is not trusted for the type:
// Android pickers sometimes report application/octet-stream or nothing at
// all for a photo, so the bytes are sniffed and the detected type is what
// gets stored and served back.

// One file per document. Phone camera photos are commonly 3-8 MB and can
// reach 12 MB on 50-megapixel modes; the app cannot shrink them (no image
// library is shipped), so the limit has to leave room for a raw photo.
const DOCUMENT_MAX_MB = 12;
const DOCUMENT_MAX_BYTES = DOCUMENT_MAX_MB * 1024 * 1024;

const DOCUMENT_TYPES = ['license', 'national_id', 'vehicle_registration', 'insurance', 'profile_photo', 'vehicle_photo', 'other'];
const REQUIRED_DOCUMENT_TYPES = ['license', 'national_id', 'vehicle_registration', 'insurance'];

const SUPPORTED_CONTENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
// Declared types the picker may send that carry no information; the bytes
// decide. Browsers and Android send these for files they cannot classify.
const UNKNOWN_CONTENT_TYPES = ['', 'application/octet-stream', 'binary/octet-stream', 'application/unknown'];

const UNSUPPORTED_TYPE_MESSAGE = 'Upload a PDF, JPEG, PNG, WebP, or HEIC file.';

/** Normalises a declared content type: lower-case, no parameters, jpg aliases. */
function normalizeContentType(value) {
  const bare = String(value || '').split(';')[0].trim().toLowerCase();
  if (bare === 'image/jpg' || bare === 'image/pjpeg') return 'image/jpeg';
  if (bare === 'image/x-png') return 'image/png';
  return bare;
}

/** The content type the first bytes of a file prove it to be, or null. */
function detectContentType(bytes) {
  if (!bytes || bytes.length < 12) return null;
  if (bytes.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (bytes.subarray(4, 8).toString('ascii') === 'ftyp') {
    // ISO base media file: the brand says whether it is a HEIF image
    // (heic, heix, hevc, mif1, msf1...) rather than an MP4 video.
    const brand = bytes.subarray(8, 12).toString('ascii').toLowerCase();
    if (/^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(brand)) return brand.startsWith('mif') || brand.startsWith('msf') ? 'image/heif' : 'image/heic';
    return null;
  }
  return null;
}

/**
 * Decides what an uploaded file is. Returns { contentType } for a file the
 * server accepts, or { error } with the message to send back.
 *
 * A declared type that is one of the supported ones must match the bytes
 * (a .pdf that is really a JPEG is refused); a declared type that says
 * nothing (octet-stream, missing) is replaced by what the bytes show.
 */
function classifyDocument(buffer, declaredType) {
  const declared = normalizeContentType(declaredType);
  const detected = detectContentType(buffer);
  if (!detected || !SUPPORTED_CONTENT_TYPES.includes(detected)) {
    return { error: { status: 415, message: UNSUPPORTED_TYPE_MESSAGE } };
  }
  if (!UNKNOWN_CONTENT_TYPES.includes(declared) && declared !== detected &&
      // image/heif and image/heic describe the same container family.
      !(declared.startsWith('image/hei') && detected.startsWith('image/hei'))) {
    return { error: { status: 415, message: 'The selected file does not match its file type.' } };
  }
  return { contentType: detected };
}

/** Whether a declared type is worth reading at all (multer's fileFilter). */
function isAcceptableDeclaredType(declaredType) {
  const declared = normalizeContentType(declaredType);
  return SUPPORTED_CONTENT_TYPES.includes(declared) || UNKNOWN_CONTENT_TYPES.includes(declared);
}

function safeDownloadName(fileName) {
  return String(fileName || 'driver-document')
    .replace(/[\\/\r\n"]/g, '_')
    .slice(0, 160);
}

module.exports = {
  DOCUMENT_MAX_MB,
  DOCUMENT_MAX_BYTES,
  DOCUMENT_TYPES,
  REQUIRED_DOCUMENT_TYPES,
  SUPPORTED_CONTENT_TYPES,
  UNSUPPORTED_TYPE_MESSAGE,
  normalizeContentType,
  detectContentType,
  classifyDocument,
  isAcceptableDeclaredType,
  safeDownloadName,
};
