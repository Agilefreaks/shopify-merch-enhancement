import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useActionData, useNavigation, Form } from "@remix-run/react";
import { Page, Layout, Card, Button, Banner, Text } from "@shopify/polaris";
import { authenticate } from "../shopify.server";

const PRODUCTS_QUERY = `
  query getProducts($cursor: String) {
    products(first: 50, after: $cursor) {
      edges {
        node {
          id
          title
          variants(first: 100) {
            edges {
              node {
                id
                sku
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const VARIANTS_UPDATE_MUTATION = `
  mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants {
        id
        sku
      }
      userErrors {
        field
        message
      }
    }
  }
`;

interface Product {
  id: string;
  title: string;
  variants: {
    edges: Array<{
      node: {
        id: string;
        sku: string | null;
      };
    }>;
  };
}

function generateSku(title: string, variantIndex: number, totalVariants: number): string {
  const base = title
    .toUpperCase()
    .replace(/[^A-Z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (totalVariants > 1) {
    return `${base}-${variantIndex + 1}`;
  }
  return base;
}

async function fetchAllProducts(admin: any): Promise<Product[]> {
  const products: Product[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const response = await admin.graphql(PRODUCTS_QUERY, {
      variables: { cursor },
    });
    const data = await response.json();
    const connection = data.data.products;

    for (const edge of connection.edges) {
      products.push(edge.node);
    }

    hasNextPage = connection.pageInfo.hasNextPage;
    cursor = connection.pageInfo.endCursor;
  }

  return products;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return json({});
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const products = await fetchAllProducts(admin);
  let updatedCount = 0;
  const errors: string[] = [];

  for (const product of products) {
    const variants = product.variants.edges;
    const variantsToUpdate = variants
      .map((edge, index) => ({
        node: edge.node,
        index,
      }))
      .filter(({ node }) => !node.sku);

    if (variantsToUpdate.length === 0) continue;

    const variantInputs = variantsToUpdate.map(({ node, index }) => ({
      id: node.id,
      inventoryItem: {
        sku: generateSku(product.title, index, variants.length),
      },
    }));

    const response = await admin.graphql(VARIANTS_UPDATE_MUTATION, {
      variables: {
        productId: product.id,
        variants: variantInputs,
      },
    });
    const result = await response.json();
    const userErrors = result.data.productVariantsBulkUpdate.userErrors;

    if (userErrors.length > 0) {
      errors.push(`${product.title}: ${userErrors.map((e: any) => e.message).join(", ")}`);
    } else {
      updatedCount += variantInputs.length;
    }
  }

  return json({
    updatedCount,
    totalProducts: products.length,
    errors,
  });
};

export default function SeedSkus() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isLoading = navigation.state === "submitting";

  return (
    <Page title="Seed SKUs" backAction={{ url: "/app" }}>
      <Layout>
        {actionData && (
          <Layout.Section>
            <Banner
              title="SKU seeding complete"
              tone={actionData.errors.length > 0 ? "warning" : "success"}
            >
              <Text as="p" variant="bodyMd">
                Updated {actionData.updatedCount} variant(s) across{" "}
                {actionData.totalProducts} product(s).
              </Text>
              {actionData.errors.length > 0 && (
                <Text as="p" variant="bodyMd">
                  Errors: {actionData.errors.join("; ")}
                </Text>
              )}
            </Banner>
          </Layout.Section>
        )}
        <Layout.Section>
          <Card>
            <Text as="p" variant="bodyMd">
              Generate SKUs for all product variants that don't have one. SKUs
              are derived from the product title (uppercase, hyphens for spaces).
              Variants that already have a SKU will be skipped.
            </Text>
            <div style={{ marginTop: "16px" }}>
              <Form method="post">
                <Button variant="primary" submit loading={isLoading}>
                  Seed SKUs
                </Button>
              </Form>
            </div>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
