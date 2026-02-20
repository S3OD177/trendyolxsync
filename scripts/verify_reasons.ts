import { buildDashboardRows } from "../lib/dashboard/service";

async function main() {
    console.log("Building dashboard rows...");
    const rows = await buildDashboardRows();

    console.log(`Total Rows: ${rows.length}`);

    const sampleSku = "1334188092";
    const sample = rows.find(r => r.sku === sampleSku);

    if (sample) {
        console.log(`Sample SKU ${sampleSku}:`);
        console.log(`  Status: ${sample.buyboxStatus}`);
        console.log(`  Reason: ${sample.noDataReason}`);
        console.log(`  Price: ${sample.ourPrice}`);
    } else {
        console.log(`Sample SKU ${sampleSku} NOT FOUND in dashboard rows.`);
    }

    const unknowns = rows.filter(r => r.buyboxStatus === 'UNKNOWN');
    console.log(`Found ${unknowns.length} UNKNOWN rows.`);

    if (unknowns.length > 0) {
        console.log("Sample Reasons:");
        unknowns.slice(0, 5).forEach(r => {
            console.log(`- SKU: ${r.sku} | Reason: ${r.noDataReason}`);
        });
    } else {
        console.log("No UNKNOWN rows found (Start sync if DB is empty?)");
    }
}

main();
