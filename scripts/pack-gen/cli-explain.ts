import { explainAuthoredPath } from "./explain";

const authoredPath = process.argv[2];
if (!authoredPath) {
    console.error("Usage: bun run pack:explain <authored-path>");
    process.exit(1);
}

try {
    const result = explainAuthoredPath(authoredPath);
    console.log(`source: ${result.source}`);
    result.destinations.forEach((destination, index) => {
        console.log(
            `document ${index + 1}: ${destination.role} -> ${destination.path}`
        );
    });
} catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`pack explain: ${message}`);
    process.exit(1);
}
