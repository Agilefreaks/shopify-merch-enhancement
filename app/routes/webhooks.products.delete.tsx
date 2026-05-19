import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // TODO: If caching is added later, remove deleted product from cached suggestions.
  // Currently no-op since we fetch suggestions in real-time.

  return new Response();
};
