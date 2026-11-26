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
  dtf: {
    path: "/dtf",
    title: `DTF Printing in India — Soft, Full-Colour, Wash-Durable | ${BRAND}`,
    description: "Premium Direct-to-Film (DTF) printing, in-house: photoreal full-colour prints on any fabric, soft hand-feel, wash-durable. Zero MOQ, from ₹54, up to 50% below market.",
  },
  embroidery: {
    path: "/embroidery",
    title: `Embroidery in India — Premium Stitched, No Setup Fees | ${BRAND}`,
    description: "In-house embroidery on tees, hoodies, polos & caps — dense, premium stitching that lasts. Flat ₹100 per patch, zero digitizing fees, zero minimums.",
  },
  fulfillment: {
    path: "/fulfillment",
    title: `End-to-End Order Fulfilment & 3PL for Brands | ${BRAND}`,
    description: "Aviva runs your entire back office — warehousing, pick-pack, pan-India shipping, automated COD remittance, RTO & returns handling, and order management in one dashboard. Focus on your brand; we handle logistics.",
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
  shipping: {
    path: "/shipping",
    title: `Shipping Policy | ${BRAND}`,
    description: "Dispatch timelines, courier partners, coverage, charges and tracking for Aviva International's print-on-demand and fulfilment orders.",
  },
  refund: {
    path: "/refund",
    title: `Refund & Cancellation Policy | ${BRAND}`,
    description: "Aviva International's refund, cancellation and reprint policy for wallet top-ups and print-on-demand orders.",
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

// Meta (Facebook) Pixel — loaded ONLY on the public Aviva website (never on
// the /admin dashboard or /portal client app). Called from main.jsx for
// public routes; injects the base pixel, inits, and fires PageView once.
export function loadMetaPixel(pixelId) {
  if (typeof window === "undefined" || window.fbq) return;
  /* eslint-disable */
  !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,"script","https://connect.facebook.net/en_US/fbevents.js");
  /* eslint-enable */
  window.fbq("init", pixelId);
  window.fbq("track", "PageView");
}

// Inject / replace a JSON-LD <script> by id.
export function setJsonLd(id, data) {
  let el = document.getElementById(id);
  if (data == null) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement("script"); el.type = "application/ld+json"; el.id = id; document.head.appendChild(el); }
  el.textContent = JSON.stringify(data);
}

// ── Visible-FAQ copy, reused for both the on-page <FAQ> section and the
// FAQPage structured data (Google requires the Q&A to be visible on the page,
// so Landing renders the same source). Keyword-rich, genuine answers. ──
export const FAQ_DATA = {
  home: [
    { q: "What is print on demand and how does Aviva International work?", a: "Print on demand means every order is printed, packed and shipped only after it's placed — no inventory and no minimums. You send a design, we produce it in-house in India with DTF or embroidery, and dispatch it across the country under your own brand." },
    { q: "Is there a minimum order quantity (MOQ)?", a: "No. You can order a single piece to test quality or scale to 10,000+ pieces — the per-unit price and turnaround stay the same." },
    { q: "How is Aviva different from Printful or Printify in India?", a: "Everything is manufactured in-house in India with no overseas outsourcing, so costs run up to 50% below imported print-on-demand, quality stays consistent, and dispatch is same-day instead of weeks." },
    { q: "How fast do orders ship?", a: "Orders confirmed by 2 PM dispatch the same day from our Delhi production floor, with live per-order tracking from manifest to doorstep." },
    { q: "Do you handle COD, shipping and returns?", a: "Yes — Aviva runs the full back office: pan-India courier shipping, automated COD remittance, and RTO and returns handling, all visible in one dashboard." },
  ],
  dtf: [
    { q: "What is DTF printing?", a: "Direct-to-Film (DTF) printing transfers full-colour, photoreal artwork onto fabric with a soft hand-feel. It works on cotton, poly, blends and dark garments without the setup cost of screen printing." },
    { q: "How much does DTF printing cost in India?", a: "Aviva's DTF prints start from ₹54 per placement with zero setup or minimum-order fees — up to 50% below typical market rates because printing is in-house." },
    { q: "Is DTF printing wash-durable?", a: "Yes. Our DTF prints are heat-cured for strong adhesion and stay vibrant and crack-free through regular machine washing." },
    { q: "What's the minimum order for DTF printing?", a: "There is none — print a single piece or tens of thousands at the same per-unit price." },
  ],
  embroidery: [
    { q: "Does Aviva charge setup or digitizing fees for embroidery?", a: "No. Embroidery is a flat ₹100 per placement with zero digitizing fees and zero minimums." },
    { q: "What can you embroider?", a: "Tees, hoodies, polos, caps and jackets — dense, premium stitching with up to a 3.5\" × 6.5\" embroidery area per placement." },
    { q: "Is there a minimum order for embroidery?", a: "No minimum — order one piece or thousands at the same price." },
  ],
  fulfillment: [
    { q: "What does Aviva's order fulfilment include?", a: "Warehousing, pick-and-pack, pan-India shipping, automated COD remittance, RTO and returns handling, and live order management in one dashboard — end to end." },
    { q: "Can Aviva fulfil orders from my Shopify store?", a: "Yes. Orders flow in automatically, we print and dispatch under your brand, and every parcel is tracked from manifest to delivery." },
    { q: "Do you remit COD automatically?", a: "Yes — COD collected by the courier is reconciled and remitted automatically, with every rupee visible per order." },
  ],
  methods: [
    { q: "Which printing methods does Aviva offer?", a: "DTF, DTG, screen printing and embroidery — every decoration method under one roof, from a single sample to tens of thousands of pieces." },
    { q: "Do you offer bulk and wholesale apparel pricing?", a: "Yes. Bulk and wholesale pricing scales with quantity across all methods, with no MOQ to get started." },
    { q: "Can I mix print methods on one order?", a: "Yes — combine DTF, screen and embroidery across a single order or production run." },
  ],
};

