export interface ExternalSignal {
  sku: string;
  score: number;
  reason: string;
}

export interface MatchedSuggestion {
  productId: string;
  title: string;
  handle: string;
  imageUrl: string | null;
  imageAltText: string | null;
  sku: string;
  price: string;
  score: number;
  reason: string;
}

interface ProductNode {
  id: string;
  title: string;
  handle: string;
  status: string;
  totalInventory: number;
  featuredMedia: {
    preview: {
      image: { url: string; altText: string | null };
    };
  } | null;
  variants: {
    edges: Array<{
      node: { sku: string; price: string };
    }>;
  };
}

interface ProductsQueryResponse {
  data: {
    products: {
      edges: Array<{ node: ProductNode }>;
    };
  };
}

const PRODUCTS_BY_SKU_QUERY = `#graphql
  query ProductsBySku($query: String!) {
    products(first: 50, query: $query) {
      edges {
        node {
          id
          title
          handle
          status
          totalInventory
          featuredMedia {
            preview {
              image {
                url
                altText
              }
            }
          }
          variants(first: 5) {
            edges {
              node {
                sku
                price
              }
            }
          }
        }
      }
    }
  }
`;

function escapeSkuForQuery(sku: string): string {
  return sku.replace(/[\\:"()]/g, "\\$&");
}

function buildSkuQuery(skus: string[]): string {
  return skus.map((sku) => `sku:${escapeSkuForQuery(sku)}`).join(" OR ");
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export async function resolveProductsBySku(
  admin: {
    graphql: (
      query: string,
      options?: { variables: Record<string, unknown> },
    ) => Promise<Response>;
  },
  signals: ExternalSignal[],
): Promise<MatchedSuggestion[]> {
  if (signals.length === 0) return [];

  const signalMap = new Map<string, ExternalSignal>();
  for (const signal of signals) {
    signalMap.set(signal.sku.toLowerCase(), signal);
  }

  const skuChunks = chunkArray(
    signals.map((s) => s.sku),
    50,
  );

  const responses = await Promise.all(
    skuChunks.map(async (skus) => {
      const query = buildSkuQuery(skus);
      const response = await admin.graphql(PRODUCTS_BY_SKU_QUERY, {
        variables: { query },
      });
      return (await response.json()) as ProductsQueryResponse;
    }),
  );

  const matched: MatchedSuggestion[] = [];

  for (const response of responses) {
    for (const edge of response.data.products.edges) {
      const product = edge.node;

      if (product.status !== "ACTIVE") continue;

      for (const variantEdge of product.variants.edges) {
        const variant = variantEdge.node;
        const signal = signalMap.get(variant.sku.toLowerCase());

        if (signal) {
          matched.push({
            productId: product.id,
            title: product.title,
            handle: product.handle,
            imageUrl: product.featuredMedia?.preview?.image?.url ?? null,
            imageAltText:
              product.featuredMedia?.preview?.image?.altText ?? null,
            sku: variant.sku,
            price: variant.price,
            score: signal.score,
            reason: signal.reason,
          });
          break; // one match per product
        }
      }
    }
  }

  matched.sort((a, b) => b.score - a.score);

  return matched;
}
