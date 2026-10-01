/**
 * An image's bytes in another of the card's cover types (owner, 2026-10-01:
 * a replaced cover keeps its file name, so a PNG chosen for `cover.jpg` is
 * stored as JPEG). Drawn once on a canvas at its own size.
 */
export async function reencode(image: Blob, type: 'image/jpeg' | 'image/png'): Promise<Blob> {
  if (image.type === type) return image
  const bitmap = await createImageBitmap(image)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('No canvas to convert the image')
  context.drawImage(bitmap, 0, 0)
  bitmap.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The image was not converted'))), type, 0.92),
  )
}
