// src/components/ShowsPage.tsx

import React, { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import {
  getLatestTV,
  getTVShowDetails,
  getEpisodeDetails,
  type TVShow,
  type EpisodeDetail,
} from "../services/tmdbClients";
import type { DocumentData } from "firebase/firestore";

const POSTER_BASE_URL = "https://image.tmdb.org/t/p/w300"; // larger size for episode stills

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

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Attempt to fetch a sibling episode (same season).
// Returns EpisodeDetail or null if TMDB returns 404 or episode < 1.
// ─────────────────────────────────────────────────────────────────────────────
async function fetchSiblingEpisode(
  showId: number,
  season: number,
  episode: number,
  direction: "prev" | "next"
): Promise<EpisodeDetail | null> {
  let targetSeason = season;
  let targetEpisode = direction === "next" ? episode + 1 : episode - 1;

  // If “prev” and episode goes below 1, bail out:
  if (direction === "prev" && targetEpisode < 1) {
    return null;
  }

  try {
    return await getEpisodeDetails(showId, targetSeason, targetEpisode);
  } catch {
    // TMDB returned 404; no same-season sibling
    return null;
  }
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

        // Temporary arrays of “candidates” (with empty data initially)
        type Candidate = { showId: number; season: number; episode: number; label: string };
        const nextArr: Candidate[] = [];
        const aWhileArr: Candidate[] = [];
        const notStartedArr: Candidate[] = [];

        for (const showId of onboardedIds) {
          const watchedEntries = episodesWatchedMap[showId] || [];

          if (watchedEntries.length === 0) {
            // Never watched → “Haven’t Started”: Season 1 Episode 1
            notStartedArr.push({ showId, season: 1, episode: 1, label: "S1 E1" });
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
            // Watched in last 30 days → “Watch Next”
            nextArr.push({
              showId,
              season: lastSeason,
              episode: lastEpisode + 1,
              label: `S${lastSeason} E${lastEpisode + 1}`,
            });
          } else {
            // Watched > 30 days ago → “Haven’t Watched For A While”
            aWhileArr.push({
              showId,
              season: lastSeason,
              episode: lastEpisode + 1,
              label: `Last seen S${lastSeason} E${lastEpisode}`,
            });
          }
        }

        // 2a) Pre-load show details for all candidate showIds
        const allCandidates = [...nextArr, ...aWhileArr, ...notStartedArr];
        const uniqueShowIds = Array.from(
          new Set(allCandidates.map((e) => e.showId))
        );
        const detailsMap: Record<number, TVShow> = {};
        await Promise.all(
          uniqueShowIds.map(async (sid) => {
            const det = await getTVShowDetails(sid);
            detailsMap[sid] = det;
          })
        );

        // 2b) Build THREE “finalized” lists, but only include episodes that TMDB confirms exist
        const finalizedNext: EpisodeInfo[] = [];
        const finalizedAWhile: EpisodeInfo[] = [];
        const finalizedNotStarted: EpisodeInfo[] = [];

        // Helper function to attempt to fetch an episode; returns EpisodeInfo or null if 404
        const tryBuildEpisode = async (
          showId: number,
          season: number,
          episode: number,
          label: string
        ): Promise<EpisodeInfo | null> => {
          // 1) First attempt: (season, episode)
          try {
            const epDet = await getEpisodeDetails(showId, season, episode);
            const showDet = detailsMap[showId];
            return {
              showId,
              showName: showDet.name,
              poster_path: showDet.poster_path,
              season,
              episode,
              label,
              episodeTitle: epDet.name || "",
              episodeOverview: epDet.overview || "",
              air_date: epDet.air_date || "",
              still_path: epDet.still_path || null,
              vote_average: epDet.vote_average || 0,
            };
          } catch {
            // 2) If that fails, attempt (season+1, episode=1)
            const nextSeason = season + 1;
            try {
              const epDet2 = await getEpisodeDetails(showId, nextSeason, 1);
              const showDet2 = detailsMap[showId];
              return {
                showId,
                showName: showDet2.name,
                poster_path: showDet2.poster_path,
                season: nextSeason,
                episode: 1,
                label: `S${nextSeason} E1`,
                episodeTitle: epDet2.name || "",
                episodeOverview: epDet2.overview || "",
                air_date: epDet2.air_date || "",
                still_path: epDet2.still_path || null,
                vote_average: epDet2.vote_average || 0,
              };
            } catch {
              // 3) If that also fails, there is no “next” episode—return null
              return null;
            }
          }
        };

        // Concurrently build all three lists:
        await Promise.all(
          nextArr.map(async (cand) => {
            const epiInfo = await tryBuildEpisode(
              cand.showId,
              cand.season,
              cand.episode,
              cand.label
            );
            if (epiInfo) finalizedNext.push(epiInfo);
          })
        );
        await Promise.all(
          aWhileArr.map(async (cand) => {
            const epiInfo = await tryBuildEpisode(
              cand.showId,
              cand.season,
              cand.episode,
              cand.label
            );
            if (epiInfo) finalizedAWhile.push(epiInfo);
          })
        );
        await Promise.all(
          notStartedArr.map(async (cand) => {
            const epiInfo = await tryBuildEpisode(
              cand.showId,
              cand.season,
              cand.episode,
              cand.label
            );
            if (epiInfo) finalizedNotStarted.push(epiInfo);
          })
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

  /**
   * When user clicks “✔️” to mark this episode as watched:
   *   1) Append a new WatchedEntry to Firestore: episodesWatched.<showId>
   *   2) Update local state so UI re‐renders immediately
   */
  const markAsWatched = async (epi: EpisodeInfo) => {
    if (!user) return;
    const nowISO = new Date().toISOString();
    const userRef = doc(db, "users", user.uid);

    // Get existing watched array or empty
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
      // Also update the modalEpisode’s label to show watched date
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
   * When user clicks to “unwatch” (only after confirmation):
   *   1) Remove that season/episode from Firestore array episodesWatched.<showId>
   *   2) Update local state so UI re‐renders immediately
   */
  const unmarkAsWatched = async (epi: EpisodeInfo) => {
    if (!user) return;
    const userRef = doc(db, "users", user.uid);

    // Filter out this (season, episode) pair
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
      // Do not close modal here; keep user on same episode if desired
    } catch (err) {
      console.error(err);
      setError("Failed to unwatch that episode. Try again.");
    }
  };

  // ─────────────────────────────────────────────────────────────
  // Helper: render the card for one episode in the scroll list
  // ─────────────────────────────────────────────────────────────
  const renderEpisodeCard = (epi: EpisodeInfo) => {
    // Build a unique key for this episode:
    const epiKey = `${epi.showId}-${epi.season}-${epi.episode}`;

    // Determine whether user has already watched this episode:
    const watchedEntries = episodesWatchedMap[epi.showId] || [];
    const isWatched = watchedEntries.some(
      (we) => we.season === epi.season && we.episode === epi.episode
    );

    // Is this episode currently in “animating → turning green” state?
    const isAnimating = animatingIds.has(epiKey);

    return (
      <div
        key={epiKey}
        style={styles.epiCard}
        onClick={() => setModalEpisode(epi)} // open modal on card click
      >
        {/* Use the show’s poster here (epi.poster_path), not the episode’s still. */}
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
            <p style={styles.epiOverview}>
              {epi.episodeOverview /* full description, no truncation */}
            </p>
          )}
        </div>

        {/* Nice circular button to mark watched (white → animate to green) */}
        <button
          onClick={(e) => {
            e.stopPropagation(); // don’t open modal if button clicked

            if (!isWatched && !isAnimating) {
              // 1) Put this epiKey into “animating” set
              setAnimatingIds((prev) => {
                const copy = new Set(prev);
                copy.add(epiKey);
                return copy;
              });

              // 2) After a brief delay (400 ms), mark watched & close modal
              setTimeout(() => {
                markAsWatched(epi);

                // 3) Remove from animating set
                setAnimatingIds((prev) => {
                  const copy = new Set(prev);
                  copy.delete(epiKey);
                  return copy;
                });

                // 4) Close any open modal (no auto-advance)
                setModalEpisode(null);
              }, 400); // 400ms for the white→green transition
            }
          }}
          style={{
            // If already watched → gray badge. Otherwise:
            //   - if animating → green background + white check
            //   - if not yet pressed → white circle + dark check
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

      {/* Error Banner */}
      {error && <p style={styles.error}>{error}</p>}

      {/* ─────────── “Watch List” Tab ─────────── */}
      {activeTab === 0 && (
        <>
          {watchNextList.length > 0 && (
            <div style={styles.section}>
              <div style={styles.sectionHeader}>WATCH NEXT</div>
              {watchNextList.map((epi) => renderEpisodeCard(epi))}
            </div>
          )}

          {watchedAWhileList.length > 0 && (
            <div style={styles.section}>
              <div style={styles.sectionHeader}>
                HAVEN’T WATCHED FOR A WHILE
              </div>
              {watchedAWhileList.map((epi) => renderEpisodeCard(epi))}
            </div>
          )}

          {notStartedList.length > 0 && (
            <div style={styles.section}>
              <div style={styles.sectionHeader}>HAVEN’T STARTED</div>
              {notStartedList.map((epi) => renderEpisodeCard(epi))}
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
          {/* ─────────── Left‐side arrow (sits outside the modalContent) ─────────── */}
          <button
            style={styles.modalArrowLeft}
            onClick={async (e) => {
              e.stopPropagation();
              const prevEp = await fetchSiblingEpisode(
                modalEpisode.showId,
                modalEpisode.season,
                modalEpisode.episode,
                "prev"
              );
              if (prevEp) {
                const showDet = await getTVShowDetails(modalEpisode.showId);
                setModalEpisode({
                  showId: modalEpisode.showId,
                  showName: showDet.name,
                  poster_path: showDet.poster_path,
                  season: prevEp.season_number,
                  episode: prevEp.episode_number,
                  label: `S${prevEp.season_number} E${prevEp.episode_number}`,
                  episodeTitle: prevEp.name,
                  episodeOverview: prevEp.overview,
                  air_date: prevEp.air_date,
                  still_path: prevEp.still_path,
                  vote_average: prevEp.vote_average || 0,
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
                // For now, go back to /shows. Later you can replace with `/shows/${modalEpisode.showId}`
                window.location.href = "/shows";
              }}
            >
              ← Back to Show
            </button>

            {/* ─────────── Episode Still Image with Overlays ─────────── */}
            <div style={styles.modalImageWrapper}>
              {modalEpisode.still_path ? (
                <img
                  src={`${POSTER_BASE_URL}${modalEpisode.still_path}`}
                  alt={modalEpisode.showName}
                  style={styles.modalStill}
                />
              ) : (
                <div style={styles.modalNoImage}>No Image</div>
              )}

              {/* Overlay: Season/Episode + Episode Title */}
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

            {/* ─────────── “Where to Watch” Placeholder Section ─────────── */}
            <div style={styles.modalWhereToWatchSection}>
              <h3 style={styles.modalWhereToWatchHeader}>Where to watch</h3>
              <button style={styles.modalNetflixButton}>NETFLIX</button>
              {/* (You can add other streaming buttons here.) */}
            </div>

            {/* ─────────── Episode Info Section ─────────── */}
            <div style={styles.modalInfo}>
              {/* Air Date / “Not watched” or watched date / Rating / Check‐button */}
              <div style={styles.modalAirRatingRow}>
                <p style={styles.modalAirDate}>
                  Air Date: {modalEpisode.air_date || "Unknown"}
                </p>
                {(() => {
                  const watchedEntries =
                    episodesWatchedMap[modalEpisode.showId] || [];
                  const match = watchedEntries.find(
                    (we) =>
                      we.season === modalEpisode.season &&
                      we.episode === modalEpisode.episode
                  );
                  const watchedTag = match
                    ? `Watched on ${match.watchedAt.split("T")[0]}`
                    : "Not watched";
                  return (
                    <p style={styles.notWatchedOrDate}>{watchedTag}</p>
                  );
                })()}
                <p style={styles.modalRatingPercent}>
                  {Math.round(modalEpisode.vote_average * 10)}%
                </p>

                {(() => {
                  const watchedEntries =
                    episodesWatchedMap[modalEpisode.showId] || [];
                  const isAlready =
                    watchedEntries.some(
                      (we) =>
                        we.season === modalEpisode.season &&
                        we.episode === modalEpisode.episode
                    );
                  // Always show the circular button, regardless of watched status
                  return (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!isAlready) {
                          // Not watched yet → mark as watched immediately
                          markAsWatched(modalEpisode);
                        } else {
                          // Already watched → ask for confirmation to unwatch
                          const confirmUnwatch = window.confirm(
                            "This episode is already marked as watched. Do you want to unwatch it?"
                          );
                          if (confirmUnwatch) {
                            unmarkAsWatched(modalEpisode);
                          }
                        }
                      }}
                      style={
                        // If episode is watched → show gray badge style.
                        // Otherwise → show white circle style.
                        watchedEntries.some(
                          (we) =>
                            we.season === modalEpisode.season &&
                            we.episode === modalEpisode.episode
                        )
                          ? styles.cardWatchedBadge
                          : styles.cardWatchBtn
                      }
                    >
                      { /* Show a checkmark in both cases */ }
                      ✔️
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

          {/* ─────────── Right‐side arrow (sits outside the modalContent) ─────────── */}
          <button
            style={styles.modalArrowRight}
            onClick={async (e) => {
              e.stopPropagation();
              const nextEp = await fetchSiblingEpisode(
                modalEpisode.showId,
                modalEpisode.season,
                modalEpisode.episode,
                "next"
              );
              if (nextEp) {
                const showDet = await getTVShowDetails(modalEpisode.showId);
                setModalEpisode({
                  showId: modalEpisode.showId,
                  showName: showDet.name,
                  poster_path: showDet.poster_path,
                  season: nextEp.season_number,
                  episode: nextEp.episode_number,
                  label: `S${nextEp.season_number} E${nextEp.episode_number}`,
                  episodeTitle: nextEp.name,
                  episodeOverview: nextEp.overview,
                  air_date: nextEp.air_date,
                  still_path: nextEp.still_path,
                  vote_average: nextEp.vote_average || 0,
                });
              }
            }}
          >
            ▶
          </button>
        </div>
      )}
    </div>
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
  // In‐card watch button styles (used both in the list and in the modal):
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
  // “Where to  Watch” placeholder section inside modal
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
  // Episode Info row: Air date / “Not watched” or watched date / Rating / Check‐button
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
    gap: "1rem",
    marginBottom: "1rem",
    position: "relative",
  },
  modalAirDate: {
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

  modalMarkAsWatchedBtn: {
    alignSelf: "flex-start",
    backgroundColor: "#28a745",
    border: "none",
    borderRadius: "50%",
    color: "#fff",
    fontSize: "1.2rem",
    lineHeight: 1,
    width: "48px",
    height: "48px",
    cursor: "pointer",
    margin: "1rem",
  },

  // ────────────────────────────────────────────────────────────────────────────
  // “Previous” Arrow (left) now sits outside modalContent
  // ────────────────────────────────────────────────────────────────────────────
  modalArrowLeft: {
    position: "absolute",
    top: "calc(50% - 10px)",  // vertically center on the still‐image area
    left: "25%",              // arrow sits to left side of centered modalContent
    transform: "translateX(-100%) translateY(-50%)",
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
  // “Next” Arrow (right) now sits outside modalContent
  // ────────────────────────────────────────────────────────────────────────────
  modalArrowRight: {
    position: "absolute",
    top: "calc(50% - 10px)",  // vertically center on the still‐image area
    right: "25%",
    transform: "translateX(100%) translateY(-50%)",
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