// Service schema inputs per public route (provider = the Organization).
const SERVICE_DATA = {
  dtf:         { path: "/dtf",         type: "DTF Printing",        name: "DTF Printing in India",        description: "In-house Direct-to-Film printing — full-colour, soft-hand, wash-durable prints on any fabric. Zero MOQ, from ₹54.", offer: { price: "54", unit: "per placement" } },
  embroidery:  { path: "/embroidery",  type: "Embroidery",          name: "Embroidery in India",          description: "In-house embroidery on tees, hoodies, polos and caps — dense premium stitching. Flat ₹100 per placement, no setup fees.", offer: { price: "100", unit: "per placement" } },
  fulfillment: { path: "/fulfillment", type: "Order Fulfilment",    name: "End-to-End Apparel Fulfilment & 3PL", description: "Warehousing, pick-pack, pan-India shipping, COD remittance, and RTO handling in one dashboard." },
  methods:     { path: "/bulk-orders", type: "Apparel Printing",    name: "Bulk & Wholesale Apparel Printing", description: "DTF, DTG, screen printing and embroidery with bulk and wholesale pricing. From one sample to tens of thousands." },
};

// Inject the site-wide + per-route JSON-LD graph (WebSite + Service + FAQPage).
// Organization lives statically in index.html (@id #org); we reference it.
export function applyStructuredData(routeKey) {
  const graph = [{
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    url: SITE_URL,
    name: BRAND,
    publisher: { "@id": `${SITE_URL}/#org` },
    inLanguage: "en-IN",
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/catalog?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  }];
  const svc = SERVICE_DATA[routeKey];
  if (svc) {
    graph.push({
      "@type": "Service",
      "@id": `${SITE_URL}${svc.path}#service`,
      serviceType: svc.type,
      name: svc.name,
      description: svc.description,
      provider: { "@id": `${SITE_URL}/#org` },
      areaServed: { "@type": "Country", name: "India" },
      ...(svc.offer ? { offers: { "@type": "Offer", priceCurrency: "INR", price: svc.offer.price, description: svc.offer.unit } } : {}),
    });
  }
  const faq = FAQ_DATA[routeKey];
  if (faq && faq.length) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${SITE_URL}${ROUTE_SEO[routeKey]?.path || "/"}#faq`,
      mainEntity: faq.map(f => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    });
  }
  setJsonLd("ld-route", { "@context": "https://schema.org", "@graph": graph });
}
