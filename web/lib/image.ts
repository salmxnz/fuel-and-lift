// Client-side photo shrinking before upload: longest side 768 px, JPEG ~0.8.
// Keeps the AI request small (the API rejects images over 2 MB) and fast on
// mobile data.

export type PreparedImage = {
  mediaType: "image/jpeg"
  /** Base64 without the data: prefix. */
  data: string
  /** Object URL of the resized image, for previews. Revoke when done. */
  previewUrl: string
  width: number
  height: number
  bytes: number
}

const MAX_SIDE = 768
const QUALITY = 0.8

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      // Applies EXIF orientation so phone photos aren't sideways.
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" })
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() }
    } catch {
      // Fall through (e.g. HEIC on some browsers): try an <img>.
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = "async"
    img.src = url
    await img.decode()
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) }
  } catch (err) {
    URL.revokeObjectURL(url)
    throw err
  }
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode the photo"))), "image/jpeg", QUALITY)
  })
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result)
      resolve(result.slice(result.indexOf(",") + 1))
    }
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the photo"))
    reader.readAsDataURL(blob)
  })
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith("image/") && file.type !== "") {
    throw new Error("That file isn't a photo.")
  }
  let decoded
  try {
    decoded = await decode(file)
  } catch {
    throw new Error("Couldn't open that photo. Try a JPEG or PNG.")
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(decoded.width, decoded.height))
  const width = Math.max(1, Math.round(decoded.width * scale))
  const height = Math.max(1, Math.round(decoded.height * scale))
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Your browser can't process photos.")
  ctx.fillStyle = "#FFFFFF" // transparent PNGs → white, not black
  ctx.fillRect(0, 0, width, height)
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(decoded.source, 0, 0, width, height)
  decoded.close()
  const blob = await toBlob(canvas)
  const data = await blobToBase64(blob)
  return { mediaType: "image/jpeg", data, previewUrl: URL.createObjectURL(blob), width, height, bytes: blob.size }
}
