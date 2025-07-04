// src/services/tmdbClients.ts

const API_KEY = import.meta.env.VITE_TMDB_API_KEY as string;
const BASE_URL = "https://api.themoviedb.org/3";

// ─────────────────────────────────────────────────────────────────────────────
// 1) Interfaces for Movie, TVShow, and a normalized MediaItem
// ─────────────────────────────────────────────────────────────────────────────

export interface Movie {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  release_date: string;
  vote_average: number;
}

export interface TVShow {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  first_air_date: string;
  vote_average: number;
  number_of_seasons: number;
}

export interface MediaItem {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  vote_average: number;
  type: "movie" | "tv";
}

interface TmdbResponse<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) Fetch “latest” (i.e. sorted‐by‐date‐desc) movies & TV shows
// ─────────────────────────────────────────────────────────────────────────────

export async function getLatestMovies(
  page: number = 1
): Promise<TmdbResponse<Movie>> {
  const url = new URL(`${BASE_URL}/discover/movie`);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("language", "en-US");
  url.searchParams.set("sort_by", "release_date.desc");
  url.searchParams.set("page", String(page));

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`TMDB Error (latest movies): ${response.status}`);
  }
  return (await response.json()) as TmdbResponse<Movie>;
}

export async function getLatestTV(
  page: number = 1
): Promise<TmdbResponse<TVShow>> {
  const url = new URL(`${BASE_URL}/discover/tv`);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("language", "en-US");
  url.searchParams.set("sort_by", "first_air_date.desc");
  url.searchParams.set("page", String(page));

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`TMDB Error (latest tv): ${response.status}`);
  }
  return (await response.json()) as TmdbResponse<TVShow>;
}

export async function getLatestMedia(
  page: number = 1
): Promise<{ page: number; results: MediaItem[]; total_pages: number }> {
  const [moviesResp, tvResp] = await Promise.all([
    getLatestMovies(page),
    getLatestTV(page),
  ]);

  const moviesItems: MediaItem[] = moviesResp.results.map((m) => ({
    id: m.id,
    title: m.title,
    overview: m.overview,
    poster_path: m.poster_path,
    vote_average: m.vote_average,
    type: "movie",
  }));

  const tvItems: MediaItem[] = tvResp.results.map((t) => ({
    id: t.id,
    title: t.name,
    overview: t.overview,
    poster_path: t.poster_path,
    vote_average: t.vote_average,
    type: "tv",
  }));

  const combinedTotalPages = Math.min(
    moviesResp.total_pages,
    tvResp.total_pages
  );

  return {
    page,
    results: [...moviesItems, ...tvItems],
    total_pages: combinedTotalPages,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) “Trending” and “Popular” endpoints for TV shows and movies
// ─────────────────────────────────────────────────────────────────────────────

export async function getTrendingShows(
  page: number = 1
): Promise<TmdbResponse<TVShow>> {
  const url = new URL(`${BASE_URL}/trending/tv/week`);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("page", String(page));

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`TMDB Error (trending shows): ${response.status}`);
  }
  return (await response.json()) as TmdbResponse<TVShow>;
}

export async function getPopularShows(
  page: number = 1
): Promise<TmdbResponse<TVShow>> {
  const url = new URL(`${BASE_URL}/tv/popular`);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("language", "en-US");
  url.searchParams.set("page", String(page));

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`TMDB Error (popular shows): ${response.status}`);
  }
  return (await response.json()) as TmdbResponse<TVShow>;
}

export async function getPopularMovies(
  page: number = 1
): Promise<TmdbResponse<Movie>> {
  const url = new URL(`${BASE_URL}/movie/popular`);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("language", "en-US");
  url.searchParams.set("page", String(page));

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`TMDB Error (popular movies): ${response.status}`);
  }
  return (await response.json()) as TmdbResponse<Movie>;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4) Get TV Show Details (including next_episode_to_air) 
// ─────────────────────────────────────────────────────────────────────────────

export async function getTVShowDetails(
  showId: number
): Promise<
  TVShow & {
    next_episode_to_air?: { season_number: number; episode_number: number };
  }
> {
  const url = new URL(`${BASE_URL}/tv/${showId}`);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("language", "en-US");

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`TMDB Error (get TV details for ID ${showId}): ${response.status}`);
  }
  return (await response.json()) as TVShow & {
    next_episode_to_air?: { season_number: number; episode_number: number };
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5) Get Episode Details (season & episode)
// ─────────────────────────────────────────────────────────────────────────────

export interface EpisodeDetail {
  name: string;
  overview: string;
  air_date: string;
  episode_number: number;
  season_number: number;
  still_path: string | null;
  vote_average: number;
  vote_count: number;
}

export async function getEpisodeDetails(
  showId: number,
  seasonNum: number,
  episodeNum: number
): Promise<EpisodeDetail> {
  const url = new URL(
    `${BASE_URL}/tv/${showId}/season/${seasonNum}/episode/${episodeNum}`
  );
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("language", "en-US");

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(
      `TMDB Error (getEpisodeDetails for show ${showId} S${seasonNum}E${episodeNum}): ${response.status}`
    );
  }
  return (await response.json()) as EpisodeDetail;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6) Get Season Details (returns list of all episodes in that season)
// ─────────────────────────────────────────────────────────────────────────────

export interface SeasonEpisodeDetail {
  episode_number: number;
  name: string;
  overview: string;
  air_date: string;
  still_path: string | null;
  vote_average: number;
}

export interface SeasonDetail {
  id: number;
  episodes: SeasonEpisodeDetail[];
  season_number: number;
  // (Other fields can be ignored; we only need `episodes[]`.)
}

export async function getSeasonDetails(
  showId: number,
  seasonNum: number
): Promise<SeasonDetail> {
  const url = new URL(`${BASE_URL}/tv/${showId}/season/${seasonNum}`);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("language", "en-US");

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(
      `TMDB Error (get season details for show ${showId}, season ${seasonNum}): ${response.status}`
    );
  }
  return (await response.json()) as SeasonDetail;
}

export type WatchProvidersResponse = {
  // This mirrors TMDB’s /tv/{tv_id}/watch/providers response.
  // We’ll only type the parts we need (e.g. “results” mapping by region).
  results: {
    [countryCode: string]: {
      link: string; // e.g. “https://www.themoviedb.org/tv/…/watch?…” 
      flatrate?: Array<{
        logo_path: string;
        provider_id: number;
        provider_name: string;
      }>;
      rent?: Array<{
        logo_path: string;
        provider_id: number;
        provider_name: string;
      }>;
      buy?: Array<{
        logo_path: string;
        provider_id: number;
        provider_name: string;
      }>;
    };
  };
};

/**
 * Fetches “where to watch” (streaming/FLATRATE/rent/buy) for a TV show.
 * 
 * @param showId  TMDB show ID (same one you pass into getTVShowDetails)
 * @returns       Full JSON object; you can pick a specific country’s section.
 */
export async function getTVWatchProviders(
  showId: number
): Promise<WatchProvidersResponse> {
  const url = `${BASE_URL}/tv/${showId}/watch/providers?api_key=${API_KEY}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error("Failed to fetch watch‐provider data");
  return (await resp.json()) as WatchProvidersResponse;
}