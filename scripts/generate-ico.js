/**
 * Converts the Kajri POS source image to a proper multi-size ICO file
 */
const sharp = require('sharp');
const pngToIco = require('png-to-ico');
const fs = require('fs');
const path = require('path');

const SOURCE_IMAGE = path.join('C:\\Users\\Aditya\\.gemini\\antigravity-ide\\brain\\ab640451-a236-4a4b-9c2e-11ce64f31b8b\\kajri_app_icon_1789544109821.jpg');
const ICONS_DIR    = path.join('C:\\Users\\Aditya\\Desktop\\kajri-pos\\electron\\icons');
const OUTPUT_ICO   = path.join(ICONS_DIR, 'icon.ico');
const OUTPUT_PNG   = path.join(ICONS_DIR, 'icon.png');

async function main() {
  console.log('Reading source image:', SOURCE_IMAGE);

  // 1. Resize to 256x256 PNG
  await sharp(SOURCE_IMAGE).resize(256, 256).png().toFile(OUTPUT_PNG);
  console.log('Resized to 256x256 PNG');

  // 2. Create multiple sizes for the ICO
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngBuffers = [];
  for (const size of sizes) {
    const buf = await sharp(SOURCE_IMAGE).resize(size, size).png().toBuffer();
    pngBuffers.push(buf);
    console.log(`Generated ${size}x${size}`);
  }

  // 3. Combine into ICO
  const icoBuffer = await pngToIco(pngBuffers);
  fs.writeFileSync(OUTPUT_ICO, icoBuffer);
  console.log('Successfully created icon.ico at:', OUTPUT_ICO);
  console.log('Size:', (icoBuffer.length / 1024).toFixed(1), 'KB');
}

main().catch(console.error);
