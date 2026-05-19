import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { logger } from "../services/logger.server";
import { resolveProductsBySku } from "app/services/product-matching.server";

export interface ExternalSignal {
  sku: string;
  score: number;
  reason: string;
}

export class ExternalApiError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "ExternalApiError";
  }
}

const MOCK_DATA: ExternalSignal[] = [
  { sku: "GFT25", score: 0.95, reason: "Popular $25 gift card add-on" },
];

export async function fetchExternalSuggestions(
  productSku: string,
): Promise<ExternalSignal[]> {
  if (process.env.SUGGESTIONS_MOCK === "1") {
    return MOCK_DATA;
  }

  const baseUrl = process.env.EXTERNAL_API_BASE_URL;
  const apiKey = process.env.EXTERNAL_API_KEY;

  if (!baseUrl || !apiKey) {
    throw new ExternalApiError(
      "Missing EXTERNAL_API_BASE_URL or EXTERNAL_API_KEY",
    );
  }

  const url = `${baseUrl}/suggestions?sku=${encodeURIComponent(productSku)}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new ExternalApiError(
      `External API returned ${response.status}`,
      response.status,
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new ExternalApiError("External API returned malformed JSON");
  }

  if (!Array.isArray(data)) {
    throw new ExternalApiError("External API returned unexpected data shape");
  }

  return data as ExternalSignal[];
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.public.appProxy(request);
  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") || "4", 10),
    12,
  );

  if (!productId) {
    return Response.json(
      { error: "Missing productId parameter" },
      { status: 400 },
    );
  }

  // Look up the product's SKU (proxy doesn't receive SKU directly)
  const productResponse = await admin!.graphql(
    `#graphql
      query GetProductSkuForProxy($id: ID!) {
        product(id: $id) {
          variants(first: 1) {
            edges {
              node {
                sku
              }
            }
          }
        }
      }`,
    { variables: { id: `gid://shopify/Product/${productId}` } },
  );

  const productData = (await productResponse.json()) as {
    data: {
      product: {
        variants: { edges: Array<{ node: { sku: string } }> };
      } | null;
    };
  };

  const product = productData.data.product;
  if (!product) {
    return Response.json({ error: "Product not found" }, { status: 404 });
  }

  const sku = product.variants.edges[0]?.node?.sku;
  if (!sku) {
    return Response.json(
      { products: [] },
      {
        headers: { "Cache-Control": "public, max-age=60" },
      },
    );
  }

  const signals = await fetchExternalSuggestions(sku);
  const matched = await resolveProductsBySku(admin!, signals);
  const limited = matched.slice(0, limit);
  logger.info({ productId, count: limited.length }, "Proxy served suggestions");

  return Response.json(
    { products: limited },
    { headers: { "Cache-Control": "public, max-age=60" } },
  );
};
