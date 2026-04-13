"use client";

import { useState, useEffect, useMemo } from "react";
import {
  applyQualifierNamesToSchedule,
  computePlayoffAdvancement,
  displayTeamAfterAdvancement,
  seriesTotalForDisplayedTeam,
  type PlayoffAdvancementResult,
} from "@/lib/playoffAdvancement";
import {
  buildTeamAbbreviationMap,
  formatTeamAbbreviation,
} from "@/lib/teamAbbreviations";

interface Team {
  name: string;
  /** Optional `League Table` column C from the sheet. */
  abbreviation?: string;
  pts?: number;
  gf?: number;
  ga?: number;
  gd?: number;
  position?: number;
}

export default function Home() {
  const [leagueTable, setLeagueTable] = useState<Team[]>([]);
  const [groups, setGroups] = useState<Team[][]>([]);
  const [schedule, setSchedule] = useState<
    {
      gameweek: number;
      matches: {
        home: string;
        away: string;
        id?: string;
        homeGoals?: number;
        awayGoals?: number;
      }[];
    }[]
  >([]);
  const [rawSchedule, setRawSchedule] = useState<
    {
      gameweek: number;
      matches: {
        home: string;
        away: string;
        id?: string;
        homeGoals?: number;
        awayGoals?: number;
      }[];
    }[]
  >([]);
  const [playoffBracket, setPlayoffBracket] = useState<{
    gameweek31_32: {
      left: { teams: [string, string]; id?: string }[];
      right: { teams: [string, string]; id?: string }[];
    };
    gameweek33_34: {
      left: { teams: [string, string]; id?: string };
      right: { teams: [string, string]; id?: string };
    };
    gameweek35_36: {
      left: { teams: [string, string]; id?: string };
      right: { teams: [string, string]; id?: string };
    };
    final: { teams: [string, string]; id?: string };
  }>({
    gameweek31_32: {
      left: [{ teams: ["A1", "C2"] }, { teams: ["C1", "B2"] }],
      right: [{ teams: ["B1", "A2"] }, { teams: ["WC1", "WC2"] }],
    },
    gameweek33_34: {
      left: { teams: ["W A1/C2", "W C1/B2"] },
      right: { teams: ["W B1/A2", "W WC1/WC2"] },
    },
    gameweek35_36: {
      left: { teams: ["T1", "W A1/C2 / W C1/B2"] },
      right: { teams: ["T2", "W B1/A2 / W WC1/WC2"] },
    },
    final: { teams: ["Winner Left", "Winner Right"] },
  });
  const [loading, setLoading] = useState(true);
  /** Two-leg aggregate winners (R8 → QF → SF → Final), keyed by schedule match `id`. */
  const [playoffAdvancement, setPlayoffAdvancement] =
    useState<PlayoffAdvancementResult | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch league table
        const leagueRes = await fetch("/api/league-table");
        if (leagueRes.ok) {
          const leagueData = await leagueRes.json();
          console.log("League table data:", leagueData);
          // Sort by position to ensure correct order
          const sortedData = [...leagueData].sort(
            (a, b) => (a.position || 0) - (b.position || 0)
          );
          setLeagueTable(sortedData);
        } else {
          console.error("Failed to fetch league table:", leagueRes.status);
        }

        // Fetch groups
        const groupsRes = await fetch("/api/groups");
        if (groupsRes.ok) {
          const groupsData = await groupsRes.json();
          console.log("Groups data:", groupsData);
          setGroups(groupsData);
        } else {
          console.error("Failed to fetch groups:", groupsRes.status);
        }

        // Fetch schedule
        const scheduleRes = await fetch("/api/schedule");
        if (scheduleRes.ok) {
          const scheduleData = await scheduleRes.json();
          console.log("Schedule data (raw):", scheduleData);

          // Debug: scores per gameweek as returned by API (Fantrax merge happens on server)
          console.group("[schedule] Scores by gameweek (browser — from /api/schedule)");
          for (const gw of scheduleData as { gameweek: number; matches: unknown[] }[]) {
            if (gw.gameweek < 25) continue;
            const rows = (
              gw.matches as {
                home: string;
                away: string;
                homeGoals?: number;
                awayGoals?: number;
                id?: string;
              }[]
            ).map((m) => ({
              id: m.id,
              home: m.home,
              away: m.away,
              homeGoals: m.homeGoals ?? null,
              awayGoals: m.awayGoals ?? null,
              bothScores:
                m.home === "BYE" ||
                m.away === "BYE" ||
                (m.homeGoals != null && m.awayGoals != null),
            }));
            console.log(`GW ${gw.gameweek}`, rows);
          }
          console.groupEnd();

          setRawSchedule(scheduleData);
          setSchedule(scheduleData);
        } else {
          console.error("Failed to fetch schedule:", scheduleRes.status);
        }

        // Don't fetch bracket from API - we'll calculate it from groups and league table
        // const bracketRes = await fetch("/api/playoff-bracket");
        // if (bracketRes.ok) {
        //   const bracketData = await bracketRes.json();
        //   console.log("Playoff bracket data:", bracketData);
        //   setPlayoffBracket(bracketData);
        // } else {
        //   console.error("Failed to fetch playoff bracket:", bracketRes.status);
        // }
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  // Store qualifiers for use in schedule
  const [qualifiers, setQualifiers] = useState<{
    A1: string;
    A2: string;
    B1: string;
    B2: string;
    C1: string;
    C2: string;
    WC1: string;
    WC2: string;
    T1: string;
    T2: string;
  } | null>(null);

  // Calculate playoff bracket from groups and league table
  useEffect(() => {
    console.log(
      "Calculating bracket - groups:",
      groups.length,
      "leagueTable:",
      leagueTable.length,
      "rawSchedule:",
      rawSchedule.length
    );
    console.log("Groups data:", groups);
    console.log("League table data:", leagueTable);

    if (
      groups.length === 3 &&
      leagueTable.length > 0 &&
      rawSchedule.length > 0
    ) {
      // Sort each group by points (desc) then GD (desc)
      const sortedGroups = groups.map((group) =>
        [...group].sort((a, b) => {
          if (b.pts !== a.pts) return (b.pts || 0) - (a.pts || 0);
          return (b.gd || 0) - (a.gd || 0);
        })
      );

      console.log("Sorted groups:", sortedGroups);

      // Get 1st and 2nd from each group
      const A1 = sortedGroups[0][0]?.name || "A1";
      const A2 = sortedGroups[0][1]?.name || "A2";
      const B1 = sortedGroups[1][0]?.name || "B1";
      const B2 = sortedGroups[1][1]?.name || "B2";
      const C1 = sortedGroups[2][0]?.name || "C1";
      const C2 = sortedGroups[2][1]?.name || "C2";

      console.log("Group qualifiers:", { A1, A2, B1, B2, C1, C2 });

      // Find the highest-scoring 2nd place team for bracket balancing
      const secondPlaceTeams = sortedGroups
        .map((group, groupIndex) => {
          if (group.length > 1) {
            return {
              ...group[1],
              groupIndex,
              groupName: String.fromCharCode(65 + groupIndex),
            };
          }
          return null;
        })
        .filter(
          (team): team is Team & { groupIndex: number; groupName: string } =>
            team !== null
        );

      const highestSecondPlace = [...secondPlaceTeams].sort((a, b) => {
        if (b.pts !== a.pts) return (b.pts || 0) - (a.pts || 0);
        return (b.gd || 0) - (a.gd || 0);
      })[0];

      console.log(
        "2nd place teams:",
        secondPlaceTeams.map((t) => `${t.groupName}2: ${t.name} (${t.pts} pts)`)
      );
      console.log(
        "Highest 2nd place:",
        highestSecondPlace
          ? `${highestSecondPlace.groupName}2: ${highestSecondPlace.name} (${highestSecondPlace.pts} pts)`
          : "N/A"
      );

      // Calculate wildcards: 2 highest points from 3rd place teams
      const thirdPlaceTeams = sortedGroups
        .map((group, groupIndex) => {
          if (group.length > 2) {
            return { ...group[2], groupIndex };
          }
          return null;
        })
        .filter((team): team is Team & { groupIndex: number } => team !== null);

      const wildcards = [...thirdPlaceTeams]
        .sort((a, b) => {
          if (b.pts !== a.pts) return (b.pts || 0) - (a.pts || 0);
          return (b.gd || 0) - (a.gd || 0);
        })
        .slice(0, 2)
        .map((team) => team.name);

      const WC1 = wildcards[0] || "WC1";
      const WC2 = wildcards[1] || "WC2";

      console.log("Wildcards:", { WC1, WC2 });

      // Get T1 and T2 from league table (positions 1 and 2)
      const T1 = leagueTable[0]?.name || "T1";
      const T2 = leagueTable[1]?.name || "T2";

      console.log("Top seeds:", { T1, T2 });

      // Store qualifiers for schedule population
      setQualifiers({ A1, A2, B1, B2, C1, C2, WC1, WC2, T1, T2 });

      // Replacement map for placeholders
      const replacements: { [key: string]: string } = {
        A1: A1,
        A2: A2,
        B1: B1,
        B2: B2,
        C1: C1,
        C2: C2,
        WC1: WC1,
        WC2: WC2,
        "1st Place": T1,
        "2nd Place": T2,
        T1: T1,
        T2: T2,
      };

      // Helper to apply replacements (same logic as schedule)
      // Also handles cases where team names might be hardcoded but should be replaced
      const applyReplacements = (value: string): string => {
        // First try exact match with replacements
        if (replacements[value]) {
          return replacements[value];
        }

        // If the value is already T1 or T2, return it (no replacement needed)
        if (value === T1 || value === T2) {
          return value;
        }

        // Check if this is a team that's currently in position 1 or 2 but hardcoded
        // If a team name matches a team in the top 2 positions, ensure we use the current T1/T2
        // This handles cases where the sheet might have old team names hardcoded
        const currentTop2Teams = leagueTable.slice(0, 2).map((t) => t.name);
        if (currentTop2Teams.includes(value)) {
          // If it's the first place team, use T1; if second place, use T2
          if (value === T1) return T1;
          if (value === T2) return T2;
        }

        return value;
      };

      // Get all playoff matches from schedule (gameweeks 31-38)
      const getAllPlayoffMatches = () => {
        const playoffGameweeks = rawSchedule.filter(
          (gw) => gw.gameweek >= 31 && gw.gameweek <= 38
        );
        const allMatches: {
          home: string;
          away: string;
          id?: string;
          gameweek: number;
        }[] = [];
        playoffGameweeks.forEach((gw) => {
          gw.matches.forEach((match) => {
            allMatches.push({
              home: match.home,
              away: match.away,
              id: match.id,
              gameweek: gw.gameweek,
            });
          });
        });
        return allMatches;
      };

      const allPlayoffMatches = getAllPlayoffMatches();

      // Debug: duplicate IDs (e.g. same id in GW31 + GW32) — bracket uses earliest GW
      if (process.env.NODE_ENV === "development") {
        console.log("\n=== CHECKING FOR DUPLICATE MATCH IDs ===");
        const matchIds = allPlayoffMatches.map((m) => m.id).filter(Boolean);
        const duplicateIds = matchIds.filter(
          (id, index) => matchIds.indexOf(id) !== index
        );
        if (duplicateIds.length > 0) {
          const uniqueDup = [...new Set(duplicateIds)];
          console.warn(
            "⚠️  DUPLICATE MATCH IDs (using earliest gameweek per id):",
            uniqueDup
          );
          uniqueDup.forEach((dupId) => {
            const gws = allPlayoffMatches
              .filter((m) => m.id === dupId)
              .map((m) => m.gameweek)
              .sort((a, b) => a - b);
            console.warn(`  "${dupId}" → gameweeks [${gws.join(", ")}]`);
          });
        } else {
          console.log("✅ No duplicate match IDs found");
        }
        console.log("All playoff matches:", allPlayoffMatches);
      }

      // Helper to find match by ID (if duplicated, prefer smallest gameweek = first leg / canonical row)
      const findMatchById = (id: string) => {
        const matches = allPlayoffMatches.filter((m) => m.id === id);
        if (matches.length === 0) {
          if (process.env.NODE_ENV === "development") {
            console.log(`Match with ID ${id} not found`);
          }
          return null;
        }
        const sorted = [...matches].sort((a, b) => a.gameweek - b.gameweek);
        const match = sorted[0];
        if (matches.length > 1 && process.env.NODE_ENV === "development") {
          console.warn(
            `⚠️  ID "${id}" ×${matches.length} — using GW${match.gameweek} (earliest). Use unique IDs in the sheet if rows differ.`
          );
        }
        let replacedHome = applyReplacements(match.home);
        let replacedAway = applyReplacements(match.away);

        // Special handling for SF1 and SF2: if a team name is hardcoded but should be T1/T2, replace it
        // SF1 should have T1, SF2 should have T2
        if (id === "SF1") {
          // If home team is a real team name (not a placeholder like "W QF1"), it should be T1
          if (
            replacedHome &&
            !replacedHome.startsWith("W ") &&
            !replacedHome.startsWith("Winner") &&
            replacedHome !== T1
          ) {
            // Replace with T1 since this is SF1
            replacedHome = T1;
          }
        } else if (id === "SF2") {
          // If home team is a real team name (not a placeholder), it should be T2
          if (
            replacedHome &&
            !replacedHome.startsWith("W ") &&
            !replacedHome.startsWith("Winner") &&
            replacedHome !== T2
          ) {
            // Replace with T2 since this is SF2
            replacedHome = T2;
          }
        }

        if (process.env.NODE_ENV === "development") {
          console.log(`Match ${id}:`, {
            original: { home: match.home, away: match.away },
            replaced: { home: replacedHome, away: replacedAway },
            replacements: { T1, T2, "1st Place": T1, "2nd Place": T2 },
          });
        }

        return {
          home: replacedHome,
          away: replacedAway,
          id: match.id,
        };
      };

      // Find matches by their IDs (R8A, R8B, R8C, R8D, QF1, QF2, SF1, SF2, Final)
      if (process.env.NODE_ENV === "development") {
        console.log("\n=== FINDING MATCHES BY ID ===");
      }
      const r8a = findMatchById("R8A");
      if (process.env.NODE_ENV === "development") console.log("R8A result:", r8a);
      const r8b = findMatchById("R8B");
      if (process.env.NODE_ENV === "development") console.log("R8B result:", r8b);
      const r8c = findMatchById("R8C");
      if (process.env.NODE_ENV === "development") console.log("R8C result:", r8c);
      const r8d = findMatchById("R8D");
      if (process.env.NODE_ENV === "development") console.log("R8D result:", r8d);
      const qf1 = findMatchById("QF1");
      if (process.env.NODE_ENV === "development") console.log("QF1 result:", qf1);
      const qf2 = findMatchById("QF2");
      if (process.env.NODE_ENV === "development") console.log("QF2 result:", qf2);
      const sf1 = findMatchById("SF1");
      if (process.env.NODE_ENV === "development") console.log("SF1 result:", sf1);
      const sf2 = findMatchById("SF2");
      if (process.env.NODE_ENV === "development") console.log("SF2 result:", sf2);
      const f1 = findMatchById("Final");
      if (process.env.NODE_ENV === "development") console.log("Final result:", f1);

      // Check if any matches are the same
      const roundOf8Matches = [r8a, r8b, r8c, r8d].filter(
        (m): m is NonNullable<typeof r8a> => m !== null
      );
      const matchStrings = roundOf8Matches.map((m) => `${m.home} vs ${m.away}`);
      const uniqueMatches = [...new Set(matchStrings)];
      if (matchStrings.length !== uniqueMatches.length) {
        console.warn("⚠️  DUPLICATE MATCHUPS IN ROUND OF 8!");
        console.warn("  All matches:", matchStrings);
        console.warn("  Unique matches:", uniqueMatches);
      }

      // Build bracket structure matching the schedule labels
      const newBracket = {
        gameweek31_32: {
          left: [
            r8a
              ? { teams: [r8a.home, r8a.away] as [string, string], id: r8a.id }
              : { teams: ["", ""] as [string, string], id: undefined },
            r8b
              ? { teams: [r8b.home, r8b.away] as [string, string], id: r8b.id }
              : { teams: ["", ""] as [string, string], id: undefined },
          ],
          right: [
            r8c
              ? { teams: [r8c.home, r8c.away] as [string, string], id: r8c.id }
              : { teams: ["", ""] as [string, string], id: undefined },
            r8d
              ? { teams: [r8d.home, r8d.away] as [string, string], id: r8d.id }
              : { teams: ["", ""] as [string, string], id: undefined },
          ],
        },
        gameweek33_34: {
          left: qf1
            ? { teams: [qf1.home, qf1.away] as [string, string], id: qf1.id }
            : { teams: ["", ""] as [string, string], id: undefined },
          right: qf2
            ? { teams: [qf2.home, qf2.away] as [string, string], id: qf2.id }
            : { teams: ["", ""] as [string, string], id: undefined },
        },
        gameweek35_36: {
          left: sf1
            ? {
                teams: [
                  // Ensure SF1 home team is always T1 (1st place from league table)
                  sf1.home &&
                  !sf1.home.startsWith("W ") &&
                  !sf1.home.startsWith("Winner")
                    ? T1
                    : sf1.home,
                  sf1.away,
                ] as [string, string],
                id: sf1.id,
              }
            : { teams: ["", ""] as [string, string], id: undefined },
          right: sf2
            ? {
                teams: [
                  // Ensure SF2 home team is always T2 (2nd place from league table)
                  sf2.home &&
                  !sf2.home.startsWith("W ") &&
                  !sf2.home.startsWith("Winner")
                    ? T2
                    : sf2.home,
                  sf2.away,
                ] as [string, string],
                id: sf2.id,
              }
            : { teams: ["", ""] as [string, string], id: undefined },
        },
        final: f1
          ? {
              teams: [f1.home, f1.away] as [string, string],
              id: f1.id,
            }
          : { teams: ["", ""] as [string, string], id: undefined },
      };

      console.log("New bracket from schedule:", newBracket);

      // Analyze bracket structure for balance
      console.log("\n=== BRACKET STRUCTURE ANALYSIS ===");
      console.log("Round of 8 (Left):");
      console.log("  R8A:", r8a ? `${r8a.home} vs ${r8a.away}` : "Not found");
      console.log("  R8B:", r8b ? `${r8b.home} vs ${r8b.away}` : "Not found");
      console.log("Round of 8 (Right):");
      console.log("  R8C:", r8c ? `${r8c.home} vs ${r8c.away}` : "Not found");
      console.log("  R8D:", r8d ? `${r8d.home} vs ${r8d.away}` : "Not found");
      console.log("\nQuarter-Finals:");
      console.log(
        "  QF1 (Left):",
        qf1 ? `${qf1.home} vs ${qf1.away}` : "Not found"
      );
      console.log(
        "  QF2 (Right):",
        qf2 ? `${qf2.home} vs ${qf2.away}` : "Not found"
      );
      console.log("\nSemi-Finals:");
      console.log(
        "  SF1 (Left):",
        sf1 ? `${sf1.home} vs ${sf1.away}` : "Not found"
      );
      console.log(
        "  SF2 (Right):",
        sf2 ? `${sf2.home} vs ${sf2.away}` : "Not found"
      );
      console.log("\nFinal:", f1 ? `${f1.home} vs ${f1.away}` : "Not found");
      console.log("\n=== VERIFICATION ===");

      // Verify all teams are represented
      const allRoundOf8Teams = [
        r8a?.home,
        r8a?.away,
        r8b?.home,
        r8b?.away,
        r8c?.home,
        r8c?.away,
        r8d?.home,
        r8d?.away,
      ].filter(Boolean);

      const expectedTeams = [A1, A2, B1, B2, C1, C2, WC1, WC2];
      const missingTeams = expectedTeams.filter(
        (team): team is string =>
          team !== undefined && !allRoundOf8Teams.includes(team)
      );
      const extraTeams = allRoundOf8Teams.filter(
        (team): team is string =>
          team !== undefined && !expectedTeams.includes(team)
      );

      if (missingTeams.length > 0) {
        console.warn("⚠️  Missing teams in Round of 8:", missingTeams);
      } else {
        console.log("✅ All expected teams present in Round of 8");
      }

      if (extraTeams.length > 0) {
        console.warn("⚠️  Unexpected teams in Round of 8:", extraTeams);
      }

      // Check for duplicates
      const uniqueTeams = [...new Set(allRoundOf8Teams)];
      if (allRoundOf8Teams.length !== uniqueTeams.length) {
        console.warn("⚠️  Duplicate teams found in Round of 8!");
        const duplicates = allRoundOf8Teams.filter(
          (team, index) => allRoundOf8Teams.indexOf(team) !== index
        );
        console.warn("  Duplicates:", [...new Set(duplicates)]);
      } else {
        console.log("✅ No duplicate teams in Round of 8");
      }

      console.log("\n=== SEEDING ANALYSIS ===");

      // Check if wildcards play each other
      if (
        r8d &&
        (r8d.home === WC1 || r8d.home === WC2) &&
        (r8d.away === WC1 || r8d.away === WC2)
      ) {
        console.log(
          "ℹ️  Wildcards play each other in R8D - easier path for wildcards"
        );
      } else if (r8a && r8b && r8c && r8d) {
        // Check if wildcards are separated
        const r8aHasWC =
          r8a.home === WC1 ||
          r8a.home === WC2 ||
          r8a.away === WC1 ||
          r8a.away === WC2;
        const r8bHasWC =
          r8b.home === WC1 ||
          r8b.home === WC2 ||
          r8b.away === WC1 ||
          r8b.away === WC2;
        const r8cHasWC =
          r8c.home === WC1 ||
          r8c.home === WC2 ||
          r8c.away === WC1 ||
          r8c.away === WC2;
        const r8dHasWC =
          r8d.home === WC1 ||
          r8d.home === WC2 ||
          r8d.away === WC1 ||
          r8d.away === WC2;
        const wcCount = [r8aHasWC, r8bHasWC, r8cHasWC, r8dHasWC].filter(
          Boolean
        ).length;
        if (wcCount === 2) {
          console.log("✅ Wildcards are separated (one per matchup)");
        }
      }

      // Check group winner distribution
      const leftBracketTeams = [
        r8a?.home,
        r8a?.away,
        r8b?.home,
        r8b?.away,
      ].filter(Boolean);
      const rightBracketTeams = [
        r8c?.home,
        r8c?.away,
        r8d?.home,
        r8d?.away,
      ].filter(Boolean);

      const groupWinnersInLeft = [A1, B1, C1].filter((winner) =>
        leftBracketTeams.some((team) => team === winner)
      );
      const groupWinnersInRight = [A1, B1, C1].filter((winner) =>
        rightBracketTeams.some((team) => team === winner)
      );

      console.log(
        `Group winners in left bracket: ${
          groupWinnersInLeft.length
        } (${groupWinnersInLeft.join(", ")})`
      );
      console.log(
        `Group winners in right bracket: ${
          groupWinnersInRight.length
        } (${groupWinnersInRight.join(", ")})`
      );

      if (groupWinnersInLeft.length !== groupWinnersInRight.length) {
        console.log(
          "⚠️  Uneven distribution of group winners between brackets"
        );

        // Suggest balancing by moving highest 2nd place to the side with fewer group winners
        if (highestSecondPlace) {
          const highestSecondPlaceName = highestSecondPlace.name;
          const isHighestSecondPlaceOnLeft = leftBracketTeams.includes(
            highestSecondPlaceName
          );
          const sideWithFewerWinners =
            groupWinnersInLeft.length < groupWinnersInRight.length
              ? "left"
              : "right";
          const sideWithMoreWinners =
            groupWinnersInLeft.length > groupWinnersInRight.length
              ? "left"
              : "right";

          if (isHighestSecondPlaceOnLeft && sideWithMoreWinners === "left") {
            console.log(
              `💡 Suggestion: Move ${highestSecondPlaceName} (highest 2nd place, ${highestSecondPlace.pts} pts) to the ${sideWithFewerWinners} bracket to balance strength`
            );
          } else if (
            !isHighestSecondPlaceOnLeft &&
            sideWithMoreWinners === "right"
          ) {
            console.log(
              `💡 Suggestion: Move ${highestSecondPlaceName} (highest 2nd place, ${highestSecondPlace.pts} pts) to the ${sideWithFewerWinners} bracket to balance strength`
            );
          }
        }
      } else {
        console.log("✅ Group winners evenly distributed");
      }

      // Check T1 and T2 paths
      console.log(
        `\nT1 (${T1}) path: SF1 → faces winner of QF1 (${qf1?.home} vs ${qf1?.away})`
      );
      console.log(
        `T2 (${T2}) path: SF2 → faces winner of QF2 (${qf2?.home} vs ${qf2?.away})`
      );

      const qualifierNames = { A1, A2, B1, B2, C1, C2, WC1, WC2, T1, T2 };
      const resolvedForAgg = applyQualifierNamesToSchedule(
        rawSchedule,
        qualifierNames
      );
      const advancement = computePlayoffAdvancement(resolvedForAgg);
      setPlayoffAdvancement(advancement);
      setPlayoffBracket(newBracket);
    } else {
      setPlayoffAdvancement(null);
      console.log(
        "Not calculating bracket - missing data. Groups:",
        groups.length,
        "League:",
        leagueTable.length,
        "Schedule:",
        rawSchedule.length
      );
    }
  }, [groups, leagueTable, rawSchedule]);

  // Populate schedule with actual team names when qualifiers are available
  useEffect(() => {
    if (qualifiers && rawSchedule.length > 0) {
      const populatedSchedule = rawSchedule.map((gameweek) => ({
        ...gameweek,
        matches: gameweek.matches.map((match) => {
          let home = match.home;
          let away = match.away;

          // Replace placeholders with actual team names
          const replacements: { [key: string]: string } = {
            A1: qualifiers.A1,
            A2: qualifiers.A2,
            B1: qualifiers.B1,
            B2: qualifiers.B2,
            C1: qualifiers.C1,
            C2: qualifiers.C2,
            WC1: qualifiers.WC1,
            WC2: qualifiers.WC2,
            "1st Place": qualifiers.T1,
            "2nd Place": qualifiers.T2,
            T1: qualifiers.T1,
            T2: qualifiers.T2,
          };

          // Replace placeholders (exact match only)
          if (replacements[home]) home = replacements[home];
          if (replacements[away]) away = replacements[away];

          return {
            home,
            away,
            id: match.id,
            homeGoals: match.homeGoals,
            awayGoals: match.awayGoals,
          };
        }),
      }));

      setSchedule(populatedSchedule);
    }
  }, [qualifiers, rawSchedule]);

  const abbrevByFullName = useMemo(() => {
    const extra: string[] = [];
    for (const g of groups) {
      for (const t of g) extra.push(t.name);
    }
    for (const gw of schedule) {
      for (const m of gw.matches) {
        extra.push(m.home, m.away);
      }
    }
    if (playoffAdvancement?.winners) {
      for (const w of playoffAdvancement.winners.values()) {
        if (w) extra.push(w);
      }
    }
    return buildTeamAbbreviationMap(leagueTable, extra);
  }, [leagueTable, groups, schedule, playoffAdvancement]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 py-8 px-4 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  const abbrevLabel = (full: string) =>
    formatTeamAbbreviation(full, abbrevByFullName);

  /** Schedule cell: qualifiers + advancing winners → abbr (same logic as bracket). */
  const scheduleTeamResolved = (cell: string) =>
    displayTeamAfterAdvancement(cell, advWinners);

  // Helper function to check if a team name is a wildcard
  const isWildcard = (teamName: string): boolean => {
    if (!qualifiers) return false;
    return teamName === qualifiers.WC1 || teamName === qualifiers.WC2;
  };

  // Helper function to check if a team is a group winner (1st place in A, B, or C)
  const isGroupWinner = (teamName: string): boolean => {
    if (!qualifiers) return false;
    const winners = [qualifiers.A1, qualifiers.B1, qualifiers.C1];
    return winners.includes(teamName);
  };

  // Helper function to check if a team is a group runner-up (2nd place in A, B, or C)
  const isGroupRunnerUp = (teamName: string): boolean => {
    if (!qualifiers) return false;
    const runnersUp = [qualifiers.A2, qualifiers.B2, qualifiers.C2];
    return runnersUp.includes(teamName);
  };

  // Helper function to check if a team is in the top 2 positions (T1 or T2)
  const isTopSeed = (teamName: string): boolean => {
    if (!qualifiers) return false;
    return teamName === qualifiers.T1 || teamName === qualifiers.T2;
  };

  // Helper function to get styling for a team cell
  const getTeamCellStyle = (teamName: string, hasIdAbove = false): string => {
    const baseClasses = hasIdAbove ? "border-t-0" : "rounded-t";
    const layout =
      "flex justify-between items-center gap-1 min-w-0 text-left";
    if (isTopSeed(teamName)) {
      return `border border-green-700/50 ${baseClasses} px-2 py-1 w-[118px] text-xs font-medium text-white ${layout} bg-green-900/30`;
    }
    if (isWildcard(teamName)) {
      return `border border-blue-700/50 ${baseClasses} px-2 py-1 w-[118px] text-xs font-medium text-white ${layout} bg-blue-900/30`;
    }
    if (isGroupWinner(teamName)) {
      return `border border-purple-500/70 ${baseClasses} px-2 py-1 w-[118px] text-xs font-medium text-white ${layout} bg-purple-900/40`;
    }
    if (isGroupRunnerUp(teamName)) {
      return `border border-cyan-500/70 ${baseClasses} px-2 py-1 w-[118px] text-xs font-medium text-white ${layout} bg-cyan-900/40`;
    }
    return `bg-slate-700 border border-slate-600 ${baseClasses} px-2 py-1 w-[118px] text-xs font-medium text-white ${layout}`;
  };

  // Helper function to get styling for final team cell
  const advWinners = playoffAdvancement?.winners ?? new Map<string, string | null>();
  const showAfterAdvancement = (name: string) =>
    displayTeamAfterAdvancement(name, advWinners);

  const bracketAggPts = (matchId: string | undefined, displayName: string) => {
    if (!matchId || !playoffAdvancement) return null;
    const v = seriesTotalForDisplayedTeam(
      playoffAdvancement.breakdown.get(matchId),
      displayName
    );
    if (v === null) return null;
    return (
      <span className="shrink-0 min-w-[1.75rem] text-right tabular-nums font-semibold text-white/95">
        {v}
      </span>
    );
  };

  const bracketSlot = (raw: string, matchId?: string) => {
    const full = showAfterAdvancement(raw);
    const score = bracketAggPts(matchId, full);
    if (!matchId) {
      return (
        <span className="min-w-0 flex-1 truncate" title={full}>
          {abbrevLabel(full)}
        </span>
      );
    }
    return (
      <>
        <span className="min-w-0 flex-1 truncate pr-1.5" title={full}>
          {abbrevLabel(full)}
        </span>
        <div
          className="h-3.5 w-px shrink-0 self-center bg-slate-500/60"
          aria-hidden
        />
        {score ?? (
          <span className="shrink-0 min-w-[1.75rem] text-right text-[10px] font-medium tabular-nums text-slate-500">
            —
          </span>
        )}
      </>
    );
  };

  const getFinalTeamCellStyle = (
    teamName: string,
    hasIdAbove = false
  ): string => {
    const baseClasses = hasIdAbove ? "border-t-0" : "rounded-t";
    const layout =
      "flex justify-between items-center gap-1 min-w-0 text-left";
    if (isTopSeed(teamName)) {
      return `border-2 border-green-700/50 ${baseClasses} px-2 py-1 w-[128px] text-xs font-medium text-white ${layout} bg-green-900/30`;
    }
    if (isWildcard(teamName)) {
      return `border-2 border-blue-700/50 ${baseClasses} px-2 py-1 w-[128px] text-xs font-medium text-white ${layout} bg-blue-900/30`;
    }
     if (isGroupWinner(teamName)) {
       return `border-2 border-purple-500/70 ${baseClasses} px-2 py-1 w-[128px] text-xs font-medium text-white ${layout} bg-purple-900/40`;
     }
     if (isGroupRunnerUp(teamName)) {
       return `border-2 border-cyan-500/70 ${baseClasses} px-2 py-1 w-[128px] text-xs font-medium text-white ${layout} bg-cyan-900/40`;
     }
    return `bg-slate-700 border-2 border-slate-600 ${baseClasses} px-2 py-1 w-[128px] text-xs font-medium text-white ${layout}`;
  };

  return (
    <div className="min-h-screen bg-slate-900 py-4 px-3">
      <div className="max-w-[1800px] mx-auto">
        {/* Header */}
        <div className="text-center mb-4">
          <h1 className="text-3xl font-bold text-white mb-1">
            TheSuperHappyFunTime League
          </h1>
          <h2 className="text-3xl font-bold text-white mb-1">2026 Playoffs</h2>
        </div>

        {/* Playoff Bracket at the top */}
        <section className="bg-slate-800 rounded-lg shadow-lg border border-slate-700 p-4 mb-4">
          <h2 className="text-xl font-semibold text-white mb-4">
            Playoff Bracket
          </h2>
          <div className="overflow-x-auto">
            <div className="relative min-w-[1000px] py-4">
              {/* Bracket with columns - each column has heading and content */}
              <div className="grid grid-cols-7 gap-4 items-start">
                {/* Left Side - Game Week 31 & 32 */}
                <div className="flex flex-col">
                  <h3 className="text-xs font-semibold text-white mb-3 w-[118px] text-center">
                    ROUND OF 8
                  </h3>
                  <div className="flex flex-col gap-3">
                    {playoffBracket.gameweek31_32.left.map((match, index) => (
                      <div key={index} className="flex flex-col">
                        {match.id && (
                          <div className="bg-slate-600 border border-slate-500 rounded-t px-2 py-1 w-[118px] text-[8px] font-semibold text-white text-center">
                            {match.id}
                          </div>
                        )}
                        <div
                          className={getTeamCellStyle(
                            showAfterAdvancement(match.teams[0]),
                            !!match.id
                          )}
                        >
                          {bracketSlot(match.teams[0], match.id)}
                        </div>
                        <div
                          className={`${getTeamCellStyle(
                            showAfterAdvancement(match.teams[1]),
                            true
                          )} rounded-t-none rounded-b`}
                        >
                          {bracketSlot(match.teams[1], match.id)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Left Side - Game Week 33 & 34 */}
                <div className="flex flex-col">
                  <h3 className="text-xs font-semibold text-white mb-3 w-[118px] text-center">
                    QUARTER-FINALS
                  </h3>
                  <div className="flex flex-col mt-[30px]">
                    {playoffBracket.gameweek33_34.left.id && (
                      <div className="bg-slate-600 border border-slate-500 rounded-t px-2 py-1 w-[118px] text-[8px] font-semibold text-white text-center">
                        {playoffBracket.gameweek33_34.left.id}
                      </div>
                    )}
                    <div
                      className={getTeamCellStyle(
                        showAfterAdvancement(
                          playoffBracket.gameweek33_34.left.teams[0]
                        ),
                        !!playoffBracket.gameweek33_34.left.id
                      )}
                    >
                      {bracketSlot(
                        playoffBracket.gameweek33_34.left.teams[0],
                        playoffBracket.gameweek33_34.left.id
                      )}
                    </div>
                    <div
                      className={`${getTeamCellStyle(
                        showAfterAdvancement(
                          playoffBracket.gameweek33_34.left.teams[1]
                        ),
                        true
                      )} rounded-t-none rounded-b`}
                    >
                      {bracketSlot(
                        playoffBracket.gameweek33_34.left.teams[1],
                        playoffBracket.gameweek33_34.left.id
                      )}
                    </div>
                  </div>
                </div>

                {/* Left Side - Game Week 35 & 36 */}
                <div className="flex flex-col">
                  <h3 className="text-xs font-semibold text-white mb-3 w-[118px] text-center">
                    SEMI-FINALS
                  </h3>
                  <div className="flex flex-col mt-[30px]">
                    {playoffBracket.gameweek35_36.left.id && (
                      <div className="bg-slate-600 border border-slate-500 rounded-t px-2 py-1 w-[118px] text-[8px] font-semibold text-white text-center">
                        {playoffBracket.gameweek35_36.left.id}
                      </div>
                    )}
                    <div
                      className={getTeamCellStyle(
                        showAfterAdvancement(
                          playoffBracket.gameweek35_36.left.teams[0]
                        ),
                        !!playoffBracket.gameweek35_36.left.id
                      )}
                    >
                      {bracketSlot(
                        playoffBracket.gameweek35_36.left.teams[0],
                        playoffBracket.gameweek35_36.left.id
                      )}
                    </div>
                    <div
                      className={`${getTeamCellStyle(
                        showAfterAdvancement(
                          playoffBracket.gameweek35_36.left.teams[1]
                        ),
                        true
                      )} rounded-t-none rounded-b`}
                    >
                      {bracketSlot(
                        playoffBracket.gameweek35_36.left.teams[1],
                        playoffBracket.gameweek35_36.left.id
                      )}
                    </div>
                  </div>
                </div>

                {/* Center - Final */}
                <div className="flex flex-col">
                  <h3 className="text-xs font-semibold text-white mb-3 w-[128px] text-center">
                    FINAL
                  </h3>
                  <div className="flex flex-col mt-[30px]">
                    {playoffBracket.final.id && (
                      <div className="bg-slate-600 border-2 border-slate-500 rounded-t px-2 py-1 w-[128px] text-[8px] font-semibold text-white text-center">
                        {playoffBracket.final.id}
                      </div>
                    )}
                    <div
                      className={getFinalTeamCellStyle(
                        showAfterAdvancement(playoffBracket.final.teams[0]),
                        !!playoffBracket.final.id
                      )}
                    >
                      {bracketSlot(
                        playoffBracket.final.teams[0],
                        playoffBracket.final.id
                      )}
                    </div>
                    <div
                      className={`${getFinalTeamCellStyle(
                        showAfterAdvancement(playoffBracket.final.teams[1]),
                        true
                      )} rounded-t-none rounded-b`}
                    >
                      {bracketSlot(
                        playoffBracket.final.teams[1],
                        playoffBracket.final.id
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Side - Game Week 35 & 36 */}
                <div className="flex flex-col">
                  <h3 className="text-xs font-semibold text-white mb-3 w-[118px] text-center">
                    SEMI-FINALS
                  </h3>
                  <div className="flex flex-col mt-[30px]">
                    {playoffBracket.gameweek35_36.right.id && (
                      <div className="bg-slate-600 border border-slate-500 rounded-t px-2 py-1 w-[118px] text-[8px] font-semibold text-white text-center">
                        {playoffBracket.gameweek35_36.right.id}
                      </div>
                    )}
                    <div
                      className={getTeamCellStyle(
                        showAfterAdvancement(
                          playoffBracket.gameweek35_36.right.teams[0]
                        ),
                        !!playoffBracket.gameweek35_36.right.id
                      )}
                    >
                      {bracketSlot(
                        playoffBracket.gameweek35_36.right.teams[0],
                        playoffBracket.gameweek35_36.right.id
                      )}
                    </div>
                    <div
                      className={`${getTeamCellStyle(
                        showAfterAdvancement(
                          playoffBracket.gameweek35_36.right.teams[1]
                        ),
                        true
                      )} rounded-t-none rounded-b`}
                    >
                      {bracketSlot(
                        playoffBracket.gameweek35_36.right.teams[1],
                        playoffBracket.gameweek35_36.right.id
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Side - Game Week 33 & 34 */}
                <div className="flex flex-col">
                  <h3 className="text-xs font-semibold text-white mb-3 w-[118px] text-center">
                    QUARTER-FINALS
                  </h3>
                  <div className="flex flex-col mt-[30px]">
                    {playoffBracket.gameweek33_34.right.id && (
                      <div className="bg-slate-600 border border-slate-500 rounded-t px-2 py-1 w-[118px] text-[8px] font-semibold text-white text-center">
                        {playoffBracket.gameweek33_34.right.id}
                      </div>
                    )}
                    <div
                      className={getTeamCellStyle(
                        showAfterAdvancement(
                          playoffBracket.gameweek33_34.right.teams[0]
                        ),
                        !!playoffBracket.gameweek33_34.right.id
                      )}
                    >
                      {bracketSlot(
                        playoffBracket.gameweek33_34.right.teams[0],
                        playoffBracket.gameweek33_34.right.id
                      )}
                    </div>
                    <div
                      className={`${getTeamCellStyle(
                        showAfterAdvancement(
                          playoffBracket.gameweek33_34.right.teams[1]
                        ),
                        true
                      )} rounded-t-none rounded-b`}
                    >
                      {bracketSlot(
                        playoffBracket.gameweek33_34.right.teams[1],
                        playoffBracket.gameweek33_34.right.id
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Side - Game Week 31 & 32 */}
                <div className="flex flex-col">
                  <h3 className="text-xs font-semibold text-white mb-3 w-[118px] text-center">
                    ROUND OF 8
                  </h3>
                  <div className="flex flex-col gap-3">
                    {playoffBracket.gameweek31_32.right.map((match, index) => (
                      <div key={index} className="flex flex-col">
                        {match.id && (
                          <div className="bg-slate-600 border border-slate-500 rounded-t px-2 py-1 w-[118px] text-[8px] font-semibold text-white text-center">
                            {match.id}
                          </div>
                        )}
                        <div
                          className={getTeamCellStyle(
                            showAfterAdvancement(match.teams[0]),
                            !!match.id
                          )}
                        >
                          {bracketSlot(match.teams[0], match.id)}
                        </div>
                        <div
                          className={`${getTeamCellStyle(
                            showAfterAdvancement(match.teams[1]),
                            true
                          )} rounded-t-none rounded-b`}
                        >
                          {bracketSlot(match.teams[1], match.id)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Schedule on left, League Table and Groups on right */}
        <div className="flex flex-col lg:flex-row gap-4 items-start mb-4">
          {/* Left: Schedule - single vertical column, fills available space */}
          <section className="bg-slate-800 rounded-lg shadow-lg border border-slate-700 p-4 flex-1 text-[10px] shrink-0">
            <h2 className="text-base font-semibold text-white mb-4">
              Schedule
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {schedule.map((gameweek) => (
                <div key={gameweek.gameweek} className="flex-shrink-0">
                  <h3 className="text-[10px] font-semibold text-white mb-2">
                    GAMEWEEK {gameweek.gameweek}
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="border-collapse">
                      <thead>
                        <tr className="bg-slate-700 border-b border-slate-600">
                          <th className="text-right py-1 px-0.5 text-[10px] font-semibold text-slate-200 whitespace-nowrap w-[68px]">
                            HOME
                          </th>
                          <th className="text-center py-1 px-0.5 text-[10px] font-semibold text-slate-200 whitespace-nowrap w-[76px]">
                            RESULT
                          </th>
                          <th className="text-left py-1 px-0.5 text-[10px] font-semibold text-slate-200 whitespace-nowrap w-[68px]">
                            AWAY
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {gameweek.matches.map((match, index) => {
                          const hasScore =
                            match.homeGoals !== undefined &&
                            match.awayGoals !== undefined;

                          return (
                            <tr
                              key={index}
                              className="border-b border-slate-700 hover:bg-slate-700/50 transition-colors"
                            >
                              <td
                                className="py-1 px-0.5 text-[10px] font-medium text-white whitespace-nowrap text-right w-[68px]"
                                title={scheduleTeamResolved(match.home)}
                              >
                                {abbrevLabel(scheduleTeamResolved(match.home))}
                              </td>
                              <td className="py-1 px-0.5 text-center w-[76px] whitespace-nowrap">
                                {hasScore && (
                                  <span className="text-[12px] font-bold text-white flex items-center justify-center gap-0.5">
                                    <span className="text-right w-7 tabular-nums">
                                      {match.homeGoals}
                                    </span>
                                    <span>-</span>
                                    <span className="text-left w-7 tabular-nums">
                                      {match.awayGoals}
                                    </span>
                                  </span>
                                )}
                              </td>
                              <td
                                className="py-1 px-0.5 text-[10px] font-medium text-white whitespace-nowrap text-left w-[68px]"
                                title={scheduleTeamResolved(match.away)}
                              >
                                {abbrevLabel(scheduleTeamResolved(match.away))}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Right: League Table and Groups stacked vertically */}
          <div className="flex flex-col gap-4 shrink-0">
            {/* League Table */}
            <section className="bg-slate-800 rounded-lg shadow-lg border border-slate-700 p-4 shrink-0">
              <h2 className="text-xl font-semibold text-white mb-3">
                League Table
              </h2>
              <div className="overflow-x-auto">
                <table className="border-collapse w-full">
                  <thead>
                    <tr className="bg-slate-700 border-b-2 border-slate-600">
                      <th className="text-left py-2 px-2 text-[10px] font-semibold text-slate-200 whitespace-nowrap">
                        Pos
                      </th>
                      <th className="text-left py-2 px-2 text-[10px] font-semibold text-slate-200 whitespace-nowrap">
                        Team Name
                      </th>
                      <th className="text-center py-2 px-2 text-[10px] font-semibold text-slate-200 whitespace-nowrap">
                        Abbr
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {leagueTable.length === 0 ? (
                      <tr>
                        <td
                          colSpan={3}
                          className="py-2 px-2 text-[10px] text-center text-slate-400"
                        >
                          No data available
                        </td>
                      </tr>
                    ) : (
                      leagueTable.map((team, index) => {
                        const position = team.position || index + 1;
                        let rowClass =
                          "border-b border-slate-700 hover:bg-slate-700/50 transition-colors";

                        if (position === 1 || position === 2) {
                          rowClass += " bg-green-900/30 border-green-700/50";
                        } else if (position >= 3 && position <= 5) {
                          rowClass += " bg-yellow-900/30 border-yellow-700/50";
                        }

                        return (
                          <tr key={index} className={rowClass}>
                            <td className="py-2 px-2 text-[10px] font-medium text-slate-300 whitespace-nowrap">
                              {position}
                            </td>
                            <td className="py-2 px-2 text-[10px] font-medium text-white whitespace-nowrap">
                              {team.name}
                            </td>
                            <td className="py-2 px-2 text-[10px] font-medium text-slate-200 whitespace-nowrap text-center tabular-nums">
                              {abbrevLabel(team.name)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Groups */}
            <section className="bg-slate-800 rounded-lg shadow-lg border border-slate-700 p-4 shrink-0">
              <h2 className="text-xl font-semibold text-white mb-3">Groups</h2>
              <div className="flex flex-col gap-4">
                {(() => {
                  // Build W/D/L stats from group-stage matches (gameweeks 25-30)
                  const wdlMap: Record<
                    string,
                    { w: number; d: number; l: number }
                  > = {};

                  schedule.forEach((gameweek) => {
                    if (gameweek.gameweek < 25 || gameweek.gameweek > 30) {
                      return;
                    }
                    gameweek.matches.forEach((match) => {
                      // Skip if no scores
                      if (
                        match.homeGoals === undefined ||
                        match.awayGoals === undefined
                      ) {
                        return;
                      }

                      const home = match.home;
                      const away = match.away;

                      // Mirror BYE handling from backend: BYE games do not affect W/D/L
                      const isHomeBye = home === "BYE";
                      const isAwayBye = away === "BYE";
                      if (isHomeBye || isAwayBye) return;

                      if (!wdlMap[home]) {
                        wdlMap[home] = { w: 0, d: 0, l: 0 };
                      }
                      if (!wdlMap[away]) {
                        wdlMap[away] = { w: 0, d: 0, l: 0 };
                      }

                      if (match.homeGoals > match.awayGoals) {
                        wdlMap[home].w += 1;
                        wdlMap[away].l += 1;
                      } else if (match.homeGoals < match.awayGoals) {
                        wdlMap[away].w += 1;
                        wdlMap[home].l += 1;
                      } else {
                        wdlMap[home].d += 1;
                        wdlMap[away].d += 1;
                      }
                    });
                  });

                  // Calculate wildcards: 2 teams with highest points from 3rd place teams
                  const thirdPlaceTeams = groups
                    .map((group, groupIndex) => {
                      // Sort group by points (desc) then GD (desc)
                      const sorted = [...group].sort((a, b) => {
                        if (b.pts !== a.pts) return (b.pts || 0) - (a.pts || 0);
                        return (b.gd || 0) - (a.gd || 0);
                      });
                      // Get 3rd place team (index 2)
                      return sorted.length > 2
                        ? { ...sorted[2], groupIndex }
                        : null;
                    })
                    .filter(
                      (team): team is Team & { groupIndex: number } =>
                        team !== null
                    );

                  // Sort 3rd place teams by points, then GD, and take top 2
                  // Store just the team names for consistent comparison (same as qualifiers)
                  const wildcardTeamNames = [...thirdPlaceTeams]
                    .sort((a, b) => {
                      if (b.pts !== a.pts) return (b.pts || 0) - (a.pts || 0);
                      return (b.gd || 0) - (a.gd || 0);
                    })
                    .slice(0, 2)
                    .map((team) => team.name);

                  return groups.map((group, groupIndex) => {
                    // Sort group by points (desc) then GD (desc)
                    const sortedGroup = [...group].sort((a, b) => {
                      if (b.pts !== a.pts) return (b.pts || 0) - (a.pts || 0);
                      return (b.gd || 0) - (a.gd || 0);
                    });

                    return (
                      <div
                        key={groupIndex}
                        className="border border-slate-600 rounded-lg p-3 bg-slate-700/30 w-full"
                      >
                        <h3 className="text-sm font-semibold text-slate-200 mb-2">
                          Group {String.fromCharCode(65 + groupIndex)}
                        </h3>
                        <div className="overflow-x-auto">
                          <table className="border-collapse w-full">
                            <thead>
                              <tr className="bg-slate-700 border-b border-slate-600">
                                <th className="text-left py-2 px-2 text-[10px] font-semibold text-slate-200 whitespace-nowrap">
                                  Team
                                </th>
                                <th className="text-center py-2 px-2 text-[10px] font-semibold text-slate-200 whitespace-nowrap">
                                  Pts
                                </th>
                                <th className="text-center py-2 px-2 text-[10px] font-semibold text-slate-200 whitespace-nowrap">
                                  W
                                </th>
                                <th className="text-center py-2 px-2 text-[10px] font-semibold text-slate-200 whitespace-nowrap">
                                  D
                                </th>
                                <th className="text-center py-2 px-2 text-[10px] font-semibold text-slate-200 whitespace-nowrap">
                                  L
                                </th>
                                <th className="text-center py-2 px-2 text-[10px] font-semibold text-slate-200 whitespace-nowrap">
                                  GF
                                </th>
                                <th className="text-center py-2 px-2 text-[10px] font-semibold text-slate-200 whitespace-nowrap">
                                  GA
                                </th>
                                <th className="text-center py-2 px-2 text-[10px] font-semibold text-slate-200 whitespace-nowrap">
                                  GD
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {sortedGroup.map((team, position) => {
                                const wdl = wdlMap[team.name] || {
                                  w: 0,
                                  d: 0,
                                  l: 0,
                                };
                                const isWinner = position === 0; // 1st
                                const isRunnerUp = position === 1; // 2nd
                                const isWildcard = wildcardTeamNames.includes(
                                  team.name
                                );

                                let rowClass =
                                  "border-b border-slate-700 hover:bg-slate-700/50 transition-colors";

                                if (isWinner) {
                                  rowClass +=
                                    " bg-purple-900/40 border-purple-500/70";
                                } else if (isRunnerUp) {
                                  rowClass +=
                                    " bg-cyan-900/40 border-cyan-500/70";
                                } else if (isWildcard) {
                                  rowClass +=
                                    " bg-blue-900/30 border-blue-700/50";
                                }

                                // Add "x " prefix to teams that don't qualify (3rd place, not wildcard)
                                const shouldShowX =
                                  !isWinner && !isRunnerUp && !isWildcard;

                                return (
                                  <tr key={position} className={rowClass}>
                                    <td
                                      className="py-2 px-2 text-[10px] font-medium text-white whitespace-nowrap"
                                      title={team.name}
                                    >
                                      {shouldShowX ? (
                                        <>
                                          <span className="text-red-500">
                                            x
                                          </span>{" "}
                                          {abbrevLabel(team.name)}
                                        </>
                                      ) : (
                                        abbrevLabel(team.name)
                                      )}
                                    </td>
                                    <td className="py-2 px-2 text-[10px] text-center text-slate-300 whitespace-nowrap">
                                      {team.pts}
                                    </td>
                                    <td className="py-2 px-2 text-[10px] text-center text-slate-300 whitespace-nowrap">
                                      {wdl.w}
                                    </td>
                                    <td className="py-2 px-2 text-[10px] text-center text-slate-300 whitespace-nowrap">
                                      {wdl.d}
                                    </td>
                                    <td className="py-2 px-2 text-[10px] text-center text-slate-300 whitespace-nowrap">
                                      {wdl.l}
                                    </td>
                                    <td className="py-2 px-2 text-[10px] text-center text-slate-300 whitespace-nowrap">
                                      {team.gf}
                                    </td>
                                    <td className="py-2 px-2 text-[10px] text-center text-slate-300 whitespace-nowrap">
                                      {team.ga}
                                    </td>
                                    <td className="py-2 px-2 text-[10px] text-center text-slate-300 whitespace-nowrap">
                                      {team.gd && team.gd > 0 ? "+" : ""}
                                      {team.gd || 0}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
