import { DEMO_FIXTURE } from "./constants";
import type { Fixture, Team } from "./types";

export type WorldCupGroup = {
  letter: string;
  teams: Team[];
};

export const WORLDCUP_2026_VENUES = [
  "Estadio Azteca",
  "Estadio Akron",
  "Estadio BBVA",
  "BMO Field",
  "BC Place",
  "AT&T Stadium",
  "Mercedes-Benz Stadium",
  "Gillette Stadium",
  "Arrowhead Stadium",
  "SoFi Stadium",
  "Hard Rock Stadium",
  "MetLife Stadium",
  "Lincoln Financial Field",
  "Levi's Stadium",
  "Lumen Field",
  "NRG Stadium",
] as const;

type GroupSeed = {
  letter: string;
  teams: Array<{ name: string; fifaCode: string; confederation: string }>;
};

const GROUP_SEEDS: GroupSeed[] = [
  {
    letter: "A",
    teams: [
      { name: "Brazil", fifaCode: "BRA", confederation: "CONMEBOL" },
      { name: "Morocco", fifaCode: "MAR", confederation: "CAF" },
      { name: "Serbia", fifaCode: "SRB", confederation: "UEFA" },
      { name: "Cameroon", fifaCode: "CMR", confederation: "CAF" },
    ],
  },
  {
    letter: "B",
    teams: [
      { name: "Argentina", fifaCode: "ARG", confederation: "CONMEBOL" },
      { name: "Spain", fifaCode: "ESP", confederation: "UEFA" },
      { name: "Iran", fifaCode: "IRN", confederation: "AFC" },
      { name: "Senegal", fifaCode: "SEN", confederation: "CAF" },
    ],
  },
  {
    letter: "C",
    teams: [
      { name: "France", fifaCode: "FRA", confederation: "UEFA" },
      { name: "Netherlands", fifaCode: "NED", confederation: "UEFA" },
      { name: "Mexico", fifaCode: "MEX", confederation: "CONCACAF" },
      { name: "Tunisia", fifaCode: "TUN", confederation: "CAF" },
    ],
  },
  {
    letter: "D",
    teams: [
      { name: "United States", fifaCode: "USA", confederation: "CONCACAF" },
      { name: "Germany", fifaCode: "GER", confederation: "UEFA" },
      { name: "Japan", fifaCode: "JPN", confederation: "AFC" },
      { name: "Wales", fifaCode: "WAL", confederation: "UEFA" },
    ],
  },
  {
    letter: "E",
    teams: [
      { name: "England", fifaCode: "ENG", confederation: "UEFA" },
      { name: "Belgium", fifaCode: "BEL", confederation: "UEFA" },
      { name: "Australia", fifaCode: "AUS", confederation: "AFC" },
      { name: "Egypt", fifaCode: "EGY", confederation: "CAF" },
    ],
  },
  {
    letter: "F",
    teams: [
      { name: "Portugal", fifaCode: "POR", confederation: "UEFA" },
      { name: "Italy", fifaCode: "ITA", confederation: "UEFA" },
      { name: "South Korea", fifaCode: "KOR", confederation: "AFC" },
      { name: "Algeria", fifaCode: "ALG", confederation: "CAF" },
    ],
  },
  {
    letter: "G",
    teams: [
      { name: "Croatia", fifaCode: "CRO", confederation: "UEFA" },
      { name: "Uruguay", fifaCode: "URU", confederation: "CONMEBOL" },
      { name: "Poland", fifaCode: "POL", confederation: "UEFA" },
      { name: "Ivory Coast", fifaCode: "CIV", confederation: "CAF" },
    ],
  },
  {
    letter: "H",
    teams: [
      { name: "Switzerland", fifaCode: "SUI", confederation: "UEFA" },
      { name: "Denmark", fifaCode: "DEN", confederation: "UEFA" },
      { name: "Colombia", fifaCode: "COL", confederation: "CONMEBOL" },
      { name: "Nigeria", fifaCode: "NGA", confederation: "CAF" },
    ],
  },
  {
    letter: "I",
    teams: [
      { name: "Sweden", fifaCode: "SWE", confederation: "UEFA" },
      { name: "Ukraine", fifaCode: "UKR", confederation: "UEFA" },
      { name: "Türkiye", fifaCode: "TUR", confederation: "UEFA" },
      { name: "Chile", fifaCode: "CHI", confederation: "CONMEBOL" },
    ],
  },
  {
    letter: "J",
    teams: [
      { name: "Norway", fifaCode: "NOR", confederation: "UEFA" },
      { name: "Austria", fifaCode: "AUT", confederation: "UEFA" },
      { name: "Czechia", fifaCode: "CZE", confederation: "UEFA" },
      { name: "Ecuador", fifaCode: "ECU", confederation: "CONMEBOL" },
    ],
  },
  {
    letter: "K",
    teams: [
      { name: "Hungary", fifaCode: "HUN", confederation: "UEFA" },
      { name: "Romania", fifaCode: "ROU", confederation: "UEFA" },
      { name: "Greece", fifaCode: "GRE", confederation: "UEFA" },
      { name: "Scotland", fifaCode: "SCO", confederation: "UEFA" },
    ],
  },
  {
    letter: "L",
    teams: [
      { name: "Slovakia", fifaCode: "SVK", confederation: "UEFA" },
      { name: "Canada", fifaCode: "CAN", confederation: "CONCACAF" },
      { name: "Ghana", fifaCode: "GHA", confederation: "CAF" },
      { name: "Peru", fifaCode: "PER", confederation: "CONMEBOL" },
    ],
  },
];

