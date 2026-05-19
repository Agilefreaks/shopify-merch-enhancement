import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { logger } from "../services/logger.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  logger.info({ shop, topic }, "Shop redact request received");

  // Delete all app data for this shop
  await db.session.deleteMany({ where: { shop } });

  return new Response();
};
