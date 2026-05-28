// AVA Remembers — address normalizer.
//
// Notes are tagged to ADDRESS, not order/stop, so the same site's history
// persists across seasons + drivers. address_key is the deterministic
// lowercase/punctuation-stripped/whitespace-collapsed form. Single source of
// truth — used by every read and every write to guarantee the keys line up.
//
// Real input shape: dispatch_stops.address is a single concatenated string
// (e.g. "2575 Route 55, Poughquag, NY 12570") — the driver app maps it
// onto Stop.address_line_1 with city/state/postal blank. normalizeAddressKey
// is the canonical entry point; the legacy object-form `addressKey` is a
// thin wrapper that joins the parts and defers to the same routine.

export function normalizeAddressKey(address: string): string {
  return address
    .toLowerCase()
    .replace(/[.,#'"]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

type StopAddressParts = {
  address_line_1: string
  address_line_2?: string | null
  city?:          string | null
  state?:         string | null
  postal_code?:   string | null
}

export function addressKeyFromParts(parts: StopAddressParts): string {
  const raw = [
    parts.address_line_1,
    parts.address_line_2,
    parts.city,
    parts.state,
    parts.postal_code,
  ].filter(Boolean).join(' ')
  return normalizeAddressKey(raw)
}

export function rawAddressFromParts(parts: StopAddressParts): string {
  const left  = [parts.address_line_1, parts.address_line_2].filter(Boolean).join(', ')
  const right = [parts.city, parts.state, parts.postal_code].filter(Boolean).join(' ')
  return [left, right].filter(Boolean).join(', ').trim()
}
