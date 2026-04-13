#!/usr/bin/env node
/**
 * Proves Fantrax + sheet merge in dev.
 * Prereq: `npm run dev` in another terminal (loads .env.local).
 *
 *   npm run verify:local
 */

const BASE = process.env.VERIFY_URL || "http://127.0.0.1:3000";

async function main() {
  const url = `${BASE}/api/schedule`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`FAIL: ${url} → HTTP ${res.status}`);
    process.exit(1);
  }
  const schedule = await res.json();
  if (!Array.isArray(schedule) || schedule.length === 0) {
    console.error("FAIL: schedule is empty");
    process.exit(1);
  }

  const gw25 = schedule.find((g) => g.gameweek === 25);
  if (!gw25?.matches?.length) {
    console.error("FAIL: no gameweek 25");
    process.exit(1);
  }

  const firstH2h = gw25.matches.find(
    (m) => m.home !== "BYE" && m.away !== "BYE"
  );
  if (!firstH2h) {
    console.error("FAIL: no H2H match in GW25");
    process.exit(1);
  }

  const hasFantraxLikeScores =
    typeof firstH2h.homeGoals === "number" &&
    typeof firstH2h.awayGoals === "number" &&
    firstH2h.homeGoals > 10 &&
    firstH2h.awayGoals > 10;

  if (!hasFantraxLikeScores) {
    console.error(
      "FAIL: GW25 first H2H missing merged scores (expected Fantrax fantasy totals).",
      firstH2h
    );
    console.error(
      "Hint: set FANTRAX_LEAGUE_ID in .env.local; private leagues may need FANTRAX_COOKIE."
    );
    process.exit(1);
  }

  function countFilledH2h(gameweeks) {
    let filled = 0;
    let total = 0;
    for (const g of gameweeks) {
      for (const m of g.matches) {
        if (m.home === "BYE" || m.away === "BYE") continue;
        total++;
        if (m.homeGoals != null && m.awayGoals != null) filled++;
      }
    }
    return { filled, total };
  }

  const groupStage = schedule.filter((g) => g.gameweek >= 25 && g.gameweek <= 30);
  const g25to30 = countFilledH2h(groupStage);

  const gw31 = schedule.find((g) => g.gameweek === 31);
  const gw31Stats = gw31 ? countFilledH2h([gw31]) : { filled: 0, total: 0 };

  if (gw31Stats.total > 0 && gw31Stats.filled < gw31Stats.total) {
    console.error(
      "FAIL: GW31 has H2H rows but missing merged Fantrax scores.",
      gw31
    );
    process.exit(1);
  }

  console.log("OK — Fantrax merge looks good in dev.");
  console.log(`   ${url}`);
  console.log(
    `   GW25 sample: ${firstH2h.home} ${firstH2h.homeGoals} - ${firstH2h.awayGoals} ${firstH2h.away}`
  );
  console.log(
    `   Group stage H2H cells with both scores: ${g25to30.filled}/${g25to30.total}`
  );
  if (gw31Stats.total > 0) {
    console.log(
      `   GW31 H2H cells with both scores: ${gw31Stats.filled}/${gw31Stats.total}`
    );
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
