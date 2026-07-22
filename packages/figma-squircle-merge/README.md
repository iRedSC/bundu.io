# Bundu Squircle Merge

Duplicates one selected frame, unions visible rectangles with matching appearances, and applies rounded squircle corners.

## Use in Figma

1. Build the plugin with `bun run --cwd packages/figma-squircle-merge build`.
2. In the Figma desktop app, choose **Plugins → Development → Import plugin from manifest…**.
3. Select `packages/figma-squircle-merge/manifest.json`.
4. Select exactly one frame and run **Bundu Squircle Merge**.

The defaults are a 25 px corner radius, object-size radius enabled, 60% square-to-circle roundness, and locked layers excluded. The plugin generates custom superellipse vector paths: 0% is square, 50% is a classic `n = 4` squircle, and 100% is circular.

Only touching rectangles with the same appearance and stacking context are merged. Disconnected geometry remains separate.

Enable **Use object size for radius** to calculate each corner independently as half the shorter of its two adjacent edges.

Locked layers default to **No copy**, which removes them from the copy. They can instead be preserved without transforming or included in the transformation. Rectangles within masks and hidden rectangles are left unchanged.

Before publishing, replace the development `id` in `manifest.json` with the ID assigned by Figma.
