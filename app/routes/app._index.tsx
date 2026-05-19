import type { LoaderFunctionArgs } from "@remix-run/node";
import {
  Page,
  Layout,
  Text,
  Card,
  BlockStack,
  Button,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function Index() {
  return (
    <Page>
      <TitleBar title="Merch Enhancement" />
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingLg">
                  Product Suggestion System
                </Text>
                <Text as="p" variant="bodyMd">
                  Get AI-powered suggestions to improve your product listings.
                  The system analyzes your products and provides actionable
                  recommendations for titles, descriptions, tags, and more.
                </Text>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">
                    How it works
                  </Text>
                  <Text as="p" variant="bodyMd">
                    1. Navigate to the Suggestions page to browse your products.
                  </Text>
                  <Text as="p" variant="bodyMd">
                    2. Select a product to generate improvement suggestions.
                  </Text>
                  <Text as="p" variant="bodyMd">
                    3. Review and apply the suggestions to enhance your
                    listings.
                  </Text>
                </BlockStack>
                <div>
                  <Button url="/app/suggestions" variant="primary">
                    View Suggestions
                  </Button>
                </div>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
