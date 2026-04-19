// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
	site: 'https://alexwiench.github.io',
	base: '/pendulum',
	integrations: [
		starlight({
			title: 'Pendulum',
			description: 'A visual easing editor panel for Adobe After Effects.',
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/alexwiench/pendulum' }],
			sidebar: [
				{ label: 'Getting Started', slug: 'getting-started' },
				{
					label: 'Reference',
					items: [
						{ label: 'Speed Graph', slug: 'reference/speed-graph' },
						{ label: 'Curve Editor', slug: 'reference/curve-editor' },
						{ label: 'Ghost Curves', slug: 'reference/ghost-curves' },
						{ label: 'Presets', slug: 'reference/presets' },
						{ label: 'Playhead', slug: 'reference/playhead' },
						{ label: 'Anchor Point Grid', slug: 'reference/anchor-point' },
						{ label: 'Null Creator', slug: 'reference/null-creator' },
						{ label: 'Settings', slug: 'reference/settings' },
					],
				},
			],
		}),
	],
});
