import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error.js';
import { authenticate, type AuthedRequest } from '../../middleware/auth.js';
import { ok } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { billingService } from './billing.service.js';

export const billingRouter = Router();
billingRouter.use(authenticate);
const uid = (req: unknown) => (req as AuthedRequest).auth.userId;

/** GET /api/billing/usage — the dashboard usage meter. */
billingRouter.get('/usage', asyncHandler(async (req, res) => ok(res, await billingService.usageMeter(uid(req)))));

/** GET /api/billing/subscription — raw subscription record. */
billingRouter.get('/subscription', asyncHandler(async (req, res) => {
  const sub = await prisma.subscription.findUnique({ where: { userId: uid(req) } });
  return ok(res, sub);
}));

/** GET /api/billing/invoices — monthly invoice history. */
billingRouter.get('/invoices', asyncHandler(async (req, res) => ok(res, await billingService.listInvoices(uid(req)))));

/** POST /api/billing/subscribe {plan:BASIC|PRO} — start/renew (payment provider stubbed). */
billingRouter.post('/subscribe', asyncHandler(async (req, res) => {
  const plan = z.object({ plan: z.enum(['BASIC', 'PRO']).default('BASIC') }).parse(req.body ?? {}).plan;
  return ok(res, await billingService.subscribe(uid(req), plan));
}));
