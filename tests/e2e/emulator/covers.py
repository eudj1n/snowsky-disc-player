"""Adds generated covers to the acceptance media inside the emulator container:
a folder cover.png for Harbor (Lumen) and an embedded PICTURE block in
Crossing. Plain-colour PNGs made here; nothing comes from a real library."""
import struct
import sys
import zlib


def png(r, g, b, size=64):
    raw = b''.join(b'\0' + bytes([r, g, b]) * size for _ in range(size))

    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))

    header = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')


def embed(path, image, mime=b'image/png'):
    data = open(path, 'rb').read()
    assert data[:4] == b'fLaC', path
    picture = (struct.pack('>II', 3, len(mime)) + mime + struct.pack('>I', 0)
               + struct.pack('>IIIII', 64, 64, 24, 0, len(image)) + image)
    length = int.from_bytes(data[5:8], 'big')
    head, rest = data[:8 + length], data[8 + length:]
    # STREAMINFO stops being the last block; the picture follows it.
    head = head[:4] + bytes([head[4] & 0x7f]) + head[5:]
    open(path, 'wb').write(head + bytes([6]) + len(picture).to_bytes(3, 'big') + picture + rest)


root = sys.argv[1]
open(root + '/Lumen - Harbor/cover.png', 'wb').write(png(70, 110, 160))
embed(root + '/Kestrel - Harbor/a Crossing.flac', png(180, 120, 60))
