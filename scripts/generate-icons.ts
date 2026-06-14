import sharp from 'sharp';
import path from 'path';

const OUTPUT_DIR = path.resolve(__dirname, '../apps/web/public/icons');
const BG = '#faf8f3';
const FG = '#1f1a14';

interface SvgOptions {
  padFactor?: number;
  rounded?: boolean;
}

function makeSvg(size: number, { padFactor = 0, rounded = true }: SvgOptions = {}): string {
  const padding = size * padFactor;
  const fontSize = (size - padding * 2) * 0.65;
  const cx = size / 2;
  const cy = size / 2;
  const rx = rounded ? Math.round(size * 0.22) : 0;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" fill="${BG}" rx="${rx}"/>
  <text
    x="${cx}" y="${cy}"
    font-family="Amiri, serif"
    font-size="${fontSize}"
    fill="${FG}"
    text-anchor="middle"
    dominant-baseline="middle"
  >ق</text>
</svg>`;
}

async function generate(svg: string, outPath: string): Promise<void> {
  await sharp(Buffer.from(svg)).png().toFile(outPath);
  console.log(`Generated ${outPath}`);
}

async function main(): Promise<void> {
  await generate(makeSvg(512), `${OUTPUT_DIR}/icon-512.png`);
  await generate(makeSvg(192), `${OUTPUT_DIR}/icon-192.png`);
  await generate(makeSvg(192, { padFactor: 0.12, rounded: false }), `${OUTPUT_DIR}/icon-maskable-192.png`);
  await generate(makeSvg(180, { rounded: false }), `${OUTPUT_DIR}/apple-touch-icon.png`);
  console.log('All icons generated.');
}

main().catch((err) => { console.error(err); process.exit(1); });
