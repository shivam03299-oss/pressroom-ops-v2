// Centralised SEO for the public site. The app is a client-rendered SPA, so
// we set per-route <title>, meta description, canonical, Open Graph and
// Twitter-card tags at runtime — Googlebot renders JS and picks these up, and
// index.html ships sensible defaults for crawlers that don't run JS.
export const SITE_URL = "https://avivainternational.co";
export const OG_IMAGE = `${SITE_URL}/og-cover.png`;
const BRAND = "Aviva International";

// Per-route copy. Keys map to the route buckets in main.jsx (and the Landing
// `focus` values). Titles ~50-60 chars, descriptions ~150-160 chars.
export const ROUTE_SEO = {
  home: {
    path: "/",
    title: "Aviva International — Print-on-Demand Apparel Manufacturing in India",
    description: "Zero-MOQ print-on-demand apparel for India's fastest-growing brands. In-house DTF & embroidery, same-day dispatch, pan-India shipping, and a dashboard that runs fulfilment for you.",
  },
  catalog: {
    path: "/catalog",
    title: `Blank Apparel Catalogue — Premium Tees, Hoodies & Shirts | ${BRAND}`,
    description: "Browse Aviva's catalogue of premium blanks — boxy-fit tees, waffle knits and shirts ready for DTF printing & embroidery. Zero MOQ, in-house production, pan-India shipping.",
  },
  enquire: {
    path: "/enquire",
    title: `Get a Quote — Start Your Clothing Brand | ${BRAND}`,
    description: "Tell us about your brand and get a fast quote for DTF printing, embroidery and end-to-end fulfilment. Zero MOQ, premium quality, honest pricing.",
  },
  methods: {
    path: "/bulk-orders",
    title: `Bulk & Wholesale Apparel Printing — DTF, DTG, Screen & Embroidery | ${BRAND}`,
    description: "Every decoration method under one roof with bulk & wholesale pricing — DTF, DTG, screen printing and embroidery. From a single sample to tens of thousands of pieces.",
  },
  process: {
    path: "/process",
    title: `How It Works — Print, Pack & Ship in 4 Steps | ${BRAND}`,
    description: "Send your art, we print in-house, QC & pack, then dispatch same-day with live tracking. See Aviva's automated print-on-demand fulfilment pipeline.",
  },
  why: {
    path: "/why",
    title: `Why Aviva — In-House Printing, Automation & Live Tracking | ${BRAND}`,
    description: "Why scaling brands choose Aviva: in-house DTF & embroidery, zero outsourcing, automated order intake, and per-order tracking from manifest to doorstep.",
  },
  compare: {
    path: "/compare",
    title: `Aviva vs Other Print Suppliers — An Honest Comparison | ${BRAND}`,
    description: "How Aviva stacks up against agencies, freelancers and other print shops on quality, pricing, automation and live tracking. An honest side-by-side.",
  },
  terms: {
    path: "/terms",
    title: `Terms & Conditions | ${BRAND}`,
    description: "The terms that govern your use of Aviva International's print-on-demand and fulfilment services.",
  },
  privacy: {
    path: "/privacy",
    title: `Privacy Policy | ${BRAND}`,
    description: "How Aviva International collects, uses, stores and protects your business and customer data.",
  },
  contactus: {
    path: "/contact-us",
    title: `Contact Us — WhatsApp, Phone & Email | ${BRAND}`,
    description: "Get in touch with Aviva International. WhatsApp is fastest; phone, email and our Delhi production-floor address are here for everything else.",
  },
};

function upsertMeta(attr, key, content) {
  if (content == null) return;
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
  el.setAttribute("content", content);
}
function upsertLink(rel, href) {
  let el = document.head.querySelector(`link[rel="${rel}"]`);
  if (!el) { el = document.createElement("link"); el.setAttribute("rel", rel); document.head.appendChild(el); }
  el.setAttribute("href", href);
}

// Push a {title, description, path, image, noindex, type} config to the head.
export function applySeo({ title, description, path, image, noindex, type = "website" } = {}) {
  if (title) document.title = title;
  const p = path || (typeof window !== "undefined" ? window.location.pathname : "/");
  const url = SITE_URL + (p === "/" ? "/" : p.replace(/\/+$/, ""));
  const img = image || OG_IMAGE;
  if (description) upsertMeta("name", "description", description);
  upsertMeta("name", "robots", noindex ? "noindex, nofollow" : "index, follow");
  upsertLink("canonical", url);
  upsertMeta("property", "og:title", title);
  upsertMeta("property", "og:description", description);
  upsertMeta("property", "og:url", url);
  upsertMeta("property", "og:type", type);
  upsertMeta("property", "og:image", img);
  upsertMeta("property", "og:site_name", BRAND);
  upsertMeta("name", "twitter:card", "summary_large_image");
  upsertMeta("name", "twitter:title", title);
  upsertMeta("name", "twitter:description", description);
  upsertMeta("name", "twitter:image", img);
}

// Inject / replace a JSON-LD <script> by id.
export function setJsonLd(id, data) {
  let el = document.getElementById(id);
  if (!el) { el = document.createElement("script"); el.type = "application/ld+json"; el.id = id; document.head.appendChild(el); }
  el.textContent = JSON.stringify(data);
}
