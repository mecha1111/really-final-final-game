// exe 아이콘(build/icon.ico) 생성 스크립트. `node tools/build-icon.mjs`로 재생성한다.
//
// 폴더 도형은 game/js/ui/fileIcons.js의 FILE_ICONS.folder를 그대로 옮겨왔다(그
// 파일이 이미 데스크톱 "숙제(안함)" 아이콘 등에 쓰는 것과 같은 모양) — 게임
// 제목 자체가 "진짜_최종_...exe" 식 파일명 농담이라 폴더가 곧 이 게임의 컨셉이다.
// 로고 전체(제목 텍스트 포함)를 그대로 축소하면 16px에서 글자가 뭉개져서
// 못 알아보므로 쓰지 않는다.
//
// ★ 16/32px은 48px 이상과 다른 SVG(flat)로 따로 렌더링한다 — 그라데이션·하이라이트
//   띠가 이 크기에서는 그냥 노이즈로 뭉개져서, 색을 2단만 남기고 선 두께를
//   키운 단순화 버전을 쓴다(아래 buildSvg의 flat/big 분기).
// ★ 빨간 X 배지는 game/js/ui/icons.js의 warning/error 아이콘과 같은 시각 언어
//   (원 + 대각선 X)를 재사용했다 — "망가진 파일"이라는 컨셉이 게임 안 다른
//   화면(나가기 대화상자의 error-icon 등)과 같은 기호로 읽히게.
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_ICO = path.join(__dirname, '..', 'build', 'icon.ico');

// 폴더 뒤판/앞판 path는 game/js/ui/fileIcons.js FILE_ICONS.folder와 동일하다.
// 원래 48x48 안에서 x:3~48, y:13~40인 가로로 긴(45x27) 모양이라, 정사각형에
// 최소 여백으로 채우려면 확대(scale 1.35) + 이동이 필요하다 — 탭 노치와
// 사다리꼴 앞판이 잘리지 않는 선에서 실측(스크린샷)으로 맞춘 값.
function folderGroup({ flat }) {
  const backFill = flat ? '#f0b81f' : 'url(#back)';
  const frontFill = flat ? '#fdc63f' : 'url(#front)';
  const defs = flat
    ? ''
    : '<defs>' +
      '<linearGradient id="back" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f8c53f"/><stop offset="1" stop-color="#d99a10"/></linearGradient>' +
      '<linearGradient id="front" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset=".55" stop-color="#fdc63f"/><stop offset="1" stop-color="#e0a014"/></linearGradient>' +
      '</defs>';
  // 하이라이트 띠는 48px 이상에서만 — 16/32px에서는 얇은 띠가 그냥 노이즈다.
  const highlight = flat ? '' : '<path d="M9.8 22.4h36.6l-.7 2.2H9.1z" fill="rgba(255,255,255,.45)"/>';
  const strokeW = flat ? 2.2 : 1.2;
  return (
    '<g transform="translate(-3,-13) scale(1.35) translate(1.2,4)">' +
    `<path d="M4 13h14l4 4h23v22H4z" fill="${backFill}" stroke="#8a6208" stroke-width="${strokeW}" stroke-linejoin="round"/>` +
    `<path d="M9 21h39l-6 19H3z" fill="${frontFill}" stroke="#8a6208" stroke-width="${strokeW}" stroke-linejoin="round"/>` +
    highlight +
    '</g>' +
    defs
  );
}

function badge({ big }) {
  const cx = 36;
  const cy = 33;
  const r = big ? 14 : 11.5;
  const xr = big ? 6.6 : 5.6;
  const strokeW = big ? 3.4 : 2.6;
  const ringW = big ? 2.4 : 1.6;
  return (
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#e0342a" stroke="#5c0f0a" stroke-width="${ringW}"/>` +
    `<path d="M${cx - xr} ${cy - xr} L${cx + xr} ${cy + xr} M${cx + xr} ${cy - xr} L${cx - xr} ${cy + xr}" ` +
    `stroke="#ffffff" stroke-width="${strokeW}" stroke-linecap="round"/>`
  );
}

function buildSvg({ flat, big }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">${folderGroup({ flat })}${badge({ big })}</svg>`;
}

const DETAILED_SVG = buildSvg({ flat: false, big: false });
const SIMPLIFIED_SVG = buildSvg({ flat: true, big: true });

const SIZES = [16, 32, 48, 64, 128, 256];

async function renderPng(size) {
  const svg = size <= 32 ? SIMPLIFIED_SVG : DETAILED_SVG;
  return sharp(Buffer.from(svg), { density: 72 * (size / 48) })
    .resize(size, size)
    .png()
    .toBuffer();
}

function packIco(sizes, pngs) {
  const headerSize = 6;
  const entrySize = 16;
  let offset = headerSize + entrySize * sizes.length;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);

  const entries = [];
  for (let i = 0; i < sizes.length; i++) {
    const size = sizes[i];
    const png = pngs[i];
    const entry = Buffer.alloc(entrySize);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += png.length;
  }
  return Buffer.concat([header, ...entries, ...pngs]);
}

const pngs = await Promise.all(SIZES.map(renderPng));
writeFileSync(OUT_ICO, packIco(SIZES, pngs));
console.log(`wrote ${OUT_ICO} (${SIZES.join(', ')}px)`);
