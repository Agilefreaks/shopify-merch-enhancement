import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { defer } from "@remix-run/node";
import {
  useLoaderData,
  useNavigate,
  useSearchParams,
  Await,
  useFetcher,
} from "@remix-run/react";
import {
  Page,
  Card,
  Button,
  BlockStack,
  InlineStack,
  Text,
  Thumbnail,
  Banner,
  SkeletonBodyText,
  SkeletonDisplayText,
  Badge,
  EmptyState,
  Box,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { fetchExternalSuggestions } from "./proxy.for-product";
import {
  resolveProductsBySku,
  type MatchedSuggestion,
} from "../services/product-matching.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");

  if (!productId) {
    return defer({ productId: null, suggestions: null });
  }

  const suggestionsPromise = (async () => {
    // Get the product's SKU first
    const productResponse = await admin.graphql(
      `#graphql
        query GetProductSku($id: ID!) {
          product(id: $id) {
            title
            variants(first: 1) {
              edges {
                node {
                  sku
                }
              }
            }
          }
        }`,
      { variables: { id: productId } },
    );
    const productData = (await productResponse.json()) as {
      data: {
        product: {
          title: string;
          variants: { edges: Array<{ node: { sku: string } }> };
        } | null;
      };
    };

    const product = productData.data.product;
    if (!product) throw new Error("Product not found");

    const sku = product.variants.edges[0]?.node?.sku;
    if (!sku) {
      return { productTitle: product.title, suggestions: [], noSku: true };
    }

    const signals = await fetchExternalSuggestions(sku);
    const matched = await resolveProductsBySku(admin, signals);

    return { productTitle: product.title, suggestions: matched, noSku: false };
  })();

  return defer({ productId, suggestions: suggestionsPromise });
};

function SuggestionsSkeleton() {
  return (
    <Card>
      <BlockStack gap="400">
        <SkeletonDisplayText size="small" />
        <SkeletonBodyText lines={3} />
        <SkeletonBodyText lines={3} />
        <SkeletonBodyText lines={3} />
      </BlockStack>
    </Card>
  );
}

function SuggestionsList({
  data,
}: {
  data: {
    productTitle: string;
    suggestions: MatchedSuggestion[];
    noSku?: boolean;
  };
}) {
  const { productTitle, suggestions, noSku } = data;

  if (noSku) {
    return (
      <Banner tone="warning">
        <p>
          "{productTitle}" has no SKU set on its variant. Add a SKU to the
          product to get suggestions.
        </p>
      </Banner>
    );
  }

  if (suggestions.length === 0) {
    return (
      <Card>
        <EmptyState
          heading="No suggestions found"
          image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
        >
          <p>
            The external system returned no suggestions for "{productTitle}".
          </p>
        </EmptyState>
      </Card>
    );
  }

  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingMd">
          Suggestions for "{productTitle}" ({suggestions.length})
        </Text>
        {suggestions.map((suggestion) => {
          const numericId = suggestion.productId.replace(
            "gid://shopify/Product/",
            "",
          );
          return (
            <Box
              key={suggestion.productId}
              padding="300"
              background="bg-surface-secondary"
              borderRadius="200"
            >
              <InlineStack gap="400" align="start" blockAlign="center">
                <Thumbnail
                  source={suggestion.imageUrl || ""}
                  alt={suggestion.imageAltText || suggestion.title}
                  size="small"
                />
                <BlockStack gap="100">
                  <InlineStack gap="200" align="start" blockAlign="center">
                    <Text as="span" variant="bodyMd" fontWeight="semibold">
                      {suggestion.title}
                    </Text>
                    <Badge tone="info">
                      {`Score: ${(suggestion.score * 100).toFixed(0)}%`}
                    </Badge>
                  </InlineStack>
                  <Text as="span" variant="bodySm" tone="subdued">
                    {suggestion.reason}
                  </Text>
                  <InlineStack gap="200">
                    <Text as="span" variant="bodySm">
                      SKU: {suggestion.sku}
                    </Text>
                    <Text as="span" variant="bodySm">
                      ${suggestion.price}
                    </Text>
                  </InlineStack>
                </BlockStack>
                <div style={{ marginLeft: "auto" }}>
                  <Button
                    url={`shopify:admin/products/${numericId}`}
                    target="_blank"
                    variant="plain"
                  >
                    View
                  </Button>
                </div>
              </InlineStack>
            </Box>
          );
        })}
      </BlockStack>
    </Card>
  );
}

function useAutoRefresh(productId: string | null, intervalMs = 30000) {
  const fetcher = useFetcher<typeof loader>();
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (!productId) return;

    function refresh() {
      if (document.visibilityState === "visible") {
        fetcher.load(`/app/suggestions?productId=${productId}`);
        setLastUpdated(new Date());
      }
    }

    intervalRef.current = setInterval(refresh, intervalMs);

    return () => clearInterval(intervalRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, intervalMs]);

  return { refreshData: fetcher.data, lastUpdated };
}

export default function SuggestionsPage() {
  const loaderData = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const productId = searchParams.get("productId");
  const fetcher = useFetcher<typeof loader>();
  const { lastUpdated } = useAutoRefresh(productId);

  const handleProductPick = useCallback(async () => {
    const selected = await shopify.resourcePicker({ type: "product" });
    if (selected && selected.length > 0) {
      const id = selected[0].id;
      navigate(`/app/suggestions?productId=${id}`);
    }
  }, [navigate]);

  const handleRefresh = useCallback(() => {
    if (productId) {
      fetcher.load(`/app/suggestions?productId=${productId}`);
    }
  }, [fetcher, productId]);

  const displayData = fetcher.data ?? loaderData;

  return (
    <Page>
      <TitleBar title="Product Suggestions" />
      <BlockStack gap="500">
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Select a product
            </Text>
            <Text as="p" variant="bodyMd">
              Pick a product to see suggestions from the external system.
            </Text>
            <InlineStack gap="300" align="start" blockAlign="center">
              <Button onClick={handleProductPick} variant="primary">
                Pick a product
              </Button>
              {productId && (
                <Button
                  onClick={handleRefresh}
                  loading={fetcher.state === "loading"}
                >
                  Refresh
                </Button>
              )}
              {lastUpdated && (
                <Text as="span" variant="bodySm" tone="subdued">
                  Auto-refreshes every 30s
                </Text>
              )}
            </InlineStack>
          </BlockStack>
        </Card>

        {displayData?.suggestions && (
          <Suspense fallback={<SuggestionsSkeleton />}>
            <Await
              resolve={displayData.suggestions}
              errorElement={
                <Banner tone="critical">
                  <p>
                    Failed to load suggestions. The external system may be
                    unavailable. Try refreshing.
                  </p>
                </Banner>
              }
            >
              {(data) => (
                <SuggestionsList
                  data={
                    data as {
                      productTitle: string;
                      suggestions: MatchedSuggestion[];
                    }
                  }
                />
              )}
            </Await>
          </Suspense>
        )}

        {!productId && (
          <Card>
            <EmptyState
              heading="No product selected"
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <p>Pick a product above to see its suggestions.</p>
            </EmptyState>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}
