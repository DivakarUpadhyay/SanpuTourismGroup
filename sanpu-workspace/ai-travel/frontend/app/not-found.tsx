import Link from "next/link";
export default function NotFound() { return <main className="page"><div className="card"><p className="tagline">404</p><h1>Page not found</h1><p className="muted">This page does not exist.</p><Link className="btn primary" href="/">Go home</Link></div></main>; }
