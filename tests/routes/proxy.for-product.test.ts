import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.EXTERNAL_API_BASE_URL = "https://api.example.com";
  process.env.EXTERNAL_API_KEY = "test-key";
  delete process.env.SUGGESTIONS_MOCK;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

vi.mock("../../app/shopify.server", () => ({
  authenticate: {
    public: {
      appProxy: vi.fn(),
    },
  },
}));

vi.mock(
  import("../../app/routes/proxy.for-product"),
  async (importOriginal) => {
    const mod = await importOriginal();
    return {
      ...mod,
      fetchExternalSuggestions: vi.fn(),
    };
  },
);

vi.mock("../../app/services/product-matching.server", () => ({
  resolveProductsBySku: vi.fn(),
}));

vi.mock("../../app/services/logger.server", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

import { loader } from "../../app/routes/proxy.for-product";
import { authenticate } from "../../app/shopify.server";
import { fetchExternalSuggestions } from "../../app/routes/proxy.for-product";
import { resolveProductsBySku } from "../../app/services/product-matching.server";

function mockAdmin(productData: any) {
  return {
    graphql: vi.fn().mockResolvedValue({
      json: () => Promise.resolve(productData),
    }),
  };
}

describe("proxy.for-product loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when productId is missing", async () => {
    vi.mocked(authenticate.public.appProxy).mockResolvedValue({
      admin: mockAdmin({}),
    } as any);

    const request = new Request("https://app.example.com/proxy/for-product");
    const response = await loader({ request, params: {}, context: {} });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Missing productId parameter");
  });

  it("returns 404 when product is not found", async () => {
    const admin = mockAdmin({ data: { product: null } });
    vi.mocked(authenticate.public.appProxy).mockResolvedValue({
      admin,
    } as any);

    const request = new Request(
      "https://app.example.com/proxy/for-product?productId=123",
    );
    const response = await loader({ request, params: {}, context: {} });

    expect(response.status).toBe(404);
  });

  it("returns products on success", async () => {
    process.env.SUGGESTIONS_MOCK = "1";

    const admin = mockAdmin({
      data: {
        product: {
          variants: { edges: [{ node: { sku: "SKU-001" } }] },
        },
      },
    });
    vi.mocked(authenticate.public.appProxy).mockResolvedValue({
      admin,
    } as any);
    vi.mocked(fetchExternalSuggestions).mockResolvedValue([
      { sku: "SKU-002", score: 0.9, reason: "Related" },
    ]);
    vi.mocked(resolveProductsBySku).mockResolvedValue([
      {
        productId: "gid://shopify/Product/2",
        title: "Suggested Product",
        handle: "suggested-product",
        imageUrl: null,
        imageAltText: null,
        sku: "SKU-002",
        price: "29.99",
        score: 0.9,
        reason: "Related",
      },
    ]);

    const request = new Request(
      "https://app.example.com/proxy/for-product?productId=123",
    );
    const response = await loader({ request, params: {}, context: {} });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.products).toHaveLength(1);
    expect(body.products[0].title).toBe("Suggested Product");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=60");
  });

  it("returns empty array when product has no SKU", async () => {
    const admin = mockAdmin({
      data: {
        product: {
          variants: { edges: [] },
        },
      },
    });
    vi.mocked(authenticate.public.appProxy).mockResolvedValue({
      admin,
    } as any);

    const request = new Request(
      "https://app.example.com/proxy/for-product?productId=123",
    );
    const response = await loader({ request, params: {}, context: {} });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.products).toEqual([]);
  });

  it("respects the limit parameter", async () => {
    process.env.SUGGESTIONS_MOCK = "1";

    const admin = mockAdmin({
      data: {
        product: {
          variants: { edges: [{ node: { sku: "SKU-001" } }] },
        },
      },
    });
    vi.mocked(authenticate.public.appProxy).mockResolvedValue({
      admin,
    } as any);
    vi.mocked(fetchExternalSuggestions).mockResolvedValue([]);
    vi.mocked(resolveProductsBySku).mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({
        productId: `gid://shopify/Product/${i}`,
        title: `Product ${i}`,
        handle: `product-${i}`,
        imageUrl: null,
        imageAltText: null,
        sku: `SKU-${i}`,
        price: "10.00",
        score: 0.9 - i * 0.05,
        reason: "Test",
      })),
    );

    const request = new Request(
      "https://app.example.com/proxy/for-product?productId=123&limit=3",
    );
    const response = await loader({ request, params: {}, context: {} });

    const body = await response.json();
    expect(body.products).toHaveLength(3);
  });
});
