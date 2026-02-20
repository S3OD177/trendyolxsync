import { ProductsClient } from "@/components/products/products-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function ProductsPage() {
  return <ProductsClient />;
}
