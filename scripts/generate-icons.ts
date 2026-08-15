import sharp from 'sharp';
import path from 'path';
import { mkdir } from 'fs/promises';
import { execFileSync } from 'child_process';

const OUTPUT_DIR = path.resolve(__dirname, '../apps/web/public/icons');
const MOBILE_DIR = path.resolve(__dirname, '../apps/mobile/assets/icons');
const BG = '#faf8f3';
const FG = '#1f1a14';

// The isolated qaf outline, lifted from the app's own Hafs face
// (apps/mobile/assets/fonts/hafs.18.woff2, glyph afii57442, unitsPerEm 2048)
// and inlined so rendering needs no font installed on the build machine.
//
// makeSvg's `font-family="Amiri, serif"` looks deterministic and is not: no
// container here has Amiri, so it silently falls back to FreeSerif and emits a
// different mark. Regenerating the web icons on this machine changed 11,222
// pixels of icon-512.png for exactly that reason. An icon whose shape depends
// on the build host's fontconfig cannot be a brand asset.
//
// Re-extract with:
//   python3 -c "from fontTools.ttLib import TTFont; \
//     from fontTools.pens.svgPathPen import SVGPathPen; \
//     f=TTFont('apps/mobile/assets/fonts/hafs.18.woff2'); g=f.getGlyphSet(); \
//     p=SVGPathPen(g); g[f.getBestCmap()[0x0642]].draw(p); print(p.getCommands())"
const QAF_PATH =
  'M878 846Q867 839 858 844L738 934L665 828Q662 823 657.0 822.5Q652 822 649 824L522 916Q513 922 518 928L595 1034Q602 1043 610 1038L730 950L807 1054Q811 1059 812.5 1059.5Q814 1060 819 1056L946 966Q953 961 946 951ZM794 497Q780 497 765.5 489.0Q751 481 738.5 468.5Q726 456 718.0 441.5Q710 427 710 414Q725 391 749.0 380.0Q773 369 798.0 370.0Q823 371 846.0 384.0Q869 397 882 421Q880 433 870.5 446.5Q861 460 848.0 471.0Q835 482 820.5 489.5Q806 497 794 497ZM937 325Q913 279 872.5 247.0Q832 215 781 215Q727 215 686.5 249.0Q646 283 637 337Q631 375 642.0 429.5Q653 484 677 538Q701 592 739.0 624.5Q777 657 822 657Q852 657 880.0 635.0Q908 613 931.5 582.0Q955 551 972.0 516.5Q989 482 999 457Q1028 378 1036.5 300.0Q1045 222 1030 137Q1012 31 956.0 -48.5Q900 -128 821 -181Q742 -234 646.5 -260.5Q551 -287 453 -287Q370 -287 299.5 -261.5Q229 -236 178.0 -188.0Q127 -140 98.5 -71.5Q70 -3 70 83Q70 177 100.5 261.5Q131 346 185 425Q191 434 196.0 433.5Q201 433 203.5 428.5Q206 424 207.0 417.5Q208 411 207 408Q165 312 148.5 223.0Q132 134 164 48Q194 -29 267.0 -78.5Q340 -128 463 -128Q542 -128 616.0 -113.0Q690 -98 755 -67Q820 -36 875.0 11.0Q930 58 970 122Q976 141 976.5 169.5Q977 198 973.0 227.5Q969 257 960.0 283.5Q951 310 937 325Z';
// Tight ink bounds of QAF_PATH in font units, from fontTools' BoundsPen.
const GLYPH = { minX: 70, minY: -287, maxX: 1039.5744680851064, maxY: 1059.5555555555557 };

interface SvgOptions {
  padFactor?: number;
  rounded?: boolean;
  /**
   * Omit the background plate. Android composites an adaptive icon's
   * foreground over `android.adaptiveIcon.backgroundColor`, and the splash
   * plugin composites over its own backgroundColor, so both want the glyph
   * alone -- an opaque plate would show as a square inside the system mask.
   */
  transparent?: boolean;
}

/**
 * Same mark as makeSvg, drawn from the embedded outline instead of a system
 * font lookup, so the output is byte-identical on every machine.
 */
