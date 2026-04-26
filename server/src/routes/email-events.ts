import { Router } from "express";

export function emailEventRoutes(db: any) {
  const router = Router();

  router.post("/webhook", async (req, res, next) => {
    try {
      const payload = req.body ?? {};

      await db.query(
        `
        insert into events (
          event_type,
          source_system,
          entity_type,
          entity_ref,
          status,
          payload
        )
        values ($1, $2, $3, $4, $5, $6)
        `,
        [
          "email.webhook",
          String(payload.provider ?? "email"),
          "email_event",
          String(payload.to ?? payload.message_id ?? "unknown"),
          "pending",
          payload,
        ],
      );

      return res.status(201).json({
        ok: true,
        event_type: "email.webhook",
        status: "pending",
      });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}