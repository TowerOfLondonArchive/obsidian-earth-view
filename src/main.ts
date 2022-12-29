import { Plugin } from 'obsidian';
import './leaflet_config'
import EarthCodeBlockManager from './code_block';

export default class EarthPlugin extends Plugin {
	async onload() {
		new EarthCodeBlockManager(this);
	}
}
