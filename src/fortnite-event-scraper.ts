import * as puppeteer from "puppeteer";
import { basename } from "path";

const USAGE = `
Usage: node ${basename(__filename)} [PLAYER]

Fetches data about all the events the player participated
in and prints them to standard output.
`.trim();

declare global {
  interface Window {
    qs(selector: string, parent?: ParentNode): Element;
    qsa(selector: string, parent?: ParentNode): Element[];
    sleep(ms: number): Promise<void>;
  }
}

declare function qs(selector: string, parent?: ParentNode): Element;
declare function qsa(selector: string, parent?: ParentNode): Element[];
declare function sleep(ms: number): Promise<void>;

type Setter<T> = (obj: T, val: string) => void;

interface Match {
  date: string;
  eliminations: number;
  placed: number;
}

interface SessionStats {
  rank: number;
  earnings: number;
  prPoints: number;
  eliminations: number;
  kd: number;
  pointsEarned: number;
  avgKills: number;
  avgPlacement: number;
  avgPoints: number;
}

interface Session {
  number: number;
  stats: SessionStats;
  numberOfMatches: number;
  matches: Match[];
}

interface EventStats {
  url: string;
  title: string;
  subtitle: string;
  sessions: Session[];
}

export async function getPlayerStats(
  playerName: string,
): Promise<EventStats[]> {
  const encodedName = encodeURIComponent(playerName);
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto(
    `https://fortnitetracker.com/profile/all/${encodedName}/events`,
  );

  await page.evaluate(() => {
    window.qs = (selector, parent = document) =>
      parent.querySelector(selector)!;
    window.qsa = (selector, parent = document) =>
      Array.from(parent.querySelectorAll(selector));

    window.sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  });

  const data = await page.evaluate(() => {
    const statToValue: Record<string, Setter<SessionStats>> = {
      Rank: (obj, val) => (obj.rank = Number(val.trim().slice(1))),
      Earnings: (obj, val) =>
        (obj.earnings = Number(val.replace(/,/g, "").slice(1))),
      "PR Points": (obj, val) => (obj.prPoints = Number(val.replace(/,/g, ""))),
      Eliminations: (obj, val) => (obj.eliminations = Number(val)),
      "K/D": (obj, val) => (obj.kd = Number(val.slice(1))),
      "Points Earned": (obj, val) => (obj.pointsEarned = Number(val)),
      "Avg. Kills": (obj, val) => (obj.avgKills = Number(val)),
      "Avg. Placement": (obj, val) => (obj.avgPlacement = Number(val)),
      "Avg. Points": (obj, val) => (obj.avgPoints = Number(val)),
    };

    const matchStatToValue: Record<string, Setter<Match>> = {
      Eliminations: (obj, val) => (obj.eliminations = Number(val)),
      Placed: (obj, val) => (obj.placed = parseInt(val, 10)),
    };

    return Promise.all(
      qsa(".fn-event-player").map(async ($player) => {
        const $event = qs(".fn-events__entry", $player) as HTMLAnchorElement;
        const url = $event.href;
        const title = qs(".fn-events__entry-title1", $event).textContent!;
        const subtitle = qs(".fn-events__entry-title2", $event).textContent!;

        const sessions = [];
        for (const $session of qsa(".fn-event-windows__entry", $player)) {
          $session.dispatchEvent(new MouseEvent("click"));
          await sleep(100);

          const number = Number(
            qs(".trn-card__header-title", $player).textContent?.split(" ")[1],
          );

          const numberOfMatches = Number(
            qs(".trn-card__header-subline", $player).textContent?.split(" ")[0],
          );

          let currentStat = "";
          const stats = qsa(
            ".fn-event-team__stat-name, .fn-event-team__stat-value",
            $player,
          ).reduce<SessionStats>((acc, $stat) => {
            if ($stat.matches(".fn-event-team__stat-name")) {
              currentStat = $stat.textContent!;
              return acc;
            }

            statToValue[currentStat](acc, $stat.textContent!);
            return acc;
          }, {} as SessionStats);

          const matches = [];
          for (const $match of qsa(".fn-event-team__session", $player)) {
            const date = qs(
              ".fn-event-team__session-date",
              $match,
            ).textContent!.split(",")[0];

            let currentStat = "";
            const matchStats = qsa(
              ".fn-event-team__session-stat__name, .fn-event-team__session-stat__value",
              $match,
            ).reduce<Match>((acc, $stat, i) => {
              if ($stat.matches(".fn-event-team__session-stat__name")) {
                currentStat = $stat.textContent!;
                return acc;
              }

              matchStatToValue[currentStat](acc, $stat.textContent!);
              return acc;
            }, {} as Match);

            matchStats.date = date;
            matches.push(matchStats);
          }

          sessions.push({ number, stats, numberOfMatches, matches });
        }

        return { url, title, subtitle, sessions };
      }),
    );
  });

  await browser.close();

  return data;
}

async function main() {
  if (process.argv.length !== 3) {
    console.error(USAGE);
    process.exit(1);
  }

  if (["-h", "--help"].includes(process.argv[2])) {
    console.log(USAGE);
    process.exit(0);
  }

  const player = process.argv[2];
  const data = await getPlayerStats(player);

  console.log(JSON.stringify(data, null, 2));
}

if (!module.parent) {
  main();
}
