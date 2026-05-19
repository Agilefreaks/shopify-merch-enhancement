import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // TODO: If caching is added later, invalidate cached suggestions for this product.
  // Currently no-op since we fetch suggestions in real-time.

  return new Response();
};
