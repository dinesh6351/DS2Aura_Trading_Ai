import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error.js';
import { ok } from '../../lib/http.js';
import { settingsService } from './settings.service.js';

/** Public, unauthenticated endpoints for the landing page. */
export const publicRouter = Router();

/** GET /api/public/branding — app name, links, copy for the home page. */
publicRouter.get('/branding', asyncHandler(async (_req, res) => ok(res, await settingsService.getBranding())));

/** POST /api/public/feedback — landing-page feedback form. */
const feedbackSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  message: z.string().min(1).max(2000),
});
publicRouter.post('/feedback', asyncHandler(async (req, res) => {
  const input = feedbackSchema.parse(req.body);
  await settingsService.submitFeedback(input, req.ip);
  return ok(res, { received: true });
}));
