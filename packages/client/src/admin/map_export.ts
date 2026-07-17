/** Trigger a browser download of map YAML. */
export function downloadMapYaml(
    yaml: string,
    filename = "editor-map.yml"
): void {
    const blob = new Blob([yaml], { type: "text/yaml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
}
