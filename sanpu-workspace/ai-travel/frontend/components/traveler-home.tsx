"use client";

import Link from "next/link";
import { Async, Demo, Icon, get, useAsync, useAuth, useContent, useSetting } from "@sanpu/web";

interface Showcase {
  regions: { regionId: number; code: string; name: string; imageUrl?: string | null; placeCount: number; templateCount: number }[];
  templates: { templateId: number; code: string; name: string; regionId: number; days: number; pace: string; description?: string | null; isDemo: boolean }[];
}

const bg = (url?: string | null) => (url ? { backgroundImage: `url(${url})` } : undefined);

export function AiHome() {
  const { status, has } = useAuth();
  const hero = useContent("home.hero");
  const tagline = useSetting("Ui.HeroTagline", "");
  const title = useSetting("Ui.HeroTitle", "AI Operations Copilot");
  const brand = useSetting("Ui.BrandName", "Sanpu");
  const show = useAsync(() => get<Showcase>("/public/showcase"), []);
  const heroImg = show.data?.regions.find((r) => r.code === "HUALIEN")?.imageUrl ?? show.data?.regions.find((r) => r.imageUrl)?.imageUrl;
  const canPlan = status === "authenticated" && has("Trip.Create");
  const planHref = canPlan ? "/trips/new" : status === "authenticated" ? "/my/trips" : "/login?next=/trips/new";
  const region = (id: number) => show.data?.regions.find((r) => r.regionId === id);
  return (
    <>
      <section className="lp-hero" style={heroImg ? ({ "--hero-img": `url(${heroImg})` } as React.CSSProperties) : undefined} data-testid="hero">
        <div className="lp-hero-in">
          <p className="lp-eyebrow">{tagline}</p>
          <h1>{title}</h1>
          <p className="lp-lead">{hero?.body}</p>
          <div className="lp-cta">
            {canPlan ? <Link className="btn lg gold" href="/trips/new" data-testid="cta-plan">Plan a trip</Link>
              : status === "authenticated" ? <Link className="btn lg gold" href="/admin">Open the Copilot</Link>
              : <Link className="btn lg gold" href="/login?next=/trips/new">Sign in to plan</Link>}
            {status === "authenticated" && has("Trip.ViewOwn") ? <Link className="btn lg glass" href="/my/trips">See my trips</Link> : <a className="btn lg glass" href="#how">How it works</a>}
          </div>
          <div className="lp-stats" aria-label="At a glance">
            <div><b>{show.data?.regions.length ?? "–"}</b><span>Regions</span></div>
            <div><b>{show.data?.templates.length ?? "–"}</b><span>Trip templates</span></div>
            <div><b>100%</b><span>Changes approved by a person</span></div>
          </div>
        </div>
      </section>

      <section className="wrap lp-section" id="how" style={{ scrollMarginTop: 70 }} aria-labelledby="how-h">
        <div className="lp-head"><div><p className="kicker">How it works</p><h2 id="how-h">A trip plan that copes when things go wrong</h2>
          <p>Rules build the plan from verified places. When a typhoon or a late train hits, a recovery plan is proposed and a person decides.</p></div></div>
        <div className="lp-steps">
          <div className="lp-step"><h3>Choose a template</h3><p>Pick a region, your dates, pace and any mobility needs.</p></div>
          <div className="lp-step"><h3>Get a checked itinerary</h3><p>Opening hours, travel time and step-free access are all checked by rules.</p></div>
          <div className="lp-step"><h3>Disruption? We re-plan</h3><p>The Copilot simulates the impact and proposes the best alternatives.</p></div>
          <div className="lp-step"><h3>A person says yes</h3><p>Our staff review every recovery plan before your trip changes.</p></div>
        </div>
      </section>

      <section className="wrap lp-section" aria-labelledby="reg-h">
        <div className="lp-head"><div><p className="kicker">Regions</p><h2 id="reg-h">Places our planner knows well</h2></div></div>
        <Async state={show} empty={(d) => d.regions.length === 0}>{(d) => (
          <div className="lp-tiles wide">
            {d.regions.map((r) => (
              <Link key={r.code} href={planHref} className="lp-tile" data-testid={`region-${r.code}`}>
                <span className="bg" style={bg(r.imageUrl)} />
                <span className="meta"><b>{r.name}</b><span>{r.placeCount} verified places · {r.templateCount} {r.templateCount === 1 ? "template" : "templates"}</span></span>
              </Link>
            ))}
          </div>
        )}</Async>
      </section>

      <section className="wrap lp-section" aria-labelledby="tpl-h">
        <div className="lp-head"><div><p className="kicker">Trip templates</p><h2 id="tpl-h">Start from a ready-made trip</h2><p>Each one is a starting point. You choose the dates, pace and travelers.</p></div></div>
        <Async state={show} empty={(d) => d.templates.length === 0}>{(d) => (
          <div className="lp-cards">
            {d.templates.map((t) => (
              <article key={t.code} className="lp-card">
                <div className="media">
                  <div className="bg" style={bg(region(t.regionId)?.imageUrl)} role="img" aria-label={`${region(t.regionId)?.name ?? "Region"} illustration`} />
                  <span className="chip"><Icon name="map" size={14} />{region(t.regionId)?.name}</span>
                  <span className="chip right">{t.days} {t.days === 1 ? "day" : "days"}</span>
                </div>
                <div className="content">
                  <span className="slogan">{t.pace} pace<Demo show={t.isDemo} /></span>
                  <h3><Link href={planHref}>{t.name}</Link></h3>
                  <p>{t.description}</p>
                  <div className="foot"><span className="facts"><span><Icon name="shield" size={14} />Accessibility checked</span></span><span className="go">Plan this trip →</span></div>
                </div>
              </article>
            ))}
          </div>
        )}</Async>
      </section>

      <section className="wrap lp-section" aria-labelledby="why-h">
        <div className="lp-head"><div><p className="kicker">Why {brand}</p><h2 id="why-h">AI that helps, people who decide</h2></div></div>
        <div className="lp-features">
          <div className="lp-feature"><div className="ico"><Icon name="check" /></div><h3>Human approval</h3><p>No plan changes until a staff member has checked and approved it.</p></div>
          <div className="lp-feature"><div className="ico"><Icon name="map" /></div><h3>Grounded in real data</h3><p>Plans only use places from our verified list, with real opening hours.</p></div>
          <div className="lp-feature"><div className="ico"><Icon name="users" /></div><h3>Accessible by design</h3><p>Wheelchair and step-free needs remove places that do not fit.</p></div>
          <div className="lp-feature"><div className="ico"><Icon name="lock" /></div><h3>Private by default</h3><p>Personal details in documents are hidden before any AI sees them.</p></div>
        </div>
        <div className="lp-band">
          <div><h2>Plan a trip that can bend without breaking</h2><p>Sign in to build your itinerary and follow it day by day.</p></div>
          <div className="lp-cta">
            <Link className="btn lg gold" href={planHref}>{canPlan ? "Plan a trip" : status === "authenticated" ? "My trips" : "Sign in to plan"}</Link>
            {status !== "authenticated" && <Link className="btn lg glass" href="/register">Create an account</Link>}
          </div>
        </div>
      </section>
    </>
  );
}
