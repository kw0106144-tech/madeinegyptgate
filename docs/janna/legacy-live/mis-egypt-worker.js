/* mis-egypt: madeinegyptgate.com -> Hostinger temp domain (/egypt). Only real site files are served; old WordPress addresses are redirected. */
const ORIGIN = 'mindful-mediumslateblue-okapi-21.hostingersite.com';
const PREFIX = '/egypt';
const CANON = 'madeinegyptgate.com';
const V = '20261118';

const FILES = `
|about.html,agencies.html,article.html,bourse.html,cities.html,city.html,company.html,consultant-leads.html,contact.html,contractor-leads.html,contractors.html,dashboard.html,deal.html,entity.html,event.html,events.html,export-market.html,factories.html,factory.html,home.html,index.html,intl.html,janna.html,lead.html,leads.html,legal.html,login.html,manifest.webmanifest,map.html,market.html,media-center.html,news.html,offer.html,offers.html,opportunity.html,outlets.html,panel.html,project-news.html,project.html,projects.html,radar.html,region.html,register.html,rfqs.html,robots.txt,sitemap.xml,suppliers.html,tenders.html,track.html,useful-links.html,videos.html,winner.html,winners.html
api|index.php
data|auth.js,bot-en.js,bot.js,deals.js,egadm.js,exportmap.js,factories.js,facx.js,i18n-en.js,i18n.js,indimg.js,janna-avatar.js,janna.js,me.js,offers.js,oldfac.js,oldfacd.js,oldprod.js,oldrfq.js,oldsup.js,oldtend.js,plan.js,products.js,projects.js,real.js,regions.js,registry.js,samap.js,seo.js,videos.js,world.js,zones.js
img|about-poster.jpg,ban-p-elhelal.jpg,ban-p-elmaleka.jpg,ban-p-lacto.jpg,ban-p-trust.jpg,ban-s-arabcont-1.jpg,ban-s-arabcont-2.jpg,ban-s-elsewedy.jpg,ban-s-soulwater.jpg,cat-ac.jpg,cat-build.jpg,cat-cable.jpg,cat-glass.jpg,cat-heater.jpg,cat-lugs.jpg,cat-metal.jpg,cat-plastic.jpg,cat-plastic2.jpg,e0.jpg,e1.jpg,e2.jpg,e3.jpg,e4.jpg,eafid-logo.png,fgcci.svg,flag-sa.svg,hassan.png,hero-poster.jpg,hero.jpg,janna.jpg,logo-site.png,m0.jpg,m1.jpg,m2.jpg,m3.jpg,m4.jpg,og-cover.jpg,p0.jpg,p1.jpg,p2.jpg,p3.jpg,p4.jpg,p5.jpg,p6.jpg,p7.jpg,pl-ae.png,pl-sa.png,v0.jpg,v1.jpg,v2.jpg,v3.jpg,v4.jpg,v5.jpg
img/cities|10th-of-ramadan.jpg,6th-of-october.jpg,kafr-el-dawwar.jpg,mahalla-el-kubra.jpg,new-borg-el-arab.jpg,new-damietta.jpg
img/events|africa-health-excon-2027.jpg,afro-plast-2027.jpg,ai-everything-egypt-2027.jpg,big5-construct-egypt-2027.jpg,cairo-woodshow-2026.jpg,edex-2027.jpg,egypes-2027.jpg,egypt-energy-2027.jpg,egypt-infrastructure-expo-2027.jpg,egypt-mining-forum-2027.jpg,fi-africa-2027.jpg,food-africa-2026.jpg,hvacr-egypt-2027.jpg,interpack-mea-2026.jpg,metal-steel-egypt-2027.jpg,pharmaconex-2027.jpg,propak-mena-2027.jpg,sahara-expo-2027.jpg
img/gov|gv-ALX.jpg,gv-ASN.jpg,gv-AST.jpg,gv-BBA.jpg,gv-BHR.jpg,gv-BNS.jpg,gv-CAI.jpg,gv-DKH.jpg,gv-DMT.jpg,gv-FYM.jpg,gv-GHR.jpg,gv-GIZ.jpg,gv-ISM.jpg,gv-JSN.jpg,gv-KFS.jpg,gv-LXR.jpg,gv-MNF.jpg,gv-MNY.jpg,gv-MTR.jpg,gv-NSN.jpg,gv-PTS.jpg,gv-QLB.jpg,gv-QNA.jpg,gv-SHG.jpg,gv-SHR.jpg,gv-SUZ.jpg,gv-WAD.jpg
img/ind|adabiya-port.jpg,alex-free-zone-2.jpg,alex-free-zone.jpg,alexandria-port.jpg,arish-port.jpg,armant-sugar-plant.jpg,aswan-efaco-ferroalloys.jpg,borg-farag-allah-1.jpg,borg-farag-allah-2.jpg,borg-tech-park.jpg,ccpp-construction.jpg,ccpp-piping.jpg,dabaa-construction.jpg,dabaa-reactor-transport.jpg,damietta-lng.jpg,dekheila-port.jpg,machine-workshop.jpg,maersk-damietta.jpg,map.json,mog-factory.jpg,nac-power-plant.jpg,ncc-cement-benisuef.jpg,phosphate-mine.jpg,port-tawfik-shipyard.jpg,prj-agri-2.jpg,prj-agri.jpg,prj-airport-2.jpg,prj-airport.jpg,prj-cement-2.jpg,prj-cement.jpg,prj-housing-2.jpg,prj-housing.jpg,prj-industry-2.jpg,prj-industry.jpg,prj-mining-2.jpg,prj-mining.jpg,prj-petro-2.jpg,prj-petro.jpg,prj-port-2.jpg,prj-port.jpg,prj-power-2.jpg,prj-power.jpg,prj-rail-2.jpg,prj-rail.jpg,prj-road-2.jpg,prj-road.jpg,prj-solar-2.jpg,prj-solar.jpg,prj-tunnel-2.jpg,prj-tunnel.jpg,prj-water-2.jpg,prj-water.jpg,prj-wind-2.jpg,prj-wind.jpg,sadat-ezz-steel.jpg,sadat-prima.jpg,smart-village-2.jpg,smart-village.jpg,sokhna-industrial-zone.jpg
img/news|n0.jpg,n1.jpg,n10.jpg,n11.jpg,n12.jpg,n13.jpg,n14.jpg,n15.jpg,n16.jpg,n17.jpg,n18.jpg,n19.jpg,n2.jpg,n20.jpg,n21.jpg,n22.jpg,n23.jpg,n24.jpg,n3.jpg,n4.jpg,n5.jpg,n6.jpg,n7.jpg,n8.jpg,n9.jpg
img/offers|ariika-fringe-honeycomb-throw-blanket.jpg,ariika-kids-bathrobe.jpg,ariika-king-percale-essentials-set.jpg,ariika-pinstripe-percale-fitted-sheet-set.jpg,btech-alaska-chest-freezer-ch200.jpg,btech-alaska-upright-freezer-up200nf.jpg,btech-fresh-32-inch-hd-led-tv.jpg,btech-fresh-boxer-box-fan.jpg,btech-fresh-built-in-gas-hob-60cm.jpg,btech-fresh-front-load-washer-8kg.jpg,btech-fresh-jumbo-air-cooler-120l.jpg,btech-fresh-relax-led-50-water-heater.jpg,btech-kiriazi-chest-freezer-kh225cf.jpg,btech-koldair-classic-a-water-dispenser.jpg,btech-koldair-slim-water-dispenser.jpg,btech-mienta-turbo-plus-hand-blender.jpg,btech-olympic-hero-plus-water-heater-50l.jpg,btech-tornado-drum-vacuum-1800w.jpg,btech-tornado-inverter-ac-1-5hp-cool-heat.jpg,btech-toshiba-gas-cooker-4-burners.jpg,btech-unionaire-artify-inverter-ac-1-5hp.jpg,btech-unionaire-refrigerator-310l.jpg,btech-zanussi-perlamax-washer-7kg.jpg,gourmet-batchelors-cup-a-soup-oxtail.jpg,gourmet-danone-activia-natural-plain-yogurt.jpg,gourmet-danone-hipro-strawberry-yoghurt-drink.jpg,gourmet-el-doha-fajita-seasoning.jpg,gourmet-el-doha-shawarma-mix.jpg,gourmet-organic-nation-rice-cake-cheese-bites.jpg,homzmart-englander-victoria-single-mattress.jpg,homzmart-mattress-180x200-connected-coils.jpg,homzmart-mdf-buffet-brown-white.jpg,homzmart-mdf-shoe-rack-3-shelves.jpg,homzmart-mdf-single-bed-pink-100x200.jpg,homzmart-metal-mdf-dining-set-3pcs.jpg,homzmart-sama-mdf-velvet-single-bed-grey.jpg,homzmart-steel-glass-console-black-gold.jpg,inyourshoe-black-border-washed-straight-jeans.jpg,inyourshoe-counting-sheeps-fluffy-pjoys.jpg,inyourshoe-olive-regular-windbreaker.jpg,inyourshoe-pack-of-6-fluffy-socks.jpg,mahgoub-bathroom-unit-80cm-sink-2-drawers.jpg,mahgoub-cleopatra-floor-porcelain-traventino-ivory-60x120.jpg,mahgoub-cleopatra-floor-porcelain-urano-60x120.jpg,mahgoub-cleopatra-wall-ceramic-lucy-30x60.jpg,mahgoub-gemma-wall-ceramic-lugano-60x180.jpg,mahgoub-ideal-standard-europa-kitchen-mixer.jpg,mahgoub-ideal-standard-san-remo-toilet-tank.jpg,mahgoub-lecico-toilet-set-matrix-sprayer.jpg,mahgoub-lecico-toilet-set-zara-white.jpg,mahgoub-marble-toilet-paper-holder.jpg,metro-abu-auf-coffee-espresso-barista-can-200g.jpg,metro-al-doha-fine-flour-1kg.jpg,metro-domty-feta-plus-cheese-500g.jpg,metro-isis-natura-fennel-20-bags.jpg,metro-juhayna-full-cream-milk-1l-6pc-s-o.jpg,metro-koki-chicken-nuggets-60pc.jpg,metro-lurpak-unsalted-butter-400g.jpg,metro-regina-spaghetti.jpg,metro-sekem-organic-hibiscus-tea-20-bags.jpg,metro-shamadan-new-katakito-chocolate-1pc.jpg,nilestock-boys-gabardine-pants.jpg,nilestock-men-s-cotton-polo-t-shirt.jpg,nilestock-womens-wide-leg-sweatpants.jpg,nillens-blue-kaleidoscope-pillowcase-set-of-2-350-tc.jpg,nillens-mustard-ikat-flowers-printed-duvet-pillowcases.jpg,nillens-navy-hooded-sweatshirt.jpg,nillens-navy-starburst-men-s-printed-pyjama-set.jpg,pavo-leen-slipper.jpg,pavo-maro-boots.jpg,pavo-oxford-loafers.jpg,pavo-velvet-ballerina.jpg,seoudi-abu-auf-classic-instant-coffee-100-g.jpg,seoudi-bisco-misr-datto-king-size-pack-of-12.jpg,seoudi-bisco-misr-tea-biscuits-pack-of-12.jpg,seoudi-california-garden-fava-beans-with-egyptian-recipe-400.jpg,seoudi-corona-munchi-wafer-back-to-school-pack-of-12.jpg,seoudi-domty-gold-feta-cheese-500-g.jpg,seoudi-domty-mozzarella-cheese-280-g.jpg,seoudi-domty-plain-creamy-cheese-380-g.jpg,seoudi-eva-skin-clinic-collagen-deep-lines-filler-moisturisi.jpg,seoudi-halwani-chicken-pane-1-kg.jpg,seoudi-halwani-strawberry-jam-340-g.jpg,seoudi-halwani-tahini-475-g.jpg,seoudi-juhayna-cooking-cream-1-liter.jpg,seoudi-juhayna-whipping-cream-500-ml.jpg,seoudi-lamar-full-cream-milk-1-liter.jpg,seoudi-persil-automatic-powder-detergent-lavender-5-kg.jpg,seoudi-pringles-texas-bbq-chips-165-g.jpg,spinneys-abu-auf-peanut-butter-300g.jpg,spinneys-abu-auf-turkish-coffee-plain-medium-200g.jpg,spinneys-domty-low-salt-cheese-kg.jpg,spinneys-el-doha-egyptian-white-rice.jpg,spinneys-el-rashidi-el-mizan-strawberry-jam-700-gr.jpg,spinneys-el-rashidi-el-mizan-sugarcane-molasses-preservative.jpg,spinneys-el-rashidi-el-mizan-tahina-700g.jpg,spinneys-halwani-crunchy-chicken-nuggets-50-pcs.jpg,spinneys-halwani-halawa-plain-kg.jpg,spinneys-holw-el-sham-basbousa-hazelnut-410-gr.jpg,spinneys-juhayna-full-cream-milk.jpg,spinneys-koki-crunchy-chicken-pane-1kg.jpg,spinneys-koki-whole-frozen-chicken-1100-1200-gm.jpg
img/old|lg0.jpg,lg1.jpg,lg2.jpg,lg3.jpg,lg4.jpg,pr0.jpg,pr1.jpg
img/onews|11227.jpg,11583.jpg,11588.jpg,11593.jpg,11603.jpg,14205.jpg,14617.jpg,14714.jpg,14939.jpg,15184.jpg,29995.jpg,29996.jpg,29997.jpg,29998.jpg,29999.jpg,30000.jpg,30015.jpg,30094.jpg,30095.jpg,30096.jpg,30097.jpg,30098.jpg,30141.jpg,30142.jpg,30144.jpg,30161.jpg,30164.jpg,30168.jpg,30170.jpg,30171.jpg,30172.jpg,30173.jpg,30174.jpg,30175.jpg,30220.jpg,30221.jpg,30222.jpg,30223.jpg,30224.jpg,30225.jpg,30277.jpg,30303.jpg,30306.jpg,30335.jpg,30351.jpg,30357.jpg,30362.jpg,30407.jpg,30409.jpg,30410.jpg,30424.jpg,30434.jpg,30664.jpg,30665.jpg,30666.jpg,30667.jpg,30668.jpg,30848.jpg,30849.jpg,30850.jpg,30851.jpg,30852.jpg,30853.jpg,30983.jpg,30984.jpg,30985.jpg,31026.jpg,31457.jpg,31461.jpg,31474.jpg,31477.jpg,31481.jpg,31485.jpg,31509.jpg,31514.jpg,31533.jpg,31538.jpg,31543.jpg,31801.jpg,31802.jpg,31803.jpg,31804.jpg,31805.jpg,32010.jpg,32040.jpg,32044.jpg,32047.jpg,32756.jpg,32757.jpg,32758.jpg,32759.jpg,33067.jpg,33068.jpg,33069.jpg,33204.jpg,33970.jpg,33971.jpg,33972.jpg,34020.jpg,34024.jpg,34037.jpg,34211.jpg,34212.jpg,34213.jpg,34214.jpg,34215.jpg
img/yt|-25iYUsu53A.jpg,4JHP4n4NYzg.jpg,4OnasJSCtXs.jpg,6bgxdEAjeNI.jpg,Is4ZW7NuiVY.jpg,J98T5z3YFdU.jpg,KVL1zdDoLOE.jpg,Vn4XWL9_q-E.jpg,VtszF5RoKCE.jpg,XtjqNhqL4Lw.jpg,_DDjh5V4v4A.jpg,aSK9V0Mdkko.jpg,cCKS9e8MTjE.jpg,cVpTPZgCmPc.jpg,e9EyQ3Kq3go.jpg,iyZHQDBbLWY.jpg,j_SYtfP5rkY.jpg,k5FpGlaDtUE.jpg,kMuTlM6Rypw.jpg,luuTDl3ePsA.jpg,miVnCNXcCpQ.jpg,o9CZUQ7oRVw.jpg,rt_NZWOvwLI.jpg,tJmopWWC_8A.jpg,vTHruPeWuwQ.jpg,vULpKZqTVRs.jpg
media|about-bg.mp4,hero.mp4
`;
const ALLOW = new Set();
FILES.trim().split('\n').forEach(function (l) { var i = l.indexOf('|'), d = l.slice(0, i), n = l.slice(i + 1).split(','); n.forEach(function (f) { ALLOW.add((d ? '/' + d : '') + '/' + f); }); });

