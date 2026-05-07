import { Router } from "express";
import {
  listMgrnzCanonicalEvents,
  listMgrnzPendingRoutes,
  listMgrnzRouteExecutions,
} from "../services/mgrnzEventAdapter.js";
import { dryRunMgrnzPendingRoutes } from "../services/mgrnzRouteExecutor.js";

export const mgrnzRouter = Router();

mgrnzRouter.get("/companies/:companyId/cockpit/mgrnz-events", async (req, res) => {
  const limit = Number(req.query.limit ?? 100);
  const result = await listMgrnzCanonicalEvents(limit);
  return res.json(result);
});

mgrnzRouter.get("/companies/:companyId/cockpit/pending-routes", async (req, res) => {
  const limit = Number(req.query.limit ?? 100);
  const result = await listMgrnzPendingRoutes(limit);
  return res.json(result);
});

mgrnzRouter.get("/companies/:companyId/cockpit/route-executions", async (req, res) => {
  const limit = Number(req.query.limit ?? 100);
  const result = await listMgrnzRouteExecutions(limit);
  return res.json(result);
});

mgrnzRouter.post("/companies/:companyId/cockpit/execute-pending-routes", async (req, res) => {
  const limit = req.body?.limit;
  const result = await dryRunMgrnzPendingRoutes({ limit });
  return res.json(result);
});
