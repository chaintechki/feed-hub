import { describe, expect, it } from "vitest";
import { EVAL_SET, fold, leagueName, marketKey, resolveGerman, sportName } from "../../supabase/functions/_shared/de-sports";

describe("German sports vocabulary", () => {
  it("folds umlauts", () => expect(fold("Fußball Über/Unter")).toBe("fussball uber unter"));
  it("maps sports, leagues, markets", () => {
    expect(sportName("Eishockey")).toBe("Ice Hockey");
    expect(leagueName("2. Bundesliga").name).toBe("2. Bundesliga");
    expect(marketKey("Beide treffen")).toBe("btts");
  });
  it("resolves every evaluation question", () => {
    for (const c of EVAL_SET) {
      const r = resolveGerman(c.q);
      expect(r.sport, c.q).toBe(c.sport);
      if (c.tournament !== undefined) expect(r.tournament, c.q).toBe(c.tournament);
      if (c.market !== undefined) expect(r.market, c.q).toBe(c.market);
    }
  });
});
