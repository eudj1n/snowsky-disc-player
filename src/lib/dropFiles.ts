/**
 * Files from a drop or a picker with their relative paths. Dropped folders
 * are walked recursively (owner's proposal 3; the reference accepted folders
 * only through the picker), keeping "Album/Disc 1/Track.flac".
 */
export interface PickedFile {
  file: File
  path: string
}

function readAll(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const entries: FileSystemEntry[] = []
    const next = () =>
      reader.readEntries((batch) => {
        if (!batch.length) resolve(entries)
        else {
          entries.push(...batch)
          next()
        }
      }, reject)
    next()
  })
}

async function walk(entry: FileSystemEntry, prefix: string, out: PickedFile[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject))
    out.push({ file, path: prefix + entry.name })
  } else if (entry.isDirectory) {
    for (const child of await readAll((entry as FileSystemDirectoryEntry).createReader())) {
      await walk(child, `${prefix}${entry.name}/`, out)
    }
  }
}

export async function droppedFiles(transfer: DataTransfer): Promise<{ files: PickedFile[]; folder: boolean }> {
  const entries = [...transfer.items].map((item) => item.webkitGetAsEntry()).filter((entry) => entry !== null)
  const folder = entries.some((entry) => entry.isDirectory)
  const files: PickedFile[] = []
  for (const entry of entries) await walk(entry, '', files)
  return { files, folder }
}

export function pickedFiles(list: FileList): PickedFile[] {
  return [...list].map((file) => ({ file, path: file.webkitRelativePath || file.name }))
}
