// src/components/ShowsPage.tsx

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import {
  getLatestTV,
  getTVShowDetails,
  getEpisodeDetails,
  getSeasonDetails,
  type TVShow,
  type EpisodeDetail,
  type SeasonDetail,
} from "../services/tmdbClients";
import type { DocumentData } from "firebase/firestore";
import { getTVWatchProviders, type WatchProvidersResponse } from "../services/tmdbClients";

const POSTER_BASE_URL = "https://image.tmdb.org/t/p/w300"; // larger size for episode stills
// small/w300 is fine for lists, but we want bigger for the modal
const STILL_BASE_URL = "https://image.tmdb.org/t/p/original";

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
  label: string;            // e.g. “S2 E3” or “Last seen S2 E3”
  episodeTitle: string;     // from getEpisodeDetails.name
  episodeOverview: string;  // from getEpisodeDetails.overview
  air_date: string;         // from EpisodeDetail.air_date
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
  },};

  function formatPrettyDate(isoDateString: string): string {
  // isoDateString is something like "2025-04-23".
  const dateObj = new Date(isoDateString);
  if (isNaN(dateObj.getTime())) return "Unknown";

  // Options: e.g. "Apr 23, 2025"
  return dateObj.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// Helper #1: Remove any duplicate (season,episode) and keep only the one
//            with the latest watchedAt timestamp. (Prevents “double counting.”)
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
//   • We fetch season details one season at a time (1 → 2 → 3 → …) until we
//     find a season where not every episode is in the watched set.
//   • Then we locate the smallest episode_number in that season which is not watched.
//   • If _every_ episode in _every_ season is already watched, return null.
// ─────────────────────────────────────────────────────────────────────────────
async function findFirstUnwatchedEpisode(
  showId: number,
  deduped: WatchedEntry[]
): Promise<{
  season: number;
  episode: number;
  episodeDetail: EpisodeDetail;
} | null> {
  // 1) Build a Set<string> of "S|E" for fast membership checks:
  const watchedSet = new Set<string>();
  for (const we of deduped) {
    watchedSet.add(`${we.season}|${we.episode}`);
  }

  // 2) Fetch show details to know how many seasons there are:
  const showDet = await getTVShowDetails(showId);
  const totalSeasons = showDet.number_of_seasons || 0;

  // 3) Iterate seasons 1 → totalSeasons:
  for (let seasonNum = 1; seasonNum <= totalSeasons; seasonNum++) {
    let seasonObj: SeasonDetail;
    try {
      seasonObj = await getSeasonDetails(showId, seasonNum);
    } catch {
      // If TMDB 404s on a season (rare), skip it:
      continue;
    }
    // 4) Build a sorted list of episode_numbers in that season:
    const episodesInThisSeason = seasonObj.episodes
      .map((ep) => ep.episode_number)
      .sort((a, b) => a - b);

    // 5) Walk through each epNum in ascending order. The first one missing from watchedSet is our answer:
    for (const epNum of episodesInThisSeason) {
      if (!watchedSet.has(`${seasonNum}|${epNum}`)) {
        // Found our first-unwatched in this season
        const epDetail = await getEpisodeDetails(showId, seasonNum, epNum);
        return {
          season: seasonNum,
          episode: epNum,
          episodeDetail: epDetail,
        };
      }
    }
    // If we get here, that entire season is fully watched. Move on to next season.
  }

  // 6) If we exit loop, every single season + episode is watched:
  return null;
}

export default function ShowsPage() {
  const { user } = useAuth();

  // 0 = “Watch List” tab, 1 = “Upcoming” tab
  const [activeTab, setActiveTab] = useState<0 | 1>(0);

  // Array of show IDs the user selected during onboarding
  const [onboardedIds, setOnboardedIds] = useState<number[]>([]);

  // Mapping: showId → array of WatchedEntry
  const [episodesWatchedMap, setEpisodesWatchedMap] = useState<
    Record<number, WatchedEntry[]>
  >({});

  // Three lists for the “Watch List” tab
  const [watchNextList, setWatchNextList] = useState<EpisodeInfo[]>([]);
  const [watchedAWhileList, setWatchedAWhileList] = useState<EpisodeInfo[]>([]);
  const [notStartedList, setNotStartedList] = useState<EpisodeInfo[]>([]);

  // One list for the “Watched History” above Watch Next
  const [watchedHistory, setWatchedHistory] = useState<EpisodeInfo[]>([]);
  const [historyCount, setHistoryCount] = useState(5);
  const [showHistory, setShowHistory] = useState(false);
  const lastScrollTop = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const historyContainerRef = useRef<HTMLDivElement>(null);
  const prevHistoryHeightRef = useRef<number>(0);
  const [historyInitialized, setHistoryInitialized] = useState(false);

   // ───── New: store watch‐provider data for the currently open show ─────
  const [modalProviders, setModalProviders] = useState<
    Array<{ provider_name: string; logo_path: string; provider_id: number }> 
  >([]);

  // Optionally, store the “link” (same for every provider) to the TMDB watch page for this show:
  const [modalProvidersLink, setModalProvidersLink] = useState<string>("");

    // ─────────────────────────────────────────────────────────────────────────────
  // Hold the user’s country code (derived from IP) in state
  // ─────────────────────────────────────────────────────────────────────────────
  const [geoCountry, setGeoCountry] = useState<string>("");

    // ─────────────────────────────────────────────────────────────────────────────
  // On mount: fetch geolocation (country code) based on IP
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch("https://ipapi.co/json/");
        if (!resp.ok) throw new Error("Failed geo-IP lookup");
        const data: { country_code?: string } = await resp.json();
        if (data.country_code) {
          setGeoCountry(data.country_code.toUpperCase());
        }
      } catch (err) {
        console.warn("Could not determine geo-IP country:", err);
        // If it fails, geoCountry remains ""
      }
    })();
  }, []);

  useEffect(() => {
  // Whenever we switch _into_ the “Watch List” tab (activeTab === 0),
  // restore historyCount → 5 and historyInitialized → false so that
  // it “feels fresh” exactly as on first load.
  if (activeTab === 0) {
    setHistoryCount(5);
    setHistoryInitialized(false);
  }
}, [activeTab]);



  // One list for the “Upcoming” tab
  const [upcomingList, setUpcomingList] = useState<EpisodeInfo[]>([]);

  // Modal state: the episode clicked on (null = no modal open)
  const [modalEpisode, setModalEpisode] = useState<EpisodeInfo | null>(null);
  const [animatingIds, setAnimatingIds] = useState<Set<string>>(new Set());

  const [error, setError] = useState<string | null>(null);

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
        const rawWatched: Record<string, WatchedEntry[]> =
          data.episodesWatched || {};
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

        // Temporary holders for each category
        const nextArr: EpisodeInfo[] = [];
        const aWhileArr: EpisodeInfo[] = [];
        const notStartedArr: EpisodeInfo[] = [];

        // 1) For each showId, figure out the “first unwatched” via our helper
        for (const showId of onboardedIds) {
          const rawEntries = episodesWatchedMap[showId] || [];
          // Deduplicate on (season,episode) keeping only the latest watchedAt:
          const uniqueEntries = dedupeWatchedEntries(rawEntries);

          // If there are NO watched entries at all, we immediately know “first unwatched” = S1E1:
          if (uniqueEntries.length === 0) {
            // Fetch details for S1 E1 to fill everything in:
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
              // If TMDB says S1E1 doesn’t exist (rare), skip entirely.
            }
            continue;
          }

          // Otherwise, at least one watched entry exists.  Find the first truly unwatched:
          const firstUnwatched = await findFirstUnwatchedEpisode(
            showId,
            uniqueEntries
          );

          // If null → every episode in every season is already watched → skip this show entirely.
          if (firstUnwatched === null) {
            continue;
          }

          // We do have a “next candidate”:
          const { season, episode, episodeDetail } = firstUnwatched;
          const showDet = await getTVShowDetails(showId);
          const epiLabel = `S${season} E${episode}`;

          // We still need to categorize into NEXT vs. AWHILE:
          //   – Grab the single “most recent watched” timestamp:
          const latestWatched = uniqueEntries.sort(
            (a, b) =>
              new Date(b.watchedAt).getTime() -
              new Date(a.watchedAt).getTime()
          )[0];

          if (new Date(latestWatched.watchedAt) > new Date(thirtyDaysAgo)) {
            // “Watched within last 30 days” → put into WATCH NEXT
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
            // “More than 30 days ago” → put into “HAVEN’T WATCHED FOR A WHILE”
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

        // 2) Finally, set our state arrays:
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
  // 3) Build “Upcoming” using TMDB’s discover TV (sorted desc)
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (onboardedIds.length === 0) {
      setUpcomingList([]);
      return;
    }

    (async () => {
      try {
        const latestResp = await getLatestTV(1);
        const today = new Date().toISOString().split("T")[0];

        // Filter: user’s picks whose first_air_date > today
        const filtered: TVShow[] = latestResp.results.filter(
          (show) =>
            onboardedIds.includes(show.id) && show.first_air_date > today
        );

        const upcomingEpisodes: EpisodeInfo[] = [];
        await Promise.all(
          filtered.map(async (show) => {
            const det = await getTVShowDetails(show.id);
            const ne = det.next_episode_to_air;
            if (ne) {
              let epTitle = "";
              let epOverview = "";
              let epAirDate = "";
              let epStill: string | null = null;
              let epVote = 0;
              try {
                const epDet: EpisodeDetail = await getEpisodeDetails(
                  show.id,
                  ne.season_number,
                  ne.episode_number
                );
                epTitle = epDet.name;
                epOverview = epDet.overview;
                epAirDate = epDet.air_date;
                epStill = epDet.still_path;
                epVote = epDet.vote_average || 0;
              } catch {
                // leave blank if not found
              }
              upcomingEpisodes.push({
                showId: show.id,
                showName: show.name,
                poster_path: show.poster_path,
                season: ne.season_number,
                episode: ne.episode_number,
                label: `S${ne.season_number} E${ne.episode_number}`,
                episodeTitle: epTitle,
                episodeOverview: epOverview,
                air_date: epAirDate,
                still_path: epStill,
                vote_average: epVote,
              });
            }
          })
        );
        setUpcomingList(upcomingEpisodes);
      } catch (err) {
        console.error(err);
        setError("Failed to load upcoming episodes.");
      }
    })();
  }, [onboardedIds]);

    // ────── Whenever `modalEpisode` or `geoCountry` changes, fetch providers ──────
  useEffect(() => {
    if (!modalEpisode) {
      setModalProviders([]);
      setModalProvidersLink("");
      return;
    }

    (async () => {
      try {
        // 1) Fetch the TMDB “where to watch” data for this show:
        const data: WatchProvidersResponse = await getTVWatchProviders(
          modalEpisode.showId
        );

        // ─── Determine countryCode dynamically ───
        let countryCode = "US"; // Default fallback

        // 2a) If geoCountry (from IP) is set, use that:
        if (geoCountry && geoCountry.length === 2) {
          countryCode = geoCountry;
        } else {
          // 2b) Otherwise, derive from browser locale, e.g. "en-RO" → "RO"
          try {
            const lang = navigator.language || "";
            if (lang.includes("-")) {
              countryCode = lang.split("-")[1].toUpperCase();
            }
          } catch {
            // keep "US"
          }
        }

        // 3) Look up that region inside TMDB’s response:
        const countryData = data.results[countryCode];
        if (!countryData) {
          // No providers for this region → clear state
          setModalProviders([]);
          setModalProvidersLink("");
          return;
        }

        // 4) Grab “flatrate” (subscription) list:
        const flatrateList = countryData.flatrate || [];

        // 5) Save TMDB’s universal “where to watch” link:
        setModalProvidersLink(countryData.link);

        // 6) Map only the fields we need:
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
    })();
  }, [modalEpisode, geoCountry]);

  // ─────────────────────────────────────────────────────────────
// 4) Build “Watched History” list (sorted by watchedAt descending)
//    whenever episodesWatchedMap changes
// ─────────────────────────────────────────────────────────────
useEffect(() => {
  const buildHistory = async () => {
    // 1) Flatten all watched entries into one array
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

    // 2) Sort descending by watchedAt
    entries.sort(
      (a, b) =>
        new Date(b.watchedAt).getTime() - new Date(a.watchedAt).getTime()
    );

    // 3) Fetch details for each entry & build EpisodeInfo objects
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
// 5) Once the watchedHistory array is populated, scroll down
//    by its container’s height so “Watch Next” sits at top.
// ─────────────────────────────────────────────────────────────
useEffect(() => {
  if (
    !historyInitialized &&
    historyContainerRef.current !== null &&
    scrollRef.current !== null
  ) {
    // push scroll down by the height of the history container
    scrollRef.current.scrollTop = historyContainerRef.current.offsetHeight;
    setHistoryInitialized(true);
  }
}, [watchedHistory, historyInitialized]);

useLayoutEffect(() => {
  // As soon as historyCount grows, measure how much taller the history
  // container became and shift scrollTop downward by that delta.
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

      // If modal is currently showing THIS episode, update its label:
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
   * When user clicks the ✓ in the modal (if already watched), confirm they
   * want to “unwatch” and then remove from Firestore + local state:
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
// Helper: render one “History” card (grayed out, ✓ already watched)
// ─────────────────────────────────────────────────────────────
const renderHistoryCard = (epi: EpisodeInfo) => {
  const epiKey = `hist-${epi.showId}-${epi.season}-${epi.episode}`;
  return (
    <div
      key={epiKey}
      style={{
        ...styles.epiCard,
        backgroundColor: "#2a2a2a",
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
          ...styles.cardWatchBtn,      // same base as “mark as watched”
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
  // Helper: render the card for one episode in the scroll list
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

  return (
       <>
     {/* ───── Top “Watch List / Upcoming” bar ───── */}
     <nav style={topNavStyles.container}>
       <button
         onClick={() => setActiveTab(0)}
         style={
           activeTab === 0
             ? topNavStyles.activeTab
             : topNavStyles.tab
         }
       >
         {/* (optional: add an icon to match main menu style) */}
         <span style={topNavStyles.label}>Watch List</span>
       </button>
       <button
         onClick={() => setActiveTab(1)}
         style={
           activeTab === 1
             ? topNavStyles.activeTab
             : topNavStyles.tab
         }
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
         paddingBottom: "9rem", // unchanged from before
       }}
       onScroll={(e) => {
  const target = e.target as HTMLElement;
  const curr = target.scrollTop;

  // If we scrolled up into the top 50px and still have more history to show…
  if (curr < 50 && lastScrollTop.current > curr) {
    if (historyCount < watchedHistory.length) {
      // 1) Record how tall the “history” container is *right now*:
      if (historyContainerRef.current) {
        prevHistoryHeightRef.current = historyContainerRef.current.scrollHeight;
      }

      // 2) Now bump the count by 5. After React re-renders,
      //    useLayoutEffect (below) will shift the scroll by the right delta.
      setHistoryCount((prev) => prev + 5);
    }
  }

  lastScrollTop.current = curr;
}}
     >
       {/* ─ Tab Buttons for Watch List/Upcoming are now removed here because we moved them up */}
       {/* ─ Error Banner ─ */}
      {error && <p style={styles.error}>{error}</p>}

      {/* ─────────── “Watched History” Section (new) ─────────── */}
      {activeTab === 0 && watchedHistory.length > 0 && (
  <div
    ref={historyContainerRef}
    style={{ marginBottom: "1.5rem" }}
  >
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

      {/* ─────────── “Haven’t Watched For A While” Section ─────────── */}
      {activeTab === 0 && watchedAWhileList.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionBadge}>
            <span style={styles.sectionBadgeText}>HAVEN’T WATCHED FOR A WHILE</span>
          </div>
          {watchedAWhileList.map((epi) => renderEpisodeCard(epi))}
        </div>
      )}

      {/* ─────────── “Haven’t Started” Section ─────────── */}
      {activeTab === 0 && notStartedList.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionBadge}>
            <span style={styles.sectionBadgeText}>HAVEN’T STARTED</span>
          </div>
          {notStartedList.map((epi) => renderEpisodeCard(epi))}
        </div>
      )}

      {activeTab === 0 &&
        watchNextList.length === 0 &&
        watchedAWhileList.length === 0 &&
        notStartedList.length === 0 && (
          <p style={styles.emptyText}>Your watch list is empty.</p>
        )}

      {/* ─────────── “Upcoming” Tab ─────────── */}
      {activeTab === 1 && (
        <div style={styles.section}>
          <div style={styles.sectionHeader}>UPCOMING</div>
          {upcomingList.map((epi) => renderEpisodeCard(epi))}
          {upcomingList.length === 0 && (
            <p style={styles.emptyText}>No upcoming episodes.</p>
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

              // 1) Try (same season, episode−1):
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

              // 2) If not found, attempt “last episode of (season−1)”:
              if (!prevEpDetail && season > 1) {
                const candidateSeason = season - 1;
                try {
                  const seasonInfo = await getSeasonDetails(showId, candidateSeason);
                  // Find the maximum episode_number in that season
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

              // 3) If we found previous, open it in modal:
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
              {/* Overlay: Season/Episode + Title */}
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
      // Compute a brand color based on provider_name:
      let bgColor = "#222"; // default dark gray

      const name = prov.provider_name.toLowerCase();
      if (name.includes("netflix")) {
        bgColor = "#e50914";       // Netflix red
      } else if (name.includes("disney")) {
        bgColor = "#0072d2";       // Disney blue
      } else if (name.includes("prime")) {
        bgColor = "#00a8e1";       // Prime Video light-blue
      } else if (name.includes("hulu")) {
        bgColor = "#1ce783";       // Hulu green
      } else if (name.includes("hbo")) {
        bgColor = "#343434";       // HBO charcoal
      } else if (name.includes("crunchyroll")) {
        bgColor = "#f27c00";       // Crunchyroll orange
      }
      // (Add more cases here if needed.)

      return (
        <a
          key={prov.provider_id}
          href={modalProvidersLink}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            ...styles.modalProviderButton,
            backgroundColor: bgColor,
            // Remove backgroundImage entirely—no logos anymore
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
              {/* ─── Air Date / “Not watched”~“Watched on” / Rating / ✓ button ─── */}
              <div style={styles.modalAirRatingRow}>
  {/* ───── Calendar icon + pretty date ───── */}
  <span style={styles.modalIcon}>📅</span>
  <span style={styles.modalAirDateText}>
    {modalEpisode.air_date
      ? formatPrettyDate(modalEpisode.air_date)
      : "Unknown"}
  </span>

  {/* ───── Eye icon + watched status ───── */}
  {(() => {
    const watchedEntries = episodesWatchedMap[modalEpisode.showId] || [];
    const match = watchedEntries.find(
      (we) =>
        we.season === modalEpisode.season &&
        we.episode === modalEpisode.episode
    );
    if (match) {
      // Already watched → show eye icon + watched-on date
      return (
        <>
          <span style={styles.modalIcon}>👁️</span>
          <span style={styles.notWatchedOrDate}>
            {formatPrettyDate(match.watchedAt.split("T")[0])}
          </span>
        </>
      );
    } else {
      // Not watched yet → eye icon + “Not watched”
      return (
        <>
          <span style={styles.modalIcon}>👁️</span>
          <span style={styles.notWatchedOrDate}>Not watched</span>
        </>
      );
    }
  })()}

  {/* ───── Rating percentage ───── */}
  <p style={styles.modalRatingPercent}>
    {Math.round(modalEpisode.vote_average * 10)}%
  </p>

  {/* ───── “Mark as Watched” button (unchanged) ───── */}
  {(() => {
    const watchedEntries = episodesWatchedMap[modalEpisode.showId] || [];
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
            ? {
                ...styles.cardWatchBtn,
                backgroundColor: "#28a745",
                color: "#ffffff",
              }
            : styles.cardWatchBtn
        }
      >
        ✓
      </button>
    );
  })()}
</div>


              {/* Full Episode Overview */}
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

              // 1) Try (same season, episode+1):
              try {
                nextEpDetail = await getEpisodeDetails(
                  showId,
                  nextSeason,
                  nextEpisode
                );
              } catch {
                nextEpDetail = null;
              }

              // 2) If not found, attempt “season+1, episode=1” (provided it exists):
              if (!nextEpDetail) {
                const showDet = await getTVShowDetails(showId);
                if (season < showDet.number_of_seasons) {
                  // attempt next season’s first episode
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

              // 3) If we found next, open it in modal:
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
    /* Note: we no longer need overflow here, because scrolling is driven by .scrollable */
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
    // exactly like TabsLayout.tsx .tab
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
    // exactly like TabsLayout.tsx .activeTab
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
  padding: "0.5rem 1rem",        // match your other menu’s padding
  cursor: "pointer",
  transition: "color 0.2s ease",
},
tabButtonActive: {
  color: "#e50914",              // red text for the active tab
},

  error: {
    color: "#ff4d4f",
    textAlign: "center",
    marginBottom: "1rem",
  },
  section: {
    marginBottom: "2rem",
  },
  // New “badge” wrapper — positions the badge in the center and makes it sticky if you like:
  sectionBadge: {
    position: "sticky",
    top: 0,                          // sticks the badge to the top of the scroll container
    display: "flex",
    justifyContent: "center",
    backgroundColor: "transparent",  // let the badge’s <span> handle its own background
    zIndex: 10,
    margin: "1rem 0 0.5rem 0",       // space above/below each badge
    padding: 0,
  },

  // The pill-shaped background (dark gray) with white text, centered:
  sectionBadgeText: {
    backgroundColor: "#444444",  // dark gray
    color: "#ffffff",
    fontSize: "0.75rem",
    fontWeight: "bold",
    padding: "4px 12px",        
    borderRadius: "999px",       // fully rounded pill shape
    whiteSpace: "nowrap",        // prevent wrapping
    border: "1px solid #666666",
    boxShadow: "0 2px 4px rgba(0,0,0,0.5)",
  },
  epiCard: {
    display: "flex",
    alignItems: "flex-start",
    backgroundColor: "#181818",
    borderRadius: "6px",
    padding: "0.5rem",
    marginBottom: "0.5rem",
    cursor: "pointer",
    position: "relative",
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
  },
  epiOverview: {
    fontSize: "0.8rem",
    color: "#ccc",
    marginTop: "0.25rem",
    lineHeight: 1.2,
  },
  emptyText: {
    textAlign: "center",
    color: "#888",
    marginTop: "2rem",
  },

  // ────────────────────────────────────────────────────────────────────────────
  // In-card watch button styles (used in both the list and in the modal):
  // ────────────────────────────────────────────────────────────────────────────
  cardWatchBtn: {
    position: "absolute",
    top: "8px",
    right: "8px",
    backgroundColor: "#ffffff",
    border: "none",
    borderRadius: "50%",
    width: "28px",
    height: "28px",
    color: "#000000",
    fontSize: "1rem",
    lineHeight: 1,
    cursor: "pointer",
    transition: "background-color 0.3s ease",
  },
  cardWatchedBadge: {
    position: "absolute",
    top: "8px",
    right: "8px",
    backgroundColor: "#555",
    border: "none",
    borderRadius: "50%",
    width: "28px",
    height: "28px",
    color: "#fff",
    fontSize: "1rem",
    lineHeight: 1,
    cursor: "pointer",
  },

  // ────────────────────────────────────────────────────────────────────────────
  // Modal / Popup Styling
  // ────────────────────────────────────────────────────────────────────────────
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
    backgroundColor: "#121212",
    borderRadius: "8px",
    width: "90%",
    maxWidth: "600px",
    maxHeight: "90%",
    overflowY: "auto",
    position: "relative",
    boxSizing: "border-box",
  },

  // ────────────────────────────────────────────────────────────────────────────
  // Back-to-Show Button (top-left)
  // ────────────────────────────────────────────────────────────────────────────
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

  // ────────────────────────────────────────────────────────────────────────────
  // “Where to Watch” placeholder section inside modal
  // ────────────────────────────────────────────────────────────────────────────
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
    // ────────────────────────────────────────────────────────────────────────────
  // Provider‐button style (each streaming‐service “pill”)
  // ────────────────────────────────────────────────────────────────────────────
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
  backgroundRepeat: "no-repeat",
  backgroundPosition: "center left",
  backgroundSize: "24px 24px",
  paddingLeft: "14px",
  transition: "background-color 0.2s",
},



  // ────────────────────────────────────────────────────────────────────────────
  // Episode Info row: Air date / “Not watched” or watched date / Rating / ✓ button
  // ────────────────────────────────────────────────────────────────────────────
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
    gap: "0.75rem",
    marginBottom: "1rem",
    position: "relative",
  },
  // Style for the calendar/eye icons so they’re aligned and not too big:
  modalIcon: {
    fontSize: "1rem",      // same as your text, or adjust slightly (e.g. 1.1rem)
    lineHeight: 1,
  },

  // Air date text (same color as before, just no “Air Date:” prefix)
  modalAirDateText: {
    fontSize: "0.9rem",
    color: "#bbb",
    margin: 0,
  },

  // “Not watched” or watched date:
  notWatchedOrDate: {
    fontSize: "0.9rem",
    color: "#ff6666", // red if “Not watched”
    margin: 0,
  },
  modalAirDate: {
    fontSize: "0.9rem",
    color: "#bbb",
    margin: 0,
  },
  modalRatingPercent: {
    fontSize: "0.9rem",
    color: "#ffff00", // yellow/gold font for rating percentage
    margin: 0,
  },

  // ────────────────────────────────────────────────────────────────────────────
  // Episode Overview inside modal
  // ────────────────────────────────────────────────────────────────────────────
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

  // ────────────────────────────────────────────────────────────────────────────
  // “Previous” Arrow (left)
  // ────────────────────────────────────────────────────────────────────────────
  modalArrowLeft: {
    position: "absolute",
    top: "calc(50% - 20px)",
    left: "20px",
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

  // ────────────────────────────────────────────────────────────────────────────
  // “Next” Arrow (right)
  // ────────────────────────────────────────────────────────────────────────────
  modalArrowRight: {
    position: "absolute",
    top: "calc(50% - 20px)",
    right: "20px",
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
};
