const ascii = (value: string) => Uint8Array.from(value, c => c.charCodeAt(0));
const zeros = (length: number) => new Uint8Array(length);
const u16 = (n: number) => Uint8Array.of(n >>> 8, n);
const u32 = (n: number) => Uint8Array.of(n >>> 24, n >>> 16, n >>> 8, n);

function concat(parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

function atom(type: string, ...parts: Uint8Array[]) {
  return concat([u32(8 + parts.reduce((sum, part) => sum + part.length, 0)), ascii(type), ...parts]);
}

const full = (type: string, flags: number, ...parts: Uint8Array[]) => atom(type, u32(flags), ...parts);
const unity = concat([u32(0x10000), zeros(12), u32(0x10000), zeros(12), u32(0x40000000)]);
const counted = (name: string) => concat([Uint8Array.of(name.length), ascii(name)]);

export function quickTimeFrame(rgba: Uint8ClampedArray, width: number, height: number) {
  if (rgba.length !== width * height * 4) throw new Error('视频帧尺寸有误');
  const bytes = new Uint8Array(8 + (width * 5 + 2) * height);
  let write = 6;
  const pixel = (i: number) => {
    const p = i * 4;
    bytes[write++] = rgba[p + 3]; bytes[write++] = rgba[p]; bytes[write++] = rgba[p + 1]; bytes[write++] = rgba[p + 2];
  };
  const raw = new Uint32Array(rgba.buffer, rgba.byteOffset, width * height);
  for (let row = 0; row < height; row++) {
    bytes[write++] = 1;
    let i = row * width;
    const end = i + width;
    function run(at: number) {
      let length = 1;
      while (at + length < end && length < 127 && raw[at + length] === raw[at]) length++;
      return length;
    }
    while (i < end) {
      const repeat = run(i);
      if (repeat >= 3) {
        bytes[write++] = 256 - repeat;
        pixel(i); i += repeat;
      } else {
        const from = i++;
        while (i < end && i - from < 127 && run(i) < 3) i++;
        bytes[write++] = i - from;
        for (let p = from; p < i; p++) pixel(p);
      }
    }
    bytes[write++] = 255;
  }
  bytes[write++] = 0;
  bytes.set(u32(write), 0);
  return bytes.slice(0, write);
}

export function transparentMovie(frames: Uint8Array[], width: number, height: number, lengthMs: number) {
  const sampleDuration = Math.round(lengthMs);
  const duration = sampleDuration * frames.length;
  const size = frames.reduce((total, frame) => total + frame.length, 0);
  if (!frames.length || width < 1 || width > 65535 || height < 1 || height > 65535 || duration >= 0xffffffff || size > 0x7ffffff0) {
    throw new Error('透明视频尺寸或长度超出编码范围');
  }
  const ftyp = atom('ftyp', ascii('qt  '), u32(0x200), ascii('qt  '));
  const handler = (type: string, subtype: string, name: string) =>
    full('hdlr', 0, ascii(type), ascii(subtype), zeros(12), counted(name));
  const compressor = zeros(32); compressor.set(counted('Animation'));
  const sample = atom('rle ', zeros(6), u16(1), zeros(12), u32(0x200), u16(width), u16(height),
    u32(0x480000), u32(0x480000), u32(0), u16(1), compressor, u16(32), u16(0xffff));
  const movie = (offset: number) => atom('moov',
    full('mvhd', 0, zeros(8), u32(1000), u32(duration), u32(0x10000), u16(0x100), zeros(10), unity, zeros(24), u32(2)),
    atom('trak',
      full('tkhd', 3, zeros(8), u32(1), u32(0), u32(duration), zeros(16), unity, u32(width * 65536), u32(height * 65536)),
      atom('mdia',
        full('mdhd', 0, zeros(8), u32(1000), u32(duration), u16(0x55c4), u16(0)),
        handler('mhlr', 'vide', 'VideoHandler'),
        atom('minf',
          full('vmhd', 1, zeros(8)), handler('dhlr', 'url ', 'DataHandler'),
          atom('dinf', full('dref', 0, u32(1), full('url ', 1))),
          atom('stbl',
            full('stsd', 0, u32(1), sample), full('stts', 0, u32(1), u32(frames.length), u32(sampleDuration)),
            full('stsc', 0, u32(1), u32(1), u32(frames.length), u32(1)),
            full('stsz', 0, u32(0), u32(frames.length), ...frames.map(frame => u32(frame.length))),
            full('stco', 0, u32(1), u32(offset)),
          ),
        ),
      ),
    ),
  );
  const offset = ftyp.length + movie(0).length + 8;
  return concat([ftyp, movie(offset), u32(8 + size), ascii('mdat'), ...frames]);
}