/* old WordPress pages -> new pages */
const PAGES = {
  '/about-us': '/about.html', '/registration-packages': '/register.html', '/factories-registration': '/register.html', '/factory-checkout': '/register.html',
  '/cities-guide': '/cities.html', '/sectors-guide': '/market.html', '/product-guide': '/market.html', '/products': '/market.html', '/industrial_products': '/market.html',
  '/buyer-guide': '/rfqs.html', '/public_rfqs': '/rfqs.html', '/rfqs-archive': '/rfqs.html', '/rfq-cart': '/rfqs.html', '/rfq': '/rfqs.html',
  '/factory-guide': '/factories.html', '/factories_2': '/factories.html', '/factories': '/factories.html',
  '/contact': '/contact.html', '/contact-us': '/contact.html', '/track-rfq': '/track.html', '/blog': '/news.html',
  '/factory-dashboard': '/dashboard.html', '/payment-success': '/dashboard.html', '/useful-links': '/useful-links.html', '/media': '/media-center.html',
  '/international-platforms': '/intl.html', '/tenders': '/tenders.html', '/privacy-policy': '/legal.html', '/terms-and-conditions': '/legal.html',
  '/sitemap_index.xml': '/sitemap.xml', '/wp-sitemap.xml': '/sitemap.xml'
};
/* old WordPress sections -> listing page */
const SECTIONS = [
  ['/industrial_products/', '/market.html'], ['/industrial_cert/', '/factories.html'], ['/industrial_catalogs/', '/factories.html'],
  ['/rfq/', '/rfqs.html'], ['/rfq_category/', '/rfqs.html'], ['/tender-item/', '/tenders.html'],
  ['/industry_sector/', '/factories.html'], ['/entity_type/', '/factories.html'], ['/industrial_city/', '/cities.html'],
  ['/category/', '/news.html'], ['/tag/', '/news.html'], ['/author/', '/news.html'], ['/page/', '/news.html'], ['/tenders/', '/tenders.html']
];

