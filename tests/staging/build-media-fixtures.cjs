const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const out = path.resolve(__dirname, '../../output/google-staging-20260914');

(async () => {
  const fixtures = [];
  for (let n = 0; n < 2; n++) {
    const width = n ? 360 : 640, height = n ? 480 : 360;
    const raw = Buffer.alloc(width * height * 3);
    const colors = n ? [[27, 126, 83], [240, 185, 25], [28, 99, 173]] : [[222, 50, 62], [30, 133, 183], [247, 210, 64]];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const color = colors[Math.floor(x / (width / 3))];
      const at = (y * width + x) * 3;
      for (let c = 0; c < 3; c++) raw[at + c] = ((x % 80 < 5) || (y % 80 < 5)) ? 255 : color[c];
    }
    const format = n ? 'png' : 'jpeg';
    const bytes = await sharp(raw, { raw: { width, height, channels: 3 } }).toFormat(format, { quality: 90 }).toBuffer();
    const fileName = `qa-media-${n + 1}.${format}`;
    fs.writeFileSync(path.join(out, fileName), bytes);
    fixtures.push({ fileName, mimeType: 'image/' + format, width, height, size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), base64: bytes.toString('base64') });
  }
  fs.writeFileSync(path.join(out, 'media-fixtures.json'), JSON.stringify(fixtures));
  console.log(JSON.stringify(fixtures.map(({ base64, ...info }) => info), null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
