// src/components/ShowsPage.tsx

import React, { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import {
  getLatestTV,
  getTVShowDetails,
  getEpisodeDetails,      // ← newly added
  type TVShow,
  type EpisodeDetail,
} from "../services/tmdbClients";

const POSTER_BASE_URL = "https://image.tmdb.org/t/p/w200";

// Shape of a “watched” entry in Firestore
interface WatchedEntry {
  season: number;
  episode: number;
  watchedAt: string; // ISO timestamp
}

// Local interface for each episode to display
interface EpisodeInfo {
  showId: number;
  showName: string;
  poster_path: string | null;
  season: number;
  episode: number;
  label: string;           // e.g. “S2 E3” or “Last seen S2 E3”
  episodeTitle: string;    // Filled in from getEpisodeDetails.name
  episodeOverview: string; // Filled in from getEpisodeDetails.overview
}

export default function ShowsPage() {
  const { user } = useAuth();

  // 0 = Watch List, 1 = Upcoming
  const [activeTab, setActiveTab] = useState<0 | 1>(0);

  // IDs of shows chosen in onboarding (step 2)
  const [onboardedIds, setOnboardedIds] = useState<number[]>([]);

  // Map: showId → array of WatchedEntry
  const [episodesWatchedMap, setEpisodesWatchedMap] = useState<
    Record<number, WatchedEntry[]>
  >({});

  // Three lists for the Watch List tab
  const [watchNextList, setWatchNextList] = useState<EpisodeInfo[]>([]);
  const [watchedAWhileList, setWatchedAWhileList] = useState<EpisodeInfo[]>([]);
  const [notStartedList, setNotStartedList] = useState<EpisodeInfo[]>([]);

  // One list for the Upcoming tab
  const [upcomingList, setUpcomingList] = useState<EpisodeInfo[]>([]);

  const [error, setError] = useState<string | null>(null);

  // ─────────────────────────────────────────────────────────────
  // 1) Fetch “showsOnboarded” + “episodesWatched” from Firestore
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;

    (async () => {
      try {
        const userSnap = await getDoc(doc(db, "users", user.uid));
        const data = userSnap.data() ?? {};

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

        // Temporary arrays of EpisodeInfo (without episodeTitle/overview yet)
        const nextArr: EpisodeInfo[] = [];
        const aWhileArr: EpisodeInfo[] = [];
        const notStartedArr: EpisodeInfo[] = [];

        for (const showId of onboardedIds) {
          const watchedEntries = episodesWatchedMap[showId] || [];

          if (watchedEntries.length === 0) {
            // Never watched → “Haven’t Started”, Season 1 Episode 1
            notStartedArr.push({
              showId,
              showName: "",
              poster_path: null,
              season: 1,
              episode: 1,
              label: "S1 E1",
              episodeTitle: "",
              episodeOverview: "",
            });
            continue;
          }

          // Sort watched entries by watchedAt descending
          watchedEntries.sort(
            (a, b) =>
              new Date(b.watchedAt).getTime() - new Date(a.watchedAt).getTime()
          );
          const mostRecent = watchedEntries[0];
          const lastWatchedDate = mostRecent.watchedAt;
          const lastSeason = mostRecent.season;
          const lastEpisode = mostRecent.episode;

          if (lastWatchedDate > thirtyDaysAgo) {
            // Within 30 days → “Watch Next”
            nextArr.push({
              showId,
              showName: "",
              poster_path: null,
              season: lastSeason,
              episode: lastEpisode + 1,
              label: `S${lastSeason} E${lastEpisode + 1}`,
              episodeTitle: "",
              episodeOverview: "",
            });
          } else {
            // Outside 30 days → “Haven’t Watched For A While”
            aWhileArr.push({
              showId,
              showName: "",
              poster_path: null,
              season: lastSeason,
              episode: lastEpisode + 1,
              label: `Last seen S${lastSeason} E${lastEpisode}`,
              episodeTitle: "",
              episodeOverview: "",
            });
          }
        }

        // Combine all EpisodeInfo entries to batch‐fetch show + episode details
        const allEpisodes = [...nextArr, ...aWhileArr, ...notStartedArr];
        const uniqueShowIds = Array.from(
          new Set(allEpisodes.map((e) => e.showId))
        );
        const detailsMap: Record<number, TVShow> = {};

        // 2a) Fetch show details (to fill showName + poster_path)
        await Promise.all(
          uniqueShowIds.map(async (sid) => {
            const det = await getTVShowDetails(sid);
            detailsMap[sid] = det;
          })
        );

        // 2b) For each EpisodeInfo, fetch its episode details (to fill title + overview)
        await Promise.all(
          allEpisodes.map(async (epi) => {
            const det = detailsMap[epi.showId];
            epi.showName = det.name;
            epi.poster_path = det.poster_path;

            // Now fetch the actual episode’s name + overview
            // If the requested season/episode does not exist (e.g. user watched last season), the call may 404—catch that.
            try {
              const epDet: EpisodeDetail = await getEpisodeDetails(
                epi.showId,
                epi.season,
                epi.episode
              );
              epi.episodeTitle = epDet.name;
              epi.episodeOverview = epDet.overview;
            } catch {
              // If TMDB returns 404 (e.g. user tried to watch beyond last existing ep),
              // we’ll just leave title/overview empty.
              epi.episodeTitle = "";
              epi.episodeOverview = "";
            }
          })
        );

        // Split back into the three final lists
        const finalizedNext = allEpisodes.filter((epi) =>
          nextArr.some(
            (n) =>
              n.showId === epi.showId &&
              n.season === epi.season &&
              n.episode === epi.episode
          )
        );
        const finalizedAWhile = allEpisodes.filter((epi) =>
          aWhileArr.some(
            (a) =>
              a.showId === epi.showId &&
              a.season === epi.season &&
              a.episode === epi.episode
          )
        );
        const finalizedNotStarted = allEpisodes.filter((epi) =>
          notStartedArr.some(
            (n) =>
              n.showId === epi.showId &&
              n.season === epi.season &&
              n.episode === epi.episode
          )
        );

        setWatchNextList(finalizedNext);
        setWatchedAWhileList(finalizedAWhile);
        setNotStartedList(finalizedNotStarted);
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

        const filtered: TVShow[] = latestResp.results.filter(
          (show) =>
            onboardedIds.includes(show.id) &&
            show.first_air_date > today
        );

        const upcomingEpisodes: EpisodeInfo[] = [];
        await Promise.all(
          filtered.map(async (show) => {
            const det = await getTVShowDetails(show.id);
            const ne = det.next_episode_to_air;
            if (ne) {
              // Fetch episode details for that upcoming episode
              let epTitle = "";
              let epOverview = "";
              try {
                const epDet: EpisodeDetail = await getEpisodeDetails(
                  show.id,
                  ne.season_number,
                  ne.episode_number
                );
                epTitle = epDet.name;
                epOverview = epDet.overview;
              } catch {
                // If it 404s, just leave blank
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

  /**
   * When user clicks “Mark as Watched” on an EpisodeInfo:
   *  1) Append a new WatchedEntry to Firestore under episodesWatched.<showId>
   *  2) Update local state so the UI re‐renders immediately.
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
    } catch (err) {
      console.error(err);
      setError("Failed to mark episode as watched. Try again.");
    }
  };

  // Helper to render a single episode card, including title, overview, and “Mark as Watched”
  const renderEpisodeCard = (epi: EpisodeInfo, showMarkButton: boolean) => (
    <div
      key={`${epi.showId}-${epi.season}-${epi.episode}`}
      style={styles.epiCard}
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
      {showMarkButton && (
        <button onClick={() => markAsWatched(epi)} style={styles.markButton}>
          Mark as Watched
        </button>
      )}
    </div>
  );

  return (
    <div style={styles.container}>
      {/* Tab Buttons */}
      <div style={styles.tabContainer}>
        <button
          onClick={() => setActiveTab(0)}
          style={{
            ...styles.tabButton,
            borderBottom: activeTab === 0 ? "3px solid #e50914" : "none",
          }}
        >
          Watch List
        </button>
        <button
          onClick={() => setActiveTab(1)}
          style={{
            ...styles.tabButton,
            borderBottom: activeTab === 1 ? "3px solid #e50914" : "none",
          }}
        >
          Upcoming
        </button>
      </div>

      {error && <p style={styles.error}>{error}</p>}

      {/* ─────────── “Watch List” Tab ─────────── */}
      {activeTab === 0 && (
        <>
          {watchNextList.length > 0 && (
            <div style={styles.section}>
              <div style={styles.sectionHeader}>WATCH NEXT</div>
              {watchNextList.map((epi) => renderEpisodeCard(epi, true))}
            </div>
          )}

          {watchedAWhileList.length > 0 && (
            <div style={styles.section}>
              <div style={styles.sectionHeader}>
                HAVEN’T WATCHED FOR A WHILE
              </div>
              {watchedAWhileList.map((epi) =>
                renderEpisodeCard(epi, true)
              )}
            </div>
          )}

          {notStartedList.length > 0 && (
            <div style={styles.section}>
              <div style={styles.sectionHeader}>HAVEN’T STARTED</div>
              {notStartedList.map((epi) => renderEpisodeCard(epi, true))}
            </div>
          )}

          {watchNextList.length === 0 &&
            watchedAWhileList.length === 0 &&
            notStartedList.length === 0 && (
              <p style={styles.emptyText}>Your watch list is empty.</p>
            )}
        </>
      )}

      {/* ─────────── “Upcoming” Tab ─────────── */}
      {activeTab === 1 && (
        <div style={styles.section}>
          <div style={styles.sectionHeader}>UPCOMING</div>
          {upcomingList.map((epi) => renderEpisodeCard(epi, false))}
          {upcomingList.length === 0 && (
            <p style={styles.emptyText}>No upcoming episodes.</p>
          )}
        </div>
      )}
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: "1rem",
    color: "#fff",
  },
  tabContainer: {
    display: "flex",
    justifyContent: "center",
    gap: "1rem",
    marginBottom: "1rem",
  },
  tabButton: {
    background: "none",
    border: "none",
    color: "#fff",
    fontSize: "1rem",
    padding: "0.5rem 1rem",
    cursor: "pointer",
  },
  error: {
    color: "#ff4d4f",
    textAlign: "center",
    marginBottom: "1rem",
  },
  section: {
    marginBottom: "2rem",
  },
  sectionHeader: {
    fontSize: "0.85rem",
    fontWeight: "bold",
    color: "#888",
    marginBottom: "0.5rem",
  },
  epiCard: {
    display: "flex",
    alignItems: "flex-start",
    backgroundColor: "#181818",
    borderRadius: "4px",
    padding: "0.75rem",
    marginBottom: "0.5rem",
  },
  epiPoster: {
    width: "60px",
    height: "90px",
    objectFit: "cover",
    borderRadius: "4px",
    marginRight: "1rem",
  },
  noImage: {
    width: "60px",
    height: "90px",
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
    marginBottom: "0.5rem",
  },
  epiTitle: {
    fontSize: "0.95rem",
    marginBottom: "0.25rem",
    color: "#fff",
  },
  epiOverview: {
    fontSize: "0.85rem",
    color: "#ddd",
    marginBottom: "0.5rem",
  },
  markButton: {
    marginLeft: "auto",
    marginTop: "0.5rem",
    backgroundColor: "#e50914",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    padding: "0.5rem 0.75rem",
    cursor: "pointer",
  },
  emptyText: {
    textAlign: "center",
    color: "#888",
    marginTop: "2rem",
  },
};
