#!/usr/bin/env python3
"""
SUPERSEDED (2026-09-26): the Supabase edge function `sync-2hr-catalog` now pulls the
Shopify `2-hour-delivery` collection live every 10 min (pg_cron job
`hashway-2hr-catalog-sync`). Do NOT run this script — its snapshot below is stale
(it would re-add the removed Heritage sweatshirts and drop the linen shirts).

Reconcile the Hashway 2-hour storefront catalog (Supabase table
`hashway_2hr_products`, read by express.hashway.in) with the live Shopify
`2-hour-delivery` collection.

Data below is the current live snapshot (name, image, price, real Delhi stock)
of the 21 products in the collection, captured 2026-09-19. Upserts them
(active=true) and deactivates every other row so the storefront stops showing
stale/OOS products.

NOTE: the tenants.shopify_access_token for Hashway is currently 401 (stale), so
this one-shot uses the captured snapshot instead of a live pull. For ongoing
auto-sync, refresh that token and drive this from Shopify (see actionList in
api/hashway-express-inventory.js).

Run:  python3 scripts/hashway_2hr_sync.py [--dry]
"""
import re, sys, json, urllib.request, urllib.parse, os

DRY = "--dry" in sys.argv
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(ROOT, "api", "hashway-express-inventory.js")).read()
SUPABASE_URL = re.search(r'SUPABASE_URL\s*=\s*"([^"]+)"', src).group(1)
SERVICE_ROLE = re.search(r'SUPABASE_SERVICE_ROLE\s*=\s*\n?\s*"([^"]+)"', src).group(1)

