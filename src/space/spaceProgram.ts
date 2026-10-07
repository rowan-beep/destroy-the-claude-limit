// The whole space program in one module, loaded only when it is first needed
// (the jet game's players never download its million bytes of code): the
// launch site, the Saturn V flight, Starship to Mars, the rover missions and
// the Falcon Heavy / SLS missions.

import * as THREE from 'three';
import { LaunchSite } from '../ui/menu/launchSite';
import { SpaceFlight } from './spaceFlight';
import { MarsMission } from './mars/marsMission';
import { RoverMission, ROVER_MISSIONS } from './rover/roverMission';
import { LaunchMission } from './launch/launchMission';

export interface SpaceHost {
  renderer: () => THREE.WebGLRenderer;
  /** draw a scene through the game's post-processing */
  draw: (scene: THREE.Scene, camera: THREE.Camera, exposure?: number) => void;
  /** a mission ended: back to the menus */
  onExit: () => void;
}

export class SpaceProgram {
  private site: LaunchSite | null = null;
  readonly flight: SpaceFlight;
  readonly mars: MarsMission;
  readonly rover: RoverMission;
  readonly launch: LaunchMission;
  readonly roverMissions = ROVER_MISSIONS;

  constructor(private host: SpaceHost) {
    const draw = (sc: THREE.Scene, cam: THREE.Camera) => host.draw(sc, cam);
    this.flight = new SpaceFlight(() => this.factory(), document.body);
    this.mars = new MarsMission(() => this.factory(), host.renderer, document.body);
    this.rover = new RoverMission(host.renderer, document.body);
    this.launch = new LaunchMission(() => this.factory(), host.renderer, document.body);
    for (const m of [this.flight, this.mars, this.rover, this.launch]) {
      m.drawWith = draw;
      m.onExit = host.onExit;
    }
    if (import.meta.env.DEV) Object.assign(window, { __flight: this.flight, __mars: this.mars, __rover: this.rover, __launch: this.launch });
  }

  /** the launch site (the space program's menu backdrop), built on first use */
  factory(): LaunchSite {
    if (!this.site) {
      this.site = new LaunchSite(this.host.renderer());
      if (import.meta.env.DEV) Object.assign(window, { __site: this.site });
      // outdoor daylight under a physical sky: a little more exposure than the hangar's
      this.site.drawWith = (sc, cam) => this.host.draw(sc, cam, 1.05);
    }
    return this.site;
  }

  /** the launch site if it has been built */
  get builtSite(): LaunchSite | null {
    return this.site;
  }

  /** is a flight or mission running? */
  get active(): boolean {
    return this.flight.active || this.mars.active || this.rover.active || this.launch.active;
  }

  /** a frame of whichever mission is running (false if none is) */
  frame(dt: number, w: number, h: number): boolean {
    if (this.flight.active) this.flight.frame(dt, w, h);
    else if (this.mars.active) this.mars.frame(dt, w, h);
    else if (this.rover.active) this.rover.frame(dt, w, h);
    else if (this.launch.active) this.launch.frame(dt, w, h);
    else return false;
    return true;
  }
}
