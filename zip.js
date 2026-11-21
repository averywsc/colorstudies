const crcTable = Uint32Array.from({length:256},(_,index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value;
});

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = (value >>> 8) ^ crcTable[(value ^ byte) & 255];
  return (value ^ 0xffffffff) >>> 0;
}

// The pack contains small ASCII LUT filenames, with no ZIP64 requirement.
async function buildZip(items, resolveFile) {
  const encoder = new TextEncoder();
  const entries = [];
  const directory = [];
  let offset = 0;
  let directorySize = 0;
  for (const item of items) {
    const file = await resolveFile(item);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const name = encoder.encode(item.lutName + '.cube');
    const checksum = crc32(bytes);
    let payload = file;
    let method = 0;
    try {
      const stream = file.stream().pipeThrough(new CompressionStream('deflate-raw'));
      const compressed = await new Response(stream).blob();
      if (compressed.size < file.size) {
        payload = compressed;
        method = 8;
      }
    } catch {
      // Browsers without raw deflate support can still write uncompressed ZIP entries.
    }

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0,0x04034b50,true);
    local.setUint16(4,20,true);
    local.setUint16(8,method,true);
    local.setUint16(12,33,true);
    local.setUint32(14,checksum,true);
    local.setUint32(18,payload.size,true);
    local.setUint32(22,file.size,true);
    local.setUint16(26,name.length,true);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0,0x02014b50,true);
    central.setUint16(4,20,true);
    central.setUint16(6,20,true);
    central.setUint16(10,method,true);
    central.setUint16(14,33,true);
    central.setUint32(16,checksum,true);
    central.setUint32(20,payload.size,true);
    central.setUint32(24,file.size,true);
    central.setUint16(28,name.length,true);
    central.setUint32(42,offset,true);

    entries.push(local.buffer,name,payload);
    directory.push(central.buffer,name);
    offset += local.byteLength + name.length + payload.size;
    directorySize += central.byteLength + name.length;
  }
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0,0x06054b50,true);
  end.setUint16(8,items.length,true);
  end.setUint16(10,items.length,true);
  end.setUint32(12,directorySize,true);
  end.setUint32(16,offset,true);
  return new Blob([...entries,...directory,end.buffer],{type:'application/zip'});
}
