// German sports vocabulary for the feed assistant. Pure module (unit-tested in src/lib/deSports.test.ts).

/** Lowercase, strip accents/umlauts (ü→u, ß→ss) and punctuation for fuzzy comparisons. */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// German (folded) → provider sport name
const SPORTS: Record<string, string> = {
  fussball: "Soccer", fusball: "Soccer", soccer: "Soccer", football: "Soccer",
  tennis: "Tennis", basketball: "Basketball", eishockey: "Ice Hockey", hockey: "Ice Hockey",
  handball: "Handball", volleyball: "Volleyball", beachvolleyball: "Beach Volley",
  tischtennis: "Table Tennis", "american football": "American Football", baseball: "Baseball",
  rugby: "Rugby", cricket: "Cricket", darts: "Darts", snooker: "Snooker", badminton: "Badminton",
  futsal: "Futsal", wasserball: "Waterpolo", boxen: "Boxing", mma: "MMA", radsport: "Cycling",
  "formel 1": "Formula 1", motorsport: "Motorsport", golf: "Golf", esports: "ESport", "e sport": "ESport",
  ebasketball: "eBasketball", efussball: "eSoccer", "e fussball": "eSoccer", floorball: "Floorball", unihockey: "Floorball",
};

// German league names (folded) → provider tournament name part + sport + country
const LEAGUES: { de: string[]; name: string; sport: string; country?: string }[] = [
  { de: ["bundesliga", "1 bundesliga", "erste bundesliga"], name: "Bundesliga", sport: "Soccer", country: "Germany" },
  { de: ["2 bundesliga", "zweite bundesliga", "zweite liga"], name: "2. Bundesliga", sport: "Soccer", country: "Germany" },
  { de: ["3 liga", "dritte liga"], name: "3. Liga", sport: "Soccer", country: "Germany" },
  { de: ["dfb pokal", "pokal"], name: "DFB Pokal", sport: "Soccer", country: "Germany" },
  { de: ["champions league", "cl", "konigsklasse"], name: "UEFA Champions League", sport: "Soccer" },
  { de: ["europa league"], name: "UEFA Europa League", sport: "Soccer" },
  { de: ["conference league"], name: "Conference League", sport: "Soccer" },
  { de: ["premier league", "englische liga"], name: "Premier League", sport: "Soccer", country: "England" },
  { de: ["la liga", "spanische liga", "primera division"], name: "LaLiga", sport: "Soccer", country: "Spain" },
  { de: ["serie a", "italienische liga"], name: "Serie A", sport: "Soccer", country: "Italy" },
  { de: ["ligue 1", "franzosische liga"], name: "Ligue 1", sport: "Soccer", country: "France" },
  { de: ["osterreichische bundesliga", "admiral bundesliga"], name: "Bundesliga", sport: "Soccer", country: "Austria" },
  { de: ["super league schweiz", "schweizer liga"], name: "Super League", sport: "Soccer", country: "Switzerland" },
  { de: ["del", "deutsche eishockey liga"], name: "DEL", sport: "Ice Hockey", country: "Germany" },
  { de: ["nhl"], name: "NHL", sport: "Ice Hockey" },
  { de: ["bbl", "basketball bundesliga"], name: "BBL", sport: "Basketball", country: "Germany" },
  { de: ["nba"], name: "NBA", sport: "Basketball" },
  { de: ["euroleague"], name: "Euroleague", sport: "Basketball" },
  { de: ["hbl", "handball bundesliga"], name: "Bundesliga", sport: "Handball", country: "Germany" },
  { de: ["nfl"], name: "NFL", sport: "American Football" },
];

// German market terms (folded) → panel market key
const MARKETS: Record<string, string> = {
  "1x2": "1x2", dreiweg: "1x2", "3 weg": "1x2", siegwette: "1x2", siegquote: "1x2", siegquoten: "1x2", endergebnis: "1x2", sieger: "1x2", "wer gewinnt": "1x2",
  "uber unter": "total", "uber/unter": "total", "over under": "total", tore: "total", torwette: "total", gesamttore: "total",
  "beide treffen": "btts", "beide teams treffen": "btts", btts: "btts",
  "doppelte chance": "double_chance", handicap: "handicap", "asiatisches handicap": "handicap",
  halbzeit: "ht_1x2", "1 halbzeit": "ht_1x2", "halbzeit uber unter": "ht_total",
};

