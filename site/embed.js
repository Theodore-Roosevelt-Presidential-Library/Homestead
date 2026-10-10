/*!
 * Homestead embeds - Theodore Roosevelt Presidential Library
 * https://homestead.labs.trlibrary.com/
 *
 * Usage on any page (any number of divs, one script tag):
 *   <div data-homestead="map"></div>
 *   <script src="https://homestead.labs.trlibrary.com/embed.js" async></script>
 *
 * Views: map | chart | search | stories | all
 * Optional attributes: data-height="600" (map), data-year="1915" (map start year),
 *                      data-name="olsen" (preset search)
 * Renders straight into the host page (no iframe). Styles live in homestead.css,
 * all scoped under .hs.
 */
(function () {
  "use strict";
  if (window.Homestead && window.Homestead.scan) { window.Homestead.scan(); return; }

  // ---------- base URL from this script's own src ----------
  var me = document.currentScript;
  if (!me) {
    var ss = document.getElementsByTagName("script");
    for (var i = ss.length - 1; i >= 0; i--) if (/embed\.js(\?|#|$)/.test(ss[i].src)) { me = ss[i]; break; }
  }
  var BASE = me && me.src ? me.src.replace(/[?#].*$/, "").replace(/[^\/]*$/, "") : "https://homestead.labs.trlibrary.com/";
  var DATA = BASE + "data/";
  var FULL_PAGE = BASE;

  var LEAFLET = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/";
  var TILES = "https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}";
  var Y0 = 1880, Y1 = 1960;
  var MEDORA = [46.9139, -103.5246];
  var C = { forest: "#1B4532", night: "#092A4D", sand: "#D1CCBD", gray: "#25282A", orange: "#E7805D", sky: "#99ADC5" };
  var REDUCED = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  // ---------- small helpers ----------
  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === "class") e.className = attrs[k];
      else if (k === "text") e.textContent = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function titleCase(s) {
    return String(s).toLowerCase()
      .replace(/(^|[\s\-'(;.])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); })
      .replace(/\bMc([a-z])/g, function (m, a) { return "Mc" + a.toUpperCase(); })
      .replace(/\b(Ii|Iii|Iv)\b/g, function (m) { return m.toUpperCase(); });
  }
  function displayName(p) {
    if (p.t === "usa") return "United States";
    if (p.t === "unnamed") return "No name in the index";
    return titleCase(p.n);
  }
  function fmtDate(d) {
    var a = String(d).split("-");
    if (a.length < 3) return d;
    return MONTHS[+a[1] - 1] + " " + (+a[2]) + ", " + a[0];
  }
  function gloUrl(acc) {
    return "https://glorecords.blm.gov/s/advanced-search#/search?q=" + encodeURIComponent(acc) +
      "&documenttype=Patent&geostatecodes=ND&page=1&pageSize=25";
  }
  function mapUrl(acc) { return FULL_PAGE + "?acc=" + encodeURIComponent(acc) + "#hs-map"; }
  function normalize(s) { return String(s).toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim(); }
  function fmt(n) { return Number(n).toLocaleString("en-US"); }

  var cache = {};
  function getJSON(name) {
    if (!cache[name]) {
      cache[name] = fetch(DATA + name, { credentials: "omit" }).then(function (r) {
        if (!r.ok) throw new Error(name + " " + r.status);
        return r.json();
      });
    }
    return cache[name];
  }
  function loadCSS(href, id) {
    if (id && document.getElementById(id)) return;
    var l = el("link", { rel: "stylesheet", href: href });
    if (id) l.id = id;
    (document.head || document.documentElement).appendChild(l);
  }
  var leafletP = null;
  function loadLeaflet() {
    if (leafletP) return leafletP;
    leafletP = new Promise(function (resolve, reject) {
      var hasCss = document.querySelector('link[href*="leaflet"][href$=".css"]');
      if (!hasCss) loadCSS(LEAFLET + "leaflet.min.css", "hs-leaflet-css");
      if (window.L && window.L.map && /^1\./.test(window.L.version || "")) return resolve(window.L);
      var s = el("script", { src: LEAFLET + "leaflet.min.js" });
      s.onload = function () { resolve(window.L); };
      s.onerror = function () { reject(new Error("Leaflet failed to load")); };
      document.head.appendChild(s);
    });
    return leafletP;
  }
  loadCSS(BASE + "homestead.css", "hs-css");

  // Maps on this page, so "See it on the map" can stay on the page when it can.
  var maps = [];
  function seeOnMap(acc, ev) {
    var m = maps[0];
    if (!m) return; // follow the link to the full page
    if (ev) ev.preventDefault();
    m.focus(acc, true);
  }
  function mapLink(acc, label) {
    var a = el("a", { href: mapUrl(acc), "data-hs-acc": acc }, esc(label || "See it on the map"));
    a.addEventListener("click", function (e) { seeOnMap(acc, e); });
    return a;
  }

  // =====================================================================
  // MAP
  // =====================================================================
  function renderMap(root, opts) {
    var wrap = el("section", { class: "hs-view hs-view-map", "aria-labelledby": uid("hs-maph") });
    var hid = wrap.getAttribute("aria-labelledby");
    wrap.innerHTML =
      '<h2 class="hs-h" id="' + hid + '">Who owned this land?</h2>' +
      '<p class="hs-sub">Slide through the years and watch federal land patents fill in the townships around Medora and the Elkhorn Ranch area. Tap any parcel for the record.</p>';
    var box = el("div", { class: "hs-mapbox" });
    var ctr = el("div", { class: "hs-controls" });
    var play = el("button", { type: "button", class: "hs-btn hs-play", "aria-pressed": "false" });
    var yearOut = el("div", { class: "hs-year", "aria-hidden": "true" });
    var sid = uid("hs-range");
    var slider = el("div", { class: "hs-slider" });
    slider.innerHTML =
      '<label class="hs-sr" for="' + sid + '">Year</label>' +
      '<input class="hs-range" id="' + sid + '" type="range" min="' + Y0 + '" max="' + Y1 + '" step="1">' +
      '<div class="hs-ticks" aria-hidden="true"><span>1880</span><span>1900</span><span>1920</span><span>1940</span><span>1960</span></div>';
    ctr.appendChild(play); ctr.appendChild(yearOut); ctr.appendChild(slider);
    var mapEl = el("div", { class: "hs-map", role: "region", "aria-label": "Map of federal land patents around Medora, North Dakota" });
    var h = parseInt(opts.height, 10);
    if (h > 150) mapEl.style.height = h + "px";
    else if (window.innerWidth < 640) mapEl.style.height = Math.max(380, Math.min(520, Math.round(window.innerHeight * 0.62))) + "px";
    var legend = el("ul", { class: "hs-legend" });
    legend.innerHTML =
      '<li><span class="hs-sw hs-sw-ind" aria-hidden="true"></span>Patents to individuals so far: <strong class="hs-c-ind">0</strong></li>' +
      '<li><span class="hs-sw hs-sw-usa" aria-hidden="true"></span>Patents to the United States so far: <strong class="hs-c-usa">0</strong></li>' +
      '<li><span class="hs-sw hs-sw-unn" aria-hidden="true"></span>No name in the index</li>' +
      '<li><span class="hs-sw hs-sw-part" aria-hidden="true"></span>Only part of the land mapped so far</li>' +
      '<li><span class="hs-sw hs-sw-twp" aria-hidden="true"></span>Township</li>';
    var live = el("p", { class: "hs-sr", "aria-live": "polite" });
    box.appendChild(ctr); box.appendChild(mapEl); box.appendChild(legend);
    wrap.appendChild(box); wrap.appendChild(live);
    root.appendChild(wrap);
    var range = slider.querySelector("input");
    var cInd = legend.querySelector(".hs-c-ind"), cUsa = legend.querySelector(".hs-c-usa");

    Promise.all([loadLeaflet(), getJSON("parcels.json"), getJSON("townships.json")]).then(function (r) {
      var L = r[0], parcels = r[1], twp = r[2];
      var map = L.map(mapEl, {
        scrollWheelZoom: false, zoomSnap: 0.25, minZoom: 8, maxZoom: 17,
        zoomAnimation: !REDUCED, fadeAnimation: !REDUCED, markerZoomAnimation: !REDUCED
      });
      map.attributionControl.setPrefix(false);
      L.tileLayer(TILES, {
        maxNativeZoom: 16, maxZoom: 17,
        attribution: 'Basemap: <a href="https://www.usgs.gov/programs/national-geospatial-program/national-map" target="_blank" rel="noopener">USGS The National Map</a> · Survey grid and land patents: <a href="https://glorecords.blm.gov/" target="_blank" rel="noopener">BLM</a>'
      }).addTo(map);
      map.on("click focus", function () { map.scrollWheelZoom.enable(); });
      mapEl.addEventListener("mouseleave", function () { map.scrollWheelZoom.disable(); });

      [["hs-twp", 405], ["hs-unn", 410], ["hs-ind", 420], ["hs-usa", 430], ["hs-top", 640]].forEach(function (p) {
        map.createPane(p[0]).style.zIndex = p[1];
      });
      map.getPane("hs-twp").style.pointerEvents = "none";

      // townships
      var tLayer = L.geoJSON({ type: "FeatureCollection", features: twp.townships.map(function (t) { return { type: "Feature", geometry: t.geom, properties: { name: t.name } }; }) },
        { pane: "hs-twp", interactive: false, style: { color: C.forest, weight: 1.6, opacity: 0.85, fill: false } }).addTo(map);
      tLayer.eachLayer(function (ly) {
        var b = ly.getBounds();
        var at = [b.getNorth() - (b.getNorth() - b.getSouth()) * 0.09, b.getCenter().lng];
        L.marker(at, { pane: "hs-top", interactive: false, keyboard: false,
          icon: L.divIcon({ className: "hs-twp-label", html: "<span>" + esc(ly.feature.properties.name).replace(" ", "<br>") + "</span>", iconSize: [0, 0] }) }).addTo(map);
      });
      L.marker(twp.elkhorn, { pane: "hs-top", interactive: false, keyboard: false,
        icon: L.divIcon({ className: "hs-area-label", html: "<span>Elkhorn Ranch area</span>", iconSize: [0, 0] }) }).addTo(map);
      L.circleMarker(MEDORA, { pane: "hs-top", radius: 6, color: "#fff", weight: 2, fillColor: C.gray, fillOpacity: 1, interactive: false })
        .bindTooltip("Medora", { permanent: true, direction: "right", offset: [8, 0], className: "hs-town-label", pane: "hs-top" })
        .addTo(map);

      // parcels
      var groups = { unnamed: L.layerGroup().addTo(map), individual: L.layerGroup().addTo(map), usa: L.layerGroup().addTo(map) };
      var paneOf = { unnamed: "hs-unn", individual: "hs-ind", usa: "hs-usa" };
      function styleOf(p) {
        var s;
        if (p.t === "usa") s = { fillColor: C.night, fillOpacity: 0.75, color: C.night, weight: 0.8, opacity: 1 };
        else if (p.t === "unnamed") s = { fillColor: C.sand, fillOpacity: 0.9, color: C.gray, weight: 1.4, opacity: 1 };
        else s = { fillColor: C.orange, fillOpacity: 0.85, color: "#9A4A2E", weight: 0.8, opacity: 1 };
        if (p.p) { s.dashArray = "4 3"; s.weight = 1.6; s.color = p.t === "usa" ? C.sky : C.gray; }
        return s;
      }
      var items = [], byAcc = {};
      parcels.features.forEach(function (f) {
        var p = f.properties;
        var t = groups[p.t] ? p.t : "individual";
        var ly = L.geoJSON(f, { pane: paneOf[t], style: function () { return styleOf(p); } });
        ly.bindPopup(function () { return popupHtml(p); }, { maxWidth: 300, autoPanPadding: [16, 16] });
        ly.on("mouseover", function () { ly.setStyle({ weight: 2.6, color: p.t === "usa" ? C.orange : C.night }); });
        ly.on("mouseout", function () { ly.setStyle(styleOf(p)); });
        var it = { p: p, layer: ly, group: groups[t], on: false };
        items.push(it); byAcc[p.a] = it;
      });

      var current = Y1;
      function setYear(y, announce) {
        y = Math.max(Y0, Math.min(Y1, y | 0));
        current = y;
        var atEnd = y >= Y1, nInd = 0, nUsa = 0;
        for (var i = 0; i < items.length; i++) {
          var it = items[i], show = atEnd || it.p.y <= y;
          if (show) { if (it.p.t === "individual") nInd++; else if (it.p.t === "usa") nUsa++; }
          if (show && !it.on) { it.group.addLayer(it.layer); it.on = true; }
          else if (!show && it.on) { it.group.removeLayer(it.layer); it.on = false; }
        }
        range.value = y;
        range.style.setProperty("--hs-pct", ((y - Y0) / (Y1 - Y0) * 100) + "%");
        var label = atEnd && laterCount ? y + "+" : String(y);
        yearOut.textContent = label;
        cInd.textContent = fmt(nInd); cUsa.textContent = fmt(nUsa);
        var txt = (atEnd && laterCount ? "1960 and later" : y) + ": " + nInd + " patents to individuals, " + nUsa + " to the United States so far";
        range.setAttribute("aria-valuetext", txt);
        if (announce) live.textContent = txt;
      }
      var laterCount = items.filter(function (it) { return it.p.y > Y1; }).length;

      range.addEventListener("input", function () { stop(); setYear(+range.value, false); });

      // play
      var timer = null;
      var PLAY_ICON = '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2 1l11 6-11 6z"/></svg>Play';
      var PAUSE_ICON = '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2 1h4v12H2zM8 1h4v12H8z"/></svg>Pause';
      play.innerHTML = PLAY_ICON;
      function stop() {
        if (timer) { clearInterval(timer); timer = null; }
        play.innerHTML = PLAY_ICON; play.setAttribute("aria-pressed", "false");
      }
      function start() {
        if (current >= Y1) setYear(Y0, false);
        play.innerHTML = PAUSE_ICON; play.setAttribute("aria-pressed", "true");
        var step = REDUCED ? 5 : 1;
        timer = setInterval(function () {
          if (current >= Y1) { stop(); setYear(Y1, true); return; }
          setYear(Math.min(Y1, current + step), false);
        }, REDUCED ? 1200 : 320);
      }
      play.addEventListener("click", function () { timer ? stop() : start(); });

      var startYear = parseInt(opts.year, 10);
      setYear(isNaN(startYear) ? Y1 : startYear, false);
      map.fitBounds(twp.bounds, { padding: [4, 4] });

      if (window.ResizeObserver) new ResizeObserver(function () { map.invalidateSize(); }).observe(mapEl);

      var api = {
        focus: function (acc, scroll) {
          var it = byAcc[acc];
          if (!it) return false;
          stop();
          if (it.p.y > current) setYear(it.p.y > Y1 ? Y1 : it.p.y, true);
          if (scroll && wrap.scrollIntoView) wrap.scrollIntoView({ behavior: REDUCED ? "auto" : "smooth", block: "start" });
          map.fitBounds(it.layer.getBounds(), { maxZoom: 14, padding: [40, 40], animate: !REDUCED });
          setTimeout(function () { it.layer.openPopup(it.layer.getBounds().getCenter()); }, REDUCED ? 50 : 450);
          return true;
        }
      };
      maps.push(api);
      var q = new URLSearchParams(window.location.search).get("acc");
      if (q && maps.length === 1) setTimeout(function () { api.focus(q, false); }, 50);
    }).catch(function (e) { fail(wrap, e); });
  }

  function popupHtml(p) {
    var kind = p.t === "usa" ? "Patent to the United States" : p.t === "unnamed" ? "Patent, no name in the index" : "Patent to an individual";
    var h = '<div class="hs-pop"><p class="hs-pop-kind">' + kind + '</p>' +
      '<p class="hs-pop-name">' + esc(displayName(p)) + '</p><dl>' +
      '<dt>Patented</dt><dd>' + esc(fmtDate(p.d)) + '</dd>' +
      '<dt>Land</dt><dd>' + esc(p.l) + '</dd>' +
      '<dt>Township</dt><dd>' + esc((p.w || []).join(", ")) + '</dd>' +
      '<dt>Accession</dt><dd>' + esc(p.a) + '</dd></dl>';
    if (p.p) h += '<p class="hs-pop-note">Only part of this patent\'s land is mapped so far.</p>';
    if (p.x) h += '<p class="hs-pop-note">This land is a smaller piece of the 40-acre square drawn here.</p>';
    h += '<a class="hs-pop-link" href="' + esc(gloUrl(p.a)) + '" target="_blank" rel="noopener">See this record at BLM GLO Records</a>' +
      '<span class="hs-pop-hint">opens BLM\'s search; this record is the first result.</span></div>';
    return h;
  }

  // =====================================================================
  // CHART
  // =====================================================================
  function renderChart(root) {
    var wrap = el("section", { class: "hs-view hs-view-chart" });
    var hid = uid("hs-charth");
    wrap.setAttribute("aria-labelledby", hid);
    wrap.innerHTML =
      '<h2 class="hs-h" id="' + hid + '">Patents by year, 1880–1960</h2>' +
      '<p class="hs-sub">Each bar counts the federal land patents issued that year in the 12 townships: orange for individuals, navy for the United States.</p>' +
      '<ul class="hs-chart-legend"><li><span class="hs-sw hs-sw-ind" aria-hidden="true"></span>Patents to individuals</li>' +
      '<li><span class="hs-sw hs-sw-usa" aria-hidden="true"></span>Patents to the United States</li></ul>';
    var box = el("div", { class: "hs-chartbox" });
    var tip = el("div", { class: "hs-tip", hidden: "" });
    var live = el("p", { class: "hs-sr", "aria-live": "polite" });
    box.appendChild(tip);
    wrap.appendChild(box); wrap.appendChild(live);
    root.appendChild(wrap);

    getJSON("yearly.json").then(function (d) {
      var active = null, svg = null, geo = null;
      var maxV = 0;
      d.years.forEach(function (y, i) { maxV = Math.max(maxV, d.individual[i] + d.usa[i]); });
      var step = niceStep(maxV / 4), top = Math.ceil(maxV / step) * step;

      function draw() {
        var W = Math.max(300, box.clientWidth || 700);
        var narrow = W < 560;
        var H = narrow ? 300 : 340;
        var m = { l: 36, r: 8, t: narrow ? 64 : 44, b: 26 };
        var iw = W - m.l - m.r, ih = H - m.t - m.b, n = d.years.length, bw = iw / n;
        var gap = bw > 6 ? 1.5 : 0.75;
        function x(y) { return m.l + (y - d.years[0]) * bw; }
        function yv(v) { return m.t + ih - v / top * ih; }
        var s = [];
        s.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" tabindex="0" role="group" aria-label="Bar chart of land patents by year, 1880 to 1960. Use the left and right arrow keys to read each year.">');
        // band
        if (d.band) {
          var bx = x(d.band.from), bx2 = x(d.band.to + 1);
          s.push('<rect x="' + bx + '" y="' + (m.t - 6) + '" width="' + (bx2 - bx) + '" height="' + (ih + 6) + '" fill="' + C.sand + '" fill-opacity=".45"/>');
          if (narrow) {
            s.push('<text class="hs-band-label" text-anchor="end" x="' + (bx - 6) + '" y="' + (m.t + 2) + '">Most land patented back</text>');
            s.push('<text class="hs-band-label" text-anchor="end" x="' + (bx - 6) + '" y="' + (m.t + 17) + '">to the United States</text>');
          } else {
            s.push('<text class="hs-band-label" text-anchor="end" x="' + (bx - 8) + '" y="' + (m.t + 6) + '">' + esc(d.band.label) + '</text>');
          }
        }
        // grid + y axis
        s.push('<g class="hs-grid">');
        for (var v = 0; v <= top; v += step) s.push('<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + yv(v) + '" y2="' + yv(v) + '"/>');
        s.push('</g><g class="hs-axis">');
        for (v = 0; v <= top; v += step) s.push('<text x="' + (m.l - 6) + '" y="' + (yv(v) + 4) + '" text-anchor="end">' + v + '</text>');
        var every = narrow ? 20 : 10;
        for (var yr = d.years[0]; yr <= d.years[n - 1]; yr += every) {
          s.push('<text x="' + (x(yr) + bw / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' + yr + '</text>');
        }
        s.push('</g>');
        // bars
        s.push('<g>');
        d.years.forEach(function (y, i) {
          var a = d.individual[i], u = d.usa[i];
          if (a) s.push('<rect x="' + (x(y) + gap / 2) + '" width="' + (bw - gap) + '" y="' + yv(a) + '" height="' + (yv(0) - yv(a)) + '" fill="' + C.orange + '"/>');
          if (u) s.push('<rect x="' + (x(y) + gap / 2) + '" width="' + (bw - gap) + '" y="' + yv(a + u) + '" height="' + (yv(a) - yv(a + u)) + '" fill="' + C.night + '"/>');
        });
        s.push('<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + yv(0) + '" y2="' + yv(0) + '" stroke="' + C.gray + '"/>');
        s.push('</g>');
        // annotation
        if (d.annotation) {
          var ax = x(d.annotation.year) + bw / 2;
          s.push('<g class="hs-annot"><line x1="' + ax + '" x2="' + ax + '" y1="' + (m.t - (narrow ? 50 : 30)) + '" y2="' + yv(0) + '" stroke="' + C.gray + '" stroke-dasharray="3 3"/>' +
            '<text x="' + (ax + 6) + '" y="' + (m.t - (narrow ? 40 : 20)) + '">' + esc(d.annotation.label) + '</text></g>');
        }
        // highlight + hit areas
        s.push('<rect class="hs-hl" x="0" y="' + m.t + '" width="' + bw + '" height="' + ih + '" fill="' + C.sky + '" fill-opacity=".35" visibility="hidden" pointer-events="none"/>');
        s.push('<rect class="hs-hit" x="' + m.l + '" y="' + (m.t - 6) + '" width="' + iw + '" height="' + (ih + 6) + '" fill="transparent"/>');
        s.push('</svg>');
        box.innerHTML = s.join("");
        box.appendChild(tip);
        svg = box.querySelector("svg");
        geo = { x: x, yv: yv, bw: bw, m: m, iw: iw, n: n };
        var hit = svg.querySelector(".hs-hit");
        function fromEvent(e) {
          var r = svg.getBoundingClientRect();
          var px = (e.clientX - r.left) * (W / r.width);
          return Math.max(0, Math.min(n - 1, Math.floor((px - m.l) / bw)));
        }
        hit.addEventListener("pointermove", function (e) { show(fromEvent(e), false); });
        hit.addEventListener("pointerdown", function (e) { show(fromEvent(e), false); });
        hit.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse") hide(); });
        svg.addEventListener("keydown", function (e) {
          var k = e.key, i = active == null ? -1 : active;
          if (k === "ArrowRight") i = Math.min(n - 1, i + 1);
          else if (k === "ArrowLeft") i = i < 0 ? n - 1 : Math.max(0, i - 1);
          else if (k === "Home") i = 0;
          else if (k === "End") i = n - 1;
          else if (k === "Escape") { hide(); return; }
          else return;
          e.preventDefault(); show(i, true);
        });
        svg.addEventListener("blur", hide);
        if (active != null) show(active, false);
      }
      function show(i, announce) {
        active = i;
        var y = d.years[i], a = d.individual[i], u = d.usa[i];
        var hl = svg.querySelector(".hs-hl");
        hl.setAttribute("x", geo.x(y)); hl.setAttribute("visibility", "visible");
        tip.innerHTML = "<b>" + y + "</b><br>" + a + " to individuals<br>" + u + " to the United States";
        tip.hidden = false;
        var r = svg.getBoundingClientRect(), scale = r.width / svg.viewBox.baseVal.width;
        var cx = (geo.x(y) + geo.bw / 2) * scale;
        var cy = geo.yv(a + u) * scale;
        var half = tip.offsetWidth / 2;
        tip.style.left = Math.max(half, Math.min(r.width - half, cx)) + "px";
        tip.style.top = Math.max(tip.offsetHeight + 10, cy) + "px";
        if (announce) live.textContent = y + ": " + a + " patents to individuals, " + u + " to the United States";
      }
      function hide() {
        active = null; tip.hidden = true;
        var hl = svg && svg.querySelector(".hs-hl");
        if (hl) hl.setAttribute("visibility", "hidden");
      }
      draw();
      var lastW = box.clientWidth;
      if (window.ResizeObserver) new ResizeObserver(function () {
        if (Math.abs(box.clientWidth - lastW) > 4) { lastW = box.clientWidth; draw(); }
      }).observe(box);

      // notes + accessible table
      var notes = [];
      notes.push("Counts include every federal patent to an individual or to the United States found for these townships, including a few whose land is not on the map yet.");
      if (d.outside && (d.outside.individual || d.outside.usa)) {
        var parts = [];
        if (d.outside.individual) parts.push(d.outside.individual + " to individuals");
        if (d.outside.usa) parts.push(d.outside.usa + " to the United States");
        notes.push("Not shown: " + parts.join(" and ") + " dated after 1960.");
      }
      wrap.appendChild(el("p", { class: "hs-small hs-chart-note" }, esc(notes.join(" "))));
      var rows = [];
      d.years.forEach(function (y, i) {
        if (d.individual[i] || d.usa[i]) rows.push("<tr><td>" + y + "</td><td>" + d.individual[i] + "</td><td>" + d.usa[i] + "</td></tr>");
      });
      var det = el("details", { class: "hs-table" });
      det.innerHTML = "<summary>Show the numbers as a table</summary><div class=\"hs-table-wrap\"><table><caption class=\"hs-sr\">Land patents by year</caption>" +
        "<thead><tr><th scope=\"col\">Year</th><th scope=\"col\">To individuals</th><th scope=\"col\">To the United States</th></tr></thead><tbody>" +
        rows.join("") + "</tbody></table></div><p class=\"hs-small\">Years with no patents are left out.</p>";
      wrap.appendChild(det);
    }).catch(function (e) { fail(wrap, e); });
  }
  function niceStep(raw) {
    var p = Math.pow(10, Math.floor(Math.log10(raw || 1))), f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }

  // =====================================================================
  // SEARCH
  // =====================================================================
  function renderSearch(root, opts) {
    var wrap = el("section", { class: "hs-view hs-view-search" });
    var hid = uid("hs-searchh"), iid = uid("hs-q");
    wrap.setAttribute("aria-labelledby", hid);
    wrap.innerHTML =
      '<h2 class="hs-h" id="' + hid + '">Did your family homestead near Medora?</h2>' +
      '<p class="hs-sub">Search the names on every federal land patent to an individual in these townships.</p>' +
      '<label class="hs-search-label" for="' + iid + '">Name</label>' +
      '<input class="hs-search-input" id="' + iid + '" type="search" autocomplete="off" spellcheck="false" placeholder="Try a last name, like Olsen">' +
      '<p class="hs-search-status" aria-live="polite"></p><div class="hs-search-body"></div>';
    root.appendChild(wrap);
    var input = wrap.querySelector("input"), status = wrap.querySelector(".hs-search-status"), body = wrap.querySelector(".hs-search-body");
    var coverage =
      '<div class="hs-coverage"><p>This search covers the names on all <span data-hs-n="individual">individual</span> federal land patents to individuals in 12 townships around Medora and the Elkhorn Ranch area (T139N–T141N and T143N, R101W–R103W). Type any part of a first or last name; capitals and punctuation don\'t matter.</p>' +
      '<p>It includes federal land patents only, transcribed from BLM GLO Records search results in October 2026. Land bought from a railroad, from the state or from another private owner won\'t show up here.</p></div>';

    getJSON("search.json").then(function (idx) {
      body.innerHTML = coverage;
      fillN(body, { individual: fmt(idx.length) });
      var t = null;
      function run() {
        var q = normalize(input.value);
        if (!q) { status.textContent = ""; body.innerHTML = coverage; fillN(body, { individual: fmt(idx.length) }); return; }
        var qs = q.replace(/ /g, "");
        var hits = idx.filter(function (r) { return r.k.indexOf(q) >= 0 || r.k.replace(/ /g, "").indexOf(qs) >= 0; });
        var LIMIT = 60;
        status.textContent = hits.length ? (hits.length === 1 ? "1 patent matches." : hits.length + " patents match." ) + (hits.length > LIMIT ? " Showing the first " + LIMIT + "." : "") : "";
        body.innerHTML = "";
        if (!hits.length) {
          body.innerHTML = '<p class="hs-search-status">No patents match “' + esc(input.value.trim()) + '”.</p>' + coverage;
          fillN(body, { individual: fmt(idx.length) });
          return;
        }
        var list = el("ul", { class: "hs-results" });
        hits.slice(0, LIMIT).forEach(function (r) {
          var li = el("li", { class: "hs-result" });
          li.innerHTML = '<div class="hs-result-name">' + highlight(titleCase(r.n), q) + '</div>' +
            '<div class="hs-result-meta">Patented ' + esc(fmtDate(r.d)) + ' · ' + esc(r.l) + ' · ' + esc(r.w.join(", ")) + '</div>';
          var links = el("div", { class: "hs-links" });
          links.appendChild(el("a", { href: gloUrl(r.a), target: "_blank", rel: "noopener" }, "See this record at BLM GLO Records"));
          links.appendChild(mapLink(r.a));
          li.appendChild(links);
          list.appendChild(li);
        });
        body.appendChild(list);
      }
      input.addEventListener("input", function () { clearTimeout(t); t = setTimeout(run, 120); });
      if (opts.name) { input.value = opts.name; run(); }
    }).catch(function (e) { fail(wrap, e); });
  }
  function highlight(name, q) {
    // highlight the matched run of letters, ignoring punctuation in the name
    var map = [], flat = "";
    for (var i = 0; i < name.length; i++) {
      var c = name[i].toLowerCase();
      if (/[a-z0-9 ]/.test(c)) { if (c === " " && flat.slice(-1) === " ") continue; map.push(i); flat += c; }
    }
    var at = flat.indexOf(q);
    if (at < 0) return esc(name);
    var s = map[at], e = map[at + q.length - 1] + 1;
    return esc(name.slice(0, s)) + "<mark>" + esc(name.slice(s, e)) + "</mark>" + esc(name.slice(e));
  }
  function fillN(scope, vals) {
    var n = scope.querySelectorAll("[data-hs-n]");
    for (var i = 0; i < n.length; i++) if (vals[n[i].getAttribute("data-hs-n")] != null) n[i].textContent = vals[n[i].getAttribute("data-hs-n")];
  }

  // =====================================================================
  // STORIES
  // =====================================================================
  function renderStories(root) {
    var wrap = el("section", { class: "hs-view hs-view-stories" });
    var hid = uid("hs-storyh");
    wrap.setAttribute("aria-labelledby", hid);
    wrap.innerHTML =
      '<h2 class="hs-h" id="' + hid + '">Patented twice</h2>' +
      '<p class="hs-sub">Each card is a piece of land that federal records show patented first to a homesteader and later patented to the United States. Longest gaps first.</p>' +
      '<ul class="hs-thumb-key" aria-hidden="true"><li><span class="hs-sw hs-sw-ind"></span>Homesteader\'s patent</li><li><span class="hs-sw hs-sw-usa-o"></span>Patent to the United States</li><li>Squares are the township\'s 36 sections</li></ul>';
    var list = el("ul", { class: "hs-cards" });
    var more = el("div", { class: "hs-more" });
    var btn = el("button", { type: "button", class: "hs-btn hs-btn-ghost" }, "Show more");
    var count = el("p", { class: "hs-small", "aria-live": "polite" });
    more.appendChild(btn); more.appendChild(count);
    wrap.appendChild(list); wrap.appendChild(more);
    root.appendChild(wrap);

    getJSON("stories.json").then(function (d) {
      var items = d.items, shown = 0, PAGE = 6;
      function add() {
        var first = null;
        items.slice(shown, shown + PAGE).forEach(function (s) {
          var li = el("li", { class: "hs-card" });
          var svg = '<svg class="hs-thumb" viewBox="0 0 100 100" role="img" aria-label="Where this land sits in township ' + esc(s.twp) + '">' +
            '<path d="' + (d.grids[s.twp] || "") + '" fill="#fff" stroke="#C9C3B2" stroke-width=".6"/>' +
            (s.thumb.h ? '<path d="' + s.thumb.h + '" fill="' + C.orange + '" stroke="#9A4A2E" stroke-width=".6"/>' : "") +
            (s.thumb.u ? '<path d="' + s.thumb.u + '" fill="' + C.night + '" fill-opacity=".3" stroke="' + C.night + '" stroke-width="1.6"/>' : "") +
            '</svg>';
          li.innerHTML = svg + '<div><h3 class="hs-card-title"><b>' + esc(titleCase(s.h)) + '</b>, patented ' + s.hy +
            ' <span class="hs-arrow" aria-hidden="true">→</span><span class="hs-sr"> then</span> patented to the United States, ' + s.uy + '</h3>' +
            '<p class="hs-card-meta">' + esc(s.land) + ' · ' + esc(s.twp) + '</p>' +
            '<span class="hs-gap">' + s.gap + (s.gap === 1 ? " year" : " years") + ' apart</span><div class="hs-links"></div></div>';
          li.querySelector(".hs-links").appendChild(mapLink(s.ua));
          list.appendChild(li);
          if (!first) first = li;
        });
        shown = Math.min(items.length, shown + PAGE);
        count.textContent = "Showing " + shown + " of " + items.length;
        btn.hidden = shown >= items.length;
        return first;
      }
      add();
      btn.addEventListener("click", function () {
        var f = add();
        var a = f && f.querySelector("a");
        if (a) a.focus({ preventScroll: true });
      });
    }).catch(function (e) { fail(wrap, e); });
  }

  // =====================================================================
  // bootstrap
  // =====================================================================
  var n = 0;
  function uid(p) { n++; return p + "-" + n; }
  function fail(wrap, e) {
    var p = el("p", { class: "hs-error" }, "This part of the page couldn't load. Please try again later.");
    wrap.appendChild(p);
    if (window.console) console.warn("[homestead]", e);
  }
  function fillStats() {
    var nodes = document.querySelectorAll("[data-hs-stat]");
    if (!nodes.length) return;
    getJSON("meta.json").then(function (m) {
      for (var i = 0; i < nodes.length; i++) {
        var k = nodes[i].getAttribute("data-hs-stat");
        if (m[k] != null) nodes[i].textContent = /year/.test(k) ? String(m[k]) : fmt(m[k]);
      }
    }).catch(function () {});
  }
  var RENDER = { map: renderMap, chart: renderChart, search: renderSearch, stories: renderStories };
  function scan() {
    var nodes = document.querySelectorAll("[data-homestead]");
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (node.getAttribute("data-hs-ready")) continue;
      node.setAttribute("data-hs-ready", "1");
      var view = (node.getAttribute("data-homestead") || "all").toLowerCase();
      var opts = { height: node.getAttribute("data-height"), year: node.getAttribute("data-year"), name: node.getAttribute("data-name") };
      node.classList.add("hs");
      var views = view === "all" ? ["map", "chart", "search", "stories"] : [view];
      views.forEach(function (v) { if (RENDER[v]) RENDER[v](node, opts); });
    }
    fillStats();
  }
  window.Homestead = { scan: scan, base: BASE, version: "1.0.0" };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scan);
  else scan();
})();
