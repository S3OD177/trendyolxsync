import { ProductDetailsClient } from "@/components/products/product-details-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function ProductDetailsPage({ params }: { params: { id: string } }) {
  return <ProductDetailsClient productId={params.id} />;
}
