import { defineConfig } from "vitepress";

export default defineConfig({
	title: "bundu docs",
	description: "Gameplay reference and pack authoring for bundu.io",
	// Served by the same frontend container as the game client.
	base: "/docs/",
	outDir: "../public/docs",
	cleanUrls: true,
	ignoreDeadLinks: true,
	srcExclude: ["**/ops/**"],
	themeConfig: {
		nav: [
			{ text: "Gameplay", link: "/gameplay/basics" },
			{ text: "Authoring", link: "/authoring/" },
		],
		sidebar: [
			{
				text: "Gameplay",
				items: [
					{ text: "Basics", link: "/gameplay/basics" },
					{ text: "Items", link: "/gameplay/items" },
					{ text: "Entities", link: "/gameplay/entities" },
					{ text: "Structures", link: "/gameplay/structures" },
				],
			},
			{
				text: "Authoring",
				items: [
					{ text: "Overview", link: "/authoring/" },
					{ text: "Packs", link: "/authoring/packs" },
				],
			},
		],
		socialLinks: [
			{ icon: "github", link: "https://github.com/iRedSC/bundu.io" },
		],
		search: {
			provider: "local",
		},
	},
});