const NOT_FOUND = '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1"><title>404</title></head><body style="font:16px system-ui,sans-serif;text-align:center;padding:14vh 1rem"><h1>404</h1><p>الصفحة غير موجودة</p><p><a href="/">العودة إلى الصفحة الرئيسية</a></p></body></html>';

function dec(s) { try { return decodeURIComponent(s).normalize('NFC'); } catch (e) { return null; } }
function notFound() { return new Response(NOT_FOUND, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } }); }
function go(to) { return new Response(null, { status: 301, headers: { Location: 'https://' + CANON + to, 'Cache-Control': 'public, max-age=3600' } }); }

let FAC = null; /* old factory slug -> position in data/oldfac.js (company.html#<position>) */
async function facMap() {
  if (FAC) return FAC;
  try {
    const r = await fetch('https://' + ORIGIN + PREFIX + '/legacy-factories.txt?_v=' + V, { cf: { cacheTtl: 86400, cacheEverything: true } });
    const t = r.ok ? await r.text() : '';
    if (t.length > 1000 && t.charCodeAt(0) !== 60) { const m = new Map(); t.split('\n').forEach(function (s, i) { if (s) m.set(s, i); }); FAC = m; return m; }
  } catch (e) {}
  return new Map();
}

async function legacy(lc) {
  const q = lc.replace(/\/+$/, '') || '/';
  if (PAGES[q]) return PAGES[q];
  if (/^\/[a-z_]+-sitemap\d*\.xml$/.test(q)) return '/sitemap.xml';
  if (q.indexOf('/factories/') === 0) {
    const slug = q.slice(11);
    if (slug && slug.indexOf('/') < 0) { const i = (await facMap()).get(slug); if (i !== undefined) return '/company.html#' + i; }
    return '/factories.html';
  }
  for (let k = 0; k < SECTIONS.length; k++) if (lc.indexOf(SECTIONS[k][0]) === 0) return SECTIONS[k][1];
  const seg = q.split('/').filter(Boolean);
  if (seg.length === 1 && /[^\x00-\x7f]/.test(seg[0])) { /* old Arabic-titled pages and posts */
    const s = seg[0];
    if (/لوحة-تحكم|rfqs-manager|ردود-وتسعير|الإدارة|الادارة/.test(s)) return '/dashboard.html';
    if (s.indexOf('بروفايل') > -1) return '/factories.html';
    if (s.indexOf('دليل-المشتر') > -1) return '/rfqs.html';
    return '/news.html';
  }
  return null;
}

