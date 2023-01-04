import { Plugin } from 'obsidian';
import './leaflet_config'
import EarthCodeBlockManager from './embedded_map';

export default class EarthPlugin extends Plugin {
	async onload() {
		new EarthCodeBlockManager(this);
	}
}
