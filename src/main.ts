import { Plugin } from 'obsidian';
import { geojsonFormatter } from './code_block';

export default class EarthPlugin extends Plugin {
	async onload() {
		this.registerMarkdownCodeBlockProcessor("geojson", geojsonFormatter);
	}
}
