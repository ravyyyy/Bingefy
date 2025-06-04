// src/components/ShowsPage.tsx

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import {
  getTVShowDetails,
  getEpisodeDetails,
  getSeasonDetails,
  type TVShow,
  type EpisodeDetail,
  type SeasonDetail,
} from "../services/tmdbClients";
import type { DocumentData } from "firebase/firestore";
import { getTVWatchProviders, type WatchProvidersResponse } from "../services/tmdbClients";
import { Calendar, Eye } from "lucide-react";

const POSTER_BASE_URL = "https://image.tmdb.org/t/p/w300";    // for card posters
const STILL_BASE_URL = "https://image.tmdb.org/t/p/original"; // for modal stills

// ─────────────────────────────────────────────────────────────────────────────
// Shape of a “watched” entry in Firestore
// ─────────────────────────────────────────────────────────────────────────────
interface WatchedEntry {
  season: number;
  episode: number;
  watchedAt: string; // ISO timestamp
}

// ─────────────────────────────────────────────────────────────────────────────
// Local interface for each episode to display
// ─────────────────────────────────────────────────────────────────────────────
interface EpisodeInfo {
  showId: number;
  showName: string;
  poster_path: string | null;
  season: number;
  episode: number;
  label: string;            // e.g. “S2 E3” or “Watched on 2025-01-15”
  episodeTitle: string;     // from getEpisodeDetails.name
  episodeOverview: string;  // from getEpisodeDetails.overview
  air_date: string;         // from EpisodeDetail.air_date (“YYYY-MM-DD”)
  still_path: string | null;// from EpisodeDetail.still_path
  vote_average: number;     // from EpisodeDetail.vote_average (0–10 scale)
}

const topTabBarHeight = 64; // must match your main menu height
const topNavStyles = {
  container: {
    position: "fixed" as const,
    top: 0,
    left: 0,
    width: "100%",
    height: `${topTabBarHeight}px`,
    backgroundColor: "#111",
    borderBottom: "1px solid #333",
    display: "flex",
    justifyContent: "space-around",
    alignItems: "center",
    zIndex: 10,
  },
  tab: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    color: "#888",
    backgroundColor: "transparent",
    border: "none",
    textDecoration: "none",
    fontSize: "14px",
    gap: "4px",
    width: "50%", // two tabs = 50% each
    height: "100%",
    transition: "color 0.2s",
  },
  activeTab: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    backgroundColor: "transparent",
    border: "none",
    textDecoration: "none",
    fontSize: "14px",
    gap: "4px",
    width: "50%",
    height: "100%",
    borderBottom: "3px solid #e50914",
    transition: "color 0.2s, border-bottom 0.2s",
  },
  label: {
    fontSize: "14px",
    fontWeight: 500,
  },
};

