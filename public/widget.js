/* Feed Panel odds widget. Usage:
   <script src="https://YOUR-PANEL/widget.js" data-key="fpw_live_..." data-sport="sr:sport:1" data-api="https://.../functions/v1/feed-widget"></script> */
(function () {
  var s = document.currentScript;
  if (!s) return;
  var key = s.getAttribute("data-key");
  var sport = s.getAttribute("data-sport") || "";
  var api = s.getAttribute("data-api");
  var lang = s.getAttribute("data-lang") || "en";
  var host = document.createElement("div");
  host.className = "fp-widget";
  s.parentNode.insertBefore(host, s.nextSibling);
  var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
  var css =
    ":host{all:initial}*{box-sizing:border-box;font-family:'Noto Sans',system-ui,sans-serif}" +
    ".w{border:1px solid #d5dde6;border-radius:4px;overflow:hidden;font-size:12px;color:#1c2b3a;background:#fff}" +
    ".h{background:#0b2d4f;color:#fff;padding:8px 10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;font-size:11px}" +
    "table{width:100%;border-collapse:collapse}td,th{padding:6px 8px;border-top:1px solid #e6ebf0;text-align:left}" +
    "th{background:#eef2f6;font-size:10px;text-transform:uppercase;color:#5a6b7c}tr:nth-child(even) td{background:#f7f9fb}" +
    ".o{text-align:center;font-weight:700;width:56px}.live{color:#1f9d55;font-weight:700}.e{padding:10px;color:#a33}";
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function render(list) {
    var rows = list.map(function (m) {
      var mk = (m.markets || []).filter(function (x) { return x.market === "1x2"; })[0];
      var o = mk ? mk.outcomes : [];
      var odd = function (id) { var f = o.filter(function (x) { return x.id === id; })[0]; return f ? f.odds.toFixed(2) : "–"; };
      var t = m.status === "live" ? '<span class="live">' + (m.match_minute ? m.match_minute + "'" : "LIVE") + "</span>" :
        new Date(m.scheduled).toLocaleString(lang, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
      return "<tr><td>" + t + "</td><td>" + esc(m.home_team) + " – " + esc(m.away_team) + '</td><td class="o">' + odd("1") + '</td><td class="o">' + odd("X") + '</td><td class="o">' + odd("2") + "</td></tr>";
    }).join("");
    root.innerHTML = "<style>" + css + '</style><div class="w"><div class="h">Odds</div><table><thead><tr><th></th><th></th><th class="o">1</th><th class="o">X</th><th class="o">2</th></tr></thead><tbody>' + rows + "</tbody></table></div>";
  }
  function load() {
    fetch(api + "?key=" + encodeURIComponent(key) + (sport ? "&sport=" + encodeURIComponent(sport) : ""))
      .then(function (r) { return r.json(); })
      .then(function (j) { if (j.error) throw new Error(j.error); render(j.data || []); })
      .catch(function (e) { root.innerHTML = "<style>" + css + '</style><div class="w"><div class="e">' + esc(e.message) + "</div></div>"; });
  }
  if (!key || !api) return;
  load();
  setInterval(load, 15000);
})();
