import fs from 'fs';
import path from 'path';

// Load .env manually
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach(line => {
        const parts = line.split('=');
        if (parts.length >= 2) {
            const key = parts[0].trim();
            const value = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, ''); // Remove quotes if present
            if (key && value) {
                process.env[key] = value;
            }
        }
    });
}

async function main() {
    // Import dynamically after env is set
    const { runPoll } = await import("../lib/jobs/poll-products");

    console.log("Starting poll...");
    const result = await runPoll();
    console.log("Poll finished.");
    console.log(JSON.stringify(result, null, 2));
}

main();