function formatPrettyDate(isoDateString: string): string {
  const dateObj = new Date(isoDateString);
  if (isNaN(dateObj.getTime())) return "Unknown";
  return dateObj.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Given an ISO date string (“YYYY-MM-DD”), return how many full days from today.
 * If it’s the same day, this returns 0. If it’s in the future, it returns 1, 2, …
 */
function daysUntil(isoDate: string): number {
  const today = new Date();
  // Zero out time so we compare just YYYY-MM-DD
  today.setHours(0, 0, 0, 0);
  const target = new Date(isoDate);
  target.setHours(0, 0, 0, 0);
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((target.getTime() - today.getTime()) / msPerDay);
}

// Helper: map a 0–10 vote_average to a hex‐color
function ratingColor(voteAverage: number): string {
  const pct = voteAverage * 10; // convert to 0–100 scale
  if (pct >= 80) {
    return "#28a745";   // bright green for “excellent” (≥ 8.0)
  } else if (pct >= 60) {
    return "#ffc107";   // amber/yellow for “good” (6.0–7.9)
  } else if (pct >= 40) {
    return "#fd7e14";   // orange for “okay” (4.0–5.9)
  } else {
    return "#dc3545";   // red for “poor” (< 4.0)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper #1: Deduplicate watched entries by keeping only the latest timestamp
// ─────────────────────────────────────────────────────────────────────────────
function dedupeWatchedEntries(entries: WatchedEntry[]): WatchedEntry[] {
  const map: Record<string, WatchedEntry> = {};
  for (const e of entries) {
    const key = `${e.season}|${e.episode}`;
    if (!map[key] || new Date(e.watchedAt) > new Date(map[key].watchedAt)) {
      map[key] = e;
    }
  }
  return Object.values(map);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper #2: Find the “very first unwatched episode” for a show.
// ─────────────────────────────────────────────────────────────────────────────
async function findFirstUnwatchedEpisode(
  showId: number,
  deduped: WatchedEntry[]
): Promise<{
  season: number;
  episode: number;
  episodeDetail: EpisodeDetail;
} | null> {
  const watchedSet = new Set<string>();
  for (const we of deduped) {
    watchedSet.add(`${we.season}|${we.episode}`);
  }

  const showDet = await getTVShowDetails(showId);
  const totalSeasons = showDet.number_of_seasons || 0;

  for (let seasonNum = 1; seasonNum <= totalSeasons; seasonNum++) {
    let seasonObj: SeasonDetail;
    try {
      seasonObj = await getSeasonDetails(showId, seasonNum);
    } catch {
      continue; // skip if TMDB 404s on this season
    }
    const episodesInThisSeason = seasonObj.episodes
      .map((ep) => ep.episode_number)
      .sort((a, b) => a - b);

    for (const epNum of episodesInThisSeason) {
      if (!watchedSet.has(`${seasonNum}|${epNum}`)) {
        const epDetail = await getEpisodeDetails(showId, seasonNum, epNum);
        return {
          season: seasonNum,
          episode: epNum,
          episodeDetail: epDetail,
        };
      }
    }
  }

  return null; // all watched
}

export default function ShowsPage() {
  const { user } = useAuth();

  // ─────────────────────────────────────────────────────────────
  // Which (day + show) groups are currently “open” (expanded)?
  // We’ll store keys like “Monday-12345” (weekday + showId).
  // ─────────────────────────────────────────────────────────────
  const [expandedUpcomingGroups, setExpandedUpcomingGroups] = useState<Set<string>>(
    new Set()
  );

  // Which Past‐groups are open?
  const [expandedPastGroups, setExpandedPastGroups] = useState<Set<string>>(new Set());

  // 0 = “Watch List” tab, 1 = “Upcoming” tab
  const [activeTab, setActiveTab] = useState<0 | 1>(0);

  // Array of show IDs the user selected during onboarding
  const [onboardedIds, setOnboardedIds] = useState<number[]>([]);

  // Mapping: showId → array of WatchedEntry
  const [episodesWatchedMap, setEpisodesWatchedMap] = useState<Record<number, WatchedEntry[]>>({});

  // Three lists for the “Watch List” tab
  const [watchNextList, setWatchNextList] = useState<EpisodeInfo[]>([]);
  const [watchedAWhileList, setWatchedAWhileList] = useState<EpisodeInfo[]>([]);
  const [notStartedList, setNotStartedList] = useState<EpisodeInfo[]>([]);

  // One list for the “Watched History” above Watch Next
  const [watchedHistory, setWatchedHistory] = useState<EpisodeInfo[]>([]);
  const [historyCount, setHistoryCount] = useState(5);
  const historyContainerRef = useRef<HTMLDivElement>(null);
  const prevHistoryHeightRef = useRef<number>(0);
  const [historyInitialized, setHistoryInitialized] = useState(false);

  // One list for the “Upcoming” tab
  const [upcomingList, setUpcomingList] = useState<EpisodeInfo[]>([]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Group upcomingList by weekday vs. “Later” so JSX can use it
  // ─────────────────────────────────────────────────────────────────────────────
  const groupedUpcoming: Record<string, EpisodeInfo[]> = {};
  if (upcomingList.length > 0) {
    const today = new Date();
    const oneWeekLater = new Date(today);
    oneWeekLater.setDate(today.getDate() + 7);

    for (const epi of upcomingList) {
      const epDate = new Date(epi.air_date);
      let header: string;
      if (epDate <= oneWeekLater) {
        header = epDate.toLocaleDateString(undefined, { weekday: "long" });
      } else {
        header = "Later";
      }
      if (!groupedUpcoming[header]) {
        groupedUpcoming[header] = [];
      }
      groupedUpcoming[header].push(epi);
    }
  }

  // ─────────── Required for modal functionality ───────────
  const [seasonEpisodes, setSeasonEpisodes] = useState<number[]>([]);
  const [modalProviders, setModalProviders] = useState<Array<{ provider_name: string; logo_path: string; provider_id: number }>>([]);
  const [modalProvidersLink, setModalProvidersLink] = useState<string>("");

  // Modal state: the episode clicked on (null = no modal open)
  const [modalEpisode, setModalEpisode] = useState<EpisodeInfo | null>(null);
  const [animatingIds, setAnimatingIds] = useState<Set<string>>(new Set());

  const [error, setError] = useState<string | null>(null);

  // ─────────────────────────────────────────────────────────────
  // Hold the user’s country code (derived from IP) in state
  // ─────────────────────────────────────────────────────────────
  const [geoCountry, setGeoCountry] = useState<string>("");

  // ─────────────────────────────────────────────────────────────
  // On mount: fetch geolocation (country code) based on IP
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch("https://ipwhois.app/json/");
        if (!resp.ok) throw new Error("Failed geo-IP lookup");
        const data: { country_code?: string } = await resp.json();
        if (data.country_code) {
          setGeoCountry(data.country_code.toUpperCase());
        }
      } catch (err) {
        console.warn("Could not determine geo-IP country:", err);
      }
    })();
  }, []);

// ─────────────────────────────────────────────────────────────
// Whenever `activeTab` changes, reset both tabs’ lazy-loading:
//   • if tab 0 (“Watch List”), reset watch-history & scroll so “Watch Next” is at top
//   • if tab 1 (“Upcoming”), reset pastCount to 5 and scrollTop = 0 (show the first of those 5)
// ─────────────────────────────────────────────────────────────
useEffect(() => {
  if (activeTab === 0) {
    setHistoryCount(5);
    setHistoryInitialized(false);

    if (scrollRef.current && historyContainerRef.current) {
      scrollRef.current.scrollTop = historyContainerRef.current.offsetHeight;
      lastScrollTop.current = scrollRef.current.scrollTop;
    }
  } else {
    setPastCount(5);
    setPastInitialized(false);

    // We no longer manually set scrollRef.current.scrollTop here.
    // A separate useLayoutEffect will handle scrolling “Upcoming” into view.
    lastScrollTop.current = 0;
  }
}, [activeTab]);

const upcomingContainerRef = useRef<HTMLDivElement>(null);
useLayoutEffect(() => {
  if (activeTab === 1 && upcomingContainerRef.current && scrollRef.current) {
    // This will make the top of the “Upcoming” block appear at the top
    // of the scrollable container
    upcomingContainerRef.current.scrollIntoView({ block: "start" });
  }
}, [activeTab, upcomingList]);

  // ─────────────────────────────────────────────────────────────
  // 1) Fetch “showsOnboarded” + “episodesWatched” from Firestore
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;

    (async () => {
      try {
        const userSnap = await getDoc(doc(db, "users", user.uid));
        const data = userSnap.data() as DocumentData | undefined;
        if (!data) {
          setOnboardedIds([]);
          setEpisodesWatchedMap({});
          return;
        }

        // showsOnboarded: array of show IDs
        const ids: number[] = Array.isArray(data.showsOnboarded)
          ? data.showsOnboarded
          : [];
        setOnboardedIds(ids);

        // episodesWatched: { showId: WatchedEntry[] }
        const rawWatched: Record<string, WatchedEntry[]> = data.episodesWatched || {};
        const watchedMap: Record<number, WatchedEntry[]> = {};
        Object.keys(rawWatched).forEach((key) => {
          watchedMap[Number(key)] = rawWatched[key];
        });
        setEpisodesWatchedMap(watchedMap);
      } catch (err) {
        console.error(err);
        setError("Failed to load your watch history.");
      }
    })();
  }, [user]);

  // ─────────────────────────────────────────────────────────────
  // 2) Build “Watch Next”, “Haven’t Watched For A While”, “Haven’t Started”
  //    whenever onboardedIds or episodesWatchedMap changes
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (onboardedIds.length === 0) {
      setWatchNextList([]);
      setWatchedAWhileList([]);
      setNotStartedList([]);
      return;
    }

    (async () => {
      try {
        const now = new Date();
        const thirtyDaysAgo = new Date(
          now.getTime() - 30 * 24 * 60 * 60 * 1000
        ).toISOString();

        const nextArr: EpisodeInfo[] = [];
        const aWhileArr: EpisodeInfo[] = [];
        const notStartedArr: EpisodeInfo[] = [];

        for (const showId of onboardedIds) {
          const rawEntries = episodesWatchedMap[showId] || [];
          const uniqueEntries = dedupeWatchedEntries(rawEntries);

          // If no watched entries, first unwatched is S1E1
          if (uniqueEntries.length === 0) {
            try {
              const epDet = await getEpisodeDetails(showId, 1, 1);
              const showDet = await getTVShowDetails(showId);
              notStartedArr.push({
                showId,
                showName: showDet.name,
                poster_path: showDet.poster_path,
                season: 1,
                episode: 1,
                label: "S1 E1",
                episodeTitle: epDet.name,
                episodeOverview: epDet.overview,
                air_date: epDet.air_date,
                still_path: epDet.still_path,
                vote_average: epDet.vote_average || 0,
              });
            } catch {
              // skip if S1E1 doesn’t exist
            }
            continue;
          }

          // Otherwise find first unwatched
          const firstUnwatched = await findFirstUnwatchedEpisode(
            showId,
            uniqueEntries
          );
          if (!firstUnwatched) {
            // all watched, skip
            continue;
          }

          const { season, episode, episodeDetail } = firstUnwatched;
          const showDet = await getTVShowDetails(showId);
          const epiLabel = `S${season} E${episode}`;

          // Determine if watched recently or long ago
          const latestWatched = uniqueEntries.sort(
            (a, b) =>
              new Date(b.watchedAt).getTime() - new Date(a.watchedAt).getTime()
          )[0];

          if (new Date(latestWatched.watchedAt) > new Date(thirtyDaysAgo)) {
            nextArr.push({
              showId,
              showName: showDet.name,
              poster_path: showDet.poster_path,
              season,
              episode,
              label: epiLabel,
              episodeTitle: episodeDetail.name,
              episodeOverview: episodeDetail.overview,
              air_date: episodeDetail.air_date,
              still_path: episodeDetail.still_path,
              vote_average: episodeDetail.vote_average || 0,
            });
          } else {
            aWhileArr.push({
              showId,
              showName: showDet.name,
              poster_path: showDet.poster_path,
              season,
              episode,
              label: epiLabel,
              episodeTitle: episodeDetail.name,
              episodeOverview: episodeDetail.overview,
              air_date: episodeDetail.air_date,
              still_path: episodeDetail.still_path,
              vote_average: episodeDetail.vote_average || 0,
            });
          }
        }

        setWatchNextList(nextArr);
        setWatchedAWhileList(aWhileArr);
        setNotStartedList(notStartedArr);
      } catch (err) {
        console.error(err);
        setError("Failed to build your watch categories.");
      }
    })();
  }, [onboardedIds, episodesWatchedMap]);

  // ─────────────────────────────────────────────────────────────
  // 3) Build “Upcoming” by iterating through your Watch List (onboardedIds)
  //    and pulling next_episode_to_air for each show. Only include
  //    episodes with air_date ≥ today. Show the poster in the card.
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (onboardedIds.length === 0) {
      setUpcomingList([]);
      return;
    }

    (async () => {
      try {
        // (1) Grab “today” in YYYY-MM-DD form
       const today = new Date().toISOString().split("T")[0];
       const upcomingEpisodes: EpisodeInfo[] = [];

       // (2) For each onboarded show, walk through every season → every episode
       await Promise.all(
         onboardedIds.map(async (showId) => {
           try {
             // Fetch show details to know how many seasons exist
             const showDet = await getTVShowDetails(showId);
             const totalSeasons = showDet.number_of_seasons || 0;

             // Loop through each season
             for (let seasonNum = 1; seasonNum <= totalSeasons; seasonNum++) {
               let seasonObj: SeasonDetail;
               try {
                 seasonObj = await getSeasonDetails(showId, seasonNum);
               } catch {
                 // Skip if TMDB returns 404 or missing season
                 continue;
               }

               // For each episode in that season, check if air_date ≥ today
               for (const ep of seasonObj.episodes) {
                 if (ep.air_date && ep.air_date >= today) {
                   // We have a future (or today’s) episode: fetch full details
                   try {
                     const epDet: EpisodeDetail = await getEpisodeDetails(
                       showId,
                       seasonNum,
                       ep.episode_number
                     );
                     upcomingEpisodes.push({
                       showId: showDet.id,
                       showName: showDet.name,
                       poster_path: showDet.poster_path,
                       season: seasonNum,
                       episode: ep.episode_number,
                       label: `S${seasonNum} E${ep.episode_number}`,
                       episodeTitle: epDet.name,
                       episodeOverview: epDet.overview,
                       air_date: epDet.air_date,
                       still_path: epDet.still_path,
                       vote_average: epDet.vote_average || 0,
                     });
                   } catch {
                     // Skip if getEpisodeDetails fails
                     continue;
                   }
                 }
               }
             }
           } catch {
             // Skip entire show if getTVShowDetails fails
           }
         })
       );

       // (3) Sort all future episodes by air_date ascending
       upcomingEpisodes.sort((a, b) => {
         return new Date(a.air_date).getTime() - new Date(b.air_date).getTime();
       });

       setUpcomingList(upcomingEpisodes);
      } catch (err) {
        console.error(err);
        setError("Failed to load upcoming episodes.");
      }
    })();
  }, [onboardedIds]);

  // ─────────────────────────────────────────────────────────────
  // 4) Build “Past Episodes” = all episodes with air_date < today,
  //    across every season of every show in your watch list.
  //    Sort by descending air_date. Lazy‐load 5 at a time,
  //    newest first, and greyed‐out like “Watch History.”
  // ─────────────────────────────────────────────────────────────
  const [pastEpisodes, setPastEpisodes] = useState<EpisodeInfo[]>([]);
  const [pastCount, setPastCount] = useState(5);

  // ───── UPDATED: add a ref to store the scrollTop before loading more ─────
  const prevScrollTopRef = useRef<number>(0);

  // Refs & state for scroll‐preserve in “Past Episodes”
  const pastContainerRef = useRef<HTMLDivElement>(null);
  const prevPastHeightRef = useRef<number>(0);
  const [pastInitialized, setPastInitialized] = useState(false);

  useEffect(() => {
    if (onboardedIds.length === 0) {
      setPastEpisodes([]);
      return;
    }

    (async () => {
      try {
        const today = new Date().toISOString().split("T")[0]; // “YYYY-MM-DD”
        const allPast: EpisodeInfo[] = [];

        await Promise.all(
          onboardedIds.map(async (showId) => {
            try {
              const showDet = await getTVShowDetails(showId);
              const totalSeasons = showDet.number_of_seasons || 0;

              for (let seasonNum = 1; seasonNum <= totalSeasons; seasonNum++) {
                let seasonObj: SeasonDetail;
                try {
                  seasonObj = await getSeasonDetails(showId, seasonNum);
                } catch {
                  continue;
                }
                for (const ep of seasonObj.episodes) {
                  // Only collect if air_date exists AND is before today
                  if (ep.air_date && ep.air_date < today) {
                    try {
                      const epDet: EpisodeDetail = await getEpisodeDetails(
                        showId,
                        seasonNum,
                        ep.episode_number
                      );
                      allPast.push({
                        showId,
                        showName: showDet.name,
                        poster_path: showDet.poster_path,
                        season: seasonNum,
                        episode: ep.episode_number,
                        label: `S${seasonNum} E${ep.episode_number}`,
                        episodeTitle: epDet.name,
                        episodeOverview: epDet.overview,
                        air_date: epDet.air_date,
                        still_path: epDet.still_path,
                        vote_average: epDet.vote_average || 0,
                      });
                    } catch {
                      // skip if getEpisodeDetails fails
                    }
                  }
                }
              }
            } catch {
              // skip this show if getTVShowDetails fails
            }
          })
        );

        // Sort in **DESCENDING** order by air_date (newest first)
        allPast.sort(
          (a, b) =>
            new Date(b.air_date).getTime() - new Date(a.air_date).getTime()
        );

        setPastEpisodes(allPast);
      } catch (err) {
        console.error("Failed to build past episodes:", err);
      }
    })();
  }, [onboardedIds]);

  // ─────────────────────────────────────────────────────────────
  // After “pastEpisodes” first populates & Tab 1 is active,
  // scroll down by pastContainerRef height so “Upcoming” is visible.
  // ─────────────────────────────────────────────────────────────
  const scrollRef = useRef<HTMLDivElement>(null);

  // ─────────────────────────────────────────────────────────────
  // When pastCount increases, preserve scroll position exactly
  // ─────────────────────────────────────────────────────────────
  useLayoutEffect(() => {
    if (
      pastInitialized &&
      pastContainerRef.current !== null &&
      scrollRef.current !== null
    ) {
      // Compute how much new height was added
      const newHeight = pastContainerRef.current.scrollHeight;
      const addedHeight = newHeight - prevPastHeightRef.current;

      // Restore exactly where the user was
      scrollRef.current.scrollTop = prevScrollTopRef.current + addedHeight;
    }
  }, [pastCount, pastInitialized]);

  // ────────────────────────────────────────────────────
  // Whenever `modalEpisode` or `geoCountry` changes, fetch providers
  // ────────────────────────────────────────────────────
  useEffect(() => {
    if (!modalEpisode) {
      setModalProviders([]);
      setModalProvidersLink("");
      return;
    }

    const fetchProviders = async () => {
      let countryCode: string | null = null;
      if (geoCountry && geoCountry.length === 2) {
        countryCode = geoCountry;
      } else {
        const lang = navigator.language || "";
        if (lang.includes("-")) {
          countryCode = lang.split("-")[1].toUpperCase();
        }
      }
      if (!countryCode) return;

      try {
        const data: WatchProvidersResponse = await getTVWatchProviders(
          modalEpisode.showId
        );
        const countryData = data.results[countryCode];
        if (!countryData) {
          setModalProviders([]);
          setModalProvidersLink("");
          return;
        }
        const flatrateList = countryData.flatrate || [];
        setModalProvidersLink(countryData.link);
        setModalProviders(
          flatrateList.map((p) => ({
            provider_id: p.provider_id,
            provider_name: p.provider_name,
            logo_path: p.logo_path,
          }))
        );
      } catch (err) {
        console.error("Error fetching watch providers:", err);
        setModalProviders([]);
        setModalProvidersLink("");
      }
    };

    fetchProviders();
  }, [modalEpisode, geoCountry]);

  // ─────────────────────────────────────────────────────────────
  // 5) Build “Watched History” list (sorted by watchedAt descending)
  //    whenever episodesWatchedMap changes
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const buildHistory = async () => {
      let entries: {
        showId: number;
        season: number;
        episode: number;
        watchedAt: string;
      }[] = [];

      Object.entries(episodesWatchedMap).forEach(([showId, watchArr]) => {
        watchArr.forEach((we) =>
          entries.push({
            showId: Number(showId),
            season: we.season,
            episode: we.episode,
            watchedAt: we.watchedAt,
          })
        );
      });

      entries.sort(
        (a, b) =>
          new Date(b.watchedAt).getTime() - new Date(a.watchedAt).getTime()
      );

      const result: EpisodeInfo[] = [];
      for (const { showId, season, episode, watchedAt } of entries) {
        try {
          const epDet: EpisodeDetail = await getEpisodeDetails(
            showId,
            season,
            episode
          );
          const showDet = await getTVShowDetails(showId);
          result.push({
            showId,
            showName: showDet.name,
            poster_path: showDet.poster_path,
            season,
            episode,
            label: `Watched ${watchedAt.split("T")[0]}`,
            episodeTitle: epDet.name,
            episodeOverview: epDet.overview,
            air_date: epDet.air_date,
            still_path: epDet.still_path,
            vote_average: epDet.vote_average || 0,
          });
        } catch {
          continue;
        }
      }

      setWatchedHistory(result);
    };

    buildHistory();
  }, [episodesWatchedMap]);

  // ─────────────────────────────────────────────────────────────
  // 6) Once “Watched History” first populates & Tab 0 is active,
  //    scroll down by historyContainerRef height so “Watch Next”
  //    sits at the top.
  // ─────────────────────────────────────────────────────────────
  const lastScrollTop = useRef(0);
  useEffect(() => {
    if (
      activeTab === 0 &&
      !historyInitialized &&
      historyContainerRef.current !== null &&
      scrollRef.current !== null
    ) {
      scrollRef.current.scrollTop = historyContainerRef.current.offsetHeight;
      setHistoryInitialized(true);
    }
  }, [watchedHistory, historyInitialized, activeTab]);

  useLayoutEffect(() => {
    if (
      historyContainerRef.current !== null &&
      scrollRef.current !== null &&
      prevHistoryHeightRef.current !== null &&
      historyCount <= 10
    ) {
      const newHeight = historyContainerRef.current.scrollHeight;
      const delta = newHeight - prevHistoryHeightRef.current;
      scrollRef.current.scrollTop += delta;
    }
  }, [historyCount]);

  /**
   * When user clicks “✔️” to mark this episode as watched:
   *   1) Append a new WatchedEntry to Firestore: episodesWatched.<showId>
   *   2) Update local state so UI re‐renders immediately
   */
  const markAsWatched = async (epi: EpisodeInfo) => {
    if (!user) return;
    const nowISO = new Date().toISOString();
    const userRef = doc(db, "users", user.uid);

    const existingArray = episodesWatchedMap[epi.showId] || [];
    const newEntry: WatchedEntry = {
      season: epi.season,
      episode: epi.episode,
      watchedAt: nowISO,
    };
    const updatedArray = [...existingArray, newEntry];

    try {
      await updateDoc(userRef, {
        [`episodesWatched.${epi.showId}`]: updatedArray,
      });
      setEpisodesWatchedMap((prev) => ({
        ...prev,
        [epi.showId]: updatedArray,
      }));

      // If modal is showing this episode, update its label
      setModalEpisode((prev) =>
        prev &&
        prev.showId === epi.showId &&
        prev.season === epi.season &&
        prev.episode === epi.episode
          ? { ...prev, label: `Watched on ${nowISO.split("T")[0]}` }
          : prev
      );
    } catch (err) {
      console.error(err);
      setError("Failed to mark episode as watched. Try again.");
    }
  };

  /**
   * When user clicks ✓ in the modal (if already watched), confirm they
   * want to “unwatch” and then remove from Firestore + local state.
   */
  const unmarkAsWatched = async (epi: EpisodeInfo) => {
    if (!user) return;
    const userRef = doc(db, "users", user.uid);

    const existingArray = episodesWatchedMap[epi.showId] || [];
    const updatedArray = existingArray.filter(
      (we) => !(we.season === epi.season && we.episode === epi.episode)
    );

    try {
      await updateDoc(userRef, {
        [`episodesWatched.${epi.showId}`]: updatedArray,
      });
      setEpisodesWatchedMap((prev) => ({
        ...prev,
        [epi.showId]: updatedArray,
      }));
    } catch (err) {
      console.error(err);
      setError("Failed to unwatch that episode. Try again.");
    }
  };

  // ─────────────────────────────────────────────────────────────
  // Helper: Render one “History” card (grayed out, ✓ to unwatch)
  // ─────────────────────────────────────────────────────────────
  const renderHistoryCard = (epi: EpisodeInfo) => {
    const epiKey = `hist-${epi.showId}-${epi.season}-${epi.episode}`;
    return (
      <div
        key={epiKey}
        style={{
          ...styles.epiCard,
          backgroundColor: "#2a2a2a", // greyed out
        }}
        onClick={() => setModalEpisode(epi)}
      >
        {epi.poster_path ? (
          <img
            src={`${POSTER_BASE_URL}${epi.poster_path}`}
            alt={epi.showName}
            style={styles.epiPoster}
          />
        ) : (
          <div style={styles.noImage}>No Image</div>
        )}

        <div style={styles.epiInfo}>
          <span style={{ ...styles.showName, color: "#bbb" }}>
            {epi.showName}
          </span>
          <span style={{ ...styles.epiLabel, color: "#aaa" }}>
            {epi.label}
          </span>
          {epi.episodeTitle && (
            <span style={{ ...styles.epiTitle, color: "#ccc" }}>
              {epi.episodeTitle}
            </span>
          )}
        </div>

        {/* green “✓” that lets you unwatch */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            const confirmUnwatch = window.confirm(
              "This episode is already marked as watched. Do you want to unwatch it?"
            );
            if (confirmUnwatch) {
              unmarkAsWatched(epi);
            }
          }}
          style={{
            ...styles.cardWatchBtn,
            backgroundColor: "#28a745",  // green
            color: "#fff",               // white checkmark
          }}
        >
          ✓
        </button>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────
  // Helper: render one episode card (Watch List categories)
  // ─────────────────────────────────────────────────────────────
  const renderEpisodeCard = (epi: EpisodeInfo) => {
    const epiKey = `${epi.showId}-${epi.season}-${epi.episode}`;
    const watchedEntries = episodesWatchedMap[epi.showId] || [];
    const isWatched = watchedEntries.some(
      (we) => we.season === epi.season && we.episode === epi.episode
    );
    const isAnimating = animatingIds.has(epiKey);

    return (
      <div
        key={epiKey}
        style={styles.epiCard}
        onClick={() => setModalEpisode(epi)}
      >
        {epi.poster_path ? (
          <img
            src={`${POSTER_BASE_URL}${epi.poster_path}`}
            alt={epi.showName}
            style={styles.epiPoster}
          />
        ) : (
          <div style={styles.noImage}>No Image</div>
        )}

        <div style={styles.epiInfo}>
          <span style={styles.showName}>{epi.showName}</span>
          <span style={styles.epiLabel}>{epi.label}</span>
          {epi.episodeTitle && (
            <span style={styles.epiTitle}>{epi.episodeTitle}</span>
          )}
          {epi.episodeOverview && (
            <p style={styles.epiOverview}>{epi.episodeOverview}</p>
          )}
        </div>

        {/* “✓” to mark watched (white → animate to green) */}
        <button
          onClick={(e) => {
            e.stopPropagation(); // don’t open modal if button clicked
            if (!isWatched && !isAnimating) {
              setAnimatingIds((prev) => {
                const copy = new Set(prev);
                copy.add(epiKey);
                return copy;
              });
              setTimeout(() => {
                markAsWatched(epi);
                setAnimatingIds((prev) => {
                  const copy = new Set(prev);
                  copy.delete(epiKey);
                  return copy;
                });
                setModalEpisode(null);
              }, 400);
            }
          }}
          style={{
            ...(isWatched
              ? styles.cardWatchedBadge
              : {
                  ...styles.cardWatchBtn,
                  backgroundColor: isAnimating ? "#28a745" : "#ffffff",
                  color: isAnimating ? "#ffffff" : "#000000",
                }),
          }}
        >
          {isWatched ? "✔️" : "✓"}
        </button>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────
  // Lazy‐load more “Past Episodes” when scrolling near the top
  // Also handle “Watched History” scroll near top
  // ─────────────────────────────────────────────────────────────
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const curr = target.scrollTop;

    // If we scroll up into the “Past Episodes” (i.e. curr < 50),
    // and there are more to show, bump pastCount by 5
    if (curr < 50 && lastScrollTop.current > curr) {
      if (pastCount < pastEpisodes.length) {
        if (pastContainerRef.current && scrollRef.current) {
          prevPastHeightRef.current = pastContainerRef.current.scrollHeight;
          // ─────────────────────────── UPDATED ───────────────────────────
          // Capture current scrollTop before new episodes get added:
          prevScrollTopRef.current = scrollRef.current.scrollTop;
          // ────────────────────────────────────────────────────────────────
        }
        setPastCount((prev) => prev + 5);
      }
      lastScrollTop.current = curr;
    }

    // Also handle “Watched History” lazy loading (as before)
    if (curr < 50 && lastScrollTop.current > curr) {
      if (historyCount < watchedHistory.length) {
        if (historyContainerRef.current) {
          prevHistoryHeightRef.current = historyContainerRef.current.scrollHeight;
        }
        setHistoryCount((prev) => prev + 5);
      }
    }

    lastScrollTop.current = curr;
  };

  // Weekday+Later order for rendering upcoming
  const WEEKDAY_ORDER = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
    "Later",
  ];

  return (
    <>
      {/* ───── Top “Watch List / Upcoming” bar ───── */}
      <nav style={topNavStyles.container}>
        <button
          onClick={() => setActiveTab(0)}
          style={activeTab === 0 ? topNavStyles.activeTab : topNavStyles.tab}
        >
          <span style={topNavStyles.label}>Watch List</span>
        </button>
        <button
          onClick={() => setActiveTab(1)}
          style={activeTab === 1 ? topNavStyles.activeTab : topNavStyles.tab}
        >
          <span style={topNavStyles.label}>Upcoming</span>
        </button>
      </nav>

      {/* ───── Content area ───── */}
      {/* Add paddingTop so content starts below the fixed top nav */}
      <div
        ref={scrollRef}
        className="scrollable"
        style={{
          ...styles.container,
          paddingTop: `${topTabBarHeight}px`,
          paddingBottom: "9rem",
        }}
        onScroll={handleScroll}
      >
        {/* ─ Error Banner ─ */}
        {error && <p style={styles.error}>{error}</p>}

        {/* ─────────── “Watch History” Section (tab 0) ─────────── */}
        {activeTab === 0 && watchedHistory.length > 0 && (
          <div ref={historyContainerRef} style={{ marginBottom: "1.5rem" }}>
            <div style={styles.sectionBadge}>
              <span style={styles.sectionBadgeText}>WATCH HISTORY</span>
            </div>
            {[...watchedHistory.slice(0, historyCount)]
              .reverse()
              .map((epi) => renderHistoryCard(epi))}
          </div>
        )}

        {/* ─────────── “Watch Next” Section ─────────── */}
        {activeTab === 0 && watchNextList.length > 0 && (
          <div style={styles.section}>
            <div style={styles.sectionBadge}>
              <span style={styles.sectionBadgeText}>WATCH NEXT</span>
            </div>
            {watchNextList.map((epi) => renderEpisodeCard(epi))}
          </div>
        )}

        {/* ─────────── “Haven’t Watched For A While” ─────────── */}
        {activeTab === 0 && watchedAWhileList.length > 0 && (
          <div style={styles.section}>
            <div style={styles.sectionBadge}>
              <span style={styles.sectionBadgeText}>HAVEN’T WATCHED FOR A WHILE</span>
            </div>
            {watchedAWhileList.map((epi) => renderEpisodeCard(epi))}
          </div>
        )}

        {/* ─────────── “Haven’t Started” ─────────── */}
        {activeTab === 0 && notStartedList.length > 0 && (
          <div style={styles.section}>
            <div style={styles.sectionBadge}>
              <span style={styles.sectionBadgeText}>HAVEN’T STARTED</span>
            </div>
            {notStartedList.map((epi) => renderEpisodeCard(epi))}
          </div>
        )}

        {/* If tab 0 is empty */}
        {activeTab === 0 &&
          watchNextList.length === 0 &&
          watchedAWhileList.length === 0 &&
          notStartedList.length === 0 && (
            <p style={styles.emptyText}>Your watch list is empty.</p>
          )}

        {/* ─────────── “Past Episodes” (lazy-loaded above Upcoming) ─────────── */}
        {activeTab === 1 && (
  <div style={{ marginBottom: "2rem" }}>
    {pastEpisodes.length === 0 ? (
      <p style={styles.emptyText}>No past episodes yet.</p>
    ) : (
      <div ref={pastContainerRef}>
        {(() => {
          // 1) Get the window of episodes to show (5 * pastCount), newest first, then reverse so oldest goes first in the DOM.
          const visibleWindow = pastEpisodes.slice(0, pastCount);
          const reversedWindow = [...visibleWindow].reverse();

          // 2) First-level grouping: by pretty-printed date
          const groupedByDate: Record<string, EpisodeInfo[]> = {};
          reversedWindow.forEach((epi) => {
            const dateLabel = formatPrettyDate(epi.air_date);
            if (!groupedByDate[dateLabel]) {
              groupedByDate[dateLabel] = [];
            }
            groupedByDate[dateLabel].push(epi);
          });

          // 3) Sort the date keys ascending (oldest date first).
          const dateKeysAsc = Object.keys(groupedByDate).sort((a, b) => {
            const da = new Date(a);
            const db = new Date(b);
            return da.getTime() - db.getTime();
          });

          return dateKeysAsc.map((dateLabel) => {
            // All episodes that aired on this date:
            const episodesOnThisDate = groupedByDate[dateLabel];

            // Second-level grouping: by showId within this date
            const byShow: Record<number, EpisodeInfo[]> = {};
            episodesOnThisDate.forEach((epi) => {
              if (!byShow[epi.showId]) byShow[epi.showId] = [];
              byShow[epi.showId].push(epi);
            });

            return (
              <div key={dateLabel} style={styles.section}>
                {/* The date badge at top */}
                <div style={styles.sectionBadge}>
                  <span style={styles.sectionBadgeText}>{dateLabel}</span>
                </div>

                {/*
                  For each show that has one or more episodes on this date,
                  render a “show-header” (collapsed by default) with the poster, name,
                  number of episodes, and a ▶/▾ arrow. Clicking it toggles the per-show episodes.
                */}
                {Object.entries(byShow).map(([showIdStr, episodesArr]) => {
                  const showId = Number(showIdStr);
                  // We’ll use the first episode to grab poster + showName + date
                  const firstEpi = episodesArr[0];

                  // Build a unique key that combines date + showId.
                  // We’ll keep which ones are open in expandedPastGroups.
                  const groupKey = `${dateLabel}-${showId}`;
                  const isOpen = expandedPastGroups.has(groupKey);

                  return (
                    <React.Fragment key={groupKey}>
                      {/*** Collapsed “show‐header” row ***/}
                      <div
                        style={{
                          ...styles.epiCard,
                          backgroundColor: "#2a2a2a",
                          padding: "1rem",
                          marginBottom: "0.25rem",
                          display: "flex",
                          alignItems: "center",
                          cursor: "pointer",
                        }}
                        onClick={() => {
                          const copy = new Set(expandedPastGroups);
                          if (isOpen) copy.delete(groupKey);
                          else copy.add(groupKey);
                          setExpandedPastGroups(copy);
                        }}
                      >
                        {/* Show the poster (small) */}
                        {firstEpi.poster_path ? (
                          <img
                            src={`${POSTER_BASE_URL}${firstEpi.poster_path}`}
                            alt={firstEpi.showName}
                            style={{
                              width: "60px",
                              height: "90px",
                              objectFit: "cover",
                              borderRadius: "4px",
                              marginRight: "1rem",
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              ...styles.noImage,
                              width: "60px",
                              height: "90px",
                              marginRight: "1rem",
                            }}
                          >
                            No Image
                          </div>
                        )}

                        <div style={{ flexGrow: 1, display: "flex", flexDirection: "column" }}>
                          <span style={{ ...styles.showName, color: "#bbb" }}>
                            {firstEpi.showName}
                          </span>
                          <span style={{ ...styles.epiLabel, color: "#aaa" }}>
                            {episodesArr.length} episode{episodesArr.length > 1 ? "s" : ""}
                          </span>
                        </div>

                        {/*** Expand/collapse arrow ***/}
                        <div style={{ fontSize: "1.2rem", color: "#888" }}>
                          {isOpen ? "▾" : "▸"}
                        </div>
                      </div>

                      {/*** If this show‐group is open, render each episode ***/}
                      {isOpen &&
                        // Sort by episode number ascending: 7, 8, 9, …
                 episodesArr
                   .sort((a, b) => a.episode - b.episode)
                   .map((epi) => {
                          const epiKey = `${epi.showId}-${epi.season}-${epi.episode}-past`;
                          return (
                            <div
                              key={epiKey}
                              style={{
                                ...styles.epiCard,
                                backgroundColor: "#222",
                                padding: "0.75rem",
                                marginBottom: "0.25rem",
                                marginLeft: "72px", // indent under the show‐header
                                display: "flex",
                                alignItems: "flex-start",
                                cursor: "pointer",
                              }}
                              onClick={() => setModalEpisode(epi)}
                            >
                              {/* Show episode still if available */}
         {epi.still_path ? (
           <img
             src={`${STILL_BASE_URL}${epi.still_path}`}
             alt={`${epi.showName} S${epi.season}E${epi.episode}`}
             style={{
               width: "60px",
               height: "90px",
               objectFit: "cover",
               borderRadius: "4px",
               marginRight: "0.75rem",
             }}
           />
         ) : (
           <div style={{ width: "60px", height: "90px", marginRight: "0.75rem" }} />
         )}

                              <div style={{ flexGrow: 1, display: "flex", flexDirection: "column" }}>
                                <span style={{ ...styles.epiLabel, color: "#ccc" }}>
                                  S{epi.season} | E{epi.episode}
                                </span>
                                {epi.episodeTitle && (
                                  <span style={{ ...styles.epiTitle, color: "#eee" }}>
                                    {epi.episodeTitle}
                                  </span>
                                )}
                                {epi.episodeOverview && (
                                  <p style={{ ...styles.epiOverview, color: "#aaa" }}>
                                    {epi.episodeOverview}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </React.Fragment>
                  );
                })}
              </div>
            );
          });
        })()}
      </div>
    )}
  </div>
)}

        {/* ─────────── “Upcoming” (under Past Episodes) ─────────── */}
        {activeTab === 1 && (
          <div ref={upcomingContainerRef}>
            {Object.keys(groupedUpcoming).length === 0 ? (
     <p style={styles.emptyText}>No upcoming episodes.</p>
   ) : (
     WEEKDAY_ORDER.map((day) => {
       const dayGroup = groupedUpcoming[day];
       if (!dayGroup || dayGroup.length === 0) return null;

       // ─── Step A: Group all episodes under this `day` by showId ───
       const byShow: Record<number, EpisodeInfo[]> = {};
       dayGroup.forEach((epi) => {
         if (!byShow[epi.showId]) byShow[epi.showId] = [];
         byShow[epi.showId].push(epi);
       });

       return (
         <div key={day} style={styles.section}>
           <div style={styles.sectionBadge}>
             <span style={styles.sectionBadgeText}>{day}</span>
           </div>

           {/*
             Step B: For each show that has ≥1 episode on this day,
             render a single “header row” that shows:
             - The show’s poster
             - The show name
             - “N episodes” (count of episodes in this group)
             - Days until air (they all share the same date, so we can use epi.air_date of the first)
             And an arrow to expand/collapse.
           */}
           {Object.entries(byShow).map(([showIdStr, episodesArr]) => {
             const showId = Number(showIdStr);
             // We’ll use the first EpisodeInfo just to grab poster + date + showName
             const firstEpi = episodesArr[0];

             // Build a unique key: `${day}-${showId}`. Will live in expandedUpcomingGroups.
             const groupKey = `${day}-${showId}`;
             const isOpen = expandedUpcomingGroups.has(groupKey);

             // Calculate “days until air” from that shared date:
             const daysLeft = daysUntil(firstEpi.air_date);

             return (
               <React.Fragment key={groupKey}>
                 {/*** Collapsed header for this show’s group ***/}
                 <div
                   style={{
                     ...styles.epiCard,
                     backgroundColor: "#181818",
                     padding: "1rem",
                     marginBottom: "0.25rem",
                     display: "flex",
                     alignItems: "center",
                     cursor: "pointer",
                   }}
                   onClick={() => {
                     const copy = new Set(expandedUpcomingGroups);
                     if (isOpen) copy.delete(groupKey);
                     else copy.add(groupKey);
                     setExpandedUpcomingGroups(copy);
                   }}
                 >
                   {/* Show the poster of the first episode as the group icon */}
                   {firstEpi.poster_path ? (
                     <img
                       src={`${POSTER_BASE_URL}${firstEpi.poster_path}`}
                       alt={firstEpi.showName}
                       style={{
                         width: "60px",
                         height: "90px",
                         objectFit: "cover",
                         borderRadius: "4px",
                         marginRight: "1rem",
                       }}
                     />
                   ) : (
                     <div style={{ ...styles.noImage, width: "60px", height: "90px" }}>
                       No Image
                     </div>
                   )}

                   <div style={{ flexGrow: 1, display: "flex", flexDirection: "column" }}>
                     <span style={styles.showName}>{firstEpi.showName}</span>
                     <span style={styles.epiLabel}>
                       {episodesArr.length} episode{episodesArr.length > 1 ? "s" : ""}
                     </span>
                   </div>

                   {/*** “Days left” badge on the right ***/}
                   <div
                     style={{
                       display: "flex",
                       flexDirection: "column",
                       alignItems: "flex-end",
                       marginRight: "1rem",
                     }}
                   >
                     <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "#fff" }}>
                       {daysLeft} DAYS
                     </span>
                     <span style={{ fontSize: "0.7rem", color: "#aaa" }}>until air</span>
                   </div>

                   {/*** Expand/collapse arrow ***/}
                   <div style={{ fontSize: "1.2rem", color: "#888" }}>
                     {isOpen ? "▾" : "▸"}
                   </div>
                 </div>

                 {/*** If open, render each episode individually ***/}
                 {isOpen &&
                   episodesArr.map((epi) => {
                     const epiKey = `${epi.showId}-${epi.season}-${epi.episode}-upcoming`;
                     const epiDays = daysUntil(epi.air_date);
                     return (
                       <div
                         key={epiKey}
                         style={{
                           ...styles.epiCard,
                           backgroundColor: "#202020",
                           padding: "0.75rem",
                           marginBottom: "0.25rem",
                           marginLeft: "72px", // indent under the group’s poster
                           display: "flex",
                           alignItems: "center",
                         }}
                         onClick={() => setModalEpisode(epi)}
                       >
                         {/* Show the episode's still if it exists (otherwise leave a blank placeholder) */}
       {epi.still_path ? (
         <img
           src={`${STILL_BASE_URL}${epi.still_path}`}
           alt={`${epi.showName} S${epi.season}E${epi.episode}`}
           style={{
             width: "60px",
             height: "90px",
             objectFit: "cover",
             borderRadius: "4px",
             marginRight: "0.75rem",
           }}
         />
       ) : (
         <div style={{ width: "60px", height: "90px", marginRight: "0.75rem" }} />
       )}

                         <div style={{ flexGrow: 1, display: "flex", flexDirection: "column" }}>
                           <span style={styles.epiLabel}>
                             S{epi.season} | E{epi.episode}
                           </span>
                           {epi.episodeTitle && (
                             <span style={styles.epiTitle}>{epi.episodeTitle}</span>
                           )}
                         </div>

                         {/*** “Days left” on the right ***/}
                         <span style={{ fontSize: "0.85rem", fontWeight: 500, color: "#fff" }}>
                           {epiDays} DAYS
                         </span>
                       </div>
                     );
                   })}
               </React.Fragment>
             );
           })}
         </div>
       );
     })
     
   )}
          </div>
        )}

        {/* ─────────── Modal / Popup ─────────── */}
        {modalEpisode && (
          <div
            style={styles.modalOverlay}
            onClick={() => setModalEpisode(null)}
          >
            {/* ─────────── Left Arrow (outside modalContent) ─────────── */}
            <button
              style={styles.modalArrowLeft}
              onClick={async (e) => {
                e.stopPropagation();
                if (!modalEpisode) return;

                const { showId, season, episode } = modalEpisode;
                let prevSeason = season;
                let prevEpisode = episode - 1;
                let prevEpDetail: EpisodeDetail | null = null;

                // 1) Try previous episode in same season
                if (prevEpisode >= 1) {
                  try {
                    prevEpDetail = await getEpisodeDetails(
                      showId,
                      prevSeason,
                      prevEpisode
                    );
                  } catch {
                    prevEpDetail = null;
                  }
                }
                // 2) If not found, try last episode of (season - 1)
                if (!prevEpDetail && season > 1) {
                  const candidateSeason = season - 1;
                  try {
                    const seasonInfo = await getSeasonDetails(
                      showId,
                      candidateSeason
                    );
                    const lastEpNum = Math.max(
                      ...seasonInfo.episodes.map((e) => e.episode_number)
                    );
                    prevSeason = candidateSeason;
                    prevEpisode = lastEpNum;
                    prevEpDetail = await getEpisodeDetails(
                      showId,
                      prevSeason,
                      prevEpisode
                    );
                  } catch {
                    prevEpDetail = null;
                  }
                }

                if (prevEpDetail) {
                  const showDet = await getTVShowDetails(showId);
                  setModalEpisode({
                    showId,
                    showName: showDet.name,
                    poster_path: showDet.poster_path,
                    season: prevSeason,
                    episode: prevEpisode,
                    label: `S${prevSeason} E${prevEpisode}`,
                    episodeTitle: prevEpDetail.name,
                    episodeOverview: prevEpDetail.overview,
                    air_date: prevEpDetail.air_date,
                    still_path: prevEpDetail.still_path,
                    vote_average: prevEpDetail.vote_average || 0,
                  });
                }
              }}
            >
              ◀
            </button>

            <div
              style={styles.modalContent}
              onClick={(e) => e.stopPropagation()}
            >
              {/* ─────────── Top‐Left “Back to Show” Button ─────────── */}
              <button
                style={styles.modalBackButton}
                onClick={() => {
                  window.location.href = "/shows";
                }}
              >
                ← Back to Show
              </button>

              {/* ─────────── Sliding‐Window Episode‐Indicator Dots Row ─────────── */}
              {(() => {
                const MAX_DOTS = 7;
                const total = seasonEpisodes.length;
                const currentEp = modalEpisode.episode;
                const idx = seasonEpisodes.indexOf(currentEp);

                if (idx === -1 || total === 0) {
                  return null;
                }

                const half = Math.floor(MAX_DOTS / 2);
                let start = Math.max(0, idx - half);
                let end = start + MAX_DOTS;
                if (end > total) {
                  end = total;
                  start = Math.max(0, end - MAX_DOTS);
                }

                const visibleDots = seasonEpisodes.slice(start, end);

                return (
                  <div style={styles.dotsContainer}>
                    {visibleDots.map((epNum: number) => {
                      const isActive = epNum === currentEp;
                      return (
                        <span
                          key={epNum}
                          style={isActive ? styles.activeDot : styles.dot}
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (epNum === currentEp) return;
                            try {
                              const epDetail = await getEpisodeDetails(
                                modalEpisode.showId,
                                modalEpisode.season,
                                epNum
                              );
                              const showDet = await getTVShowDetails(
                                modalEpisode.showId
                              );
                              setModalEpisode({
                                showId: modalEpisode.showId,
                                showName: showDet.name,
                                poster_path: showDet.poster_path,
                                season: modalEpisode.season,
                                episode: epNum,
                                label: `S${modalEpisode.season} E${epNum}`,
                                episodeTitle: epDetail.name,
                                episodeOverview: epDetail.overview,
                                air_date: epDetail.air_date,
                                still_path: epDetail.still_path,
                                vote_average: epDetail.vote_average || 0,
                              });
                            } catch (err) {
                              console.error(
                                "Failed to load selected episode:",
                                err
                              );
                            }
                          }}
                        />
                      );
                    })}
                  </div>
                );
              })()}

              {/* ─────────── Episode Banner Image + Overlay ─────────── */}
              <div style={styles.modalImageWrapper}>
                {modalEpisode.still_path ? (
                  <img
                    src={`${STILL_BASE_URL}${modalEpisode.still_path}`}
                    alt={modalEpisode.showName}
                    style={styles.modalStill}
                  />
                ) : (
                  <div style={styles.modalNoImage}>No Image</div>
                )}
                <div style={styles.modalOverlayText}>
                  <span style={styles.modalOverlaySE}>
                    S{modalEpisode.season} | E{modalEpisode.episode}
                  </span>
                  {modalEpisode.episodeTitle && (
                    <span style={styles.modalOverlayTitle}>
                      {modalEpisode.episodeTitle}
                    </span>
                  )}
                </div>
              </div>

              {/* ─────────── “Where to Watch” Section ─────────── */}
              <div style={styles.modalWhereToWatchSection}>
                <h3 style={styles.modalWhereToWatchHeader}>Where to watch</h3>
                {modalProviders.length > 0 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                    {modalProviders.map((prov) => {
                      let bgColor = "#222";
                      const name = prov.provider_name.toLowerCase();
                      if (name.includes("netflix")) {
                        bgColor = "#e50914";
                      } else if (name.includes("disney")) {
                        bgColor = "#0072d2";
                      } else if (name.includes("prime")) {
                        bgColor = "#00a8e1";
                      } else if (name.includes("hulu")) {
                        bgColor = "#1ce783";
                      } else if (name.includes("hbo")) {
                        bgColor = "#343434";
                      } else if (name.includes("crunchyroll")) {
                        bgColor = "#f27c00";
                      }
                      return (
                        <a
                          key={prov.provider_id}
                          href={modalProvidersLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            ...styles.modalProviderButton,
                            backgroundColor: bgColor,
                          }}
                        >
                          {prov.provider_name}
                        </a>
                      );
                    })}
                  </div>
                ) : (
                  <p style={{ color: "#aaa", fontSize: "14px" }}>
                    No streaming providers found in your region.
                  </p>
                )}
              </div>

              {/* ─────────── Episode Info Section ─────────── */}
              <div style={styles.modalInfo}>
                <div style={styles.modalAirRatingRow}>
                  <Calendar size={16} color="#bbb" style={{ marginRight: "-3px" }} />
                  <span style={styles.modalAirDateText}>
                    {modalEpisode.air_date
                      ? formatPrettyDate(modalEpisode.air_date)
                      : "Unknown"}
                  </span>
                  {(() => {
                    const watchedEntries =
                      episodesWatchedMap[modalEpisode.showId] || [];
                    const match = watchedEntries.find(
                      (we) =>
                        we.season === modalEpisode.season &&
                        we.episode === modalEpisode.episode
                    );
                    const eyeColor = match ? "#28a745" : "#ff6666";
                    return (
                      <>
                        <Eye
                          size={16}
                          color={eyeColor}
                          style={{ marginLeft: "0.5rem", marginRight: "1px" }}
                        />
                        <span
                          style={
                            match
                              ? { ...styles.notWatchedOrDate, color: "#28a745" }
                              : styles.notWatchedOrDate
                          }
                        >
                          {match
                            ? formatPrettyDate(match.watchedAt.split("T")[0])
                            : "Not watched"}
                        </span>
                      </>
                    );
                  })()}
                  <p
                    style={{
                      ...styles.modalRatingPercent,
                      color: ratingColor(modalEpisode.vote_average),
                      marginLeft: "2rem",
                    }}
                  >
                    {Math.round(modalEpisode.vote_average * 10)}%
                  </p>
                  {(() => {
                    const watchedEntries =
                      episodesWatchedMap[modalEpisode.showId] || [];
                    const isAlready = watchedEntries.some(
                      (we) =>
                        we.season === modalEpisode.season &&
                        we.episode === modalEpisode.episode
                    );
                    return (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!isAlready) {
                            markAsWatched(modalEpisode);
                          } else {
                            const confirmUnwatch = window.confirm(
                              "This episode is already marked as watched. Do you want to unwatch it?"
                            );
                            if (confirmUnwatch) {
                              unmarkAsWatched(modalEpisode);
                            }
                          }
                        }}
                        style={
                          isAlready
                            ? styles.modalWatchedBadge
                            : styles.modalWatchBtn
                        }
                      >
                        ✓
                      </button>
                    );
                  })()}
                </div>

                {modalEpisode.episodeOverview && (
                  <div style={styles.modalOverviewSection}>
                    <h4 style={styles.modalOverviewHeader}>Episode Info</h4>
                    <p style={styles.modalOverviewText}>
                      {modalEpisode.episodeOverview}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* ─────────── Right Arrow (outside modalContent) ─────────── */}
            <button
              style={styles.modalArrowRight}
              onClick={async (e) => {
                e.stopPropagation();
                if (!modalEpisode) return;

                const { showId, season, episode } = modalEpisode;
                let nextSeason = season;
                let nextEpisode = episode + 1;
                let nextEpDetail: EpisodeDetail | null = null;

                // 1) Try next episode in same season
                try {
                  nextEpDetail = await getEpisodeDetails(
                    showId,
                    nextSeason,
                    nextEpisode
                  );
                } catch {
                  nextEpDetail = null;
                }

                // 2) If not found, attempt “season+1, episode=1” (if exists)
                if (!nextEpDetail) {
                  const showDet = await getTVShowDetails(showId);
                  if (season < showDet.number_of_seasons) {
                    nextSeason = season + 1;
                    nextEpisode = 1;
                    try {
                      nextEpDetail = await getEpisodeDetails(
                        showId,
                        nextSeason,
                        nextEpisode
                      );
                    } catch {
                      nextEpDetail = null;
                    }
                  }
                }

                if (nextEpDetail) {
                  const showDet = await getTVShowDetails(showId);
                  setModalEpisode({
                    showId,
                    showName: showDet.name,
                    poster_path: showDet.poster_path,
                    season: nextSeason,
                    episode: nextEpisode,
                    label: `S${nextSeason} E${nextEpisode}`,
                    episodeTitle: nextEpDetail.name,
                    episodeOverview: nextEpDetail.overview,
                    air_date: nextEpDetail.air_date,
                    still_path: nextEpDetail.still_path,
                    vote_average: nextEpDetail.vote_average || 0,
                  });
                }
              }}
            >
              ▶
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: "1rem",
    color: "#fff",
    position: "relative",
  },
  tabContainer: {
    position: "sticky",
    top: 0,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "64px",
    backgroundColor: "#111",
    zIndex: 10,
  },
  tabInactive: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    color: "#888",
    textDecoration: "none",
    fontSize: "14px",
    gap: "4px",
    padding: "0 1rem",
    height: "100%",
    background: "none",
    border: "none",
    transition: "color 0.2s",
    cursor: "pointer",
  },
  tabActive: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    textDecoration: "none",
    fontSize: "14px",
    gap: "4px",
    padding: "0 1rem",
    height: "100%",
    background: "none",
    border: "none",
    borderBottom: "3px solid #e50914",
    transition: "color 0.2s, border-bottom 0.2s",
    cursor: "pointer",
  },
  tabButton: {
    background: "none",
    border: "none",
    color: "#fff",
    fontSize: "1rem",
    fontWeight: "bold",
    textTransform: "uppercase",
    padding: "0.5rem 1rem",
    cursor: "pointer",
    transition: "color 0.2s ease",
  },
  tabButtonActive: {
    color: "#e50914",
  },

  error: {
    color: "#ff4d4f",
    textAlign: "center",
    marginBottom: "1rem",
  },
  section: {
    marginBottom: "2rem",
  },

  sectionBadge: {
    position: "sticky",
    top: 0,
    display: "flex",
    justifyContent: "center",
    backgroundColor: "transparent",
    zIndex: 10,
    margin: "1rem 0 0.5rem 0",
    padding: 0,
  },
  sectionBadgeText: {
    backgroundColor: "#444444",
    color: "#ffffff",
    fontSize: "0.75rem",
    fontWeight: "bold",
    padding: "4px 12px",
    borderRadius: "999px",
    whiteSpace: "nowrap",
    border: "1px solid #666666",
    boxShadow: "0 2px 4px rgba(0,0,0,0.5)",
  },

  epiCard: {
    display: "flex",
    alignItems: "flex-start",
    backgroundColor: "#181818",
    borderRadius: "6px",
    padding: "0.5rem 3rem 0.5rem 0.5rem",
    marginBottom: "0.5rem",
    position: "relative",
  },
  showName: {
    fontSize: "1rem",
    fontWeight: "bold",
    marginBottom: "0.25rem",
  },
  epiLabel: {
    fontSize: "0.85rem",
    color: "#ccc",
    marginBottom: "0.25rem",
  },
  epiTitle: {
    fontSize: "0.9rem",
    color: "#fff",
    marginBottom: "0.25rem",
  },
  epiOverview: {
    fontSize: "0.8rem",
    color: "#ccc",
    lineHeight: 1.2,
  },
  emptyText: {
    textAlign: "center",
    color: "#888",
    marginTop: "2rem",
  },
  epiPoster: {
    width: "80px",
    height: "120px",
    objectFit: "cover",
    borderRadius: "4px",
    marginRight: "1rem",
  },
  noImage: {
    width: "80px",
    height: "120px",
    backgroundColor: "#333",
    borderRadius: "4px",
    marginRight: "1rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#888",
    fontSize: "0.75rem",
  },
  epiInfo: {
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    paddingRight: "80px",
  },

  // In-card watch button styles (used in both the list and in the modal):
    cardWatchBtn: {
    position: "absolute",
    top: "40px",      
    right: "46px",           
    backgroundColor: "#ffffff",
    border: "none",
    borderRadius: "50%",
    width: "56px",           
    height: "56px",          
    color: "#000000",
    fontSize: "1.2rem",      
    lineHeight: 1,
    cursor: "pointer",
    transition: "background-color 0.3s ease",
  },
  cardWatchedBadge: {
    position: "absolute",
    top: "40px",             
    right: "46px",
    backgroundColor: "#555",
    border: "none",
    borderRadius: "50%",
    width: "56px",           
    height: "56px",          
    color: "#fff",
    fontSize: "1.2rem",
    lineHeight: 1,
    cursor: "pointer",
  },

  // ─── NEW: “same look, but for inside the modal” ───
  modalWatchBtn: {
    position: "absolute",
    // push it a bit up/left compared to the in-card version:
    top: "8px",         // <-- adjust as needed
    right: "8px",       // <-- adjust as needed
    backgroundColor: "#ffffff",
    border: "none",
    borderRadius: "50%",
    width: "56px",
    height: "56px",
    color: "#000000",
    fontSize: "1.2rem",
    lineHeight: 1,
    cursor: "pointer",
    transition: "background-color 0.3s ease",
    zIndex: 5,          // make sure it floats above text
  },
  modalWatchedBadge: {
    position: "absolute",
    top: "8px",        // <-- same offset in modal for consistency
    right: "8px",
    backgroundColor: "#28a745", 
    border: "none",
    borderRadius: "50%",
    width: "56px",
    height: "56px",
    color: "#fff",
    fontSize: "1.2rem",
    lineHeight: 1,
    cursor: "pointer",
    zIndex: 5,
  },

  // Modal / Popup Styling
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100vw",
    height: "100vh",
    backgroundColor: "rgba(0,0,0,0.85)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
  },
  modalContent: {
    position: "relative",
    backgroundColor: "#121212",
    borderRadius: "8px",
    width: "90%",
    maxWidth: "600px",
    maxHeight: "90%",
    overflowY: "auto",
    boxSizing: "border-box",
  },

  // Back-to-Show Button (top-left)
  modalBackButton: {
    position: "absolute",
    top: "12px",
    left: "12px",
    backgroundColor: "rgba(0,0,0,0.5)",
    border: "none",
    color: "#fff",
    fontSize: "0.9rem",
    padding: "6px 10px",
    borderRadius: "4px",
    cursor: "pointer",
    zIndex: 2,
  },

  modalImageWrapper: {
    position: "relative",
    width: "100%",
    maxHeight: "300px",
    overflow: "hidden",
    borderTopLeftRadius: "8px",
    borderTopRightRadius: "8px",
  },
  modalStill: {
    width: "100%",
    height: "auto",
    display: "block",
  },
  modalOverlayText: {
    position: "absolute",
    bottom: "12px",
    left: "12px",
    color: "#fff",
    backgroundColor: "rgba(0,0,0,0.4)",
    padding: "6px 10px",
    borderRadius: "4px",
  },
  modalOverlaySE: {
    display: "block",
    fontSize: "1rem",
    fontWeight: "bold",
  },
  modalOverlayTitle: {
    display: "block",
    fontSize: "0.9rem",
    marginTop: "4px",
  },
  modalNoImage: {
    width: "100%",
    height: "300px",
    backgroundColor: "#333",
    borderRadius: "4px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#888",
    fontSize: "1rem",
  },

  // “Where to Watch” section in modal
  modalWhereToWatchSection: {
    padding: "1rem",
    borderTop: "1px solid #333",
    borderBottom: "1px solid #333",
    backgroundColor: "#181818",
    display: "flex",
    alignItems: "center",
    gap: "1rem",
  },
  modalWhereToWatchHeader: {
    color: "#fff",
    fontSize: "1rem",
    margin: 0,
  },
  modalNetflixButton: {
    backgroundColor: "#e50914",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    padding: "6px 12px",
    fontSize: "0.9rem",
    cursor: "pointer",
  },
  modalProviderButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0.5rem 1rem",
    backgroundColor: "#222",
    color: "#fff",
    textDecoration: "none",
    borderRadius: "4px",
    fontSize: "14px",
    minWidth: "100px",
    height: "40px",
    transition: "background-color 0.2s",
  },

  // Episode Info row in modal
  modalInfo: {
    display: "flex",
    flexDirection: "column",
    color: "#fff",
    padding: "1rem",
    paddingTop: "12px",
  },
  modalAirRatingRow: {
    display: "flex",
    alignItems: "center",
    gap: "1rem",
    marginBottom: "1rem",
    position: "relative",
  },
  modalAirDateText: {
    fontSize: "0.9rem",
    color: "#bbb",
    margin: 0,
  },
  notWatchedOrDate: {
    fontSize: "0.9rem",
    color: "#ff6666",
    margin: 0,
  },
  modalRatingPercent: {
    fontSize: "0.9rem",
    margin: 0,
  },

  // Episode Overview in modal
  modalOverviewSection: {
    padding: "1rem 1rem 2rem",
    backgroundColor: "#121212",
  },
  modalOverviewHeader: {
    margin: 0,
    fontSize: "1rem",
    fontWeight: "bold",
    color: "#fff",
    marginBottom: "0.5rem",
  },
  modalOverviewText: {
    margin: 0,
    fontSize: "0.9rem",
    lineHeight: 1.4,
    color: "#ddd",
  },

  // “Previous” Arrow in modal
  modalArrowLeft: {
    position: "absolute",
    top: "50%",
    left: "355px",               // adjust if needed
    transform: "translateY(-50%)",
    backgroundColor: "rgba(255,255,255,0.8)",
    border: "none",
    color: "#000",
    fontSize: "1.5rem",
    lineHeight: 1,
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    cursor: "pointer",
    zIndex: 3,
  },
  // “Next” Arrow in modal
  modalArrowRight: {
    position: "absolute",
    top: "50%",
    right: "355px",              // adjust if needed
    transform: "translateY(-50%)",
    backgroundColor: "rgba(255,255,255,0.8)",
    border: "none",
    color: "#000",
    fontSize: "1.5rem",
    lineHeight: 1,
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    cursor: "pointer",
    zIndex: 3,
  },
  // Episode‐Indicator Dots
  dotsContainer: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: "6px",
    padding: "8px 0",
    backgroundColor: "#000",
  },
  dot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    backgroundColor: "#555",
    cursor: "pointer",
  },
  activeDot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    backgroundColor: "#00C6FF",  // changed from "#fff"
    cursor: "pointer",
  },
};
