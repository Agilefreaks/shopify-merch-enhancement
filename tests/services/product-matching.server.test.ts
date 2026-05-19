import { describe, it, expect, vi } from "vitest";
import { resolveProductsBySku } from "../../app/services/product-matching.server";
import type { ExternalSignal } from "../../app/services/product-matching.server";

function createMockAdmin(products: any[]) {
  return {
    graphql: vi.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          data: {
            products: {
              edges: products.map((p) => ({ node: p })),
            },
          },
        }),
    }),
  };
}

function makeProduct(overrides: Partial<any> = {}) {
  return {
    id: "gid://shopify/Product/1",
    title: "Test Product",
    handle: "test-product",
    status: "ACTIVE",
    totalInventory: 10,
    featuredMedia: {
      preview: {
        image: { url: "https://cdn.shopify.com/img.jpg", altText: "Alt" },
      },
    },
    variants: {
      edges: [{ node: { sku: "SKU-001", price: "29.99" } }],
    },
    ...overrides,
  };
}

describe("resolveProductsBySku", () => {
  it("returns empty array for empty signals", async () => {
    const admin = createMockAdmin([]);
    const result = await resolveProductsBySku(admin, []);
    expect(result).toEqual([]);
    expect(admin.graphql).not.toHaveBeenCalled();
  });

  it("matches products by SKU and stitches signal data", async () => {
    const product = makeProduct();
    const admin = createMockAdmin([product]);
    const signals: ExternalSignal[] = [
      { sku: "SKU-001", score: 0.9, reason: "Related" },
    ];

    const result = await resolveProductsBySku(admin, signals);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      productId: "gid://shopify/Product/1",
      title: "Test Product",
      handle: "test-product",
      imageUrl: "https://cdn.shopify.com/img.jpg",
      imageAltText: "Alt",
      sku: "SKU-001",
      price: "29.99",
      score: 0.9,
      reason: "Related",
    });
  });

  it("filters out DRAFT and ARCHIVED products", async () => {
    const draft = makeProduct({
      status: "DRAFT",
      id: "gid://shopify/Product/2",
    });
    const archived = makeProduct({
      status: "ARCHIVED",
      id: "gid://shopify/Product/3",
      variants: { edges: [{ node: { sku: "SKU-002", price: "19.99" } }] },
    });
    const admin = createMockAdmin([draft, archived]);
    const signals: ExternalSignal[] = [
      { sku: "SKU-001", score: 0.9, reason: "Related" },
      { sku: "SKU-002", score: 0.8, reason: "Similar" },
    ];

    const result = await resolveProductsBySku(admin, signals);
    expect(result).toHaveLength(0);
  });

  it("handles SKU misses gracefully", async () => {
    const product = makeProduct({
      variants: { edges: [{ node: { sku: "DIFFERENT-SKU", price: "10.00" } }] },
    });
    const admin = createMockAdmin([product]);
    const signals: ExternalSignal[] = [
      { sku: "SKU-001", score: 0.9, reason: "Related" },
    ];

    const result = await resolveProductsBySku(admin, signals);
    expect(result).toHaveLength(0);
  });

  it("sorts results by score descending", async () => {
    const p1 = makeProduct({
      id: "gid://shopify/Product/1",
      title: "Low Score",
      variants: { edges: [{ node: { sku: "SKU-LOW", price: "10.00" } }] },
    });
    const p2 = makeProduct({
      id: "gid://shopify/Product/2",
      title: "High Score",
      variants: { edges: [{ node: { sku: "SKU-HIGH", price: "20.00" } }] },
    });
    const admin = createMockAdmin([p1, p2]);
    const signals: ExternalSignal[] = [
      { sku: "SKU-LOW", score: 0.3, reason: "Low" },
      { sku: "SKU-HIGH", score: 0.95, reason: "High" },
    ];

    const result = await resolveProductsBySku(admin, signals);
    expect(result[0].title).toBe("High Score");
    expect(result[1].title).toBe("Low Score");
  });

  it("matches SKUs case-insensitively", async () => {
    const product = makeProduct({
      variants: { edges: [{ node: { sku: "sku-001", price: "29.99" } }] },
    });
    const admin = createMockAdmin([product]);
    const signals: ExternalSignal[] = [
      { sku: "SKU-001", score: 0.9, reason: "Related" },
    ];

    const result = await resolveProductsBySku(admin, signals);
    expect(result).toHaveLength(1);
  });

  it("handles products with no featured media", async () => {
    const product = makeProduct({ featuredMedia: null });
    const admin = createMockAdmin([product]);
    const signals: ExternalSignal[] = [
      { sku: "SKU-001", score: 0.9, reason: "Related" },
    ];

    const result = await resolveProductsBySku(admin, signals);
    expect(result[0].imageUrl).toBeNull();
    expect(result[0].imageAltText).toBeNull();
  });
});
