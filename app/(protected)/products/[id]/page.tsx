import { ProductDetailsClient } from "@/components/products/product-details-client";

export default function ProductDetailsPage({ params }: { params: { id: string } }) {
  return <ProductDetailsClient productId={params.id} />;
}