const ROUND_ROBIN_PAIRINGS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [2, 3],
  [0, 2],
  [1, 3],
  [0, 3],
  [1, 2],
];

function teamId(team: { name: string; fifaCode: string }): string {
  const slug = team.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return `team-${slug}`;
}

function buildTeam(team: { name: string; fifaCode: string; confederation: string }): Team {
  return {
    id: teamId(team),
    name: team.name,
    fifaCode: team.fifaCode,
    confederation: team.confederation,
    qualifiedStatus: "qualified",
  };
}

export const WORLDCUP_2026_GROUPS: WorldCupGroup[] = GROUP_SEEDS.map((group) => ({
  letter: group.letter,
  teams: group.teams.map(buildTeam),
}));

export const WORLDCUP_2026_TEAMS: Team[] = WORLDCUP_2026_GROUPS.flatMap((group) => group.teams);

const GROUP_STAGE_START_UTC = Date.UTC(2026, 5, 11, 12, 0, 0);
const KICKOFF_INTERVAL_MS = 3 * 60 * 60 * 1000;

function venueForMatch(matchNumber: number): string {
  return WORLDCUP_2026_VENUES[(matchNumber - 1) % WORLDCUP_2026_VENUES.length] ?? WORLDCUP_2026_VENUES[0];
}

function defaultKickoff(matchNumber: number): string {
  return new Date(GROUP_STAGE_START_UTC + (matchNumber - 1) * KICKOFF_INTERVAL_MS).toISOString();
}

function buildFixture(input: {
  matchNumber: number;
  groupLetter: string;
  homeTeam: string;
  awayTeam: string;
}): Fixture {
  const id = `fixture:worldcup-2026-${input.matchNumber.toString().padStart(3, "0")}`;
  return {
    id,
    fifaMatchId: `worldcup-2026-${input.matchNumber.toString().padStart(3, "0")}`,
    matchNumber: input.matchNumber,
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    status: "scheduled",
    homeScore: 0,
    awayScore: 0,
    matchSecond: 0,
    displayClock: "Pre-match",
    venue: venueForMatch(input.matchNumber),
    kickoffAtUtc: defaultKickoff(input.matchNumber),
    dataQualityStatus: "verified",
  };
}

function buildGroupStageFixtures(): Fixture[] {
  const fixtures: Fixture[] = [];
  let matchNumber = 1;
  for (const group of WORLDCUP_2026_GROUPS) {
    const groupTeams = group.teams;
    for (const [homeIndex, awayIndex] of ROUND_ROBIN_PAIRINGS) {
      const home = groupTeams[homeIndex];
      const away = groupTeams[awayIndex];
      if (!home || !away) throw new Error(`Group ${group.letter} missing teams for pairing ${homeIndex}-${awayIndex}`);
      const fixture = buildFixture({
        matchNumber,
        groupLetter: group.letter,
        homeTeam: home.name,
        awayTeam: away.name,
      });
      if (matchNumber === DEMO_FIXTURE.matchNumber) {
        fixtures.push({ ...DEMO_FIXTURE });
      } else {
        fixtures.push(fixture);
      }
      matchNumber += 1;
    }
  }
  return fixtures;
}

export const WORLDCUP_2026_GROUP_STAGE_FIXTURES: Fixture[] = buildGroupStageFixtures();

export const WORLDCUP_2026_GROUP_STAGE_MATCH_COUNT = WORLDCUP_2026_GROUP_STAGE_FIXTURES.length;
