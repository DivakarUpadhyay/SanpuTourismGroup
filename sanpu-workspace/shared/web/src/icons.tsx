/** Small outline icon set (Fluent-like, 20px grid). The key comes from dbo.Menus.IconKey, so menus stay data-driven. */
const P: Record<string, string> = {
  info: "M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM10 9v5M10 6.5v.01",
  send: "M3 10l14-7-5 14-2.5-5.5zM9.5 11.5L17 3",
  image: "M3 4h14v12H3zM3 13l4-4 3 3 2-2 5 5M12.5 7.5a1 1 0 1 0 0 .01",
  upload: "M10 13V3M6 7l4-4 4 4M3 13v4h14v-4",
  dashboard: "M3 3h6v8H3zM11 3h6v5h-6zM11 10h6v7h-6zM3 13h6v4H3z",
  briefcase: "M7 5V3.5h6V5M3 6h14v10H3zM3 10h14",
  ticket: "M3 6h14v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4zM11 6v10",
  check: "M4 10.5l4 4 8-9",
  calendar: "M3 5h14v12H3zM3 9h14M7 3v4M13 3v4",
  map: "M3 5l4.5-2 5 2L17 3v12l-4.5 2-5-2L3 17zM7.5 3v12M12.5 5v12",
  list: "M7 5h10M7 10h10M7 15h10M3 5h1M3 10h1M3 15h1",
  users: "M7.5 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 17c0-3 2.5-5 5.5-5s5.5 2 5.5 5M13 3.5a3 3 0 0 1 0 5.5M15 12c2 .7 3 2.5 3 5",
  user: "M10 9a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 18c0-3.9 3.1-6.5 7-6.5s7 2.6 7 6.5",
  handshake: "M2 9l4-4 4 2 4-2 4 4-7 7zM6 13l2 2M8 11l3 3",
  truck: "M2 5h10v9H2zM12 8h3.5l2.5 3v3h-6M5.5 16.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM14.5 16.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
  plug: "M7 2v4M13 2v4M5 6h10v3a5 5 0 0 1-10 0zM10 14v4",
  scale: "M10 3v14M4 17h12M4 6h12M4 6l-2 6h4zM16 6l-2 6h4z",
  building: "M4 17V3h8v14M12 8h4v9M7 6h2M7 9h2M7 12h2M2 17h16",
  calculator: "M5 2h10v16H5zM7 5h6v3H7zM7 11h1M10 11h1M13 11h0M7 14h1M10 14h1M13 14h0",
  settings: "M10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM10 1.5v2.5M10 16v2.5M1.5 10H4M16 10h2.5M4 4l1.8 1.8M14.2 14.2L16 16M4 16l1.8-1.8M14.2 5.8L16 4",
  gauge: "M3 14a7 7 0 1 1 14 0M10 14l3.5-4.5M2 17h16",
  shield: "M10 2l7 3v5c0 4-3 7-7 8-4-1-7-4-7-8V5z",
  key: "M7 13a4 4 0 1 1 3.5-6M10.5 7l6.5 6.5M14 10.5l2 2M12.5 12l1.5 1.5",
  tree: "M3 3h5v4H3zM12 9h5v4h-5zM12 15h5v3h-5zM5.5 7v9h6.5M5.5 11h6.5",
  sliders: "M4 3v14M10 3v14M16 3v14M2 6h4M8 13h4M14 9h4",
  flow: "M3 3h5v4H3zM12 13h5v4h-5zM5.5 7v3h9v3",
  file: "M5 2h7l4 4v12H5zM12 2v4h4M8 10h5M8 13h5",
  lock: "M5 9h10v8H5zM7 9V6a3 3 0 0 1 6 0v3",
  history: "M3 10a7 7 0 1 0 2-5M3 3v3h3M10 6v4l3 2",
  home: "M3 9l7-6 7 6v8h-5v-5H8v5H3z",
  plus: "M10 4v12M4 10h12",
  search: "M8.5 14a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zM12.5 12.5L17 17",
  sparkle: "M10 2l1.8 4.6L16 8l-4.2 1.6L10 14l-1.8-4.4L4 8l4.2-1.4zM15 13l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z",
  storm: "M5 11a4 4 0 0 1 .5-8 5 5 0 0 1 9.5 2 3 3 0 0 1 0 6zM9 13l-2 3h3l-2 3",
  cpu: "M6 6h8v8H6zM8 2v4M12 2v4M8 14v4M12 14v4M2 8h4M2 12h4M14 8h4M14 12h4",
  menu: "M3 5h14M3 10h14M3 15h14",
  close: "M5 5l10 10M15 5L5 15",
  signout: "M8 3H4v14h4M13 6l4 4-4 4M17 10H8",
  globe: "M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM2 10h16M10 2c2.5 2.5 2.5 13.5 0 16M10 2c-2.5 2.5-2.5 13.5 0 16",
  plane: "M2 11.5l6-1.5 3.5-6.5c.5-.9 1.8-.6 1.8.4l-.8 5.6 4.5 1.5v1.5l-4.5-.5-1 4 1.5 1.5v1l-3-1-3 1v-1l1.5-1.5-.5-3.5-6 .5z",
  bus: "M4 3h12v12H4zM4 9h12M6.5 12.5h.01M13.5 12.5h.01M5 15v2.5M15 15v2.5",
  car: "M3 13l1.5-5a2 2 0 0 1 2-1.5h7a2 2 0 0 1 2 1.5l1.5 5v3H3zM3 13h14M6 16v1.5M14 16v1.5M6 10.5h.01M14 10.5h.01",
  tag: "M3 3h7l7 7-7 7-7-7zM7 7h.01",
  help: "M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM7.8 7.5a2.3 2.3 0 0 1 4.4.8c0 1.6-2.2 2-2.2 3.4M10 14.5h.01",
  phone: "M4 3h3l1.5 4-2 1.3a9 9 0 0 0 5.2 5.2l1.3-2 4 1.5v3a1.5 1.5 0 0 1-1.6 1.5C8.7 17.1 2.9 11.3 2.5 4.6A1.5 1.5 0 0 1 4 3z",
  star: "M10 2.5l2.3 4.8 5.2.7-3.8 3.6.9 5.2-4.6-2.5-4.6 2.5.9-5.2L2.5 8l5.2-.7z",
  arrow: "M4 10h12M11 5l5 5-5 5",
};

export function Icon({ name, size = 18 }: { name?: string | null; size?: number }) {
  const d = (name && P[name]) || "M10 10.01";
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" focusable="false"
         fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
  );
}
