import { Request, Response } from 'express';
import * as tmdbService from '../services/tmdbServices';

export const fetchPopularMovies = async (req: Request, res: Response) => {
  try {
    const data = await tmdbService.getPopularMovies();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch movies' });
  }
};