function makeGlyphSvg(size: number, { padFactor = 0, rounded = true, transparent = false }: SvgOptions = {}): string {
  const inner = size * (1 - padFactor * 2);
  const glyphWidth = GLYPH.maxX - GLYPH.minX;
  const glyphHeight = GLYPH.maxY - GLYPH.minY;
  // 0.86 keeps a little optical air inside the padding box; fitting the ink to
  // the full inner square makes the mark read as cramped at launcher sizes.
  const scale = (inner * 0.86) / Math.max(glyphWidth, glyphHeight);
  // Font space is y-up, SVG is y-down, hence scale(s, -s). Translate so the
  // glyph's ink centre lands on the icon's centre.
  const tx = size / 2 - ((GLYPH.minX + GLYPH.maxX) / 2) * scale;
  const ty = size / 2 + ((GLYPH.minY + GLYPH.maxY) / 2) * scale;
  const rx = rounded ? Math.round(size * 0.22) : 0;
  const plate = transparent ? '' : `<rect width="${size}" height="${size}" fill="${BG}" rx="${rx}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  ${plate}
  <g transform="translate(${tx} ${ty}) scale(${scale} ${-scale})"><path d="${QAF_PATH}" fill="${FG}"/></g>
</svg>`;
}

function makeSvg(size: number, { padFactor = 0, rounded = true, transparent = false }: SvgOptions = {}): string {
  const padding = size * padFactor;
  const fontSize = (size - padding * 2) * 0.65;
  const cx = size / 2;
  const cy = size / 2;
  const rx = rounded ? Math.round(size * 0.22) : 0;
  const plate = transparent ? '' : `<rect width="${size}" height="${size}" fill="${BG}" rx="${rx}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  ${plate}
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

/**
 * The web icons below are drawn with `font-family="Amiri, serif"`. If Amiri is
 * not installed, fontconfig substitutes silently and the icons still generate
 * -- as a different mark. That is worse than failing, so refuse to overwrite
 * them rather than quietly reshaping a mark that already shipped.
 */
function assertAmiriAvailable(): void {
  let families = '';
  try {
    families = execFileSync('fc-list', [':family=Amiri', 'family'], { encoding: 'utf8' });
  } catch {
    throw new Error(
      'Cannot verify the Amiri font (fc-list unavailable), and the web icons render with it. ' +
        'Install fontconfig, or pass --mobile-only to regenerate just the Android icons.',
    );
  }

  if (!/amiri/i.test(families)) {
    throw new Error(
      'Amiri is not installed. The web icons would render in a fallback serif and silently ' +
        'change the shipped mark. Install it (Debian: fonts-hosny-amiri), or pass --mobile-only ' +
        'to regenerate just the Android icons, which use the embedded outline instead.',
    );
  }
}

async function main(): Promise<void> {
  const mobileOnly = process.argv.includes('--mobile-only');

  if (!mobileOnly) {
    assertAmiriAvailable();
    await generate(makeSvg(512), `${OUTPUT_DIR}/icon-512.png`);
    await generate(makeSvg(192), `${OUTPUT_DIR}/icon-192.png`);
    await generate(makeSvg(192, { padFactor: 0.12, rounded: false }), `${OUTPUT_DIR}/icon-maskable-192.png`);
    await generate(makeSvg(512, { padFactor: 0.12, rounded: false }), `${OUTPUT_DIR}/icon-maskable-512.png`);
    await generate(makeSvg(180, { rounded: false }), `${OUTPUT_DIR}/apple-touch-icon.png`);
  }

  // Android, drawn from the embedded outline -- see QAF_PATH. The web icons
  // above still go through the font-dependent path; switching them changes a
  // mark that already shipped, so that is a product call, not a build fix.
  await mkdir(MOBILE_DIR, { recursive: true });
  // Play requires a 1024 square with no transparency and no built-in rounding;
  // the launcher applies its own mask.
  await generate(makeGlyphSvg(1024, { rounded: false }), `${MOBILE_DIR}/icon.png`);
  // Adaptive foreground: the outer ~25% is cropped on round/squircle masks, so
  // the glyph is padded well inside the safe zone.
  await generate(
    makeGlyphSvg(1024, { padFactor: 0.28, rounded: false, transparent: true }),
    `${MOBILE_DIR}/adaptive-icon.png`,
  );
  await generate(
    makeGlyphSvg(512, { padFactor: 0.1, rounded: false, transparent: true }),
    `${MOBILE_DIR}/splash-icon.png`,
  );
  console.log('All icons generated.');
}

main().catch((err) => { console.error(err); process.exit(1); });
