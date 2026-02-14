export interface TrendyolShipmentPackage {
    id: string;
    shipmentPackageId: number;
    customerId: number;
    customerCode: string; // "999" etc
    status: "Created" | "Picking" | "Invoiced" | "Shipped" | "Cancelled" | "Delivered" | "UnDelivered" | "Returned" | "Repackaged" | "UnSupplied";
    shipmentPackageStatus: "Created" | "Picking" | "Invoiced" | "Shipped" | "Cancelled" | "Delivered" | "UnDelivered" | "Returned" | "Repackaged" | "UnSupplied";
    packageNumber: string;
    orderNumber: string;
    grossAmount: number;
    totalDiscount: number;
    totalPrice: number;
    cargoProviderName: string;
    cargoTrackingNumber: number | string;
    cargoTrackingLink: string;
    shipmentPackageCreationDate: number; // epoch ms
    estimatedDeliveryStartDate: number;
    estimatedDeliveryEndDate: number;
    packageLastModifiedDate: number;
    lines: TrendyolShipmentLine[];
    // There are many fields, but these are the ones we persist
}

export interface TrendyolShipmentLine {
    id: string;
    sku: string;
    productName: string;
    quantity: number;
    merchantSku: string;
    productSize: string;
    currencyCode: string;
    productColor: string;
    price: number;
    vatBaseAmount: number;
    amount: number;
    discount: number;
    lineItemStatus: string;
}

export interface FetchShipmentsOptions {
    page?: number;
    size?: number;
    startDate?: number; // epoch ms
    endDate?: number;   // epoch ms
    status?: string;
    orderByField?: "PackageLastModifiedDate" | "CreatedDate";
    orderByDirection?: "ASC" | "DESC";
}
