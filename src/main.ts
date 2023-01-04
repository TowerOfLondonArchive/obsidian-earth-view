import { Plugin } from 'obsidian';
import './leaflet_config'
import EarthCodeBlockManager from './embedded_map';
import EarthViewManager from "./map_view";

export default class EarthPlugin extends Plugin {
	async onload() {
		new EarthCodeBlockManager(this);
		new EarthViewManager(this);
	}
}
