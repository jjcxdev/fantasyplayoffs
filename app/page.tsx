"use client";

import { useState, useEffect } from "react";

interface Team {
  name: string;
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
          console.log("Schedule data:", scheduleData);
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
      const applyReplacements = (value: string): string => {
        return replacements[value] || value;
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

      // Helper to find match by ID
      const findMatchById = (id: string) => {
        const match = allPlayoffMatches.find((m) => m.id === id);
        if (!match) return null;
        return {
          home: applyReplacements(match.home),
          away: applyReplacements(match.away),
          id: match.id,
        };
      };

      // Find matches by their IDs (R8A, R8B, R8C, R8D, QF1, QF2, SF1, SF2, Final)
      const r8a = findMatchById("R8A");
      const r8b = findMatchById("R8B");
      const r8c = findMatchById("R8C");
      const r8d = findMatchById("R8D");
      const qf1 = findMatchById("QF1");
      const qf2 = findMatchById("QF2");
      const sf1 = findMatchById("SF1");
      const sf2 = findMatchById("SF2");
      const f1 = findMatchById("Final");

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
            ? { teams: [sf1.home, sf1.away] as [string, string], id: sf1.id }
            : { teams: ["", ""] as [string, string], id: undefined },
          right: sf2
            ? { teams: [sf2.home, sf2.away] as [string, string], id: sf2.id }
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
      setPlayoffBracket(newBracket);
    } else {
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

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 py-8 px-4 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  // Helper function to check if a team name is a wildcard
  const isWildcard = (teamName: string): boolean => {
    if (!qualifiers) return false;
    return teamName === qualifiers.WC1 || teamName === qualifiers.WC2;
  };

  // Helper function to get styling for a team cell
  const getTeamCellStyle = (teamName: string, hasIdAbove = false): string => {
    const baseClasses = hasIdAbove ? "border-t-0" : "rounded-t";
    if (teamName === "Gladidz" || teamName === "GoonterPunch FC") {
      return `border border-green-700/50 ${baseClasses} px-3 py-1.5 w-[180px] text-xs font-medium text-white text-center bg-green-900/30`;
    }
    if (isWildcard(teamName)) {
      return `border border-blue-700/50 ${baseClasses} px-3 py-1.5 w-[180px] text-xs font-medium text-white text-center bg-blue-900/30`;
    }
    return `bg-slate-700 border border-slate-600 ${baseClasses} px-3 py-1.5 w-[180px] text-xs font-medium text-white text-center`;
  };

  // Helper function to get styling for final team cell
  const getFinalTeamCellStyle = (
    teamName: string,
    hasIdAbove = false
  ): string => {
    const baseClasses = hasIdAbove ? "border-t-0" : "rounded-t";
    if (isWildcard(teamName)) {
      return `border-2 border-blue-700/50 ${baseClasses} px-3 py-1.5 w-[200px] text-xs font-medium text-white text-center bg-blue-900/30`;
    }
    return `bg-slate-700 border-2 border-slate-600 ${baseClasses} px-3 py-1.5 w-[200px] text-xs font-medium text-white text-center`;
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
            <div className="relative min-w-[1600px] py-4">
              {/* Bracket with columns - each column has heading and content */}
              <div className="grid grid-cols-7 gap-6 items-start">
                {/* Left Side - Game Week 31 & 32 */}
                <div className="flex flex-col">
                  <h3 className="text-xs font-semibold text-white mb-3 w-[180px] text-center">
                    ROUND OF 8
                  </h3>
                  <div className="flex flex-col gap-3">
                    {playoffBracket.gameweek31_32.left.map((match, index) => (
                      <div key={index} className="flex flex-col">
                        {match.id && (
                          <div className="bg-slate-600 border border-slate-500 rounded-t px-2 py-1 w-[180px] text-[8px] font-semibold text-white text-center">
                            {match.id}
                          </div>
                        )}
                        <div
                          className={getTeamCellStyle(
                            match.teams[0],
                            !!match.id
                          )}
                        >
                          {match.teams[0]}
                        </div>
                        <div
                          className={`border border-t-0 border-slate-600 rounded-b px-3 py-1.5 w-[180px] text-xs font-medium text-white text-center ${
                            isWildcard(match.teams[1])
                              ? "bg-blue-900/30 border-blue-700/50"
                              : match.teams[1] === "Gladidz" ||
                                match.teams[1] === "GoonterPunch FC"
                              ? "bg-green-900/30 border-green-700/50"
                              : "bg-slate-700"
                          }`}
                        >
                          {match.teams[1]}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Left Side - Game Week 33 & 34 */}
                <div className="flex flex-col">
                  <h3 className="text-xs font-semibold text-white mb-3 w-[180px] text-center">
                    QUARTER-FINALS
                  </h3>
                  <div className="flex flex-col mt-[30px]">
                    {playoffBracket.gameweek33_34.left.id && (
                      <div className="bg-slate-600 border border-slate-500 rounded-t px-2 py-1 w-[180px] text-[8px] font-semibold text-white text-center">
                        {playoffBracket.gameweek33_34.left.id}
                      </div>
                    )}
                    <div
                      className={getTeamCellStyle(
                        playoffBracket.gameweek33_34.left.teams[0],
                        !!playoffBracket.gameweek33_34.left.id
                      )}
                    >
                      {playoffBracket.gameweek33_34.left.teams[0]}
                    </div>
                    <div
                      className={`border border-t-0 border-slate-600 rounded-b px-3 py-1.5 w-[180px] text-xs font-medium text-white text-center ${
                        isWildcard(playoffBracket.gameweek33_34.left.teams[1])
                          ? "bg-blue-900/30 border-blue-700/50"
                          : playoffBracket.gameweek33_34.left.teams[1] ===
                              "Gladidz" ||
                            playoffBracket.gameweek33_34.left.teams[1] ===
                              "GoonterPunch FC"
                          ? "bg-green-900/30 border-green-700/50"
                          : "bg-slate-700"
                      }`}
                    >
                      {playoffBracket.gameweek33_34.left.teams[1]}
                    </div>
                  </div>
                </div>

                {/* Left Side - Game Week 35 & 36 */}
                <div className="flex flex-col">
                  <h3 className="text-xs font-semibold text-white mb-3 w-[180px] text-center">
                    SEMI-FINALS
                  </h3>
                  <div className="flex flex-col mt-[30px]">
                    {playoffBracket.gameweek35_36.left.id && (
                      <div className="bg-slate-600 border border-slate-500 rounded-t px-2 py-1 w-[180px] text-[8px] font-semibold text-white text-center">
                        {playoffBracket.gameweek35_36.left.id}
                      </div>
                    )}
                    <div
                      className={getTeamCellStyle(
                        playoffBracket.gameweek35_36.left.teams[0],
                        !!playoffBracket.gameweek35_36.left.id
                      )}
                    >
                      {playoffBracket.gameweek35_36.left.teams[0]}
                    </div>
                    <div
                      className={`border border-t-0 border-slate-600 rounded-b px-3 py-1.5 w-[180px] text-xs font-medium text-white text-center ${
                        isWildcard(playoffBracket.gameweek35_36.left.teams[1])
                          ? "bg-blue-900/30 border-blue-700/50"
                          : playoffBracket.gameweek35_36.left.teams[1] ===
                              "Gladidz" ||
                            playoffBracket.gameweek35_36.left.teams[1] ===
                              "GoonterPunch FC"
                          ? "bg-green-900/30 border-green-700/50"
                          : "bg-slate-700"
                      }`}
                    >
                      {playoffBracket.gameweek35_36.left.teams[1]}
                    </div>
                  </div>
                </div>

                {/* Center - Final */}
                <div className="flex flex-col">
                  <h3 className="text-xs font-semibold text-white mb-3 w-[200px] text-center">
                    FINAL
                  </h3>
                  <div className="flex flex-col mt-[30px]">
                    {playoffBracket.final.id && (
                      <div className="bg-slate-600 border-2 border-slate-500 rounded-t px-2 py-1 w-[200px] text-[8px] font-semibold text-white text-center">
                        {playoffBracket.final.id}
                      </div>
                    )}
                    <div
                      className={getFinalTeamCellStyle(
                        playoffBracket.final.teams[0],
                        !!playoffBracket.final.id
                      )}
                    >
                      {playoffBracket.final.teams[0]}
                    </div>
                    <div
                      className={`border-2 border-t-0 border-slate-600 rounded-b px-3 py-1.5 w-[200px] text-xs font-medium text-white text-center ${
                        isWildcard(playoffBracket.final.teams[1])
                          ? "bg-blue-900/30 border-blue-700/50"
                          : playoffBracket.final.teams[1] === "Gladidz" ||
                            playoffBracket.final.teams[1] === "GoonterPunch FC"
                          ? "bg-green-900/30 border-green-700/50"
                          : "bg-slate-700"
                      }`}
                    >
                      {playoffBracket.final.teams[1]}
                    </div>
                  </div>
                </div>

                {/* Right Side - Game Week 35 & 36 */}
                <div className="flex flex-col">
                  <h3 className="text-xs font-semibold text-white mb-3 w-[180px] text-center">
                    SEMI-FINALS
                  </h3>
                  <div className="flex flex-col mt-[30px]">
                    {playoffBracket.gameweek35_36.right.id && (
                      <div className="bg-slate-600 border border-slate-500 rounded-t px-2 py-1 w-[180px] text-[8px] font-semibold text-white text-center">
                        {playoffBracket.gameweek35_36.right.id}
                      </div>
                    )}
                    <div
                      className={getTeamCellStyle(
                        playoffBracket.gameweek35_36.right.teams[0],
                        !!playoffBracket.gameweek35_36.right.id
                      )}
                    >
                      {playoffBracket.gameweek35_36.right.teams[0]}
                    </div>
                    <div
                      className={`border border-t-0 border-slate-600 rounded-b px-3 py-1.5 w-[180px] text-xs font-medium text-white text-center ${
                        isWildcard(playoffBracket.gameweek35_36.right.teams[1])
                          ? "bg-blue-900/30 border-blue-700/50"
                          : playoffBracket.gameweek35_36.right.teams[1] ===
                              "Gladidz" ||
                            playoffBracket.gameweek35_36.right.teams[1] ===
                              "GoonterPunch FC"
                          ? "bg-green-900/30 border-green-700/50"
                          : "bg-slate-700"
                      }`}
                    >
                      {playoffBracket.gameweek35_36.right.teams[1]}
                    </div>
                  </div>
                </div>

                {/* Right Side - Game Week 33 & 34 */}
                <div className="flex flex-col">
                  <h3 className="text-xs font-semibold text-white mb-3 w-[180px] text-center">
                    QUARTER-FINALS
                  </h3>
                  <div className="flex flex-col mt-[30px]">
                    {playoffBracket.gameweek33_34.right.id && (
                      <div className="bg-slate-600 border border-slate-500 rounded-t px-2 py-1 w-[180px] text-[8px] font-semibold text-white text-center">
                        {playoffBracket.gameweek33_34.right.id}
                      </div>
                    )}
                    <div
                      className={getTeamCellStyle(
                        playoffBracket.gameweek33_34.right.teams[0],
                        !!playoffBracket.gameweek33_34.right.id
                      )}
                    >
                      {playoffBracket.gameweek33_34.right.teams[0]}
                    </div>
                    <div
                      className={`border border-t-0 border-slate-600 rounded-b px-3 py-1.5 w-[180px] text-xs font-medium text-white text-center ${
                        isWildcard(playoffBracket.gameweek33_34.right.teams[1])
                          ? "bg-blue-900/30 border-blue-700/50"
                          : playoffBracket.gameweek33_34.right.teams[1] ===
                              "Gladidz" ||
                            playoffBracket.gameweek33_34.right.teams[1] ===
                              "GoonterPunch FC"
                          ? "bg-green-900/30 border-green-700/50"
                          : "bg-slate-700"
                      }`}
                    >
                      {playoffBracket.gameweek33_34.right.teams[1]}
                    </div>
                  </div>
                </div>

                {/* Right Side - Game Week 31 & 32 */}
                <div className="flex flex-col">
                  <h3 className="text-xs font-semibold text-white mb-3 w-[180px] text-center">
                    ROUND OF 8
                  </h3>
                  <div className="flex flex-col gap-3">
                    {playoffBracket.gameweek31_32.right.map((match, index) => (
                      <div key={index} className="flex flex-col">
                        {match.id && (
                          <div className="bg-slate-600 border border-slate-500 rounded-t px-2 py-1 w-[180px] text-[8px] font-semibold text-white text-center">
                            {match.id}
                          </div>
                        )}
                        <div
                          className={getTeamCellStyle(
                            match.teams[0],
                            !!match.id
                          )}
                        >
                          {match.teams[0]}
                        </div>
                        <div
                          className={`border border-t-0 border-slate-600 rounded-b px-3 py-1.5 w-[180px] text-xs font-medium text-white text-center ${
                            isWildcard(match.teams[1])
                              ? "bg-blue-900/30 border-blue-700/50"
                              : match.teams[1] === "Gladidz" ||
                                match.teams[1] === "GoonterPunch FC"
                              ? "bg-green-900/30 border-green-700/50"
                              : "bg-slate-700"
                          }`}
                        >
                          {match.teams[1]}
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
          <section className="bg-slate-800 rounded-lg shadow-lg border border-slate-700 p-4 flex-1 text-[10px]">
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
                          <th className="text-right py-1.5 px-2 text-[10px] font-semibold text-slate-200 whitespace-nowrap min-w-[120px]">
                            HOME
                          </th>
                          <th className="text-center py-1.5 px-2 text-[10px] font-semibold text-slate-200 whitespace-nowrap min-w-[60px]">
                            RESULT
                          </th>
                          <th className="text-left py-1.5 px-2 text-[10px] font-semibold text-slate-200 whitespace-nowrap min-w-[120px]">
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
                              <td className="py-1.5 px-2 text-[10px] font-medium text-white whitespace-nowrap text-right min-w-[120px]">
                                {match.home}
                              </td>
                              <td className="py-1.5 px-2 text-center min-w-[60px]">
                                {hasScore && (
                                  <span className="text-[14px] font-bold text-white">
                                    {match.homeGoals} - {match.awayGoals}
                                  </span>
                                )}
                              </td>
                              <td className="py-1.5 px-2 text-[10px] font-medium text-white whitespace-nowrap text-left min-w-[120px]">
                                {match.away}
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
          <div className="flex flex-col gap-4 flex-shrink-0">
            {/* League Table */}
            <section className="bg-slate-800 rounded-lg shadow-lg border border-slate-700 p-4 flex-shrink-0">
              <h2 className="text-xl font-semibold text-white mb-3">
                League Table
              </h2>
              <div className="overflow-x-auto">
                <table className="border-collapse">
                  <thead>
                    <tr className="bg-slate-700 border-b-2 border-slate-600">
                      <th className="text-left py-2 px-2 text-[10px] font-semibold text-slate-200 whitespace-nowrap">
                        Pos
                      </th>
                      <th className="text-left py-2 px-2 text-[10px] font-semibold text-slate-200 whitespace-nowrap">
                        Team Name
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {leagueTable.length === 0 ? (
                      <tr>
                        <td
                          colSpan={2}
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
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Groups */}
            <section className="bg-slate-800 rounded-lg shadow-lg border border-slate-700 p-4 flex-shrink-0">
              <h2 className="text-xl font-semibold text-white mb-3">Groups</h2>
              <div className="flex flex-col gap-4">
                {(() => {
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
                  const wildcards = [...thirdPlaceTeams]
                    .sort((a, b) => {
                      if (b.pts !== a.pts) return (b.pts || 0) - (a.pts || 0);
                      return (b.gd || 0) - (a.gd || 0);
                    })
                    .slice(0, 2)
                    .map((team) => `${team.name}-${team.groupIndex}`);

                  return groups.map((group, groupIndex) => {
                    // Sort group by points (desc) then GD (desc)
                    const sortedGroup = [...group].sort((a, b) => {
                      if (b.pts !== a.pts) return (b.pts || 0) - (a.pts || 0);
                      return (b.gd || 0) - (a.gd || 0);
                    });

                    return (
                      <div
                        key={groupIndex}
                        className="border border-slate-600 rounded-lg p-3 bg-slate-700/30"
                      >
                        <h3 className="text-sm font-semibold text-slate-200 mb-2">
                          Group {String.fromCharCode(65 + groupIndex)}
                        </h3>
                        <div className="overflow-x-auto">
                          <table className="border-collapse">
                            <thead>
                              <tr className="bg-slate-700 border-b border-slate-600">
                                <th className="text-left py-2 px-2 text-[10px] font-semibold text-slate-200 whitespace-nowrap">
                                  Team
                                </th>
                                <th className="text-center py-2 px-2 text-[10px] font-semibold text-slate-200 whitespace-nowrap">
                                  Pts
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
                                const isQualified =
                                  position === 0 || position === 1; // 1st or 2nd
                                const isWildcard = wildcards.includes(
                                  `${team.name}-${groupIndex}`
                                );

                                let rowClass =
                                  "border-b border-slate-700 hover:bg-slate-700/50 transition-colors";

                                if (isQualified) {
                                  rowClass +=
                                    " bg-green-900/30 border-green-700/50";
                                } else if (isWildcard) {
                                  rowClass +=
                                    " bg-blue-900/30 border-blue-700/50";
                                }

                                return (
                                  <tr key={position} className={rowClass}>
                                    <td className="py-2 px-2 text-[10px] font-medium text-white whitespace-nowrap">
                                      {team.name}
                                    </td>
                                    <td className="py-2 px-2 text-[10px] text-center text-slate-300 whitespace-nowrap">
                                      {team.pts}
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
