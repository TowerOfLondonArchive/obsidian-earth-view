import { Plugin } from 'obsidian';
import './leaflet_config'
import { geojsonFormatter } from './code_block';

export default class EarthPlugin extends Plugin {
	async onload() {
		this.registerMarkdownCodeBlockProcessor("geojson", geojsonFormatter);
	}
}
