// ─── Code128 SVG Barcode Generator ───────────────────────────────────────────
// Generates a Code128-B SVG barcode for a given string

// Code128-B encoding table: character → bar pattern (11 bits)
const CODE128_TABLE: Record<string, number[]> = {
  " ": [2,1,2,2,2,2], "!": [2,2,2,1,2,2], '"': [2,2,2,2,2,1],
  "#": [1,2,1,2,2,3], "$": [1,2,1,3,2,2], "%": [1,3,1,2,2,2],
  "&": [1,2,2,2,1,3], "'": [1,2,2,3,1,2], "(": [1,3,2,2,1,2],
  ")": [2,2,1,2,1,3], "*": [2,2,1,3,1,2], "+": [2,3,1,2,1,2],
  ",": [1,1,2,2,3,2], "-": [1,2,2,1,3,2], ".": [1,2,2,2,3,1],
  "/": [1,1,3,2,2,2], "0": [1,2,3,1,2,2], "1": [1,2,3,2,2,1],
  "2": [2,2,3,2,1,1], "3": [2,2,1,1,3,2], "4": [2,2,1,2,3,1],
  "5": [2,1,3,2,1,2], "6": [2,2,3,1,1,2], "7": [3,1,2,1,3,1],
  "8": [3,1,1,2,2,2], "9": [3,2,1,1,2,2], ":": [3,2,1,2,2,1],
  ";": [3,1,2,2,1,2], "<": [3,2,2,1,1,2], "=": [3,2,2,2,1,1],
  ">": [2,1,2,1,2,3], "?": [2,1,2,3,2,1], "@": [2,3,2,1,2,1],
  "A": [1,1,1,3,2,3], "B": [1,3,1,1,2,3], "C": [1,3,1,3,2,1],
  "D": [1,1,2,3,1,3], "E": [1,3,2,1,1,3], "F": [1,3,2,3,1,1],
  "G": [2,1,1,3,1,3], "H": [2,3,1,1,1,3], "I": [2,3,1,3,1,1],
  "J": [1,1,3,1,2,3], "K": [1,1,3,3,2,1], "L": [1,3,3,1,2,1],
  "M": [1,1,2,1,3,3], "N": [1,1,2,3,3,1], "O": [1,3,2,1,3,1],
  "P": [3,1,1,1,2,3], "Q": [3,1,1,3,2,1], "R": [3,3,1,1,2,1],
  "S": [3,1,2,1,1,3], "T": [3,1,2,3,1,1], "U": [3,3,2,1,1,1],
  "V": [3,1,4,1,1,1], "W": [2,2,1,4,1,1], "X": [4,3,1,1,1,1],
  "Y": [1,1,1,2,2,4], "Z": [1,1,1,4,2,2], "[": [1,2,1,1,2,4],
  "\\": [1,2,1,4,2,1], "]": [1,4,1,1,2,2], "^": [1,4,1,2,2,1],
  "_": [1,1,2,2,1,4], "`": [1,1,2,4,1,2], "a": [1,2,2,1,1,4],
  "b": [1,2,2,4,1,1], "c": [1,4,2,1,1,2], "d": [1,4,2,2,1,1],
  "e": [2,4,1,2,1,1], "f": [2,2,1,1,1,4], "g": [4,1,3,1,1,1],
  "h": [2,4,1,1,1,2], "i": [1,3,4,1,1,1], "j": [1,1,1,2,4,2],
  "k": [1,2,1,1,4,2], "l": [1,2,1,2,4,1], "m": [1,1,4,2,1,2],
  "n": [1,2,4,1,1,2], "o": [1,2,4,2,1,1], "p": [4,1,1,2,1,2],
  "q": [4,2,1,1,1,2], "r": [4,2,1,2,1,1], "s": [2,1,2,1,4,1],
  "t": [2,1,4,1,2,1], "u": [4,1,2,1,2,1], "v": [1,1,1,1,4,3],
  "w": [1,1,1,3,4,1], "x": [1,3,1,1,4,1], "y": [1,1,4,1,1,3],
  "z": [1,1,4,3,1,1], "{": [4,1,1,1,1,3], "|": [4,1,1,3,1,1],
  "}": [1,1,3,1,4,1], "~": [4,1,3,1,1,1],
}

const START_B = [2,1,1,4,1,2]
const STOP    = [2,3,3,1,1,1,2]

function getPatterns(text: string): number[][] {
  const pats: number[][] = [START_B]
  for (const ch of text) {
    const p = CODE128_TABLE[ch]
    if (p) pats.push(p)
    else pats.push(CODE128_TABLE["?"])
  }
  pats.push(STOP)
  return pats
}

export function generateBarcodeSVG(
  text: string,
  options: { width?: number; height?: number; color?: string } = {}
): string {
  const { height = 48, color = "currentColor" } = options
  const moduleWidth = 2
  const margin = 10

  const patterns = getPatterns(text.slice(0, 20)) // cap at 20 chars
  const allBars: number[] = []
  patterns.forEach((p) => allBars.push(...p))

  const totalModules = allBars.reduce((a, b) => a + b, 0)
  const svgWidth = totalModules * moduleWidth + margin * 2

  let x = margin
  let bars = ""
  allBars.forEach((w, idx) => {
    const isBar = idx % 2 === 0
    if (isBar) {
      bars += `<rect x="${x}" y="0" width="${w * moduleWidth}" height="${height}" fill="${color}"/>`
    }
    x += w * moduleWidth
  })

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${height}" viewBox="0 0 ${svgWidth} ${height}">${bars}</svg>`
}

// Simple QR Code (3-module) placeholder - uses URL encoding for data URI
export function generateQRDataURL(text: string, size = 120): string {
  // We use a public QR API for accurate QR generation
  const encoded = encodeURIComponent(text)
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encoded}&format=svg&color=000000&bgcolor=ffffff&margin=4`
}