IMG = "https://cdn.shopify.com/s/files/1/0857/7014/2016/files/"
# (handle, name, image-suffix, price_paise, stock_qty)
P = [
 ("hashway-classic-polo-sweatshirt-navy","HASHWAY CLASSIC POLO SWEATSHIRT - NAVY","1_c6bea068-7aad-47ba-bd88-b2be87ac6d2b.png?v=1786434691",299900,149),
 ("hashway-long-sleeve-polo-tee-navy","HASHWAY LONG SLEEVE POLO TEE - NAVY","9_5e165af2-9f47-42ed-ad44-0fc4b59fd540.png?v=1789376459",249900,50),
 ("hashway-classic-polo-sweatshirt-bottle-green","HASHWAY CLASSIC POLO SWEATSHIRT - GREEN","5_6b158522-7234-449a-8fb9-9e7184bb77f9.png?v=1786434691",299900,134),
 ("hashway-long-sleeve-polo-tee-black","HASHWAY LONG SLEEVE POLO TEE - BLACK","11_98efccd2-c7e2-40be-ba9f-7b6bacc9bd15.png?v=1789376616",249900,249),
 ("indigo-line-denim","INDIGO LINE DENIMS","denimcouture_1.png?v=1785252746",249900,270),
 ("hashway-classic-polo-sweatshirt-black","HASHWAY CLASSIC POLO SWEATSHIRT - BLACK","3_afb6dcfd-8853-4bb3-9647-4fd4ef384290.png?v=1786434691",299900,95),
 ("the-raven-wash-denim","RAVEN EMBROIDERED WASHED DENIMS","9_13a20313-99e6-4339-8fb5-2cb9513b7f59.png?v=1784808813",299900,33),
 ("hashway-cable-knit-cotton-quarter-zip-jumper-black-regular-fit","HASHWAY QUARTER ZIP JUMPER - BLACK","162.png?v=1768904580",349900,18),
 ("hashway-cable-knit-cotton-quarter-zip-jumper-white","HASHWAY QUARTER ZIP JUMPER - WHITE","158.png?v=1768904543",349900,28),
 ("hashway-classic-polo-sweatshirt-wine","HASHWAY CLASSIC POLO SWEATSHIRT - WINE","4_fd852797-f443-416d-bf27-9f20cd232249.png?v=1786434691",299900,47),
 ("hashway-classic-polo-sweatshirt-beige","HASHWAY CLASSIC POLO SWEATSHIRT - BEIGE","6_2a8febd8-d760-46e7-883d-7aab9a10bfde.png?v=1786434693",299900,18),
 ("hashway-basic-ringer-tee-set-of-3","HASHWAY BASIC RINGER TEE - SET OF 3","ringersetof3.png?v=1783333552",314900,71),
 ("the-last-bloom-embroidered-denims","THE LAST BLOOM EMBROIDERED DENIMS - LIMITED EDITION","denim_couture_2.png?v=1785319685",449900,270),
 ("hashway-basic-ribbed-tee-navy-blue","HASHWAY BASIC RINGER TEE - NAVY BLUE","navyblue_oysterwhite_32f90cdd-71b3-4b83-a9ff-1aba5d4cae7c.png?v=1782725063",189900,66),
 ("hashway-long-sleeve-polo-tee-faded-navy","HASHWAY LONG SLEEVE POLO TEE - FADED NAVY","longsleevepolos_1.png?v=1789395229",249900,103),
 ("hashway-california-west-ribbed-tee-navy-blue","HASHWAY CALIFORNIA WEST RINGER TEE - NAVY BLUE","navy_blue_oyster_white_1.png?v=1782725617",189900,65),
 ("hashway-basic-ribbed-tee-oyster-white","HASHWAY BASIC RINGER TEE - OYSTER WHITE","oyster-white_black_f5e3ef8a-22a2-43e7-86c8-9ef375dafdd3.png?v=1782725119",189900,66),
 ("hashway-brooklyn-ribbed-tee-navy-blue","HASHWAY BROOKLYN RINGER TEE - NAVY BLUE","navy_blue_oyster_white.png?v=1782725546",189900,66),
 ("the-heritage-polo-sweatshirt-ivory-navy","THE HERITAGE POLO SWEATSHIRT — IVORY / NAVY","13_fe1195e5-cb44-4301-a08a-8891e4324e5a.png?v=1789560431",299900,120),
 ("the-heritage-polo-sweatshirt-ivory-forest-green","THE HERITAGE POLO SWEATSHIRT — IVORY / FOREST GREEN","11_a07319cd-b387-4a26-a10c-eece54bd6f9f.png?v=1789560345",299900,120),
 ("the-heritage-polo-sweatshirt-ivory-forest","THE HERITAGE POLO SWEATSHIRT — IVORY / FOREST","9_0871e359-b25a-448d-ac30-f54f070fafd4.png?v=1789560202",299900,117),
]
live = [{"sku":h,"name":n,"image_url":IMG+img,"price_paise":pr,"stock_qty":st,"active":True} for (h,n,img,pr,st) in P]
live_skus = {r["sku"] for r in live}

def sb(path, method="GET", body=None, prefer=None):
    headers = {"apikey": SERVICE_ROLE, "Authorization": "Bearer " + SERVICE_ROLE, "Content-Type": "application/json"}
    if prefer: headers["Prefer"] = prefer
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/{path}", data=data, headers=headers, method=method)
    with urllib.request.urlopen(req) as r:
        t = r.read().decode(); return json.loads(t) if t else None

existing = sb("hashway_2hr_products?select=sku,active")
to_deactivate = [r["sku"] for r in existing if r["sku"] not in live_skus and r["active"]]
print(f"Live collection products: {len(live)}   existing rows: {len(existing)}   to deactivate: {len(to_deactivate)}")
for r in sorted(live, key=lambda x: x["name"]):
    print(f"  UPSERT {r['name'][:44]:44} | {r['stock_qty']:>4} | ₹{r['price_paise']//100}")
for s in to_deactivate: print(f"  OFF    {s}")
if DRY:
    print("[dry run — no writes]"); sys.exit(0)

sb("hashway_2hr_products", method="POST", body=live, prefer="resolution=merge-duplicates,return=minimal")
if to_deactivate:
    inlist = "(" + ",".join(urllib.parse.quote(s) for s in to_deactivate) + ")"
    sb(f"hashway_2hr_products?sku=in.{inlist}", method="PATCH", body={"active": False}, prefer="return=minimal")
after = sb("hashway_2hr_products?select=sku&active=eq.true")
print(f"✅ Synced. Active products now: {len(after)} (expected {len(live)})")
