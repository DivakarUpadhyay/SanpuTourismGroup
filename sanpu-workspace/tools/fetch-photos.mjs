// Downloads real destination photos from Wikimedia Commons (free licenses only) into both apps' public/images/photos,
// and writes credits.json (title, author, license, source) shown on the Photo credits page, as the licenses require.
// Usage: node tools/fetch-photos.mjs            (re-run safe: existing files are kept unless --force)
import fs from "node:fs";

const UA = "SanpuTravel/1.0 (photo credits page; contact dev@sanpu.test)";
const FREE = /^(CC0|Public domain|PD|CC BY(-SA)? (2\.0|2\.5|3\.0|4\.0))$/i;
const SKIP = /sentinel|satellite|map|logo|diagram|ropeway-0[23]|panorama_\d|\.svg/i;
const want = {
  hualien: ["Taroko Gorge Taiwan", "Hualien East Rift Valley rice"],
  alishan: ["Alishan tea plantation mountains", "Alishan forest mountains landscape", "Alishan sea of clouds"],
  sunmoon: ["Sun Moon Lake Taiwan lake view", "Sun Moon Lake boats"],
  kinmen: ["Kinmen traditional house Shuitou", "Kinmen old village"],
  tainan: ["Anping Fort Tainan", "Chihkan Tower Tainan"],
  taipei: ["Taipei 101 skyline", "Taipei skyline Elephant Mountain"],
  "hotel-room": ["hotel bedroom double bed interior", "guest room hotel bed window"],
  "flight": ["airplane window view clouds wing", "airplane wing above clouds"],
  "bus": ["Suhua Highway coast Taiwan", "Taiwan mountain highway road"],
  "taxi": ["Taipei taxi yellow", "Taiwan taxi"],
};
const force = process.argv.includes("--force");
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",");
const prev = (() => { try { return JSON.parse(fs.readFileSync("tour-operations/frontend/public/images/photos/credits.json", "utf8")); } catch { return []; } })();
const strip = (h = "") => h.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const credits = [];
for (const [key, queries] of Object.entries(want)) {
  const file = `${key}.jpg`;
  if (only && !only.includes(key)) { const old = prev.find((c) => c.key === key); if (old) credits.push(old); continue; }
  let picked = null;
  for (const q of queries) {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=20&gsrsearch=${encodeURIComponent(q + " filetype:bitmap")}&prop=imageinfo&iiprop=url|size|extmetadata|mime&iiurlwidth=1600`;
    const j = await (await fetch(url, { headers: { "User-Agent": UA } })).json();
    const pages = Object.values(j.query?.pages ?? {}).sort((a, b) => a.index - b.index);
    picked = pages.map((p) => ({ p, i: p.imageinfo?.[0] })).find(({ p, i }) => i && i.mime === "image/jpeg" && i.width >= 1600 && i.width >= i.height * 1.25
      && FREE.test(i.extmetadata?.LicenseShortName?.value ?? "") && !SKIP.test(p.title));
    if (picked) break;
  }
  if (!picked) { console.log(`no free photo for ${key}`); continue; }
  const { p, i } = picked;
  const meta = i.extmetadata;
  for (const app of ["tour-operations", "ai-travel"]) {
    const dir = `${app}/frontend/public/images/photos`;
    fs.mkdirSync(dir, { recursive: true });
    if (force || !fs.existsSync(`${dir}/${file}`)) {
      const img = Buffer.from(await (await fetch(i.thumburl, { headers: { "User-Agent": UA } })).arrayBuffer());
      fs.writeFileSync(`${dir}/${file}`, img);
    }
  }
  credits.push({ key, file: `/images/photos/${file}`, title: p.title.replace(/^File:/, ""), author: strip(meta.Artist?.value) || "Unknown",
    license: meta.LicenseShortName?.value, licenseUrl: meta.LicenseUrl?.value ?? null, source: i.descriptionurl });
  console.log(`${key}: ${p.title} (${meta.LicenseShortName?.value}, ${strip(meta.Artist?.value).slice(0, 40)})`);
}
for (const app of ["tour-operations", "ai-travel"]) fs.writeFileSync(`${app}/frontend/public/images/photos/credits.json`, JSON.stringify(credits, null, 2));
console.log(`${credits.length} photos, credits written`);
