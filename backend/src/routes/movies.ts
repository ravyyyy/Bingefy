import { Router } from 'express';
import { fetchPopularMovies } from '../controllers/moviesController';

const router = Router();

router.get('/popular', fetchPopularMovies);

export default router;