async function serve(request, u, d) {
  const api = d === '/api/index.php';
  if (!api && request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  const o = new URL('https://' + ORIGIN + PREFIX + d);
  o.search = u.search;
  const dyn = api || d === '/' || /\.(html|js|css|txt|xml|webmanifest)$/.test(d);
  if (dyn && !api) o.search += (o.search ? '&' : '?') + '_v=' + V;
  const r = await fetch(new Request(o.toString(), request), dyn ? { cf: { cacheTtl: -1 } } : {});
  if (!dyn) return r;
  const h = new Response(r.body, r);
  h.headers.set('Cache-Control', api ? 'no-store' : 'no-cache');
  return h;
}

export default {
  async fetch(request) {
    const u = new URL(request.url);
    if (u.protocol !== 'https:' || u.hostname === 'www.' + CANON) return new Response(null, { status: 301, headers: { Location: 'https://' + CANON + u.pathname + u.search } });
    const d = dec(u.pathname);
    if (d === null) return notFound();
    if (d === '/' || ALLOW.has(d)) return serve(request, u, d);
    const to = await legacy(d.toLowerCase());
    if (to) return go(to);
    if (/^\/[a-z0-9-]+$/.test(d) && ALLOW.has(d + '.html')) return go(d + '.html');
    return notFound();
  }
};
