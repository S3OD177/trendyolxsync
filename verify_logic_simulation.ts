
// Minimal simulation of the logic in poll-products.ts

function inferBuyBoxStatus(
    ourPrice: number | null,
    competitorMinPrice: number | null,
    buyboxSellerId: string | null,
    sellerId: string | undefined,
    competitorCount: number | null
) {
    if (buyboxSellerId && sellerId && buyboxSellerId === sellerId.toString()) {
        return "WIN";
    }

    // New Logic: Solo Winner
    if (ourPrice !== null && competitorCount === 0) {
        return "WIN";
    }

    if (ourPrice === null || competitorMinPrice === null) {
        return "UNKNOWN";
    }

    return ourPrice <= competitorMinPrice ? "WIN" : "LOSE";
}

// Test Cases
const sellerId = "1111632";

console.log("Test 1: Normal Win (Price lower)");
console.log(inferBuyBoxStatus(100, 110, "99999", sellerId, 1)); // Expected: WIN

console.log("Test 2: Normal Lose (Price higher)");
console.log(inferBuyBoxStatus(120, 110, "99999", sellerId, 1)); // Expected: LOSE

console.log("Test 3: Empty BuyBox (Solo Seller) - THE FIX");
// competitorMinPrice is null, count is 0
console.log(inferBuyBoxStatus(100, null, null, sellerId, 0)); // Expected: WIN

console.log("Test 4: Empty BuyBox but No Price (Invalid state)");
console.log(inferBuyBoxStatus(null, null, null, sellerId, 0)); // Expected: UNKNOWN

console.log("Test 5: Explicit BuyBox Win by Seller ID");
console.log(inferBuyBoxStatus(100, 100, sellerId, sellerId, 1)); // Expected: WIN
