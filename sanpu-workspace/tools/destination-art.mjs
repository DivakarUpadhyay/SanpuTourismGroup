// Writes the original destination illustrations (SVG, no third-party images or logos) into both apps' public/images.
// Image paths are stored in the database (Destinations.ImageUrl / Regions.ImageUrl), so staff can change them without a rebuild.
// Usage: node tools/destination-art.mjs
import fs from "node:fs";

const svg = (label, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 292" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${label}">\n${body}\n</svg>\n`;
const grad = (id, stops) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join("")}</linearGradient>`;

const art = {
  hualien: svg("Illustration: green rift valley with rice fields between mountains", `<defs>${grad("s", [[0, "#7fb6e6"], [1, "#d9ecf7"]])}${grad("f", [[0, "#9fd06b"], [1, "#5f9e3a"]])}</defs>
<rect width="480" height="292" fill="url(#s)"/><circle cx="390" cy="62" r="26" fill="#fff6d6"/>
<path d="M0 150 L70 72 L130 128 L190 60 L260 140 L320 84 L400 132 L480 78 V200 H0Z" fill="#5c7f9e"/>
<path d="M0 170 L90 112 L160 160 L240 104 L330 168 L410 120 L480 150 V220 H0Z" fill="#46705a"/>
<path d="M0 196 C120 176 360 176 480 196 V292 H0Z" fill="url(#f)"/>
<g stroke="#4c8a2c" stroke-width="2" opacity=".55" fill="none"><path d="M0 222 C140 206 340 206 480 222"/><path d="M0 246 C140 230 340 230 480 246"/><path d="M0 270 C140 256 340 256 480 270"/></g>
<path d="M210 292 C226 250 250 222 268 196" stroke="#e8d9a8" stroke-width="10" fill="none" stroke-linecap="round"/>
<g fill="#2f5d36"><circle cx="70" cy="200" r="12"/><circle cx="84" cy="204" r="9"/><circle cx="420" cy="202" r="13"/><circle cx="404" cy="206" r="8"/></g>
<g fill="#fff" opacity=".85"><ellipse cx="120" cy="52" rx="34" ry="9"/><ellipse cx="270" cy="38" rx="40" ry="10"/></g>`),

  alishan: svg("Illustration: sunrise over a sea of clouds with mountain ridges and a small forest train", `<defs>${grad("s", [[0, "#3d4c8a"], [0.55, "#f29e7a"], [1, "#ffd9a0"]])}</defs>
<rect width="480" height="292" fill="url(#s)"/><circle cx="240" cy="150" r="40" fill="#ffe7a8"/>
<path d="M0 160 L80 108 L150 146 L230 96 L300 150 L380 104 L480 150 V200 H0Z" fill="#4a3f6b" opacity=".85"/>
<g fill="#fff8f0"><ellipse cx="80" cy="186" rx="120" ry="22"/><ellipse cx="260" cy="194" rx="150" ry="24"/><ellipse cx="430" cy="184" rx="110" ry="20"/></g>
<path d="M0 214 C100 200 380 200 480 214 V292 H0Z" fill="#2e4a3a"/>
<g fill="#1f3529"><path d="M40 214 l14 -40 l14 40z"/><path d="M70 214 l12 -32 l12 32z"/><path d="M400 214 l14 -42 l14 42z"/><path d="M430 214 l10 -28 l10 28z"/></g>
<path d="M0 252 H480" stroke="#7a5b3a" stroke-width="4"/>
<g fill="#b8392e"><rect x="170" y="230" width="44" height="20" rx="4"/><rect x="218" y="230" width="40" height="20" rx="4"/><rect x="262" y="230" width="40" height="20" rx="4"/></g>
<g fill="#ffe7a8"><rect x="176" y="234" width="8" height="7"/><rect x="190" y="234" width="8" height="7"/><rect x="224" y="234" width="8" height="7"/><rect x="238" y="234" width="8" height="7"/><rect x="268" y="234" width="8" height="7"/><rect x="282" y="234" width="8" height="7"/></g>
<g fill="#222"><circle cx="182" cy="252" r="4"/><circle cx="204" cy="252" r="4"/><circle cx="230" cy="252" r="4"/><circle cx="250" cy="252" r="4"/><circle cx="274" cy="252" r="4"/><circle cx="294" cy="252" r="4"/></g>`),

  sunmoon: svg("Illustration: calm mountain lake with a pagoda on the hillside and a small boat", `<defs>${grad("s", [[0, "#9cc8ea"], [1, "#e8f3fb"]])}${grad("w", [[0, "#3f86a8"], [1, "#1f5873"]])}</defs>
<rect width="480" height="292" fill="url(#s)"/><circle cx="90" cy="60" r="18" fill="#fff7d8"/>
<path d="M0 150 C60 96 120 92 180 128 C240 90 320 86 380 122 C420 100 460 104 480 116 V170 H0Z" fill="#5d8b6c"/>
<path d="M0 170 C80 140 160 150 230 166 C300 146 400 146 480 164 V178 H0Z" fill="#3f6e52"/>
<g transform="translate(330 96)"><rect x="-3" y="10" width="6" height="40" fill="#8a3b2a"/><path d="M-18 22 h36 l-6 -8 h-24z" fill="#b8392e"/><path d="M-14 12 h28 l-5 -7 h-18z" fill="#b8392e"/><path d="M-10 3 h20 l-10 -10z" fill="#b8392e"/></g>
<rect y="176" width="480" height="116" fill="url(#w)"/>
<g stroke="#bfe2f1" stroke-width="2" opacity=".6" stroke-linecap="round"><path d="M40 200 h50"/><path d="M150 216 h70"/><path d="M300 206 h60"/><path d="M380 240 h70"/><path d="M80 256 h80"/></g>
<g transform="translate(180 236)"><path d="M0 0 h60 l-10 12 h-40z" fill="#f1e5b8"/><path d="M28 0 v-22 l16 18z" fill="#fff"/></g>`),

  kinmen: svg("Illustration: traditional village houses with curved red-brick roofs by the sea", `<defs>${grad("s", [[0, "#8ec1e5"], [1, "#f3e7d0"]])}</defs>
<rect width="480" height="292" fill="url(#s)"/><rect y="150" width="480" height="40" fill="#5aa0c2"/><path d="M0 186 H480 V292 H0Z" fill="#e7d3a8"/>
<g transform="translate(60 120)"><rect x="0" y="40" width="150" height="80" fill="#c46a46"/><path d="M-12 44 C20 30 40 24 75 20 C110 24 130 30 162 44 L150 50 H0Z" fill="#8f3a24"/>
<rect x="62" y="74" width="26" height="46" fill="#5b3a2a"/><rect x="20" y="66" width="22" height="20" fill="#f3e2b8"/><rect x="108" y="66" width="22" height="20" fill="#f3e2b8"/></g>
<g transform="translate(270 140)"><rect x="0" y="30" width="130" height="70" fill="#d07a52"/><path d="M-10 34 C20 20 40 16 65 12 C90 16 110 20 140 34 L130 40 H0Z" fill="#8f3a24"/>
<rect x="52" y="60" width="24" height="40" fill="#5b3a2a"/><rect x="16" y="52" width="20" height="18" fill="#f3e2b8"/><rect x="94" y="52" width="20" height="18" fill="#f3e2b8"/></g>
<rect x="438" y="196" width="6" height="30" fill="#6b4a2f"/><g fill="#4e7a43"><circle cx="440" cy="190" r="22"/><circle cx="455" cy="176" r="16"/></g>
<g fill="#fff" opacity=".85"><ellipse cx="160" cy="50" rx="40" ry="9"/><ellipse cx="370" cy="70" rx="30" ry="8"/></g>`),

  tainan: svg("Illustration: historic temple roof with red lanterns at dusk", `<defs>${grad("s", [[0, "#2d3566"], [0.6, "#c66a5a"], [1, "#f2b47a"]])}</defs>
<rect width="480" height="292" fill="url(#s)"/>
<g transform="translate(240 120)"><rect x="-120" y="40" width="240" height="132" fill="#9c2f22"/><path d="M-170 46 C-100 26 -40 18 0 16 C40 18 100 26 170 46 L150 54 H-150Z" fill="#3a2a2a"/>
<path d="M-110 6 C-60 -8 -20 -12 0 -14 C20 -12 60 -8 110 6 L96 14 H-96Z" fill="#3a2a2a"/><rect x="-90" y="14" width="180" height="26" fill="#b8392e"/>
<g fill="#f1c24f"><circle cx="0" cy="-20" r="6"/><rect x="-40" y="20" width="80" height="12" rx="2"/></g><rect x="-34" y="88" width="68" height="84" fill="#5b2018"/>
<rect x="-100" y="80" width="40" height="40" fill="#7d241a"/><rect x="60" y="80" width="40" height="40" fill="#7d241a"/></g>
<g stroke="#3a2a2a"><path d="M60 40 V70"/><path d="M420 40 V70"/><path d="M130 30 V60"/><path d="M350 30 V60"/></g>
<g fill="#e2412f"><ellipse cx="60" cy="82" rx="14" ry="16"/><ellipse cx="420" cy="82" rx="14" ry="16"/><ellipse cx="130" cy="72" rx="12" ry="14"/><ellipse cx="350" cy="72" rx="12" ry="14"/></g>
<rect y="268" width="480" height="24" fill="#5a4636"/>`),

  taipei: svg("Illustration: modern city skyline with a tall stepped tower and green hills", `<defs>${grad("s", [[0, "#6aa6dc"], [1, "#e3f0fa"]])}</defs>
<rect width="480" height="292" fill="url(#s)"/><path d="M0 180 C80 140 160 150 240 170 C320 140 400 146 480 168 V220 H0Z" fill="#6f9a7e"/>
<g fill="#4f6c8f"><rect x="40" y="170" width="40" height="70"/><rect x="90" y="150" width="34" height="90"/><rect x="330" y="160" width="40" height="80"/><rect x="380" y="178" width="50" height="62"/><rect x="140" y="182" width="30" height="58"/></g>
<g transform="translate(240 40)" fill="#3c5f86"><rect x="-6" y="-24" width="12" height="24"/><path d="M-14 0 h28 l-4 30 h-20z"/><path d="M-18 30 h36 l-4 30 h-28z"/><path d="M-22 60 h44 l-4 30 h-36z"/><path d="M-26 90 h52 l-4 30 h-44z"/><path d="M-30 120 h60 l-4 30 h-52z"/><rect x="-34" y="150" width="68" height="50"/></g>
<g fill="#dbe8f3"><rect x="48" y="180" width="6" height="6"/><rect x="62" y="180" width="6" height="6"/><rect x="98" y="162" width="6" height="6"/><rect x="110" y="162" width="6" height="6"/><rect x="340" y="172" width="6" height="6"/><rect x="392" y="190" width="6" height="6"/></g>
<rect y="240" width="480" height="52" fill="#86a39a"/><path d="M0 256 H480" stroke="#c9d6d0" stroke-width="3" stroke-dasharray="18 12"/>`)
};

for (const app of ["tour-operations", "ai-travel"]) {
  const dir = `${app}/frontend/public/images/destinations`;
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(art)) fs.writeFileSync(`${dir}/${name}.svg`, content);
}
console.log(`wrote ${Object.keys(art).length} illustrations to both apps`);