export type Resolved = { sport: string | null; tournament: string | null; country: string | null; market: string | null };

const hasTerm = (text: string, term: string) => new RegExp(`(^| )${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`).test(text);

/** Extract sport, league and market from a free German/English question. */
export function resolveGerman(question: string): Resolved {
  const q = fold(question);
  let sport: string | null = null, tournament: string | null = null, country: string | null = null, market: string | null = null;
  // Longest league term first so "2 bundesliga" wins over "bundesliga".
  const leagues = LEAGUES.flatMap((l) => l.de.map((d) => ({ d, l }))).sort((a, b) => b.d.length - a.d.length);
  for (const { d, l } of leagues) if (hasTerm(q, d)) { tournament = l.name; sport = l.sport; country = l.country ?? null; break; }
  if (!sport) {
    const terms = Object.keys(SPORTS).sort((a, b) => b.length - a.length);
    for (const s of terms) if (new RegExp(`(^| )${s}(spiel[a-z]*|matches|match)?( |$)`).test(q)) { sport = SPORTS[s]!; break; }
  }
  const mterms = Object.keys(MARKETS).map((k) => [fold(k), MARKETS[k]!] as const).sort((a, b) => b[0].length - a[0].length);
  for (const [k, v] of mterms) if (hasTerm(q, k)) { market = v; break; }
  return { sport, tournament, country, market };
}

/** Map a single sport word (German or English) to the provider name, or return it unchanged. */
export function sportName(s: string): string {
  return SPORTS[fold(s)] ?? s;
}
/** Map a German league term to the provider tournament name, or return it unchanged. */
export function leagueName(s: string): { name: string; country: string | null } {
  const f = fold(s);
  const hit = LEAGUES.find((l) => l.de.includes(f));
  return hit ? { name: hit.name, country: hit.country ?? null } : { name: s, country: null };
}
/** Map a German market term to the panel market key, or return it unchanged. */
export function marketKey(s: string): string {
  return MARKETS[fold(s)] ?? MARKETS[s.toLowerCase()] ?? s;
}

/** Fixed evaluation set: German questions and the expected sport / league / market. */
export const EVAL_SET: { q: string; sport: string | null; tournament?: string | null; market?: string | null }[] = [
  { q: "Welche Fußballspiele in den nächsten 6 Stunden haben Quoten?", sport: "Soccer" },
  { q: "Zeig mir die Bundesliga-Spiele am Wochenende", sport: "Soccer", tournament: "Bundesliga" },
  { q: "Gibt es Quoten für die 2. Bundesliga?", sport: "Soccer", tournament: "2. Bundesliga" },
  { q: "Welche Eishockeyspiele laufen gerade live?", sport: "Ice Hockey" },
  { q: "DEL Spiele heute mit Über/Unter", sport: "Ice Hockey", tournament: "DEL", market: "total" },
  { q: "Tennis Matches mit offenen Siegquoten", sport: "Tennis", market: "1x2" },
  { q: "Champions League beide treffen Quoten", sport: "Soccer", tournament: "UEFA Champions League", market: "btts" },
  { q: "Handballspiele in den nächsten 24 Stunden", sport: "Handball" },
  { q: "Basketball NBA heute Nacht", sport: "Basketball", tournament: "NBA" },
  { q: "Premier League doppelte Chance", sport: "Soccer", tournament: "Premier League", market: "double_chance" },
  { q: "Tischtennis live mit Quoten", sport: "Table Tennis" },
  { q: "Welche Spiele im DFB-Pokal haben ein Handicap?", sport: "Soccer", tournament: "DFB Pokal", market: "handicap" },
];
