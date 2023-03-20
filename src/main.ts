import { Plugin } from 'obsidian';
import './leaflet_config'
import EarthCodeBlockManager from './embedded_map';
import EarthViewManager from "./map_view";
import {Database} from "./database";
import {LatLngBounds} from "leaflet"

export default class EarthPlugin extends Plugin {
	database: Database
	earth_view_manager: EarthViewManager
	code_block_manager: EarthCodeBlockManager
	default_bounds: LatLngBounds
	edit_mode: boolean

	onload() {
		this.database = new Database(this);
		this.earth_view_manager = new EarthViewManager(this, this.database);
		this.code_block_manager = new EarthCodeBlockManager(this);
		this.default_bounds = new LatLngBounds([51.506745,-0.079402], [51.509576,-0.073798]);
		this.edit_mode = true;
	}
}
