"use client";

import { useEffect, useState } from "react";
import { Loading, PageHeader } from "./ui";

const LABELS: Record<string, string> = { hualien: "Taroko Gorge, Hualien", alishan: "Tea gardens near Alishan", sunmoon: "Sun Moon Lake", kinmen: "Shuitou village, Kinmen",
  tainan: "Anping fort, Tainan", taipei: "Taipei 101", "hotel-room": "Hotel room", flight: "Above the clouds", bus: "Coastal highway", taxi: "Taxi in Taipei" };
interface Credit { key: string; file: string; title: string; author: string; license: string; licenseUrl?: string | null; source: string }

/** Photo credits (/credits): every photo, its author and license, as the Creative Commons licenses require. Data: /images/photos/credits.json. */
export function PhotoCreditsPage() {
  const [list, setList] = useState<Credit[] | null>(null);
  useEffect(() => { fetch("/images/photos/credits.json").then((r) => r.json()).then(setList).catch(() => setList([])); }, []);
  return (
    <>
      <PageHeader tagline="Legal" title="Photo credits" lead="Photographs from Wikimedia Commons, used under the licenses shown. Thank you to the photographers." />
      {!list ? <Loading lines={4} /> : (
        <div className="credits">
          {list.map((c) => (
            <figure key={c.key} className="credit">
              <img src={c.file} alt={LABELS[c.key] ?? c.key} loading="lazy" />
              <figcaption>
                <b>{LABELS[c.key] ?? c.key.replace(/-/g, " ")}</b>
                <span>Photo: {c.author}</span>
                <span>License: {c.licenseUrl ? <a href={c.licenseUrl} target="_blank" rel="noopener noreferrer">{c.license}</a> : c.license} · <a href={c.source} target="_blank" rel="noopener noreferrer">Source</a></span>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </>
  );
}
