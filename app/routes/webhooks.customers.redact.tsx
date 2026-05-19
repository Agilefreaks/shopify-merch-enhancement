import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { logger } from "../services/logger.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  logger.info({ shop, topic }, "Customer redact request received");

  // TODO: Implement proper customer data deletion before App Store submission.
  // This app currently does not store any customer-specific data.

  return new Response();
};
